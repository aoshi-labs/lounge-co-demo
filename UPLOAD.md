# Upload this folder to DigitalOcean

**Upload the entire `lounge-co-demo/dist/` directory** â€” not individual pages from your machine. Nothing in this bundle should reference `C:\`, `file://`, or `127.0.0.1` for production assets or navigation.

Deploy as a **Docker Web Service** (see `DEPLOYMENT.md`). A static-site-only upload will break Sterlon chat (`/api/sterlon/chat`).

## What is in the package

| Path | Purpose |
|------|---------|
| `animation-lab/` | Scroll-animation marketing lab |
| `sterlon.html` + `assets/` | Sterlon demo (needs Groq gateway) |
| `index.html` | Astro investor marketing site |
| `images/`, `assets/images/` | Shared images |
| `tools/sterlon-groq-gateway/` | Node server + `POST /api/sterlon/chat` |
| `Dockerfile`, `compose.yml` | Container entry for App Platform |

## URLs after deploy (replace host with yours)

| Page | URL |
|------|-----|
| **Homepage (animation lab)** | `https://YOUR-APP.ondigitalocean.app/` |
| Same lab (alternate path) | `https://YOUR-APP.ondigitalocean.app/animation-lab/` |
| Sterlon demo | `https://YOUR-APP.ondigitalocean.app/sterlon.html?fresh=1` |
| Legacy marketing scroll site | `https://YOUR-APP.ondigitalocean.app/marketing.html` |
| Gateway health | `https://YOUR-APP.ondigitalocean.app/health` |

## Animation lab â†’ Demo button

The **Demo** CTA links to Sterlon on the same host:

```html
<a href="/sterlon.html?fresh=1">Demo</a>
```

The homepage uses `<base href="/animation-lab/">` so CSS, JS, and media load correctly whether the URL bar shows `/` or `/animation-lab/`.

## Required App Platform secrets

```txt
GROQ_API_KEY=your_groq_api_key
```

Do **not** set `GROQ_MOCK=true` for live AI.

Optional:

```txt
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_MAX_RETRIES=3
GROQ_REQUEST_INTERVAL_MS=1200
PORT=8080
HOST=0.0.0.0
STATIC_ROOT=/app
```

## Pre-upload checklist

- [ ] Docker build context = this folder (`lounge-co-demo/dist`)
- [ ] `GROQ_API_KEY` set in DO (secret), `GROQ_MOCK` unset
- [ ] `/health` returns `"mock": false`, `"groqKeyConfigured": true`
- [ ] Open `/animation-lab/` â€” no broken images in Private Rooms section
- [ ] Click **Demo** â€” lands on Sterlon with live gateway (not `[MOCK]` text)

## Local smoke test before upload

From this directory:

```powershell
$env:GROQ_API_KEY="gsk_..."
docker compose up --build
```

Then:

- http://127.0.0.1:8080/animation-lab/
- http://127.0.0.1:8080/sterlon.html?fresh=1
- http://127.0.0.1:8080/health

