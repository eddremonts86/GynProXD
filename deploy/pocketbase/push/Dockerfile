# enForma push sender: watches the gym bus and delivers Web Push.
FROM node:26-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.mjs ./
CMD ["node", "index.mjs"]
