# HUSH SSL/TLS Setup Guide

> Configure HTTPS certificates for HUSH deployment

---

## Overview

HUSH requires HTTPS for secure communication. This guide covers:
- Self-signed certificates (development)
- mkcert (local development with trusted certs)
- Let's Encrypt (production)

---

## Option 1: Self-Signed Certificates (Development)

Quick setup for local development. Browsers will show security warnings.

```bash
# Create SSL directory
mkdir -p nginx/ssl

# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/C=US/ST=State/L=City/O=HUSH/CN=localhost"

# Verify certificate
openssl x509 -in nginx/ssl/cert.pem -text -noout
```

### Browser Warning

When accessing https://localhost, you'll see a security warning:
- Chrome: Click "Advanced" > "Proceed to localhost (unsafe)"
- Firefox: Click "Advanced" > "Accept the Risk and Continue"

---

## Option 2: mkcert (Local Trusted Certificates)

Better for development - creates certificates trusted by your system.

### Install mkcert

```bash
# macOS
brew install mkcert

# Linux (Ubuntu/Debian)
sudo apt install libnss3-tools
curl -JLO "https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-linux-amd64"
chmod +x mkcert-linux-amd64
sudo mv mkcert-linux-amd64 /usr/local/bin/mkcert

# Windows (with Chocolatey)
choco install mkcert
```

### Generate Certificates

```bash
# Install local CA (one-time)
mkcert -install

# Create certificates
mkdir -p nginx/ssl
mkcert -key-file nginx/ssl/key.pem -cert-file nginx/ssl/cert.pem localhost 127.0.0.1
```

Now https://localhost will be trusted without browser warnings.

---

## Option 3: Let's Encrypt (Production)

For production deployments with a domain name.

### Prerequisites

- Domain name pointing to your server
- Port 80 accessible from internet (for ACME challenge)

### Using Certbot

```bash
# Install certbot
sudo apt install certbot

# Stop nginx temporarily
docker compose stop nginx

# Obtain certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem
sudo chown $USER:$USER nginx/ssl/*.pem

# Update nginx.conf server_name
# Change: server_name localhost;
# To:     server_name your-domain.com;

# Restart nginx
docker compose up -d nginx
```

### Auto-Renewal

```bash
# Add to crontab
sudo crontab -e

# Add this line (renews at 2:30 AM daily if needed)
30 2 * * * certbot renew --quiet --deploy-hook "docker compose -f /path/to/hush/docker-compose.yml restart nginx"
```

### Using Docker-based Certbot

```bash
# Create certbot directories
mkdir -p certbot/conf certbot/www

# Run certbot
docker run -it --rm \
  -v $(pwd)/certbot/conf:/etc/letsencrypt \
  -v $(pwd)/certbot/www:/var/www/certbot \
  -p 80:80 \
  certbot/certbot certonly --standalone \
  -d your-domain.com

# Copy certs
cp certbot/conf/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
cp certbot/conf/live/your-domain.com/privkey.pem nginx/ssl/key.pem
```

---

## Nginx TLS Configuration

The default configuration in `nginx/nginx.conf`:

```nginx
server {
    listen 443 ssl http2;

    # Certificate files
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # Modern TLS only
    ssl_protocols TLSv1.2 TLSv1.3;

    # Strong ciphers
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS (1 year)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

### Security Headers Explained

| Header | Purpose |
|--------|---------|
| `Strict-Transport-Security` | Forces HTTPS for 1 year |
| `Content-Security-Policy` | Restricts resource loading |
| `X-Frame-Options` | Prevents clickjacking |
| `X-Content-Type-Options` | Prevents MIME sniffing |

---

## Verification

### Check Certificate

```bash
# View certificate details
openssl s_client -connect localhost:443 -servername localhost 2>/dev/null | openssl x509 -text

# Check expiry
openssl s_client -connect localhost:443 2>/dev/null | openssl x509 -noout -dates
```

### Test HTTPS

```bash
# Should return 200
curl -k -I https://localhost

# Check HSTS header
curl -kI https://localhost 2>/dev/null | grep -i strict
```

### SSL Labs Test (Production)

For production domains, test at: https://www.ssllabs.com/ssltest/

---

## Troubleshooting

### Certificate Not Found

```bash
# Check files exist
ls -la nginx/ssl/

# Check permissions
chmod 644 nginx/ssl/cert.pem
chmod 600 nginx/ssl/key.pem
```

### Certificate Mismatch

```bash
# Verify key matches certificate
openssl x509 -noout -modulus -in nginx/ssl/cert.pem | md5sum
openssl rsa -noout -modulus -in nginx/ssl/key.pem | md5sum
# Both should output the same hash
```

### Nginx Won't Start

```bash
# Test nginx config
docker compose exec nginx nginx -t

# Check logs
docker compose logs nginx
```

---

## Certificate File Locations

| File | Path | Content |
|------|------|---------|
| Certificate | `nginx/ssl/cert.pem` | Public certificate (or chain) |
| Private Key | `nginx/ssl/key.pem` | Private key (keep secure!) |

**Important:** Never commit `nginx/ssl/` to version control!
