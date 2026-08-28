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
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
