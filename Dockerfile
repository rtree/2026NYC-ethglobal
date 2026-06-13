# IntentOS control panel — single container: builds the dApp + server, runs the Node server which
# serves app/dist and the write-path API. Keys are NOT baked in; they come from KMS / Secret Manager
# via the Cloud Run service account (ADC) at runtime.
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY . .
# .npmrc keeps ignore-scripts=true; lockfile is committed.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @intentos/shared build \
 && pnpm --filter @intentos/runtime build \
 && pnpm --filter @intentos/server build \
 && pnpm --filter @intentos/app build

# Runtime image: reuse the built tree (pnpm symlinked node_modules stays intact within one stage copy).
FROM node:22-slim
WORKDIR /repo
ENV NODE_ENV=production PORT=8080 APP_DIST=/repo/app/dist
COPY --from=build /repo /repo
EXPOSE 8080
CMD ["node", "packages/server/dist/server.js"]
