# PHASE 10: Docker, Nginx & Deployment

## Overview
This phase implements the complete containerized deployment including Docker configurations, Nginx reverse proxy with TLS, and the final docker-compose orchestration. This enables the one-command deployment promised by `./hush deploy`.

## Objectives
1. Backend Dockerfile (production-ready)
2. Frontend Dockerfile (multi-stage build)
3. Nginx configuration with TLS
4. Docker Compose orchestration
5. SSL certificate generation
6. Health checks and logging
7. Volume management

---

## 1. Backend Dockerfile

### File: `backend/Dockerfile`

```dockerfile
FROM python:3.12-slim AS base

RUN useradd -m -u 1000 hush && \
    mkdir -p /app && \
    chown hush:hush /app

WORKDIR /app

FROM base AS dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS production
COPY --from=dependencies /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=dependencies /usr/local/bin /usr/local/bin
COPY --chown=hush:hush app/ ./app/

USER hush
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

---

## 2. Frontend Dockerfile

### File: `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit
COPY . .
RUN npm run build

FROM nginx:alpine AS production
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## 3. Main Nginx Configuration

### File: `nginx/nginx.conf`

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - [$time_local] "$request" $status $body_bytes_sent';
    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    server_tokens off;

    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript application/wasm;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=1r/s;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    upstream backend {
        server backend:8000;
        keepalive 32;
    }

    upstream frontend {
        server frontend:80;
        keepalive 16;
    }

    # HTTP -> HTTPS redirect
    server {
        listen 80;
        server_name _;
        location /health { return 200 "OK"; }
        location / { return 301 https://$host$request_uri; }
    }

    # Main HTTPS server
    server {
        listen 443 ssl http2;
        server_name _;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        # Security headers
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:; img-src 'self' data: blob:;" always;

        location /health { return 200 "OK"; }

        # API with rate limiting
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Auth with strict rate limiting
        location /api/auth {
            limit_req zone=auth burst=3 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # WebSocket
        location /ws {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 7d;
            proxy_send_timeout 7d;
        }

        # Frontend
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
        }

        # Static assets caching
        location ~* \.(js|css|png|jpg|svg|woff|woff2|wasm)$ {
            proxy_pass http://frontend;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

---

## 4. Docker Compose

### File: `docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: hush-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: hush
      POSTGRES_PASSWORD: ${DB_PASSWORD:-hush}
      POSTGRES_DB: hush
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - hush_internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hush -d hush"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    container_name: hush-backend
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql://hush:${DB_PASSWORD:-hush}@postgres:5432/hush
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - hush_internal
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  frontend:
    build: ./frontend
    container_name: hush-frontend
    restart: unless-stopped
    networks:
      - hush_internal
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:80/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  nginx:
    image: nginx:alpine
    container_name: hush-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      backend:
        condition: service_healthy
      frontend:
        condition: service_healthy
    networks:
      - hush_internal

volumes:
  postgres_data:

networks:
  hush_internal:
    driver: bridge
```

---

## 5. SSL Certificate Generation

### File: `cli/ssl.py`

```python
"""SSL certificate generation"""

import os
import subprocess
from pathlib import Path

def generate_ssl_certificates(ssl_dir: Path) -> bool:
    """Generate self-signed SSL certificates"""
    ssl_dir.mkdir(parents=True, exist_ok=True)
    cert_path = ssl_dir / 'cert.pem'
    key_path = ssl_dir / 'key.pem'

    if cert_path.exists() and key_path.exists():
        print("[HUSH] SSL certificates already exist")
        return True

    print("[HUSH] Generating SSL certificates...")

    try:
        result = subprocess.run([
            'openssl', 'req', '-x509',
            '-newkey', 'rsa:4096',
            '-keyout', str(key_path),
            '-out', str(cert_path),
            '-days', '365',
            '-nodes',
            '-subj', '/CN=localhost/O=HUSH/C=US',
            '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'
        ], capture_output=True, text=True)

        if result.returncode != 0:
            print(f"[HUSH] OpenSSL error: {result.stderr}")
            return False

        os.chmod(key_path, 0o600)
        os.chmod(cert_path, 0o644)
        print("[HUSH] SSL certificates generated successfully")
        return True

    except FileNotFoundError:
        print("[HUSH] ERROR: OpenSSL not found")
        return False
```

---

## 6. .gitignore

### File: `.gitignore`

```gitignore
.env
.env.local
nginx/ssl/*.pem
__pycache__/
*.py[cod]
venv/
node_modules/
frontend/dist/
.idea/
.vscode/
*.log
.DS_Store
```

---

## 7. Verification Checklist

- [ ] `./hush deploy` runs without errors
- [ ] All containers become healthy
- [ ] SSL certificates generated
- [ ] HTTPS works at https://localhost
- [ ] HTTP redirects to HTTPS
- [ ] API endpoints accessible
- [ ] WebSocket connects over WSS
- [ ] Rate limiting works
- [ ] Security headers present
- [ ] Data persists across restarts

---

## 8. Complete Deployment Flow

```bash
# Make CLI executable
chmod +x hush

# Deploy
./hush deploy

# Follow prompts, save the 12 words
# Access at https://localhost
```

---

## 9. Troubleshooting

```bash
# View logs
docker-compose logs -f

# Restart service
docker-compose restart backend

# Full reset
docker-compose down -v
rm .env
./hush deploy

# Check health
docker-compose ps
```
