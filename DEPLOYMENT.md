# Lounge & Co. demo — deployment

**Upload folder:** `lounge-co-demo/dist/` (see `UPLOAD.md` for checklist and URLs).

This bundle includes the **animation lab**, **Sterlon visionboard demo**, **investor marketing site**, and the **Groq gateway** in one Docker image.

## Runtime shape

- Node serves static files from `STATIC_ROOT` (default `/app` in Docker).
- `tools/sterlon-groq-gateway/server.mjs` exposes `POST /api/sterlon/chat`.
- Browser config: `assets/javascript/sterlon-gateway.config.js` → same-origin `/api/sterlon/chat`.
- Provider credentials stay in server environment variables only.

## DigitalOcean App Platform

| Setting | Value |
|---------|--------|
| Component type | **Web Service** (Docker), not Static Site |
| Build context | `lounge-co-demo/dist` |
| Dockerfile | `Dockerfile` (in build context) |
| HTTP port | `8080` |
| Health check | `GET /health` |

### Required secret

```txt
GROQ_API_KEY=...
```

Do **not** set `GROQ_MOCK` (or set `GROQ_MOCK=false`) for live Sterlon.

### Recommended env

```txt
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_MAX_RETRIES=3
GROQ_REQUEST_INTERVAL_MS=1200
PORT=8080
HOST=0.0.0.0
STATIC_ROOT=/app
```

### Public routes

| Route | File |
|-------|------|
| `/` | `animation-lab/index.html` (homepage) |
| `/animation-lab/` | Same animation lab |
| `/sterlon.html` | Sterlon demo |
| `/marketing.html` | Legacy Astro investor scroll site |

## Local Docker check

From **`lounge-co-demo/dist`**:

```bash
GROQ_API_KEY=your_key docker compose up --build
```

Mock-only local test (no Groq calls):

```bash
GROQ_API_KEY=dummy GROQ_MOCK=true docker compose up --build
```

Open:

- http://127.0.0.1:8080/ (homepage)
- http://127.0.0.1:8080/sterlon.html?fresh=1
- http://127.0.0.1:8080/health

## Animation lab asset paths

All production links are **relative to the deploy host** (`../sterlon.html`, `../assets/images/...`, `../images/...`). Do not use `127.0.0.1`, Vite preview ports, or `C:\` paths in HTML/CSS.

## Existing DigitalOcean app

```txt
lounge-co-demo
https://lounge-co-demo-q9x2s.ondigitalocean.app
```

If the app is still a **Static Site**, switch to a **Docker Web Service** using this folder so `/api/sterlon/chat` exists.

## Security gaps before production

- Add auth/session checks to `/api/sterlon/chat`.
- Add request rate limiting by session or user.
- Scope CORS to the deployed domain.
- Replace the full catalog prompt with a smaller retrieval-backed payload before production traffic.
