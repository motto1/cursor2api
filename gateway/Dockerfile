FROM node:22-alpine AS builder

WORKDIR /app

COPY gateway/package.json gateway/package-lock.json ./
RUN npm ci

COPY gateway/tsconfig.json ./
COPY gateway/src ./src
COPY gateway/public ./public
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 gateway

COPY gateway/package.json gateway/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=gateway:nodejs /app/dist ./dist
COPY --from=builder --chown=gateway:nodejs /app/public ./public
RUN mkdir -p /app/data && chown -R gateway:nodejs /app/data

USER gateway

EXPOSE 3010

CMD ["npm", "start"]
