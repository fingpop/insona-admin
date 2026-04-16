# 商照管理后台 — 服务器部署

## What This Is

inSona 商照管理后台是一个基于 Next.js 的智能照明控制系统，通过 TCP 连接 inSona 网关（端口 8091），管理商业照明设备（灯具、窗帘、面板、传感器），支持设备控制、场景管理、能耗分析、定时调度。

## Core Value

程序能够在 Linux 服务器上以生产模式稳定运行，自动管理网关连接并持久化数据。

## Current Milestone: v1.1 组设备控制优化

**Goal:** 优化组设备TAB的控制体验和视觉一致性，使其与设备管理TAB保持一致。

**Target features:**
- 组设备控制面板升级为抽屉式设计（参考设备管理TAB）
- 完整控制功能（开关、亮度、色温即时控制，无需二次确认）
- 视觉一致性优化（表格样式、按钮样式、弹窗样式与设备管理TAB统一）

## Requirements

### Validated

- ✓ 设备管理（同步、控制、房间绑定）— v1.0
- ✓ 场景管理（创建、编辑、激活）— v1.0
- ✓ 能耗监控（三写策略、聚合、查询）— v1.0
- ✓ 定时调度（cron 表达式、后台任务）— v1.0
- ✓ 实时事件推送（SSE）— v1.0
- ✓ Docker 镜像构建 — v1.0
- ✓ 生产模式启动脚本 — v1.0
- ✓ systemd 服务配置 — v1.0
- ✓ .env 环境变量管理 — v1.0
- ✓ SQLite 数据库持久化路径配置 — v1.0
- ✓ 网关连接健康检查 — v1.0
- ✓ 日志轮转（log rotation）— v1.0

### Active

- [ ] 组设备控制面板升级为抽屉式设计
- [ ] 完整控制功能（开关、亮度、色温即时控制）
- [ ] 视觉一致性优化（表格、按钮、弹窗样式统一）

### Out of Scope

- 数据库迁移到 PostgreSQL/MySQL — SQLite 已满足单实例需求
- 多进程/集群部署 — 单台服务器足够当前规模
- 用户认证系统 — 内网部署，暂不需要

## Context

### 现有架构

- Next.js 15 App Router + React 19
- Prisma + SQLite（文件数据库）
- inSona TCP 网关协议（端口 8091）
- 后台调度器通过 instrumentation hook 自动启动
- 当前通过 `npm run dev` + `daemon.sh` 本地运行

### 部署挑战

- **SQLite 数据持久化** — 需要确保 `dev.db` 文件在容器/服务器重启后不丢失
- **TCP 网关连接** — 需要确保容器能访问网关 IP（同一局域网）
- **Node.js 运行时** — 服务器需要安装 Node.js
- **开发模式 vs 生产模式** — 当前用 dev 模式，生产需要 `next build` + `next start`

## Constraints

- **Tech**: 已有 Node.js 18+ 环境，Next.js 15 要求 Node.js >= 18.18
- **Network**: 网关通过 TCP 8091 连接，服务器必须与网关在同一网络
- **Database**: SQLite 单文件，不适合多实例部署

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 使用 Docker 部署 | 标准化构建和运行环境，减少服务器配置依赖 | 已采用 v1.0 |
| 生产构建模式 | dev 模式性能差、资源占用高、不适合生产 | 已采用 v1.0 |
| SQLite 保留 | 单实例场景足够，无需引入外部数据库 | 已采用 v1.0 |
| systemd 管理进程 | Linux 原生进程管理，自动重启、开机自启 | 已采用 v1.0 |
| 组设备控制采用抽屉式面板 | 与设备管理TAB保持一致的操作体验 | — Pending v1.1 |
| 组设备控制即时响应 | 消除"发送控制"二次确认，提升操作效率 | — Pending v1.1 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-16 after v1.1 milestone started*
