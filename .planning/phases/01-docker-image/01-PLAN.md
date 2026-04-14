# PLAN: Phase 1 — Docker Image

**Phase:** 1
**Goal:** 产出可运行的 Docker 镜像，包含 Next.js 生产构建和完整的 Prisma client
**Wave:** 1
**Depends on:** Nothing
**Requirements addressed:** DOCKER-01, DOCKER-02, DOCKER-03, DOC-01
**Files to be modified:**
- `Dockerfile` (new)
- `.dockerignore` (new)
- `docker-compose.yml` (new)
- `src/lib/prisma.ts` (minimal change for production)
- `next.config.mjs` (add standalone output)
- `DEPLOY.md` (new — deployment guide)
- `.env.example` (new)

---

## Objective

Create a production-ready Docker setup for the Next.js app with:
- Multi-stage build (build → runtime) for small image size
- Standalone output mode to minimize image size
- Prisma client generation inside the build
- SQLite support with persistent volume mapping
- A basic docker-compose.yml for running with .env
- A DEPLOY.md document describing the full deployment process

---

## Tasks

### Task 1: Configure Next.js for Docker standalone output

**read_first:**
- `next.config.mjs`
- `package.json`

**acceptance_criteria:**
- `next.config.mjs` contains `output: 'standalone'` in the config object
- `next.config.mjs` still has `experimental.instrumentationHook: true`

**action:**
Add `output: 'standalone'` to the existing `nextConfig` object in `next.config.mjs`:

```js
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  output: 'standalone',
};
```

---

### Task 2: Create .dockerignore

**read_first:**
- `.gitignore`

**acceptance_criteria:**
- `.dockerignore` file exists at project root
- Excludes: `node_modules`, `.next`, `.git`, `.env`, `*.db`, `*.db-journal`, `.claude`, `.DS_Store`, `tsconfig.tsbuildinfo`, `dev.log`, `energy_events.log`, `docs/`, `scripts/` (except needed ones), `.planning/`

**action:**
Create `.dockerignore` with appropriate exclusions for the Docker build context. Must exclude development files, logs, databases, and planning directories.

---

### Task 3: Create Dockerfile with multi-stage build

**read_first:**
- `package.json`
- `prisma/schema.prisma`
- `next.config.mjs`
- `tsconfig.json`
- `.gitignore`

**acceptance_criteria:**
- `Dockerfile` exists at project root
- Uses multi-stage build (builder + runner stages)
- Base images use `node:20-alpine` or `node:18-alpine`
- Builder stage: installs all dependencies, generates Prisma client, runs `next build`
- Runner stage: copies standalone output from `.next/standalone` and `.next/static`
- Includes `prisma generate` step before build
- Sets `NODE_ENV=production`
- Exposes port 3000
- Uses `CMD ["node", "server.js"]` as the entry point
- Does NOT include devDependencies in the runner stage

**action:**
Create a `Dockerfile` with:

1. **Builder stage** (`FROM node:20-alpine AS builder`):
   - Set `WORKDIR /app`
   - Copy `package.json` and `package-lock.json`, run `npm ci`
   - Copy `prisma/schema.prisma`, run `npx prisma generate`
   - Copy all source files
   - Run `npm run build` (produces `.next/standalone`)

2. **Runner stage** (`FROM node:20-alpine AS runner`):
   - Set `WORKDIR /app`
   - Set `NODE_ENV=production`
   - Create `/app/data` directory for SQLite persistence
   - Copy `package.json` + `package-lock.json`, run `npm ci --omit=dev`
   - Copy `prisma/schema.prisma` for runtime migrations
   - Copy `.next/standalone` from builder
   - Copy `.next/static` from builder
   - Expose port 3000
   - CMD `["node", "server.js"]`

---

### Task 4: Create docker-compose.yml

**read_first:**
- `.env`
- `prisma/schema.prisma`

**acceptance_criteria:**
- `docker-compose.yml` exists at project root
- Defines a single service named `insona-admin`
- Builds from the local `Dockerfile`
- Maps port 3000
- Mounts a volume for SQLite data at `/app/data` (or `/app/prisma`)
- References `.env` file for environment variables
- Sets `restart: unless-stopped`
- Includes a startup command that runs `prisma migrate deploy` before starting the app

**action:**
Create `docker-compose.yml` with:
- Service `insona-admin`
- `build: .`
- `ports: ["3000:3000"]`
- `volumes: ["./data:/app/data"]` (for SQLite persistence)
- `env_file: .env`
- `restart: unless-stopped`
- `command` that runs `npx prisma migrate deploy && node server.js` (needs to be adapted for the standalone output)

---

### Task 5: Create .env.example

**read_first:**
- `.env`
- `prisma/schema.prisma`

**acceptance_criteria:**
- `.env.example` exists at project root
- Contains: `DATABASE_URL`, `GATEWAY_IP`, `GATEWAY_PORT`
- `DATABASE_URL` uses a path inside the container's data directory (e.g., `file:/app/data/dev.db`)
- All values have comments explaining their purpose
- No real secrets or localhost-specific IPs in example values

**action:**
Create `.env.example` with documented environment variables:
```
DATABASE_URL="file:/app/data/dev.db"
GATEWAY_IP="192.168.1.100"
GATEWAY_PORT=8091
```

---

### Task 6: Create DEPLOY.md deployment guide

**read_first:**
- `package.json`
- `prisma/schema.prisma`
- `.env`
- `src/instrumentation.ts`

**acceptance_criteria:**
- `DEPLOY.md` exists at project root
- Covers: prerequisites, building the image, running with docker-compose, .env configuration, SQLite persistence, health check, troubleshooting
- Includes complete copy-paste commands
- Explains how to verify the app is running
- Explains how to view logs
- Explains how to update/redeploy

**action:**
Create `DEPLOY.md` with sections:
1. Prerequisites (Docker, Docker Compose)
2. Clone and configure (copy `.env.example` to `.env`, set gateway IP)
3. Build and run (`docker compose up -d --build`)
4. Verify (curl localhost:3000, docker logs)
5. Data persistence (volume mapping explanation)
6. Update/redeploy (pull, rebuild, restart)
7. Troubleshooting (common issues: gateway unreachable, database not persisting)

---

## Verification

Phase is complete when:

1. `docker build -t insona-admin .` succeeds
2. `docker run -p 3000:3000 insona-admin` serves the app at http://localhost:3000
3. `docker image inspect insona-admin --format='{{.Size}}'` shows < 500MB
4. `prisma generate` output is included in the image (verified by checking `node_modules/.prisma/client` exists in the container)
5. `DEPLOY.md` document exists with complete instructions
6. `.env.example` exists with all required variables
