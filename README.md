# lounge-co-demo (deploy only)

Generated from `lounge-co-demo/dist/`. **CTO steps:** `CTO_RUNBOOK.md` at the monorepo root.

## Quick start (after git pull)

```bash
export GROQ_API_KEY=gsk_xxxx
export GROQ_MODEL=openai/gpt-oss-120b
docker compose down
docker compose up --build
```

Open http://127.0.0.1:8080/ (homepage) and http://127.0.0.1:8080/health

## Push to DigitalOcean

Connect this repo to App Platform — Docker, port 8080, health /health, secrets GROQ_API_KEY + GROQ_MODEL.

Regenerate from monorepo: `node lounge-co-demo/scripts/package-for-digitalocean.mjs`
