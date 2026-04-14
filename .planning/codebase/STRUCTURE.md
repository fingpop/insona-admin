# STRUCTURE.md — Directory Structure

**Generated:** 2026-04-14

## Root Level

```
商照管理后台/
├── .env                          # Environment vars (DB path, gateway IP/port)
├── .gitignore                    # Ignores: node_modules, .next, *.db, *.log, .claude/
├── package.json                  # Project config, scripts
├── tsconfig.json                 # TypeScript config (strict, ES2017, path alias @/*)
├── next.config.mjs               # Next.js config (instrumentationHook enabled)
├── tailwind.config.ts            # Tailwind config (custom navy palette)
├── postcss.config.mjs            # PostCSS config
├── CLAUDE.md                     # AI instructions (protocol reference)
├── AGENTS.md                     # Agent instructions
├── inSona 协议文档.md             # inSona protocol specification
├── prisma/                       # Database schema and migrations
├── src/                          # Source code
├── scripts/                      # Utility scripts (14 files)
├── docs/                         # Implementation documentation (5 files)
├── node_modules/                 # Dependencies
└── .next/                        # Next.js build output
```

## `src/` Structure

```
src/
├── app/
│   ├── layout.tsx                # Root layout (Font Awesome CDN, zh-CN locale)
│   ├── page.tsx                  # Root redirect
│   ├── (dashboard)/              # Route group — admin area
│   │   ├── layout.tsx            # Dashboard wrapper layout
│   │   ├── control/
│   │   │   ├── page.tsx          # Main control hub (all tabs)
│   │   │   └── home-layout.tsx   # Control page layout
│   │   ├── dashboard/page.tsx    # Dashboard overview
│   │   ├── devices/
│   │   │   ├── page.tsx          # Device list
│   │   │   └── [id]/page.tsx     # Device detail page
│   │   ├── energy/page.tsx       # Energy analysis
│   │   ├── scenes/page.tsx       # Scene management
│   │   ├── settings/page.tsx     # System settings
│   │   ├── rooms/
│   │   │   ├── page.tsx          # Room list
│   │   │   └── [roomId]/page.tsx # Room detail
│   │   └── groups/page.tsx       # Group management
│   └── api/                      # API route handlers
│       ├── gateway/              # 5 routes — connect/disconnect/status
│       ├── devices/              # 6 routes — CRUD, control, bind
│       ├── rooms/                # 2 routes — CRUD
│       ├── scenes/               # 6 routes — CRUD, actions, activate
│       ├── energy/               # 4 routes — query, cleanup, snapshots, today
│       ├── dashboard/            # 9 routes — stats, charts, rankings
│       ├── scheduler/            # 5 routes — tasks CRUD, run, toggle, tick
│       ├── events/route.ts       # SSE endpoint
│       ├── import-data/route.ts  # Data import
│       ├── spaces/batch-move/    # Batch room move
│       └── system/reset/         # System reset
├── hooks/
│   ├── useGatewayEvents.ts       # SSE hook with state reducer + subscribers
│   ├── useDevices.ts             # Device list hook
│   ├── useDeviceGroups.ts        # Device groups hook
│   ├── useDashboardData.ts       # Dashboard data hook
│   └── useRealtimePower.ts       # Real-time power hook
├── lib/
│   ├── gateway/
│   │   └── GatewayService.ts     # Gateway singleton (778 lines)
│   ├── scheduler/
│   │   ├── SchedulerCore.ts      # Cron parsing + task execution (380 lines)
│   │   └── BackgroundScheduler.ts # 60s interval loop (47 lines)
│   ├── prisma.ts                 # Prisma singleton
│   └── types.ts                  # Type definitions (199 lines)
├── instrumentation.ts            # Server startup hook (scheduler auto-start)
└── globals.css                   # Global styles
```

## `prisma/` Structure

```
prisma/
├── schema.prisma                 # Database schema (11 models)
├── dev.db                        # SQLite database (git-ignored)
└── migrations/                   # Migration history (if any)
```

## `scripts/` Structure (14 files)

| File | Purpose |
|------|---------|
| `scheduler.js` | Standalone scheduler runner |
| `daemon.sh` | Process daemon script |
| `monitor.sh` | Process monitoring |
| `import-insona-data.ts` | Data import from inSona backup |
| `fix-energy-data.ts` | Energy data migration/repair |
| `fix-groups.ts` | Group binding fix |
| `check_energy.js` | Energy data checker |
| `analyze_energy_log.js` | Log analyzer |
| `test-energy-fix.js` | Energy fix test |
| `debug-db.js` | Database debugger |
| `verify-complete-binding.js` | Room binding verification |
| `verify-room-binding.js` | Room binding check |
| `energy_monitor_simple.sh` | Energy monitoring |
| `monitor_energy_test.sh` | Energy test monitor |

## `docs/` Structure (5 files)

| File | Purpose |
|------|---------|
| `energy_calculation.md` | Energy calculation logic |
| `energy_implementation.md` | Energy feature implementation notes |
| `today_energy_feature.md` | Today's energy feature |
| `today_energy_chart_switch.md` | Chart switching logic |
| `device_room_binding_*.md` | Device-room binding fixes |

## Key Entry Points

| Entry | File | Purpose |
|-------|------|---------|
| App root | `src/app/layout.tsx` | Root layout, Font Awesome |
| Dashboard hub | `src/app/(dashboard)/control/page.tsx` | Main admin page with all tabs |
| API root | `src/app/api/` | All route handlers |
| Gateway | `src/lib/gateway/GatewayService.ts` | TCP connection singleton |
| Database | `src/lib/prisma.ts` | Prisma client singleton |
| Server startup | `src/instrumentation.ts` | Auto-start scheduler |
