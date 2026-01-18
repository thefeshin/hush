# Workflow: PWA Lifecycle

**Complexity:** MEDIUM
**Primary Agent:** `api-developer`
**Last Updated:** 2026-01-18

---

## Overview

HUSH is a Progressive Web App (PWA) that can be installed on devices and works offline. The service worker handles caching, and the app provides install prompts and update notifications.

**Key Principle:** Offline-first with encrypted local cache.

---

## Entry Points

| Entry Point | File | Lines | Trigger |
|-------------|------|-------|---------|
| PWA registration | `frontend/src/main.tsx` | 8-25 | App load |
| Vite PWA config | `frontend/vite.config.ts` | 15-60 | Build time |
| Install prompt | `frontend/src/hooks/useInstallPrompt.ts` | 5-40 | Browser event |
| Update banner | `frontend/src/components/UpdateBanner.tsx` | 10-45 | SW update detected |

---

## Call Chain: Registration

```
main.tsx:registerSW()
├─ if ('serviceWorker' in navigator):
│  └─ navigator.serviceWorker.register('/sw.js')
│     └─ Vite PWA plugin generated service worker
└─ setupUpdateListener()
   └─ on SW update → show UpdateBanner
```

---

## Call Chain: Install Prompt

```
useInstallPrompt.ts:useInstallPrompt()
├─ window.addEventListener('beforeinstallprompt', (e) => {
│  ├─ e.preventDefault()
│  └─ setDeferredPrompt(e)
│  })
└─ return { canInstall, promptInstall }

InstallBanner.tsx
├─ if canInstall: show banner
└─ onClick: deferredPrompt.prompt()
```

---

## Vite PWA Configuration

```typescript
// vite.config.ts
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'HUSH',
    short_name: 'HUSH',
    description: 'Zero-Knowledge Encrypted Chat',
    theme_color: '#1a1a1a',
    background_color: '#1a1a1a',
    display: 'standalone',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\/api\/.*/,
        handler: 'NetworkFirst',
        options: { cacheName: 'api-cache' }
      }
    ]
  }
})
```

---

## Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `frontend/vite.config.ts` | PWA configuration | VitePWA plugin |
| `frontend/src/main.tsx` | SW registration | `registerSW()` |
| `frontend/src/hooks/useInstallPrompt.ts` | Install detection | `useInstallPrompt()` |
| `frontend/src/hooks/useOnlineStatus.ts` | Online detection | `useOnlineStatus()` |
| `frontend/src/components/InstallBanner.tsx` | Install UI | Install prompt |
| `frontend/src/components/UpdateBanner.tsx` | Update UI | Update notification |
| `frontend/src/components/OfflineIndicator.tsx` | Offline UI | Offline status |

---

## Caching Strategy

| Resource | Strategy | Purpose |
|----------|----------|---------|
| Static assets | CacheFirst | JS, CSS, images |
| API responses | NetworkFirst | Fresh data when online |
| Encrypted messages | IndexedDB | Local encrypted cache |

---

## Offline Behavior

1. **Static app loads** - Cached by service worker
2. **Local data available** - IndexedDB encrypted cache
3. **API calls fail gracefully** - Show offline indicator
4. **Messages queued** - Sent when back online (if implemented)

---

## Update Flow

```
SW detects new version
├─ Download new assets in background
├─ Trigger 'controllerchange' event
├─ UpdateBanner.tsx shows notification
└─ User clicks "Update"
   └─ window.location.reload()
```

---

## Security Considerations

1. **Service worker origin** - Same origin only
2. **HTTPS required** - PWA requires secure context
3. **Cache isolation** - Cached data is encrypted
4. **Update integrity** - Vite handles asset hashing

---

## Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| SW not registering | HTTP (not HTTPS) | Use HTTPS or localhost |
| Install prompt not showing | Already installed or not installable | Check manifest validity |
| Stale content | SW cache not updating | Clear cache, reload |
| Offline not working | SW not registered | Check browser console |

---

## Related Workflows

- [client_storage.md](./client_storage.md) - IndexedDB for offline data
- [authentication.md](./authentication.md) - JWT stored for offline auth check

---

## Post-Implementation Checklist

After modifying this workflow:
- [ ] Update line numbers if code changed
- [ ] Test install prompt on mobile
- [ ] Test offline mode
- [ ] Verify update notification
- [ ] Run /verify-docs-current
