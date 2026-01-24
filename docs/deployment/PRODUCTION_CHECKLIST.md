# HUSH Production Deployment Checklist

> Pre-flight checklist before deploying HUSH to production

---

## Pre-Deployment

### Environment Configuration

- [ ] Copy `.env.production.example` to `.env`
- [ ] Verify `LOG_FORMAT=json` is set for production logging
- [ ] Review and set security policy values:
  - [ ] `MAX_AUTH_FAILURES` (default: 5)
  - [ ] `FAILURE_MODE` (recommended: `ip_temp` or `db_wipe_shutdown`)
  - [ ] `IP_BLOCK_MINUTES` (if using `ip_temp`)
  - [ ] `PANIC_MODE` (default: false - use with extreme caution)
  - [ ] `PERSIST_VAULT` (choose based on your requirements)

### SSL/TLS Certificates

- [ ] Generate or obtain SSL certificates
- [ ] Place `cert.pem` and `key.pem` in `nginx/ssl/`
- [ ] For production: Use Let's Encrypt or a trusted CA
- [ ] For testing: Use `mkcert` for local trusted certificates

### Docker Configuration

- [ ] Verify `docker-compose.yml` has restart policies set
- [ ] Check resource limits are appropriate for your server
- [ ] Review volume mounts for persistence

---

## Security Verification

### Network Security

- [ ] Only ports 80 and 443 are exposed externally
- [ ] PostgreSQL is NOT accessible from outside Docker network
- [ ] Backend API is NOT directly accessible (only via nginx)

### Nginx Configuration

Verify these headers are present in `nginx/nginx.conf`:

- [ ] `Strict-Transport-Security` (HSTS)
- [ ] `Content-Security-Policy`
- [ ] `X-Frame-Options`
- [ ] `X-Content-Type-Options`
- [ ] `Permissions-Policy`

### Rate Limiting

- [ ] Auth endpoint rate limited (1r/s)
- [ ] API endpoints rate limited (30r/s)
- [ ] WebSocket timeout set to reasonable value (3600s)

---

## Deployment

### Initial Deployment

```bash
# 1. Run the deployment script
./hush deploy

# 2. SAVE THE 12-WORD PASSPHRASE IMMEDIATELY
#    This is your only chance to record it!

# 3. Verify services are running
docker-compose ps

# 4. Check logs for errors
docker-compose logs -f
```

### Verification Steps

After deployment, verify:

- [ ] All containers are running: `docker-compose ps`
- [ ] Health check passes: `curl -k https://localhost/api/health`
- [ ] Readiness check passes: `curl -k https://localhost/api/health/ready`
- [ ] HSTS header present: `curl -kI https://localhost | grep -i strict`
- [ ] CSP header present: `curl -kI https://localhost | grep -i content-security`

---

## Post-Deployment

### Backup Configuration

- [ ] Set up automated backups using `scripts/backup.sh`
- [ ] Test backup creation: `./scripts/backup.sh`
- [ ] Verify backup file was created in `./backups/`
- [ ] Test restore procedure in a non-production environment

### Monitoring

- [ ] Review container logs periodically: `docker-compose logs -f`
- [ ] Monitor disk space for PostgreSQL volume
- [ ] Set up log aggregation if using `LOG_FORMAT=json`

### Security Practices

- [ ] Store the 12-word passphrase securely (offline, encrypted)
- [ ] Document who has access to the passphrase
- [ ] Plan for passphrase rotation if compromised

---

## Troubleshooting Quick Reference

### Container Won't Start

```bash
# Check logs
docker-compose logs <service-name>

# Rebuild containers
docker-compose up -d --build
```

### Database Connection Issues

```bash
# Check PostgreSQL health
docker-compose exec postgres pg_isready -U hush -d hush

# Check backend logs
docker-compose logs backend
```

### SSL Certificate Issues

```bash
# Verify certificate files exist
ls -la nginx/ssl/

# Check nginx logs
docker-compose logs nginx
```

---

## Emergency Procedures

### Database Wipe (Manual)

If you need to manually wipe the database:

```bash
docker-compose exec postgres psql -U hush -d postgres -c "DROP DATABASE hush;"
docker-compose exec postgres psql -U hush -d postgres -c "CREATE DATABASE hush OWNER hush;"
docker-compose restart backend
```

### Complete Reset

To completely reset the deployment:

```bash
docker-compose down -v  # Warning: Destroys all data
rm .env
./hush deploy
```

---

## Checklist Summary

| Category | Items | Status |
|----------|-------|--------|
| Environment | 6 items | [ ] |
| SSL/TLS | 4 items | [ ] |
| Docker | 3 items | [ ] |
| Security | 9 items | [ ] |
| Deployment | 5 items | [ ] |
| Post-Deploy | 7 items | [ ] |

**Total: 34 items**
