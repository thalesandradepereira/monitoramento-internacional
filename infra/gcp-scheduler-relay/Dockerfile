FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production
ENV PORT=8080
USER node
CMD ["node", "src/server.mjs"]
