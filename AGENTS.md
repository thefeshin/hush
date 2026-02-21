# Repository Guidelines

## Project Structure & Module Organization
- `backend/app/`: FastAPI service code (`routers/`, `schemas/`, `services/`, `middleware/`, `utils/`, `models/schema.sql`).
- `frontend/src/`: React + TypeScript app (`components/`, `crypto/`, `hooks/`, `services/`, `stores/`, `styles/`).
- `cli/`: deployment/configuration CLI used by the root launch scripts.
- `nginx/`: reverse proxy and TLS config (`nginx.conf`, local certs under `nginx/ssl/`).
- `offline/`: scripts for offline bundle/deploy workflows.

## Build, Test, and Development Commands
- Full stack (interactive): `./hush.sh` (Linux/macOS) or `.\hush.ps1` (Windows).
- Docker services directly: `docker-compose up --build -d` and `docker-compose logs -f`.
- Backend local dev:
  - `cd backend`
  - `python -m venv venv && .\venv\Scripts\Activate.ps1` (Windows) or `source venv/bin/activate`
  - `pip install -r requirements.txt`
  - `uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`
- Frontend local dev:
  - `cd frontend && npm install`
  - `npm run dev` (Vite on `http://localhost:3000`)
  - `npm run build` (type-check + production build)

## Coding Style & Naming Conventions
- Python: 4-space indentation, PEP 8 naming (`snake_case` for functions/modules, `PascalCase` for classes), concise module docstrings.
- TypeScript/React: strict TS config is enabled; use `PascalCase` for components, `useX` for hooks, and `camelCase` for utilities.
- Keep file naming consistent with existing patterns (`auth.py`, `threadStore.ts`, `LoginForm.tsx`).
- Prefer small, focused modules and keep cryptography logic inside `frontend/src/crypto/` and `backend/app/utils/`.

## Testing Guidelines
- No automated test framework or coverage gate is currently enforced in this repository.
- Minimum pre-PR checks: `npm run build`, backend startup check, and a manual end-to-end smoke test through the chat flow.
- After any Python code change, run `black --check backend/app backend/tests` before opening a PR.
- If the check fails, run `black backend/app backend/tests` and re-run the check.
- If adding tests, follow `test_*.py` (backend) and `*.test.tsx` (frontend) naming.

## Commit & Pull Request Guidelines
- Follow commit prefixes seen in history: `feat:`, `fix:`, `chore:`; keep messages short and imperative.
- Avoid leaving `WIP` commits in a final PR branch.
- PRs should include:
  - clear scope and security impact (especially auth/crypto changes),
  - linked issue (if available),
  - verification steps/commands run,
  - screenshots for UI changes.

## Security & Configuration Tips
- Never commit `.env` or generated secrets (`AUTH_HASH`, `KDF_SALT`, `JWT_SECRET`).
- Treat `nginx/ssl/` certificates as local/dev artifacts unless explicitly rotated for deployment.
