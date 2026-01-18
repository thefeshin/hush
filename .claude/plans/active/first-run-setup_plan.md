# Implementation Plan: First-Run Setup Documentation

**Date:** 2026-01-18
**Based on:** research/active/first-run-setup_research.md
**Status:** DRAFT

---

## Research Summary

The README.md is missing two critical steps for first-run deployment:
1. **SSL certificate generation** - nginx expects `nginx/ssl/cert.pem` and `nginx/ssl/key.pem` but only `.gitkeep` exists
2. **CLI dependency installation** - `pip install -r cli/requirements.txt` is required for the `mnemonic` package

Without these steps, deployment will fail with SSL errors or missing module errors.

---

## Scope Definition

**In Scope:**
- Add Prerequisites section to README.md
- Add SSL certificate generation commands (Bash + PowerShell)
- Add CLI dependency installation step
- Add troubleshooting entries for common first-run issues

**Out of Scope:**
- Code changes to the application
- Modifying nginx configuration
- Automated certificate generation in deploy script

---

## Files to Modify

| File | Lines | Change | Risk |
|------|-------|--------|------|
| `README.md` | 1-30 | Add Prerequisites, SSL cert generation, CLI deps | LOW |
| `.claude/context/workflows/deployment.md` | TBD | Update with SSL cert step | LOW |

---

## Step-by-Step Implementation

### Step 1: Add Prerequisites Section

**File:** `README.md`
**Location:** After line 4 (after "Private, encrypted conversations...")

**Proposed addition:**
```markdown
## Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Docker | 20.10+ | `docker --version` |
| Docker Compose | 2.0+ | `docker-compose --version` |
| Python | 3.7+ | `python --version` |
| pip | Latest | `pip --version` |
| OpenSSL | Any | `openssl version` |

---
```

**Test:** Visual review - ensures users know requirements before starting

---

### Step 2: Add SSL Certificate Generation

**File:** `README.md`
**Location:** Before "Production Deployment" section (new section)

**Proposed addition:**
```markdown
## First-Time Setup

### 1. Install CLI Dependencies

```bash
pip install -r cli/requirements.txt
```

### 2. Generate SSL Certificates

The nginx reverse proxy requires SSL certificates. Generate self-signed certificates for local development:

**Bash (Linux/macOS):**
```bash
mkdir -p nginx/ssl
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -days 365 \
  -subj "/CN=localhost"
```

**PowerShell (Windows):**
```powershell
New-Item -ItemType Directory -Force -Path nginx/ssl
openssl req -x509 -newkey rsa:4096 -nodes `
  -keyout nginx/ssl/key.pem `
  -out nginx/ssl/cert.pem `
  -days 365 `
  -subj "/CN=localhost"
```

> **Note:** OpenSSL is typically available via Git Bash on Windows, or install from [slproweb.com](https://slproweb.com/products/Win32OpenSSL.html). Alternatively, use [mkcert](https://github.com/FiloSottile/mkcert) for easier certificate management.

---
```

**Test:** Run the commands and verify `nginx/ssl/cert.pem` and `nginx/ssl/key.pem` exist

---

### Step 3: Add Troubleshooting Entries

**File:** `README.md`
**Location:** In Troubleshooting section (after line 93)

**Proposed addition:**
```markdown
### Common First-Run Issues

**"mnemonic" module not found:**
```bash
pip install -r cli/requirements.txt
```

**SSL certificate error (nginx won't start):**
- Ensure `nginx/ssl/cert.pem` and `nginx/ssl/key.pem` exist
- Re-run the SSL certificate generation commands above

**Port 443 already in use:**
- Stop other services using port 443, or modify `docker-compose.yml` to use a different port
```

**Test:** Visual review of troubleshooting clarity

---

### Step 4: Update Deployment Workflow Documentation

**File:** `.claude/context/workflows/deployment.md`
**Change:** Add SSL certificate generation as Step 0 in the workflow

**Test:** Run `/verify-docs-current` after changes

---

## Complete README Structure After Changes

```
# HUSH - Zero-Knowledge Encrypted Chat Vault
  (intro paragraph)

## Prerequisites
  (NEW - requirements table)

## First-Time Setup
  (NEW - CLI deps + SSL cert generation)

## Production Deployment (Docker) - Recommended
  (existing - Bash + PowerShell commands)

## Development Mode (Without Docker)
  (existing - unchanged)

## Troubleshooting
  (existing + NEW common first-run issues)
```

---

## Verification Checklist

- [ ] Prerequisites section displays correctly in markdown
- [ ] SSL generation commands work on Bash (Linux/macOS)
- [ ] SSL generation commands work on PowerShell (Windows)
- [ ] `pip install -r cli/requirements.txt` succeeds
- [ ] `./hush deploy` or `python hush deploy` runs without SSL errors
- [ ] All containers start successfully
- [ ] https://localhost is accessible
- [ ] Troubleshooting section covers common errors

---

## Rollback Plan

- Revert: `git checkout HEAD -- README.md`
- No database changes involved
- No code changes involved

---

## Documentation Updates Required

- [x] This plan document
- [ ] README.md (primary target)
- [ ] .claude/context/workflows/deployment.md (add SSL step)
- [ ] Run /verify-docs-current after implementation

---

## Implementation Notes

1. **No code changes** - This is documentation-only
2. **Cross-platform** - Both Bash and PowerShell commands provided
3. **Minimal risk** - Only README changes, easily reversible
4. **Immediate value** - Prevents 100% of SSL-related deployment failures

---

**Estimated Context Usage:** 15k tokens
**Risk Level:** LOW
**Dependencies:** None
