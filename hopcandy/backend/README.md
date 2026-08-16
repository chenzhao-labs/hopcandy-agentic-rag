# HopCandy Backend v0.1

This adapter exposes frozen publication data and an optional, guarded Live
Agent endpoint. It does not load the Agent, model, index, or corpus at import
time.

## Endpoints

```text
GET  /api/v1/health
GET  /api/v1/meta
GET  /api/v1/examples
GET  /api/v1/experiments
POST /api/v1/query
```

The read endpoints use the deterministic bundled publication artifacts under
`hopcandy/public_data`. The browser can continue using those same files when
this backend is offline.

`POST /api/v1/query` is intended for a trusted Vercel server-side proxy. It
requires `X-HopCandy-Backend-Token`, accepts one active request, and returns a
complete `hopcandy-api-v1` response after the blocking Agent run finishes.
The browser must not receive the backend token or call the GPU server directly.

## Local Replay-only server

```powershell
.\.venv\Scripts\uvicorn.exe hopcandy.backend.app:app --host 127.0.0.1 --port 8000
```

The default is `HOPCANDY_LIVE_ENABLED=false`. `/api/v1/health` therefore
reports Replay available and Live offline.

## On-demand GPU configuration

Use `hopcandy/backend/.env.example` as the variable list. Store real values in
the GPU server environment; never commit `.env` files. Live readiness requires
the service token, six-document index, corpus, Machine Facts, and entity
catalog. Step 8 performs the required real structured and textual integration
runs before any public Live status may be shown as ready.
