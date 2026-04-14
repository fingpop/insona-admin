# ─── Builder stage ───
FROM node:20-alpine AS builder

WORKDIR /app

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
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy Prisma schema for runtime migrations
COPY prisma/schema.prisma ./prisma/

# Copy standalone output from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
