---
phase: 08-panel-scene-linkage
plan: "01"
subsystem: panel-scene-linkage
tags: [panel, scene, binding, gateway-event]
dependency_graph:
  requires:
    - Scene model with sceneId and meshId
    - GatewayService with activateScene method
    - DashboardEvent model for logging
  provides:
    - PanelSceneBinding CRUD API
    - switch.key event handler
    - Panel linkage UI tab
  affects:
    - Gateway message dispatch pipeline
    - Control panel navigation
tech_stack:
  added: [Prisma model, Next.js API routes, React component]
  patterns: [CRUD API, event-driven scene activation, inline-edit table]
key_files:
  created:
    - src/app/api/panel-bindings/route.ts
    - src/app/api/panel-bindings/[id]/route.ts
  modified:
    - prisma/schema.prisma
    - src/lib/gateway/GatewayService.ts
    - src/app/(dashboard)/control/page.tsx
decisions:
  - "Used prisma db push instead of migrate dev due to shadow database issue with SQLite"
  - "Added opposite relation field panelSceneBindings on Scene model for Prisma validation"
  - "Added buttonIndex range validation (0-5) to POST API per threat model T-08-02"
  - "DashboardEvent type set to 'panel_button_trigger' for activation logging per T-08-04"
metrics:
  duration_minutes: 5
  completed: "2026-04-28T09:00:00Z"
  tasks_completed: 3
  files_modified: 5
---

# Phase 08 Plan 01: 面板按键场景联动 Summary

**One-liner:** Panel button-scene binding with database model, CRUD API, gateway switch.key event handler, and control panel UI tab.

## Tasks Completed

### Task 1: 数据库模型 + Prisma 迁移 + CRUD API

- Added `PanelSceneBinding` model to `prisma/schema.prisma` with fields: `panelDid`, `buttonIndex`, `sceneId`, `createdAt`, `updatedAt`
- Added opposite relation `panelSceneBindings` on `Scene` model
- Composite unique constraint `@@unique([panelDid, buttonIndex])` prevents duplicate bindings
- Ran `prisma db push` to sync schema (migration dev had shadow DB issue with SQLite)
- Created `GET /api/panel-bindings` — returns bindings with scene data + scenes list (filtered by sceneId != null)
- Created `POST /api/panel-bindings` — creates binding with validation (buttonIndex range 0-5, panelDid format, sceneId existence)
- Created `PUT /api/panel-bindings/[id]` — updates scene binding
- Created `DELETE /api/panel-bindings/[id]` — removes binding
- Normalize `panelDid` to uppercase on create

**Commit:** `1f6c8b3` — feat(08-panel-scene-linkage): add PanelSceneBinding model and CRUD API

### Task 2: GatewayService 新增 switch.key 事件处理

- Added `switch.key` branch in `_handleMessage` event dispatch (between energy and onoff/status handlers)
- Implemented `_handleSwitchKeyEvent` private method:
  - Validates `did` exists, `value` is array with length >= 2
  - Only triggers on button press (`buttonState === 1`), ignores release events
  - Looks up `PanelSceneBinding` by `panelDid` + `buttonIndex` composite key
  - Validates scene has both `meshId` and `sceneId` (gateway scene ID) before activation
  - Calls `activateScene(sceneId, meshId)` to execute the scene
  - Creates `DashboardEvent` with type `panel_button_trigger` and full metadata
- Error handling: debug logging on all failure paths

**Commit:** `4bc7280` — feat(08-panel-scene-linkage): add switch.key event handler to GatewayService

### Task 3: 控制面板新增"面板联动"Tab UI

- Added `PanelSceneLinkage` component at end of `control/page.tsx`
- Creation form with: panel DID input (uppercase), button index selector (0-5), scene dropdown
- Bindings list table with columns: panel DID, button badge, scene name (with icon/color), creation time, actions
- Empty state when no bindings exist
- Inline edit mode for changing scene binding (select dropdown + save/cancel)
- Delete with confirmation dialog
- Added nav item "面板联动" (fa-link icon) to sidebar
- Added page title and subtitle for header display
- Added rendering case `currentPage === "panel-linkage"` in main content area

**Commit:** `2ab4b7c` — feat(08-panel-scene-linkage): add panel-linkage tab to control panel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing relation] Added opposite relation on Scene model**
- **Found during:** Task 1 — Prisma migration failed with P1012 validation error
- **Issue:** `PanelSceneBinding.scene` relation field missing opposite relation on `Scene` model
- **Fix:** Added `panelSceneBindings PanelSceneBinding[]` field to Scene model
- **Files modified:** prisma/schema.prisma
- **Commit:** `1f6c8b3`

**2. [Rule 2 - Validation] Added buttonIndex range validation to POST API**
- **Found during:** Task 1 — implementing threat model T-08-02
- **Issue:** Plan's API code didn't validate buttonIndex range 0-5
- **Fix:** Added validation check `buttonIndex < 0 || buttonIndex > 5` with error message
- **Files modified:** src/app/api/panel-bindings/route.ts
- **Commit:** `1f6c8b3`

**3. [Rule 3 - Migration tooling] Used prisma db push instead of migrate dev**
- **Found during:** Task 1 — `prisma migrate dev` failed with shadow database syntax error
- **Issue:** SQLite shadow database had version banner output interfering with migration
- **Fix:** Used `prisma db push` which doesn't require shadow database and succeeded
- **Files modified:** none (execution approach only)

## Known Stubs

None — all functionality is fully wired with data sources.

## Self-Check: PASSED

All files verified present, all commits verified in git log.
