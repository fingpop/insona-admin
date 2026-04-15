---
phase: 03-operational-verification
plan: 01
subsystem: gateway-connection
tags: [gateway, auto-connect, instrumentation, TDD]
dependency_graph:
  requires: []
  provides: [GATEWAY-01]
  affects: ["src/instrumentation.ts", "src/lib/gateway/autoConnect.ts"]
tech-stack:
  added: [vitest]
  patterns: [dynamic-import, error-handling, env-var-configuration]
key-files:
  created:
    - src/lib/gateway/autoConnect.ts
    - __tests__/gateway-autoconnect.test.ts
    - vitest.config.ts
  modified:
    - src/instrumentation.ts
    - package.json (added vitest)
decisions:
  - Extracted gateway auto-connect into separate autoConnect.ts module for testability
  - Used dynamic import (consistent with existing scheduler pattern in instrumentation.ts)
  - Used vitest as test framework (no existing test infrastructure)
  - tryConnectGateway() is fire-and-wait (not fire-and-forget) so success/failure is logged
metrics:
  duration: ~15 min
  completed_date: "2026-04-15"
---

# Phase 3 Plan 01: Gateway Auto-Connect on Startup Summary

**One-liner:** Gateway auto-connect on Next.js server startup via instrumentation hook, reading GATEWAY_IP/GATEWAY_PORT from environment, with try/catch ensuring server startup is never blocked.

## Objective Met

GATEWAY-01 satisfied: application connects gateway on startup using .env config, no HTTP/API call needed.

## Tasks Completed

| Task | Status | Commit |
|------|--------|--------|
| Task 1: Add gateway auto-connect to instrumentation.ts | Complete | `d74d001` |

## What Was Built

### 1. Test infrastructure (TDD)
- Installed vitest as dev dependency
- Created `vitest.config.ts` with `@/` path alias resolution
- Created `__tests__/gateway-autoconnect.test.ts` with 4 test cases

### 2. Gateway auto-connect module
- Created `src/lib/gateway/autoConnect.ts` with `tryConnectGateway()` function
- Reads `GATEWAY_IP` from `process.env`, defaults port to `8091`
- Logs: `[Instrumentation] 正在连接网关 {ip}:{port}`
- Logs success: `[Instrumentation] 网关连接成功: {ip}:{port}`
- Logs warning when GATEWAY_IP missing: `[Instrumentation] GATEWAY_IP 未配置，跳过网关连接`
- Logs error without throwing: `[Instrumentation] 网关连接失败: {error message}`

### 3. Instrumentation hook integration
- Modified `src/instrumentation.ts` to call `tryConnectGateway()` after `startScheduler()`
- Used dynamic import consistent with existing scheduler pattern

## Deviations from Plan

### Deviation 1 - Extracted to separate module
- **Found during:** Task 1 (TDD setup)
- **Issue:** Plan expected gateway logic directly in instrumentation.ts, but direct import of GatewayService in tests is impossible (it uses Prisma which needs database)
- **Fix:** Created `src/lib/gateway/autoConnect.ts` as a thin wrapper module. instrumentation.ts imports and calls it. This makes the function independently testable while keeping instrumentation.ts clean.
- **Files modified:** `src/lib/gateway/autoConnect.ts` (created), `src/instrumentation.ts` (imported autoConnect instead of direct GatewayService)
- **Commit:** `d74d001`

## Auto-fixed Issues

None.

## Threat Verification

| Threat | Status |
|--------|--------|
| T-03-01 (Spoofing - accept) | No change - gateway on internal network, no auth |
| T-03-02 (Info Disclosure - mitigate) | GATEWAY_IP passed via .env file, not hardcoded |
| T-03-03 (DoS - mitigate) | try/catch ensures server starts even if gateway unreachable |

## Self-Check

- [x] `src/lib/gateway/autoConnect.ts` exists
- [x] `src/instrumentation.ts` modified
- [x] `__tests__/gateway-autoconnect.test.ts` exists
- [x] `vitest.config.ts` exists
- [x] Tests pass (4/4)
- [x] TypeScript compiles (no errors)
- [x] All 3 commits exist: `893f705`, `d74d001`, `df0ef30`

## Self-Check: PASSED
