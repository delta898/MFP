FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY apps/trends/trends-api/package.json apps/trends/trends-api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY --chown=node:node apps/trends/trends-api/src /app/apps/trends/trends-api/src
COPY --chown=node:node apps/trends/shared /app/apps/trends/shared
COPY --chown=node:node shared/naver-trends-core /app/shared/naver-trends-core

USER node

WORKDIR /app/apps/trends/trends-api

EXPOSE 4581

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.TRENDS_API_PORT || '4581') + '/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "src/server.js"]
