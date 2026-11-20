# syntax=docker/dockerfile:1
# Habits: one image with the API and the built web app.
# Build on the server: DOCKER_HOST=ssh://kubi@192.168.0.2 docker build -t habits:latest .

# Slim (glibc), not Alpine: the TypeScript compiler (tsgo) ships as a native glibc binary.
FROM node:26-slim AS build
WORKDIR /app
# Manifests first, so the dependency layer is cached until they change.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
# Node runs the server's TypeScript directly (type stripping), so no build step for it.
COPY server server
COPY --from=build /app/dist dist

ENV HOST=0.0.0.0 \
    PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.ts"]
