# Phase 3: Operational Verification - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify and complete: gateway auto-connect on startup, auto-reconnect validation, file-based energy event logging with rotation, one-click deployment script.

**What this phase delivers:**
- GatewayService connects automatically on app startup (not just on API call)
- Energy event logs written to dedicated file with logrotate config
- One-click deployment script
- Verify all existing artifacts work end-to-end
</domain>

<decisions>
## Implementation Decisions

### GATEWAY-01: Auto-connect on startup
- Current state: `/api/gateway/autoconnect` POST route exists but is NOT called on startup
- `instrumentation.ts` starts scheduler but does NOT connect gateway
- SchedulerCore has reconnection logic but depends on gateway being connected first
- **DECISION:** Add gateway auto-connect call to `instrumentation.ts` after scheduler start
- The autoconnect route reads from DB — need to store gateway config from .env on first run
- **GAP:** GatewayService connects via `gatewayService.connect(ip, port)` — needs to read from `process.env.GATEWAY_IP` / `process.env.GATEWAY_PORT`

### GATEWAY-02: Auto-reconnect
- GatewayService already has exponential backoff reconnect (2^attempt * 1000ms, max 60s, max attempts)
- `maxReconnectAttempts` — need to check what value it has
- SchedulerCore also has reconnection recovery on tick
- **VERIFICATION NEEDED** — confirm in production Docker build

### LOG-01: Logging visible
- Already verified in Phase 2 (console.log → stdout → docker logs)
- **NO NEW WORK NEEDED**

### LOG-02: Energy event log file with rotation
- Currently: energy events are stored in DB (EnergyData, EnergyHourly, EnergyRecord)
- No file-based log output for energy events
- **NEW:** Create a file writer for energy events — append to a log file
- Need to create: log directory, log writer utility, logrotate config
- File path: `/app/data/logs/energy.log` (inside container, via volume)
- **DECISION:** Simple append-only log file in JSON-lines format, one event per line
- Logrotate: provide config file for server deployment

### DOC-02: One-click deploy script
- Current state: DEPLOY.md has manual steps
- **NEW:** `scripts/deploy.sh` — clone, configure .env, build, start
- Interactive script that prompts for GATEWAY_IP, then does everything
</decisions>

<canonical_refs>
## Canonical References

- `src/instrumentation.ts` — Server startup hook (needs gateway auto-connect)
- `src/lib/gateway/GatewayService.ts` — Gateway connection with reconnect logic
- `src/app/api/gateway/autoconnect/route.ts` — Existing autoconnect API
- `src/lib/scheduler/SchedulerCore.ts` — Scheduler with reconnection recovery
- `.env.example` — Environment variables template
- `docker-compose.yml` — Docker service config
- `DEPLOY.md` — Current deployment guide
</canonical_refs>

<specifics>
## Specific Ideas

- Instrumentation hook: add `await gatewayService.connect(...)` using env vars
- Energy logging: write to `./data/logs/energy.log` in JSON-lines format
- Logrotate config: `/etc/logrotate.d/insona-admin`
- Deploy script: bash script with .env generation, docker compose up
</specifics>

<deferred>
## Deferred Ideas

None — Phase 3 scope is clear.
</deferred>

---

*Phase: 03-operational-verification*
*Context gathered: 2026-04-15*
