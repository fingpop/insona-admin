# INTEGRATIONS.md — External Integrations

**Generated:** 2026-04-14

## Gateway (TCP Connection)

- **Protocol:** inSona Local Control Protocol
- **Transport:** TCP
- **Default Port:** 8091
- **Default IP:** 192.168.10.100 (configurable via `.env`)
- **Implementation:** `src/lib/gateway/GatewayService.ts`
- **Connection:** Singleton `gatewayService` instance
- **Features:**
  - Auto-reconnect with exponential backoff (max 10 attempts, capped at 60s)
  - Heartbeat monitoring (120s interval)
  - SSE broadcast to frontend consumers
  - Request/response with UUID matching (15s default timeout)
  - Manual vs auto-disconnect distinction (`_isManualDisconnect`)

### Gateway Methods

| Method | inSona Method | Purpose |
|--------|---------------|---------|
| `queryDevices()` | `c.query` | Fetch all devices and rooms |
| `controlDevice()` | `c.control` | Send device control commands |
| `queryScenes()` | `c.query/scene` | Query gateway scenes |
| `activateScene()` | `c.control` + `scene` | Activate a scene |
| `syncDevices()` | `c.query` + DB upsert | Sync devices to database |

### Event Types (s.event)

| Event | Trigger | Action |
|-------|---------|--------|
| `energy` | Device energy report | 3-write strategy (Data → Hourly → Record) |
| `onoff` | Device on/off | DashboardEvent creation |
| `status` | Device online/offline | DashboardEvent creation |
| `meshchange` | Mesh topology change | SSE broadcast |
| `sensor` | Sensor reading | SSE broadcast |
| `scene.recall` | Scene activation | SSE broadcast |

## Database (SQLite)

- **Location:** `prisma/dev.db`
- **ORM:** Prisma Client with global singleton pattern (`src/lib/prisma.ts`)
- **Dev-only logging:** `["error", "warn"]`
- **Production logging:** `["error"]`

## SSE (Server-Sent Events)

- **Endpoint:** `/api/events`
- **Consumer hook:** `useGatewayEvents()` in `src/hooks/useGatewayEvents.ts`
- **Backend:** `GatewayService.subscribeSSE()` + `_broadcast()`
- **Purpose:** Real-time device status, energy alerts, gateway connection state

## Font Awesome CDN

- **URL:** `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css`
- **Loaded in:** `src/app/layout.tsx` `<head>`

## No Other External Integrations

- No OAuth, no email service, no payment gateway
- No external API calls besides the inSona gateway TCP connection
- No CDN except Font Awesome
- No third-party auth providers
