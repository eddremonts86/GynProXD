# Static build served by nginx. The AI coach stays off in this image unless
# MINIMAX_API_KEY is provided at build time; without it the app falls back to
# the deterministic generator by design (see lib/ai-plan.ts).
FROM node:26-alpine AS build
WORKDIR /app
# Node 25+ stopped bundling corepack, so pnpm is installed outright.
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.29-alpine
# Rendered by the image's envsubst entrypoint; the defaults match the local
# replica and any Coolify deployment overrides them with plain env vars.
ENV SYNC_PROXY_TARGET=http://coolify-proxy
ENV SYNC_UPSTREAM_HOST=gynproxd-sync.localhost
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
