# CONCERNS.md — Technical Debt & Areas of Concern

**Generated:** 2026-04-14

## High Priority

### 1. No Test Coverage
- **Impact:** Any change risks silent regression
- **Scope:** Entire codebase
- **Recommendation:** Add unit tests for `SchedulerCore.ts` and `GatewayService.ts` core logic first

### 2. Large `control/page.tsx`
- **Impact:** The main control page consolidates ALL tab modules (device, space, scene, energy, settings) in a single file. This makes it hard to navigate, test, and modify individual features
- **Recommendation:** Extract each tab into its own component file

### 3. Singleton GatewayService with TCP Connection
- **Impact:** In Next.js dev mode with Turbopack, hot module reloading can create multiple singleton instances or stale connections. In production with multiple server processes, only one process holds the TCP connection
- **Recommendation:** Consider connection pooling or externalizing gateway state

### 4. Massive Log Files
- `dev.log` is 418MB — likely accumulated debug output
- `energy_events.log` actively growing
- **Recommendation:** Implement log rotation, reduce debug verbosity in normal operation

## Medium Priority

### 5. Hardcoded Device Rated Powers
- `DEFAULT_RATED_POWER` in `types.ts` provides defaults but devices have `ratedPower` field defaulting to 10W
- **Risk:** Inaccurate energy calculations if rated power doesn't match actual device

### 6. Energy Data Cleanup Relies on Manual Trigger
- `EnergyData` records should be cleaned up automatically (retention: 1 hour) but the cleanup runs via API endpoint `POST /api/energy/cleanup`
- **Risk:** If nobody calls cleanup, table grows indefinitely
- **Recommendation:** Add cleanup to scheduler or GatewayService heartbeat

### 7. No Authentication/Authorization
- All API routes are open — no auth middleware, no session management
- **Risk:** Anyone on the network can control devices, view energy data, modify scenes
- **Note:** May be intentional for local network deployment, but should be documented

### 8. Database Schema Migration Not Tracked
- Uses `prisma db push` (shadow push) rather than formal migrations
- **Risk:** Schema drift between environments, no rollback capability
- **Note:** Acceptable for single-instance SQLite but problematic if multiple instances needed

### 9. Scheduler Double-Execution Guard is Time-Based
- `globalThis.__schedulerLastTick` prevents double execution within 55s window
- **Risk:** In multi-process deployments (e.g., PM2 cluster mode), each process has its own guard
- **Note:** Currently mitigated by single-process deployment

### 10. Error Handling Inconsistency
- Some errors are silently swallowed (`.catch(() => {})`)
- Some use `debug()` logging
- Some use `console.error()`
- **Recommendation:** Standardize error handling strategy

## Low Priority

### 11. Font Awesome via CDN
- External dependency for icons
- **Risk:** Fails if CDN unavailable (offline deployment)
- **Recommendation:** Bundle icons locally or use inline SVG

### 12. TypeScript `any` Usage
- `unknown` is used in some places but `as unknown as` casting patterns exist
- `Record<string, unknown>` for gateway messages is correct but makes type safety harder downstream

### 13. No Input Validation
- API routes don't validate request bodies (e.g., `zod`, `valibot`)
- **Risk:** Malformed requests can cause database errors or unexpected behavior

### 14. Room Type Inference is Heuristic
- `GatewayService.inferRoomType()` uses string matching on room names
- **Risk:** Incorrect type assignment for rooms with unusual naming

## Security Notes

- `.env` file is NOT in `.gitignore` (commented out) — credentials are committed
- `prisma/dev.db` IS in `.gitignore` — good
- No rate limiting on API routes
- No CORS configuration (Next.js defaults apply)
