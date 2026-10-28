# The website's live İBB data server. Build context: a snapshot holding live/ and
# frontend/src/lib/live/ (see deploy.sh); the result is one bundled file on plain Node.
FROM node:24-alpine AS build
WORKDIR /src/live
COPY live/package.json live/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY live/ ./
COPY frontend/src/lib/live/ /src/frontend/src/lib/live/
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY --from=build /src/live/dist/server.cjs ./
USER node
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.cjs"]
