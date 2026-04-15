# Requirements: 商照管理后台服务器部署

**Defined:** 2026-04-14
**Core Value:** 程序能够在 Linux 服务器上以生产模式稳定运行，自动管理网关连接并持久化数据

## v1 Requirements

### Docker 构建

- [x] **DOCKER-01**: Dockerfile 支持 Next.js 生产构建（standalone output）
- [x] **DOCKER-02**: 构建产物包含 Prisma client 生成文件
- [x] **DOCKER-03**: 镜像体积合理（<500MB）

### 运行配置

- [x] **CONFIG-01**: 通过 .env 文件配置数据库路径、网关 IP、端口
- [x] **CONFIG-02**: 数据库文件路径可配置（默认 /data/dev.db）
- [x] **CONFIG-03**: Prisma schema 使用环境变量中的 DATABASE_URL

### 进程管理

- [x] **PROCESS-01**: 通过 systemd 或 docker-compose 管理 Next.js 进程
- [x] **PROCESS-02**: 进程崩溃自动重启
- [x] **PROCESS-03**: 开机自启动
- [x] **PROCESS-04**: 日志输出到 stdout/systemd journal

### 数据库持久化

- [x] **DB-01**: SQLite 数据库文件在容器/进程重启后不丢失
- [x] **DB-02**: Prisma migrate deploy 在启动前自动执行

### 网关连接

- [x] **GATEWAY-01**: 应用启动后自动连接网关（IP 通过 .env 配置）
- [x] **GATEWAY-02**: 网关断线自动重连（已有，验证在生产模式正常工作）

### 日志管理

- [ ] **LOG-01**: 应用日志通过 systemd/journald 或 docker logs 查看
- [x] **LOG-02**: 能耗事件日志独立文件，支持日志轮转

### 部署文档

- [x] **DOC-01**: 提供完整的服务器部署指南
- [ ] **DOC-02**: 提供一键部署脚本

## v2 Requirements

### SSL/TLS

- **SSL-01**: 支持 HTTPS 反向代理（Nginx/Caddy）

### 备份

- **BACKUP-01**: 定期 SQLite 数据库备份

### 监控

- **MON-01**: 应用健康检查端点
- **MON-02**: 网关连接状态监控告警

## Out of Scope

| Feature | Reason |
|---------|--------|
| PostgreSQL/MySQL 迁移 | 单实例场景 SQLite 已足够 |
| 多实例/集群部署 | 当前规模不需要 |
| 用户认证系统 | 内网部署，防火墙已保护 |
| 移动端 App | Web 界面已覆盖需求 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOCKER-01 | Phase 1 | Complete |
| DOCKER-02 | Phase 1 | Complete |
| DOCKER-03 | Phase 1 | Complete |
| CONFIG-01 | Phase 2 | Complete |
| CONFIG-02 | Phase 2 | Complete |
| CONFIG-03 | Phase 2 | Complete |
| PROCESS-01 | Phase 2 | Complete |
| PROCESS-02 | Phase 2 | Complete |
| PROCESS-03 | Phase 2 | Complete |
| PROCESS-04 | Phase 2 | Complete |
| DB-01 | Phase 2 | Complete |
| DB-02 | Phase 2 | Complete |
| GATEWAY-01 | Phase 3 | Complete |
| GATEWAY-02 | Phase 3 | Complete |
| LOG-01 | Phase 3 | Pending |
| LOG-02 | Phase 3 | Complete |
| DOC-01 | Phase 1 | Complete |
| DOC-02 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-14 after initialization*
