# Requirements: 商照管理后台

**Defined:** 2026-04-14
**Core Value:** 程序能够在 Linux 服务器上以生产模式稳定运行，自动管理网关连接并持久化数据

## v1.0 Requirements — 服务器部署 (Complete)

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

- [x] **LOG-01**: 应用日志通过 systemd/journald 或 docker logs 查看
- [x] **LOG-02**: 能耗事件日志独立文件，支持日志轮转

### 部署文档

- [x] **DOC-01**: 提供完整的服务器部署指南
- [x] **DOC-02**: 提供一键部署脚本

## v1.1 Requirements — 组设备控制优化

### 控制面板升级

- [ ] **PANEL-01**: 组设备控制弹窗改为抽屉式侧滑面板（从右侧滑入，与设备管理TAB的 DeviceDrawer 样式一致）
- [ ] **PANEL-02**: 控制面板顶部显示设备基本信息（设备ID、名称、Mesh、在线状态、功能类型）
- [ ] **PANEL-03**: 开关控制 — 大按钮（开/关），即时生效，无需二次确认
- [ ] **PANEL-04**: 亮度控制 — 滑块组件（0-100%），实时显示百分比，即时发送控制命令
- [ ] **PANEL-05**: 色温控制 — 双色温设备提供第二滑块（色温值），与设备管理TAB的色温控制一致
- [ ] **PANEL-06**: 根据设备 func 类型动态显示对应控制组件（func=2 显示开关，func=3 显示开关+亮度，func=4 显示开关+亮度+色温）
- [ ] **PANEL-07**: 控制命令发送时显示 loading 状态，完成后自动刷新设备状态

### 视觉一致性优化

- [ ] **VISUAL-01**: 组设备列表表格样式与设备管理TAB统一（表头样式、行高、悬停效果、边框颜色）
- [ ] **VISUAL-02**: 操作按钮样式与设备管理TAB统一（btn-sm 尺寸、图标、颜色方案）
- [ ] **VISUAL-03**: 状态标签样式统一（在线/离线 badge 样式）
- [ ] **VISUAL-04**: 编辑弹窗样式与设备管理TAB统一（背景色、边框、圆角、输入框样式）
- [ ] **VISUAL-05**: 工具栏筛选组件样式统一（select、search input、清除按钮）
- [ ] **VISUAL-06**: 空状态和加载状态样式与设备管理TAB一致

### 数据同步

- [ ] **SYNC-01**: 控制操作完成后自动刷新组设备列表（无需手动点击同步）
- [ ] **SYNC-02**: 设备值解析逻辑与设备管理TAB统一（parseValue 函数复用）

## v1.2 Requirements — 面板场景联动

### 数据库与后端

- [ ] **PSL-01**: 新增 `PanelSceneBinding` 表，存储面板 DID + 按键索引 → 场景的映射关系
- [ ] **PSL-02**: `GatewayService._handleMessage` 处理 `switch.key` 事件，查找绑定并激活场景

### 前端 UI

- [ ] **PSL-03**: 控制面板新增"面板联动"Tab，支持手动输入面板 DID、配置按键绑定
- [ ] **PSL-04**: 绑定列表展示已有关联，支持删除和更换场景

### 事件日志

- [ ] **PSL-05**: 按键触发场景执行后记录日志到 DashboardEvent 表

## Future Requirements

### SSE 实时状态推送（v1.2 候选）
- 组设备状态通过 SSE 事件实时更新，无需手动刷新
- 设备控制响应通过 s.control 事件实时反馈

### 批量控制功能（v1.2 候选）
- 支持多选组设备进行批量开关/亮度控制
- 批量操作确认对话框

## Out of Scope

| Feature | Reason |
|---------|--------|
| PostgreSQL/MySQL 迁移 | 单实例场景 SQLite 已足够 |
| 多实例/集群部署 | 当前规模不需要 |
| 用户认证系统 | 内网部署，防火墙已保护 |
| 移动端 App | Web 界面已覆盖需求 |
| 组设备创建/删除 | 组设备由网关自动发现，不手动创建 |
| 组设备 Mesh 拓扑管理 | 超出当前 UI 优化范围 |
| 后端 API 改造 | 本次仅前端优化，复用现有 API |

## Traceability

### v1.0 Traceability (Complete)

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
| LOG-01 | Phase 3 | Complete |
| LOG-02 | Phase 3 | Complete |
| DOC-01 | Phase 1 | Complete |
| DOC-02 | Phase 3 | Complete |

**Coverage v1.0:** 17/17 requirements mapped and complete.

### v1.1 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PANEL-01 | Phase 4 | Pending |
| PANEL-02 | Phase 4 | Pending |
| PANEL-03 | Phase 5 | Pending |
| PANEL-04 | Phase 5 | Pending |
| PANEL-05 | Phase 5 | Pending |
| PANEL-06 | Phase 5 | Pending |
| PANEL-07 | Phase 4 | Pending |
| VISUAL-01 | Phase 6 | Pending |
| VISUAL-02 | Phase 6 | Pending |
| VISUAL-03 | Phase 6 | Pending |
| VISUAL-04 | Phase 6 | Pending |
| VISUAL-05 | Phase 6 | Pending |
| VISUAL-06 | Phase 6 | Pending |
| SYNC-01 | Phase 6 | Pending |
| SYNC-02 | Phase 6 | Pending |

**Coverage v1.1:** 15/15 requirements mapped.

---
*Requirements defined: 2026-04-14. v1.1 added: 2026-04-16. Roadmap created: 2026-04-16*
