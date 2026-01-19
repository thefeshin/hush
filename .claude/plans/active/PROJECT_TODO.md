# HUSH Project TODOs

## CLI & Deployment

### PostgreSQL Setup - Double Password Prompt Issue
**Priority: Medium**

When the PostgreSQL password is incorrect, the scripts (hush.sh and hush.ps1) ask for the password twice per retry attempt:

```
[HUSH] Enter PostgreSQL 'postgres' user password:
[HUSH] (Press Enter if postgres user has no password)


[HUSH] Testing postgres connection...
Password for user postgres:            <-- SPURIOUS SECOND PROMPT

[HUSH] Attempts remaining: 2
```

**Root cause:** Even after setting `PGPASSWORD` environment variable, `psql` is prompting again interactively when the password is incorrect.

**Expected behavior:** Should only ask for password once per retry attempt.

**Affected files:**
- `hush.sh` (lines 115-133)
- `hush.ps1` (lines 135-154)

**Possible solutions:**
1. Suppress interactive prompts with `psql` flags (e.g., `--no-password`)
2. Redirect stdin from `/dev/null` to prevent interactive fallback
3. Use `.pgpass` file for password management
4. Test connection differently (e.g., via Python with psycopg2)

---

## Phase 9: PWA Assets Needed

The following icon and splash screen files need to be created in `frontend/public/`:

### App Icons (Required for PWA)
- [ ] `icon-32.png` - 32x32px favicon
- [ ] `icon-72.png` - 72x72px
- [ ] `icon-96.png` - 96x96px
- [ ] `icon-128.png` - 128x128px
- [ ] `icon-144.png` - 144x144px
- [ ] `icon-152.png` - 152x152px
- [ ] `icon-192.png` - 192x192px (maskable)
- [ ] `icon-384.png` - 384x384px
- [ ] `icon-512.png` - 512x512px (maskable)

### iOS Splash Screens (Optional but recommended)
- [ ] `splash-640x1136.png` - iPhone 5/SE
- [ ] `splash-750x1334.png` - iPhone 6/7/8
- [ ] `splash-1242x2208.png` - iPhone 6+/7+/8+
- [ ] `splash-1125x2436.png` - iPhone X/XS

### Screenshot (Optional)
- [ ] `screenshot-1.png` - 1080x1920px app screenshot for install prompt

## Design Notes
- Theme color: `#e94560` (accent red)
- Background color: `#1a1a2e` (dark navy)
- Icons should feature the HUSH logo/branding
- Maskable icons need safe zone padding (center content in inner 80%)
