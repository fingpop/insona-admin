# TESTING.md — Testing

**Generated:** 2026-04-14

## Test Framework

**None configured.** No test framework, no test files, no test scripts.

## Current State

- Zero test files in the codebase
- No `jest`, `vitest`, `playwright`, `cypress`, or similar in dependencies
- No `__tests__/` directories
- No `*.test.ts`, `*.test.tsx`, `*.spec.ts` files
- No CI/CD pipeline

## Manual Testing Approach

The project relies on:

1. **Direct browser testing** — `npm run dev` + browser interaction
2. **Debug scripts** in `scripts/`:
   - `debug-db.js` — database state inspection
   - `check_energy.js` — energy data verification
   - `verify-room-binding.js` — room-device binding checks
   - `verify-complete-binding.js` — complete binding verification
   - `analyze_energy_log.js` — energy log analysis
3. **Log files** for debugging:
   - `energy_events.log` — energy event logging
   - `dev.log` — large development log (418MB)
   - `daemon.log` — daemon process logs
4. **Implementation docs** in `docs/` — manual verification notes

## Recommended Testing Additions

If testing were to be added:

| Layer | Tool | What to test |
|-------|------|-------------|
| Unit | Vitest | `SchedulerCore.ts` cron parsing, `GatewayService.ts` message parsing |
| Integration | Vitest + SQLite temp DB | Prisma queries, energy aggregation logic |
| API | `@shelf/jest-mongodb` or temp SQLite | API route handlers |
| E2E | Playwright | Dashboard flow, device control, scene activation |

## Critical Untested Areas

1. **Energy three-write strategy** — complex aggregation logic
2. **Scheduler cron parsing** — edge cases in `shouldRunNow()`
3. **Gateway message buffering** — `_drainBuffer()` logic
4. **Device ID parsing** — `parseStoredDeviceId()` / `buildStoredDeviceId()`
5. **Value parsing** — `parseValue()` with multiple format support
