FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev 2>/dev/null || true
COPY server.mjs ./
EXPOSE 8787
CMD ["node", "server.mjs"]
