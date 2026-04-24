# ─── Builder stage ───
FROM registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine AS builder

WORKDIR /app

# 配置国内 npm 镜像源（加速依赖安装）
RUN npm config set registry https://registry.npmmirror.com

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Generate Prisma client (needed for build)
COPY prisma/schema.prisma ./prisma/
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# ─── Runner stage ───
FROM registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 配置国内 npm 镜像源
RUN npm config set registry https://registry.npmmirror.com

# Install OpenSSL and other required libraries for Prisma
RUN apk add --no-cache openssl zlib-dev

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy Prisma CLI binary from builder (for runtime migrations)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy Prisma schema and migrations for runtime migrations
COPY prisma/schema.prisma ./prisma/
COPY prisma/migrations ./prisma/migrations/

# Copy standalone output from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
