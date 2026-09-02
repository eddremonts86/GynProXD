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
# Whatever mode the checkout arrived with, nginx's worker has to be able to
# read what it serves. A developer machine with a strict umask hands COPY
# 0600 files and every illustration under /repdb comes back 403; production
# only escaped because its clone happened to be 0644. Done here, in the build
# stage, so the runtime image carries the fix without an extra layer.
RUN pnpm build && chmod -R a+rX dist

FROM nginx:1.29-alpine
# Rendered by the image's envsubst entrypoint; the defaults match the local
# replica and any Coolify deployment overrides them with plain env vars.
ENV SYNC_PROXY_TARGET=http://coolify-proxy
ENV SYNC_UPSTREAM_HOST=enforma-sync.localhost
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# The platform polls from outside; this is for `docker compose` and for
# anything that orders itself on this container being up rather than started.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
