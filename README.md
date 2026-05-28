# lounge-co-demo (deploy only)

Generated from `lounge-co-demo/dist/`.

## Runtime

Docker web service on port `8080`.

- `/` opens the Lounge & Co. animation-lab homepage.
- `/sterlon.html?fresh=1` opens the Sterlon demo.
- `/api/sterlon/chat` proxies Sterlon chat to Groq.
- `/health` reports gateway status.

Required DigitalOcean secret: `GROQ_API_KEY`.
Recommended model: `llama-3.3-70b-versatile`.
