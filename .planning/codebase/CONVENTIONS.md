# CONVENTIONS.md — Coding Conventions

**Generated:** 2026-04-14

## Code Style

- **TypeScript strict mode** — `strict: true` in `tsconfig.json`
- **No emit** — Next.js handles compilation
- **Path alias** — `@/*` maps to `src/*`
- **Module system** — ESM (`"module": "esnext"`)

## Naming Conventions

### Files

- **API routes:** `route.ts` (Next.js convention)
- **Components:** kebab-case (`home-layout.tsx`)
- **Pages:** kebab-case (`page.tsx`)
- **Hooks:** camelCase prefix `use` (`useGatewayEvents.ts`)
- **Services:** PascalCase (`GatewayService.ts`)
- **Types:** PascalCase (`InSonaRequest`, `InSonaDevice`)
- **Scripts:** snake_case (`fix-energy-data.ts`)

### Variables & Functions

- **camelCase** for variables and functions
- **Private methods** prefixed with underscore (`_handleMessage`, `_broadcast`, `_doConnect`)
- **Public getters** without prefix (`isConnected`, `status`)

### Database Models

- **PascalCase** model names (`EnergyData`, `ScheduledTask`)
- **camelCase** field names (`deviceId`, `lastRun`)
- **Snake_case** for string date values (`"YYYY-MM-DD"`)

## Error Handling

### Pattern: try/catch with debug logging

```typescript
try {
  await prisma.device.upsert({ ... });
} catch (err) {
  debug(`[SYNC] Failed to save device ${did}:`, err);
}
```

### Pattern: Silent failure for non-critical operations

```typescript
await prisma.device.update({...}).catch(() => {});
```

### API routes

- Return JSON responses with `error` field on failure
- HTTP status codes: 200 (success), 400 (bad request), 500 (server error)
- Errors logged with `console.error` or `debug`

## Logging

- **Console-based logging** — no external logger
- **Prefix convention** — `[Gateway]`, `[Scheduler]`, `[ENERGY]`, `[SYNC]`, etc.
- **Debug function** — `console.log` wrapper in `GatewayService`
- **Development vs Production** — Prisma logs `["error", "warn"]` in dev, `["error"]` in prod

## React Patterns

### Client vs Server Components

- `"use client"` directive at top of file for interactive components
- Default: Server Components (no directive needed)
- Hooks must be in client components

### State Management

- **`useReducer`** for complex state (gateway events)
- **`useRef`** for mutable references (EventSource, subscriber sets)
- **`useCallback`** for stable function references
- **Global state** via singleton services (`gatewayService`)

### SSE Subscription Pattern

```typescript
const subscribersRef = useRef<Set<EventCallback>>(new Set());

const subscribe = useCallback((callback) => {
  subscribersRef.current.add(callback);
  return () => { subscribersRef.current.delete(callback); };
}, []);
```

## Database Patterns

### Singleton Prisma Client

```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({...});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### Upsert Pattern

```typescript
await prisma.device.upsert({
  where: { id: did },
  update: { ... },
  create: { ... },
});
```

### Index Usage

- `@@index([roomId])`, `@@index([alive])`, `@@index([type])` on Device
- `@@unique([deviceId, date])` on EnergyRecord
- `@@unique([deviceId, date, hour])` on EnergyHourly

## Scheduler Patterns

### Anti-double-execution

```typescript
if (now - (globalThis.__schedulerLastTick ?? 0) < 55_000) {
  return { executed: 0, errors: 0, skipped: true };
}
```

### Value Parsing (flexible)

Handles: `number[]`, `string` (JSON), `string` (comma-separated), `number`, double-serialized strings.
