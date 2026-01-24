# HUSH Troubleshooting Guide

> Common issues and solutions for HUSH deployment

---

## Quick Diagnostics

```bash
# Check all container status
docker compose ps

# Check logs for errors
docker compose logs --tail=50

# Check health endpoints
curl -k https://localhost/health
curl -k https://localhost/api/health/ready
```

---

## Container Issues

### Container Won't Start

**Symptoms:** Container status shows "Restarting" or exits immediately

**Diagnosis:**
```bash
docker compose logs <service-name>
```

**Common Causes:**

1. **Missing environment variables**
   ```bash
   # Check .env file exists and has required values
   cat .env | grep -E "^(AUTH_HASH|KDF_SALT|JWT_SECRET)="
   ```

2. **Port already in use**
   ```bash
   # Check what's using ports 80/443
   sudo lsof -i :80
   sudo lsof -i :443

   # Stop conflicting service or change ports in docker-compose.yml
   ```

3. **Missing SSL certificates**
   ```bash
   ls -la nginx/ssl/
   # Should show cert.pem and key.pem
   ```

### Container Health Check Failing

**Symptoms:** Container shows "unhealthy" status

```bash
# Check specific health
docker inspect --format='{{json .State.Health}}' hush-backend-1 | jq

# Manual health check
docker compose exec backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
```

---

## Database Issues

### Cannot Connect to Database

**Symptoms:** Backend logs show "connection refused" or timeout

**Diagnosis:**
```bash
# Check PostgreSQL is running
docker compose exec postgres pg_isready -U hush -d hush

# Check PostgreSQL logs
docker compose logs postgres
```

**Solutions:**

1. **Wait for database startup**
   ```bash
   # PostgreSQL might still be initializing
   docker compose logs postgres | grep "ready to accept connections"
   ```

2. **Check DATABASE_URL**
   ```bash
   # In .env, should be:
   DATABASE_URL=postgresql://hush:hush@postgres:5432/hush
   ```

3. **Reset database**
   ```bash
   docker compose down
   docker volume rm hush_postgres_data
   docker compose up -d
   ```

### Database Corruption

**Symptoms:** Errors about corrupted data or failed queries

```bash
# Restore from backup
./scripts/restore.sh ./backups/hush_backup_YYYYMMDD_HHMMSS.sql.gz

# Or reset completely (DATA LOSS!)
docker compose down -v
docker compose up -d
```

---

## WebSocket Issues

### WebSocket Connection Fails

**Symptoms:** Real-time messages not working, console shows WebSocket errors

**Diagnosis:**
```bash
# Check WebSocket endpoint
curl -k -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  https://localhost/ws
```

**Common Causes:**

1. **Missing JWT token**
   - WebSocket requires `?token=JWT` parameter
   - Token might be expired (24h default)

2. **Nginx proxy misconfiguration**
   ```bash
   # Check nginx logs
   docker compose logs nginx | grep -i websocket
   ```

3. **Firewall blocking WebSocket**
   - Ensure WSS (port 443) is allowed

### WebSocket Disconnects Frequently

**Symptoms:** Connection drops after some time

**Solutions:**
- Check `proxy_read_timeout` in nginx.conf (default: 3600s = 1 hour)
- Client should implement reconnection logic
- Check for network issues or proxy timeouts

---

## Authentication Issues

### Cannot Authenticate

**Symptoms:** "Invalid credentials" error with correct passphrase

**Diagnosis:**
```bash
# Check AUTH_HASH is set
grep AUTH_HASH .env

# Check auth endpoint
curl -k -X POST https://localhost/api/auth \
  -H "Content-Type: application/json" \
  -d '{"words": "your twelve word passphrase here"}'
```

**Common Causes:**

1. **Wrong passphrase normalization**
   - Words must be lowercase
   - Single spaces between words
   - No leading/trailing spaces

2. **AUTH_HASH mismatch**
   - Hash was regenerated but passphrase wasn't updated

### IP Blocked

**Symptoms:** "Access denied" or 403 error

**Diagnosis:**
```bash
# Check blocked IPs in database
docker compose exec postgres psql -U hush -d hush -c "SELECT * FROM blocked_ips;"
```

**Solutions:**
```bash
# Remove all IP blocks
docker compose exec postgres psql -U hush -d hush -c "DELETE FROM blocked_ips;"

# Remove specific IP
docker compose exec postgres psql -U hush -d hush -c "DELETE FROM blocked_ips WHERE ip_address = '192.168.1.100';"
```

### Rate Limited

**Symptoms:** 429 "Too Many Requests" error

**Solutions:**
- Wait 1 minute (rate limit resets)
- Check rate limit settings in nginx.conf:
  - Auth: 1 request/second
  - API: 30 requests/second

---

## SSL/Certificate Issues

### Certificate Not Trusted

**Symptoms:** Browser shows "Your connection is not private"

**Solutions:**
1. Use mkcert for local development (see SSL_SETUP.md)
2. For production, use Let's Encrypt
3. Click through warning for development (Advanced > Proceed)

### Certificate Expired

**Symptoms:** Browser shows certificate error, curl fails

```bash
# Check certificate expiry
openssl s_client -connect localhost:443 2>/dev/null | openssl x509 -noout -dates

# Regenerate or renew certificate
# See SSL_SETUP.md
```

### Certificate/Key Mismatch

**Symptoms:** Nginx won't start, logs show SSL error

```bash
# Verify key matches certificate
openssl x509 -noout -modulus -in nginx/ssl/cert.pem | md5sum
openssl rsa -noout -modulus -in nginx/ssl/key.pem | md5sum
# Both should output the same hash
```

---

## Performance Issues

### Slow Response Times

**Diagnosis:**
```bash
# Check container resource usage
docker stats

# Check database query performance
docker compose exec postgres psql -U hush -d hush -c "SELECT * FROM pg_stat_activity;"
```

**Solutions:**
1. Increase container memory limits
2. Add database indexes if needed
3. Check for connection leaks

### High Memory Usage

```bash
# Check memory per container
docker stats --no-stream

# Increase limits in docker-compose.yml if needed
```

---

## Log Analysis

### View Recent Errors

```bash
# Backend errors
docker compose logs backend 2>&1 | grep -i error | tail -20

# All service errors
docker compose logs 2>&1 | grep -iE "(error|exception|failed)" | tail -50
```

### Enable Debug Logging

```bash
# In .env, add:
LOG_LEVEL=DEBUG

# Restart backend
docker compose restart backend
```

### Export Logs

```bash
# Save logs to file
docker compose logs > hush_logs_$(date +%Y%m%d).txt
```

---

## Complete Reset

If all else fails, complete reset (WARNING: DATA LOSS!):

```bash
# Stop everything
docker compose down -v

# Remove all images
docker compose down --rmi all

# Clean Docker cache
docker system prune -a

# Rebuild from scratch
docker compose build --no-cache
docker compose up -d
```

---

## Getting Help

1. Check the logs first: `docker compose logs`
2. Review this troubleshooting guide
3. Check [GitHub Issues](https://github.com/your-repo/hush/issues)
4. Ensure you're running the latest version
