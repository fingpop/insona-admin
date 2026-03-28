# Agent Guidelines for inSona 商照管理后台

## Project Overview

A Next.js 15 admin dashboard for managing inSona smart lighting systems via TCP gateway connection (port 8091).

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Prisma + SQLite · Node.js runtime for API routes

---

## Build / Lint / Test Commands

```bash
# Development
npm run dev              # Start dev server with Turbopack
npm run dev:watch        # Watch mode (nodemon) for API/lib changes

# Build
npm run build            # Production build
npm start                # Start production server

# Database
npm run db:push          # Push schema to SQLite
npm run db:generate      # Generate Prisma client
npm run db:studio        # Open Prisma Studio

# Testing (no test framework configured)
# For manual testing, use the browser UI or API endpoints directly
```

**Path Alias:** `@/*` maps to `./src/*`

---

## Code Style Guidelines

### TypeScript

- **Strict mode enabled** (`"strict": true` in tsconfig.json)
- Use explicit types for all function parameters and return values
- Prefer `interface` over `type` for object shapes
- Use `Record<K, V>` for dictionary types, not plain objects
- Use `unknown` instead of `any`; narrow with type guards

### React Components

- Use **Server Components** by default (`.tsx` files without `"use client"`)
- Add `"use client"` directive only when hooks (useState, useEffect, etc.) are needed
- Prefer `function` declarations over `const arrow` for components
- Use `React.ReactNode` for children prop type, not `ReactNode`
- Prefer `useCallback` for event handlers passed to child components

### Imports

- **Next.js / React built-ins**: import from `next`, `react`, `next/navigation`, etc.
- **Internal modules**: use `@/` alias (e.g., `@/lib/prisma`, `@/lib/types`)
- **Node.js built-ins**: import directly (e.g., `import net from "net"`)
- Group order: 1) Next.js 2) React 3) External libs 4) Internal `@/` imports 5) Node.js built-ins
- No side-effect imports unless necessary

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `use-devices.ts`, `gateway-service.ts` |
| React Components | PascalCase | `DeviceCard.tsx`, `RoomList.tsx` |
| Hooks | camelCase with `use` prefix | `useDevices.ts`, `useGatewayEvents.ts` |
| API Routes | lowercase, kebab-case dirs | `/api/devices/route.ts` |
| Prisma models | PascalCase | `Device`, `SceneAction` |
| TypeScript interfaces | PascalCase with descriptive suffix | `InSonaDevice`, `GatewayStatus` |
| Database fields | camelCase | `lastSeen`, `ratedPower` |
| CSS classes | Tailwind utility classes preferred | `flex`, `text-navy-900` |

### Error Handling

**API Routes:**
```typescript
// Pattern for all API routes
export async function GET() {
  try {
    // ... logic
    return Response.json({ data });
  } catch (err) {
    console.error("Failed to fetch:", err);
    return Response.json({ error: "Human-readable message" }, { status: 500 });
  }
}
```

- Always use `err instanceof Error` before accessing `err.message`
- Return user-friendly error messages in Chinese
- Log errors with `console.error` including context

**Service/Utility Files:**
- Let errors bubble up to API routes when possible
- Use `debug()` logging forGatewayService for development tracing
- Never expose internal error details to clients

### Formatting

- **No trailing commas** (matches project style)
- **Single quotes** for strings
- **No semicolons** at end of statements
- **No comments** in code unless explicitly requested
- **Line length**: no hard limit, use reasonable wrapping
- **Imports**: named imports preferred over default where applicable
- **Tailwind CSS**: use utility classes; custom colors via `text--*`, `bg-*` (see `tailwind.config.ts`)

### Prisma

- Use `prisma.modelName` for queries (lowercase, camelCase model name)
- Always use `prisma` singleton from `@/lib/prisma`
- Prefer `where` filters over `findMany().filter()` for performance
- Use `$executeRaw` only for JSON column updates (see `route.ts:143`)
- Include relations with `include: { relation: true }` when needed

### API Route Conventions

- **Runtime:** always set `export const runtime = "nodejs"` at top
- **Response format:** `Response.json({ ... })` or `NextResponse.json()`
- **Request parsing:** `await request.json()` with try/catch
- **Validation:** check required fields first, return 400 for bad input
- **Status codes:** 200 (ok), 400 (bad request), 404 (not found), 500 (server error), 503 (service unavailable)

### Gateway / inSona Protocol

- Device ID handling: use `isGroupDevice()`, `parseStoredDeviceId()`, `buildStoredDeviceId()` from `@/lib/types`
- Group devices have 2-character hex DID (e.g., "00", "FF"); stored as `meshId:did`
- Control values are `number[]`, always JSON-encoded when stored
- Gateway events (`s.event`) use `GatewayService._broadcast()` → SSE → `useGatewayEvents` hook

### Database Schema (SQLite)

| Model | Purpose |
|-------|---------|
| `Gateway` | Single row ("default"), stores IP/port/status |
| `Room` | Hierarchical: building → floor → room |
| `Device` | inSona devices; `type` = 1984/1860-62/1218/1344 |
| `Scene` + `SceneAction` | Scenes with ordered device actions |
| `EnergySnapshot` | Raw time-series readings |
| `EnergyRecord` | Daily aggregated kWh |
| `ScheduledTask` | Cron-based device/scene control |

---

## File Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Route group (shared layout)
│   │   ├── devices/        # Device pages
│   │   ├── rooms/          # Room pages
│   │   ├── scenes/         # Scene pages
│   │   ├── energy/         # Energy pages
│   │   └── settings/       # Settings pages
│   ├── api/                # API routes
│   │   ├── devices/        # Device CRUD + control
│   │   ├── gateway/        # Gateway connect/disconnect/status
│   │   ├── scenes/         # Scene CRUD
│   │   ├── energy/         # Energy data
│   │   └── tasks/          # Scheduled tasks
│   ├── layout.tsx          # Root layout (HTML shell)
│   └── page.tsx            # Root redirect to /control
├── components/             # Shared UI components
│   ├── devices/
│   ├── gateway/
│   ├── rooms/
│   └── scenes/
├── hooks/                  # Custom React hooks
│   ├── useDevices.ts
│   ├── useGatewayEvents.ts
│   └── useDeviceGroups.ts
└── lib/
    ├── prisma.ts           # Prisma singleton
    ├── types.ts           # inSona protocol types + helpers
    └── gateway/
        └── GatewayService.ts  # TCP gateway client (singleton)
```

---

## Key Patterns

### Device Control Flow
1. Client calls `useDevices.controlDevice(did, action, value, meshid)`
2. POST `/api/devices/control` → `gatewayService.controlDevice()`
3. TCP message sent to gateway, response awaited
4. Gateway broadcasts `s.event` with new value
5. SSE subscription in `useGatewayEvents` updates UI

### Device ID Storage
```
普通设备: did (e.g., "0123456789abcdef")
组设备:   meshId:did (e.g., "mesh01:00")
```
Use `buildStoredDeviceId()` before saving, `parseStoredDeviceId()` when reading.

### Adding a New API Route
1. Create directory: `src/app/api/<resource>/`
2. Add `route.ts` with `export const runtime = "nodejs"`
3. Implement `GET`, `POST`, `PATCH`, `DELETE` as needed
4. Follow error handling pattern above
