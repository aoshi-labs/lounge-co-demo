# Sterlon Groq gateway

Small Node gateway for the visionboard demo. It keeps `GROQ_API_KEY` on the server and exposes an OpenAI-compatible chat endpoint at:

```txt
POST /api/sterlon/chat
```

Deployment instructions live in:

```txt
docs/visionboard/DEPLOYMENT.md
```

For local development, copy `.env.example` to `.env`, set `GROQ_API_KEY`, and run:

```bash
npm start
```

Do not commit `.env` or place provider keys in browser JavaScript.
