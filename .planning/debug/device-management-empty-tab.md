---
status: verifying
trigger: "控制页面的设备管理Tab无法正常加载数据，点击tab没有http请求产生。重置系统后出现。"
created: 2026-04-15T00:00:00.000Z
updated: 2026-04-15T00:12:00.000Z
---

## Current Focus
status: self-verification of fix
next_action: Request human verification - user needs to confirm the fix works in their environment

## Symptoms
expected: 点击"设备管理"Tab时应发起HTTP请求加载设备列表数据
actual: 只显示UI框架，空数据，没有HTTP请求发出
errors: 用户未报告具体错误信息
reproduction: 在控制页面点击"设备管理"Tab
started: 重置系统后开始出现

## Eliminated
- hypothesis: API route /api/devices has a bug preventing requests
  evidence: Route is standard Prisma query, works correctly (returns empty array when database is empty)
  timestamp: 2026-04-15T00:03:00.000Z
- hypothesis: DevicesPage component has its own useEffect that should fire
  evidence: DevicesPage is purely presentational, receives all data as props from parent
  timestamp: 2026-04-15T00:02:00.000Z
- hypothesis: queryDevices function has a conditional preventing the fetch
  evidence: queryDevices unconditionally fetches /api/devices and /api/rooms
  timestamp: 2026-04-15T00:04:00.000Z

## Evidence
- timestamp: 2026-04-15T00:01:00.000Z
  checked: control/page.tsx lines 355-419
  found: useEffect with empty dependency array [] calls queryDevices() only once on mount
  implication: Data is never re-fetched when user navigates between sidebar tabs

- timestamp: 2026-04-15T00:02:00.000Z
  checked: control/page.tsx lines 587-598 (DevicesPage render)
  found: DevicesPage receives devices={dbDevices.map(toInSonaDevice)} as props, no internal data fetching
  implication: DevicesPage is purely presentational - it displays whatever data the parent passes

- timestamp: 2026-04-15T00:03:00.000Z
  checked: control/page.tsx line 1467 (sub-tabs within DevicesPage)
  found: Sub-tabs (灯光/面板/传感器) only change local activeTab state, no HTTP requests
  implication: Sub-tabs are purely for filtering, not data loading

- timestamp: 2026-04-15T00:04:00.000Z
  checked: /api/devices GET route
  found: Returns devices from database; empty array if database was reset
  implication: Even if fetch fires, empty database = empty UI. User needs to sync from gateway after reset.

- timestamp: 2026-04-15T00:05:00.000Z
  checked: grep for currentPage in useEffect dependencies
  found: No useEffect watches currentPage - it's only used for conditional rendering
  implication: Navigating between sidebar tabs never triggers data refresh

## Resolution
root_cause: The ControlPanel component has a useEffect with empty dependency array ([]) that calls queryDevices() only once on initial mount. There is no useEffect watching currentPage changes. After system reset, the initial fetch returned empty data from the database. When the user navigated to the "设备管理" tab, no HTTP request was fired because the component was already mounted and the useEffect doesn't re-run on page navigation.
fix: Added a new useEffect (line 421-427) that watches currentPage state. When the user navigates to data-dependent pages (devices, rooms, scenes, energy, automation), queryDevices() is called to refresh the data from the server.
verification: Code change verified - new useEffect correctly watches currentPage and calls queryDevices() for relevant pages
files_changed: ["src/app/(dashboard)/control/page.tsx"]
