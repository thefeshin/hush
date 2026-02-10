# HUSH - Zero-Knowledge Encrypted Chat Vault

[![GitHub Stars](https://img.shields.io/github/stars/thefeshin/hush?style=for-the-badge)](https://github.com/thefeshin/hush/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/thefeshin/hush?style=for-the-badge)](https://github.com/thefeshin/hush/network/members)
[![License](https://img.shields.io/github/license/thefeshin/hush?style=for-the-badge)](https://github.com/thefeshin/hush/blob/main/LICENSE)

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=for-the-badge&logo=nginx&logoColor=white)

English | [فارسی](README.fa.md) | [License](LICENSE)

HUSH is a self-hosted private messaging vault focused on client-side cryptography and minimal server trust.
The backend relays encrypted payloads and stores only metadata needed for routing, discovery, and session management.

## What HUSH Provides

- End-to-end encryption workflow in the client (Argon2id + HKDF + AES-GCM).
- Cookie-based authentication with refresh-token rotation.
- Real-time messaging over WebSocket with offline queue support.
- PWA frontend and Docker-first deployment.
- Air-gapped/offline bundle deployment scripts.

## Current Status

P0 hardening is complete as of **February 10, 2026**:
- strict server-side participant authorization is enforced for REST and WebSocket message paths,
- WebSocket identity binding no longer trusts client-supplied `user_id`,
- WebSocket query-token auth is removed (cookie-only),
- raw vault-key storage in `sessionStorage` is removed (memory-only runtime cache).

P1 hardening is also complete as of **February 10, 2026**:
- vault lock now preserves PIN setup by default,
- REST fallback send path is aligned to `POST /api/messages`,
- offline bundle scripts generate supported `FAILURE_MODE=ip_temp`,
- backend startup fails fast on missing auth secrets or invalid failure mode,
- `/health/db` now returns sanitized `503` on database failure.

Post-P1 refactor/validation phases are complete as of **February 10, 2026**:
- legacy thread/conversation compatibility layers were removed in favor of conversation-first frontend state,
- realtime connection lifecycle is centralized under a single provider-owned path,
- strict payload guards are enforced for REST/WebSocket encrypted fields (base64 validation, IV length, ciphertext caps),
- WebSocket now applies per-connection subscription caps and inbound message rate guards.

Breaking client contract changes:
- WebSocket no longer accepts `?token=...`.
- `subscribe_user` payload is now `{"type":"subscribe_user"}` (no `user_id` field).

## Repository Layout

- `backend/`: FastAPI API + WebSocket relay.
- `frontend/`: React + TypeScript client (crypto, stores, PWA).
- `cli/`: interactive setup and secret generation.
- `offline/`: bundle/deploy scripts for air-gapped environments.
- `nginx/`: reverse proxy and TLS config.

## Security and Realtime Notes

- WebSocket authentication is cookie-only (`access_token` cookie).
- `subscribe_user` payload is `{"type":"subscribe_user"}` (no client `user_id`).
- REST and WebSocket payload validation enforces:
  - strict base64 decoding,
  - IV length = 12 bytes,
  - ciphertext caps (messages: 64 KiB decoded, thread metadata: 16 KiB decoded),
  - per-connection WebSocket safeguards (subscription cap + inbound rate guard).

## Prerequisites

- Docker + Docker Compose
- Python 3
- Node.js + npm (for local frontend dev)
- OpenSSL (for local cert generation)

## Online Deployment (Connected Host)

### Guided deployment (recommended)

Linux/macOS:
```bash
chmod +x ./hush.sh
./hush.sh
```

Windows PowerShell:
```powershell
.\hush.ps1
```

Choose Docker mode in the prompt. Access app at `https://localhost`.

### Manual Docker deployment

```bash
docker compose build
docker compose up -d
docker compose ps
```

## Local Development (Without Full Docker Stack)

1. Start PostgreSQL:
```bash
docker run -d --name hush-postgres -e POSTGRES_USER=hush -e POSTGRES_PASSWORD=hush -e POSTGRES_DB=hush -p 5432:5432 postgres:16-alpine
```

2. Start backend:
```bash
cd backend
python -m venv venv
# Windows: .\venv\Scripts\Activate.ps1
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Optional backend tests:
```bash
pip install -r requirements-dev.txt
pytest -q
```

3. Start frontend:
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000` (configured in `frontend/vite.config.ts`).

## Offline Deployment (Air-Gapped)

### On internet-connected machine

Linux/macOS:
```bash
./offline/build-bundle.sh
```

Windows:
```powershell
.\offline\build-bundle.ps1
```

This produces `offline/hush-offline-bundle.tar` and generates `.env`.

### Transfer to air-gapped machine

Copy:
- `offline/hush-offline-bundle.tar`
- `docker-compose.yml`
- `nginx/`
- `offline/deploy-offline.sh` or `offline/deploy-offline.ps1`
- `.env` (if you are not regenerating it on target)

### On air-gapped machine

Linux/macOS:
```bash
./offline/deploy-offline.sh
```

Windows:
```powershell
.\offline\deploy-offline.ps1
```

## Operations

```bash
docker compose logs -f
docker compose ps
docker compose restart backend
docker compose down -v
```

## Planned Improvements

1. Add end-to-end reconnect/resubscribe integration tests against a live WebSocket server.
2. Add deployment-level override knobs for payload/rate limits where operators need tuning.
3. Expand frontend queue replay tests for intermittent connectivity scenarios.

## Language and License

- Persian docs: `README.fa.md`
- License: MIT (`LICENSE`)
