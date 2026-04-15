# Roadmap: 商照管理后台 — 服务器部署

**Core Value:** 程序能够在 Linux 服务器上以生产模式稳定运行，自动管理网关连接并持久化数据

**Granularity:** standard
**Phases:** 3
**Coverage:** 17/17 requirements mapped

## Phases

- [x] **Phase 1: Docker Image** — Next.js 生产构建的 Docker 镜像，包含 Prisma client 和合理体积 (completed 2026-04-14)
- [x] **Phase 2: Production Runtime** — 通过 .env 配置、systemd/docker-compose 管理、数据持久化的生产运行环境 (completed 2026-04-15)
- [ ] **Phase 3: Operational Verification** — 网关自动连接、日志轮转、完整部署文档验证

## Phase Details

### Phase 1: Docker Image
**Goal:** 产出可运行的 Docker 镜像，包含 Next.js 生产构建和完整的 Prisma client
**Depends on:** Nothing (first phase)
**Requirements:** DOCKER-01, DOCKER-02, DOCKER-03, DOC-01
**Success Criteria** (what must be TRUE):
  1. 执行 `docker build` 命令能成功生成 Docker 镜像
  2. 镜像运行后能访问 Next.js 应用页面（HTTP 响应正常）
  3. 镜像体积小于 500MB
  4. Prisma client 在容器内可用，`prisma generate` 产物已包含在镜像中
**Plans:** 1/1 plans complete

### Phase 2: Production Runtime
**Goal:** 应用在服务器上以生产模式稳定运行，配置通过 .env 管理，数据持久化，进程自动恢复
**Depends on:** Phase 1
**Requirements:** CONFIG-01, CONFIG-02, CONFIG-03, PROCESS-01, PROCESS-02, PROCESS-03, PROCESS-04, DB-01, DB-02
**Success Criteria** (what must be TRUE):
  1. 通过修改 .env 文件中的 DATABASE_URL、GATEWAY_IP、GATEWAY_PORT 能改变应用行为
  2. SQLite 数据库文件存储在指定路径（如 /data/dev.db），容器/进程重启后数据不丢失
  3. 应用崩溃后能自动重启（systemd Restart=always 或 docker-compose restart policy）
  4. 服务器开机后应用能自动启动
  5. 应用启动时自动执行 `prisma migrate deploy` 确保数据库 schema 最新
**Plans:** 1/1 plans complete
Plans:
- [x] 02-01-PLAN.md — Create systemd auto-start service, Docker healthcheck, update deployment docs (CONFIG-01/02/03, PROCESS-01/02/03/04, DB-01/02)

### Phase 3: Operational Verification
**Goal:** 网关连接自动建立，日志可查且支持轮转，部署文档完整可用
**Depends on:** Phase 2
**Requirements:** GATEWAY-01, GATEWAY-02, LOG-01, LOG-02, DOC-02
**Success Criteria** (what must be TRUE):
  1. 应用启动后自动连接 .env 中配置的网关 IP:端口，无需手动触发
  2. 网关断线后应用能自动重连（验证已有重连逻辑在生产模式正常工作）
  3. 通过 `docker logs` 或 `journalctl` 能查看应用日志
  4. 能耗事件日志输出到独立文件，且配置了日志轮转（logrotate 或等效机制）
  5. 按照部署文档能从零开始完成服务器部署
**Plans:** 2/3 plans executed
Plans:
- [x] 03-01-PLAN.md — Add gateway auto-connect to instrumentation.ts using GATEWAY_IP/GATEWAY_PORT env vars (GATEWAY-01)
- [x] 03-02-PLAN.md — Create EnergyLogger utility, integrate into GatewayService, add gateway env vars to Docker, create logrotate config (LOG-02, GATEWAY-02)
- [ ] 03-03-PLAN.md — Create one-click deploy script and update DEPLOY.md (DOC-02)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Docker Image | 1/1 | Complete    | 2026-04-14 |
| 2. Production Runtime | 1/1 | Complete    | 2026-04-15 |
| 3. Operational Verification | 2/3 | In Progress|  |

## Coverage Map

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOCKER-01 | Phase 1 | Pending |
| DOCKER-02 | Phase 1 | Pending |
| DOCKER-03 | Phase 1 | Pending |
| DOC-01 | Phase 1 | Pending |
| CONFIG-01 | Phase 2 | Pending |
| CONFIG-02 | Phase 2 | Pending |
| CONFIG-03 | Phase 2 | Pending |
| PROCESS-01 | Phase 2 | Pending |
| PROCESS-02 | Phase 2 | Pending |
| PROCESS-03 | Phase 2 | Pending |
| PROCESS-04 | Phase 2 | Pending |
| DB-01 | Phase 2 | Pending |
| DB-02 | Phase 2 | Pending |
| GATEWAY-01 | Phase 3 | Pending |
| GATEWAY-02 | Phase 3 | Pending |
| LOG-01 | Phase 3 | Pending |
| LOG-02 | Phase 3 | Pending |
| DOC-02 | Phase 3 | Pending |

**Coverage:** 17/17 v1 requirements mapped. No orphans.
