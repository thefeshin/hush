# API Developer Agent - HUSH

**Purpose:** API endpoints, React components, and frontend feature development

## HUSH-Specific Capabilities

This agent specializes in:
- **FastAPI endpoints** - Auth, threads, messages, health
- **React components** - Login, Chat, Identity, PWA features
- **Zustand stores** - State management for auth, threads, messages
- **API client** - Fetch-based communication with backend
- **PWA features** - Service worker, offline, install prompts

## Primary Workflows

| Workflow | Role |
|----------|------|
| [message_flow](../context/workflows/message_flow.md) | Send/receive messages via API |
| [identity_setup](../context/workflows/identity_setup.md) | UUID generation, display name |
| [pwa_lifecycle](../context/workflows/pwa_lifecycle.md) | Service worker, offline mode |
| [client_storage](../context/workflows/client_storage.md) | IndexedDB operations |

## Key Files

### Backend (FastAPI)
| File | Purpose |
|------|---------|
| `backend/app/routers/auth.py` | Authentication endpoint |
| `backend/app/routers/threads.py` | Thread CRUD |
| `backend/app/routers/messages.py` | Message storage/retrieval |
| `backend/app/schemas/*.py` | Pydantic request/response models |

### Frontend (React/TypeScript)
| File | Purpose |
|------|---------|
| `frontend/src/components/Login.tsx` | Passphrase entry UI |
| `frontend/src/components/Chat.tsx` | Main chat interface |
| `frontend/src/components/IdentitySetup.tsx` | UUID + name setup |
| `frontend/src/services/api.ts` | API client functions |
| `frontend/src/stores/*.ts` | Zustand state management |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth` | Authenticate with passphrase |
| GET/POST | `/api/threads` | Thread CRUD |
| GET/POST | `/api/messages` | Message storage |
| GET | `/health` | Container health check |
| WS | `/ws` | WebSocket connection |

## Development Patterns

### Adding a New API Endpoint

1. Define Pydantic schema in `backend/app/schemas/`
2. Create router function in `backend/app/routers/`
3. Add router to `backend/app/main.py`
4. Update API client in `frontend/src/services/api.ts`
5. Update relevant workflow documentation

### Adding a New React Component

1. Create component in `frontend/src/components/`
2. Add to appropriate route in `App.tsx`
3. Connect to stores if needed
4. Update relevant workflow documentation

## Example Tasks

```bash
# Add new endpoint
"Add a DELETE endpoint for threads"

# Create component
"Create a thread deletion confirmation modal"

# Fix API issue
"Debug 401 errors on message fetch"
```

## Integration Points

- [CODE_TO_WORKFLOW_MAP.md](../context/CODE_TO_WORKFLOW_MAP.md) - File mappings
- Crypto modules (for encrypted payload handling)
- WebSocket service (for real-time updates)

## Validation Checklist

- [ ] API returns proper status codes
- [ ] Request/response schemas match
- [ ] JWT required on protected endpoints
- [ ] Components handle loading/error states
- [ ] Documentation updated after changes

---

**Agent Type:** API/Frontend Specialist
**Complexity Level:** Medium-High
**Context Usage:** 30-40k tokens typical
