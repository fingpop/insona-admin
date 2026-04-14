# Phase 2: Production Runtime - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Production runtime environment: .env configuration, process management (docker-compose/systemd), SQLite data persistence, auto-restart, auto-start on boot, logging to stdout.

**What this phase delivers:**
- Verified .env configuration works end-to-end for DATABASE_URL, GATEWAY_IP, GATEWAY_PORT
- Auto-start on boot capability (systemd service or docker-compose integration)
- Verified logging outputs to stdout / docker logs
- Any missing pieces from Phase 1's docker setup
</domain>

<decisions>
## Implementation Decisions

### Runtime Configuration
- .env file is already used by docker-compose.yml via `env_file` directive
- DATABASE_URL in .env: `file:./dev.db` (local) — docker-compose overrides to `file:/app/data/dev.db` (container)
- GATEWAY_IP and GATEWAY_PORT read from process.env in GatewayService
- **DECISION:** Keep .env as single source of truth. Docker-compose `environment` override for DATABASE_URL is correct pattern.

### Prisma Schema
- Already uses `env("DATABASE_URL")` — no changes needed
- SQLite provider, no migration to external DB

### Process Management
- docker-compose already has `restart: unless-stopped` — covers auto-restart
- `prisma migrate deploy` already runs before app start in docker-compose command
- **GAP:** No auto-start on boot. Docker Compose service needs systemd unit or `docker compose up -d` on boot.

### Logging
- Next.js standalone (`node server.js`) outputs to stdout by default
- Docker captures stdout — `docker compose logs` works
- **NEEDS VERIFICATION:** Ensure instrumentation hook logs don't get swallowed

### Data Persistence
- Volume mapping `./data:/app/data` already configured
- SQLite db at `/app/data/dev.db` persists across restarts

### What's Already Done (from Phase 1)
- CONFIG-01: .env file exists with DATABASE_URL, GATEWAY_IP, GATEWAY_PORT
- CONFIG-02: DATABASE_URL configurable
- CONFIG-03: Prisma schema uses env("DATABASE_URL")
- PROCESS-01: docker-compose manages process
- PROCESS-02: `restart: unless-stopped`
- DB-01: Volume persistence
- DB-02: `prisma migrate deploy` in startup command
- PROCESS-04: stdout logging (needs verification)

### What's Missing
- PROCESS-03: Auto-start on boot — needs systemd service file for `docker compose up -d`
- PROCESS-04: Verify logging works correctly in production
</decisions>

<canonical_refs>
## Canonical References

- `docker-compose.yml` — Current service configuration
- `.env` — Current environment variables
- `.env.example` — Template for server deployment
- `prisma/schema.prisma` — DATABASE_URL env usage
- `Dockerfile` — Production image build
- `src/lib/gateway/GatewayService.ts` — GATEWAY_IP/GATEWAY_PORT usage
- `src/instrumentation.ts` — Background scheduler startup
</canonical_refs>

<specifics>
## Specific Ideas

- systemd unit file: `/etc/systemd/system/insona-admin.service` that runs `docker compose up -d`
- Or use Docker's built-in `restart: always` with systemd for docker.service (already covers most cases)
- Consider adding a healthcheck to docker-compose.yml for better process management
</specifics>

<deferred>
## Deferred Ideas

None — Phase 2 scope is narrow, most items covered by Phase 1 work.
</deferred>

---

*Phase: 02-production-runtime*
*Context gathered: 2026-04-14*
