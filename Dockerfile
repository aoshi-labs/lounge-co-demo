FROM node:22-alpine

WORKDIR /app
COPY . .

ENV PORT=8080
ENV HOST=0.0.0.0
ENV STATIC_ROOT=/app

EXPOSE 8080
CMD ["node", "tools/sterlon-groq-gateway/server.mjs"]
