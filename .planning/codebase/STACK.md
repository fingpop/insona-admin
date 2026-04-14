# STACK.md — Tech Stack

**Generated:** 2026-04-14
**Project:** insonactl-admin (商照管理后台)

## Languages & Runtime

| Item | Version | Notes |
|------|---------|-------|
| TypeScript | 5.7.2 | Strict mode, ES2017 target |
| Node.js | (implicit) | TCP net module used for gateway |
| React | 19.0.0 | App Router, Server/Client components |
| Next.js | 15.1.0 | App Router, Turbopack dev |

## Framework & Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^15.1.0 | Full-stack framework, App Router |
| `react` | ^19.0.0 | UI library |
| `react-dom` | ^19.0.0 | React DOM renderer |
| `@prisma/client` | ^5.22.0 | Database ORM (SQLite) |
| `recharts` | ^2.14.1 | Charting library (energy trends, dashboard) |
| `cron-parser` | ^5.5.0 | Cron expression parsing for scheduler |

## Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `prisma` | ^5.22.0 | Database CLI & migration tool |
| `tailwindcss` | ^3.4.17 | Utility-first CSS framework |
| `typescript` | ^5.7.2 | Type checking |
| `@types/node` | ^22.10.2 | Node.js type definitions |
| `@types/react` | ^19.0.2 | React type definitions |
| `@types/react-dom` | ^19.0.2 | React DOM type definitions |
| `nodemon` | ^3.1.14 | File watcher for dev rebuilds |

## Database

- **SQLite** (file-based via `prisma/dev.db`)
- 9 Prisma models: `Gateway`, `Room`, `Device`, `Scene`, `SceneAction`, `EnergySnapshot`, `EnergyData`, `EnergyRecord`, `EnergyHourly`, `ScheduledTask`, `DashboardEvent`
- Hierarchical room structure via self-relation (`RoomHierarchy`)
- Device-room binding via foreign key

## UI Framework

- **Tailwind CSS v3** — utility classes
- **Font Awesome 6.4.0** — loaded via CDN in `src/app/layout.tsx`
- Custom navy color palette in `tailwind.config.ts` (`navy-950` through `navy-700`)

## External Protocol

- **inSona Local Control Protocol** — TCP-based, port 8091
- JSON messages delimited by `\r\n`
- Gateway (WiFi/Bluetooth bridge) + Sub-devices (Bluetooth Mesh)
- Device types: lights (1984), curtains (1860/61/62), panels (1218), sensors (1344)
- Methods: `c.query`, `s.query`, `c.control`, `s.control`, `s.event`

## Configuration

- `.env` — `DATABASE_URL`, `GATEWAY_IP`, `GATEWAY_PORT`
- `next.config.mjs` — minimal config, `experimental.instrumentationHook: true`
- `tsconfig.json` — path alias `@/*` → `src/*`, strict mode
- `postcss.config.mjs` — standard Tailwind setup

## Key Scripts

| Script | Command |
|--------|---------|
| `dev` | `next dev --turbopack` |
| `build` | `next build` |
| `start` | `next start` |
| `dev:watch` | `nodemon --exec "npm run build"` (watches API/gateway/hooks) |
| `db:migrate` | `prisma migrate dev` |
| `db:push` | `prisma db push` |
| `db:studio` | `prisma studio` |
| `scheduler` | `node scripts/scheduler.js` |
