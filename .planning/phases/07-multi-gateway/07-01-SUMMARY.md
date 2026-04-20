# Phase 7: Multi-Gateway Architecture — Summary

**Goal:** 系统支持同时连接多个网关（10-20个），设置页提供网关管理 UI，设备自动归属来源网关

**Status:** ✅ COMPLETED

**Date:** 2026-04-20

---

## Changes Made

### Database (Task 1)
- `Gateway` model: `id` changed from `@default("default")` to `@default(cuid())`, added `name` field
- `Device` model: added `gatewayId` field with relation to `Gateway`
- `SceneAction` model: added `gatewayId` field for scene execution routing
- Data migration: existing "default" gateway migrated to cuid() id, all 18 devices linked

### Core Architecture (Task 2)
- `GatewayService.ts`: de-singletonized — accepts `gatewayId` constructor parameter, exposes `id`, `connectionIp`, `connectionPort` getters
- `GatewayService._handleDisconnect()`: now scopes device offline update to `gatewayId` (was marking ALL devices offline)
- `GatewayService.syncDevices()`: writes `gatewayId` on device create
- `MultiGatewayService.ts` (new): singleton manager with `connectGateway`, `disconnectGateway`, `removeGateway`, `loadAndConnectAll`, SSE event enrichment with gatewayId
- `autoConnect.ts`: delegates to `MultiGatewayService.loadAndConnectAll()`
- `instrumentation.ts`: uses `multiGatewayService.loadAndConnectAll()` on server startup

### API Routes (Task 3)
- `/api/gateway/connect`: supports `gatewayId` for specific gateway + backward compat
- `/api/gateway/status`: returns all gateways with live status
- `/api/gateway/disconnect`: supports `gatewayId` or disconnects all
- `/api/gateway/autoconnect`: delegates to `loadAndConnectAll()`
- `/api/events`: subscribes to `multiGatewayService` (SSE event enrichment)
- `/api/gateway/add` (new): create new gateway with IP validation
- `/api/gateway/remove` (new): disconnect + unlink devices + delete
- `/api/gateway/list` (new): list all gateways with live status
- `/api/gateway/update` (new): update gateway name

### UI (Task 4)
- `settings/page.tsx`: replaced single gateway form with gateway list (GatewayCard + AddGatewayForm)
- Each card: name, IP:port, status indicator, connect/disconnect/diagnose/remove
- `useGatewayEvents.ts`: aggregates multi-gateway status, parses gatewayId from events

### Legacy Migration (Task 5)
- `/api/devices/route.ts`: syncs from ALL connected gateways
- `/api/devices/control/route.ts`: routes to correct gateway via `device.gatewayId`
- `SchedulerCore.ts`: gateway-aware task execution (uses device's gatewayId)
- `/api/system/reset/route.ts`: disconnects ALL gateways
- `/api/scenes/activate/route.ts`: uses multiGatewayService
- `/api/scenes/[id]/activate/route.ts`: groups scene actions by device gatewayId

## Files Modified (25)
- `prisma/schema.prisma`
- `src/lib/gateway/GatewayService.ts`
- `src/lib/gateway/MultiGatewayService.ts` (new)
- `src/lib/gateway/autoConnect.ts`
- `src/lib/scheduler/SchedulerCore.ts`
- `src/instrumentation.ts`
- `src/app/api/gateway/connect/route.ts`
- `src/app/api/gateway/status/route.ts`
- `src/app/api/gateway/disconnect/route.ts`
- `src/app/api/gateway/autoconnect/route.ts`
- `src/app/api/gateway/test/route.ts` (unchanged, works standalone)
- `src/app/api/events/route.ts`
- `src/app/api/gateway/add/route.ts` (new)
- `src/app/api/gateway/remove/route.ts` (new)
- `src/app/api/gateway/list/route.ts` (new)
- `src/app/api/gateway/update/route.ts` (new)
- `src/app/api/devices/route.ts`
- `src/app/api/devices/control/route.ts`
- `src/app/api/scenes/activate/route.ts`
- `src/app/api/scenes/[id]/activate/route.ts`
- `src/app/api/system/reset/route.ts`
- `src/app/(dashboard)/settings/page.tsx`
- `src/hooks/useGatewayEvents.ts`

## Verification
- `grep -rn "gatewayService" src/` → 0 matches (all migrated)
- `npx tsc --noEmit` → no errors
- Database migration: 1 gateway migrated, 18 devices linked
- Git backup: `prisma/dev.db.backup` exists

## Commits
1. `008d1f4` — feat: multi-gateway architecture (Tasks 1-3)
2. `cbc97f0` — feat: complete multi-gateway migration (Tasks 4-5)
