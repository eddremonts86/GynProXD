# enForma push sender: watches the gym bus and delivers Web Push.
FROM node:26-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.mjs ./
# Healthy while the poll loop keeps touching /state/alive: six polls (60 s at
# the default 10 s) without a touch means the loop is stuck, not merely idle.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=2 \
  CMD node -e "const t=Number(require('fs').readFileSync(process.env.ALIVE_FILE||'/state/alive','utf8'));process.exit(Date.now()-t<6*Number(process.env.POLL_MS||10000)?0:1)"
CMD ["node", "index.mjs"]
