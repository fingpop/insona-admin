# ARCHITECTURE.md — System Architecture

**Generated:** 2026-04-14

## Architecture Pattern

**Next.js 15 App Router** with route groups, Server Components default, and explicit `"use client"` directives for interactive components.

## Layers

### 1. UI Layer (Pages + Components)

```
src/app/(dashboard)/          # Route group for authenticated/admin area
├── layout.tsx                # Dashboard wrapper (minimal)
├── control/page.tsx          # Main control hub (all Tab modules)
│   ├── Device Management Tab
│   ├── Space Management Tab
│   ├── Scene Management Tab
│   ├── Energy Analysis Tab
│   └── System Settings Tab
├── dashboard/page.tsx        # Dashboard overview
├── devices/page.tsx          # Standalone device list
├── devices/[id]/page.tsx     # Device detail
├── energy/page.tsx           # Energy analysis page
├── scenes/page.tsx           # Scene management page
├── settings/page.tsx         # Settings page
├── rooms/page.tsx            # Room/space management
├── rooms/[roomId]/page.tsx   # Room detail
├── groups/page.tsx           # Group management
└── home-layout.tsx           # Shared layout for control
```

### 2. API Layer (Route Handlers)

```
src/app/api/
├── gateway/                  # Gateway connection management
│   ├── connect/route.ts
│   ├── disconnect/route.ts
│   ├── status/route.ts
│   ├── autoconnect/route.ts
│   └── test/route.ts
├── devices/                  # Device CRUD and control
│   ├── route.ts              # List all devices
│   ├── [id]/route.ts         # Get/update device
│   ├── control/route.ts      # Send control command
│   ├── bind/route.ts         # Bind device to room
│   ├── groups/route.ts       # Device group queries
│   └── transfer/route.ts     # Transfer device between rooms
├── rooms/                    # Room CRUD
│   ├── route.ts
│   └── [id]/route.ts
├── scenes/                   # Scene CRUD and activation
│   ├── route.ts
│   ├── [id]/route.ts
│   ├── [id]/actions/route.ts
│   ├── [id]/actions/[actionId]/route.ts
│   ├── [id]/activate/route.ts
│   └── activate/route.ts
├── energy/                   # Energy data endpoints
│   ├── route.ts
│   ├── cleanup/route.ts
│   ├── snapshots/route.ts
│   └── today/route.ts
├── dashboard/                # Dashboard data endpoints
│   ├── stats/route.ts
│   ├── events/route.ts
│   ├── hourly-energy/route.ts
│   ├── realtime-power/route.ts
│   ├── room-energy-ranking/route.ts
│   ├── device-type-distribution/route.ts
│   ├── floor-status/route.ts
│   ├── function-distribution/route.ts
│   └── carbon-emissions/route.ts
├── scheduler/                # Scheduled task management
│   ├── tasks/route.ts
│   ├── tasks/[id]/route.ts
│   ├── tasks/[id]/toggle/route.ts
│   ├── tasks/[id]/run/route.ts
│   └── tick/route.ts
├── events/route.ts           # SSE endpoint for real-time events
├── spaces/batch-move/route.ts # Batch device room move
├── import-data/route.ts      # Data import
└── system/reset/route.ts     # System reset
```

### 3. Service Layer

| Module | File | Purpose |
|--------|------|---------|
| GatewayService | `src/lib/gateway/GatewayService.ts` | TCP gateway connection, device control, SSE broadcast |
| SchedulerCore | `src/lib/scheduler/SchedulerCore.ts` | Cron parsing, task execution, value parsing |
| BackgroundScheduler | `src/lib/scheduler/BackgroundScheduler.ts` | 60s interval tick loop, auto-started on server |

### 4. Data Layer

- **Prisma Client** singleton in `src/lib/prisma.ts` (globalThis pattern)
- **SQLite** database with 11 models
- **Types** defined in `src/lib/types.ts`

### 5. Hooks Layer

| Hook | File | Purpose |
|------|------|---------|
| `useGatewayEvents` | `src/hooks/useGatewayEvents.ts` | SSE connection, device state reducer, subscriber pattern |
| `useDevices` | `src/hooks/useDevices.ts` | Device list management |
| `useDeviceGroups` | `src/hooks/useDeviceGroups.ts` | Device group queries |
| `useDashboardData` | `src/hooks/useDashboardData.ts` | Dashboard data fetching |
| `useRealtimePower` | `src/hooks/useRealtimePower.ts` | Real-time power monitoring |

## Data Flow

### Gateway → Frontend (Real-time)

```
inSona Gateway (TCP)
  → GatewayService._handleMessage()
    → GatewayService._broadcast() → SSE consumers
      → /api/events (SSE endpoint)
        → useGatewayEvents() → React state
          → UI components
```

### Gateway → Database (Persistence)

```
inSona Gateway (TCP)
  → GatewayService._handleEnergyEvent()
    → EnergyData (detail, auto-cleanup)
    → EnergyHourly (aggregation)
    → EnergyRecord (daily summary)
  → GatewayService._handleDeviceEvent()
    → DashboardEvent
  → GatewayService.syncDevices()
    → Room upsert
    → Device upsert
```

### User Control → Gateway

```
UI action → API route → gatewayService.controlDevice()
  → TCP send (c.control)
  → Await s.control response
  → Return result to UI
```

## Startup Flow

```
Next.js server start
  → instrumentation.ts register()
    → BackgroundScheduler.startScheduler()
      → Initial tick
      → 60s interval loop
```

## Key Design Decisions

1. **Singleton GatewayService** — single TCP connection shared across all API routes
2. **SSE for real-time** — lightweight alternative to WebSockets for browser clients
3. **SQLite file-based DB** — zero-ops, suitable for embedded deployment
4. **Three-write energy strategy** — balances write performance with query speed
5. **Route group `(dashboard)`** — shared layout for all admin pages
6. **control/page.tsx as hub** — consolidates all management tabs in one file
