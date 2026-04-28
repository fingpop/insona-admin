# Roadmap: 商照管理后台 — v1.1 组设备控制优化

**Core Value:** 优化组设备TAB的控制体验和视觉一致性，使其与设备管理TAB保持一致。

**Granularity:** standard
**Phases:** 3 (continuing from v1.0 Phase 3)
**Coverage:** 15/15 v1.1 requirements mapped

## Phases

- [ ] **Phase 4: 控制面板基础架构** — 抽屉式面板组件、设备信息展示、加载状态 (PANEL-01, PANEL-02, PANEL-07)
- [ ] **Phase 5: 控制面板控制组件** — 开关、亮度、色温即时控制，动态组件显示 (PANEL-03, PANEL-04, PANEL-05, PANEL-06)
- [ ] **Phase 6: 视觉一致性优化与数据同步** — 表格/按钮/弹窗样式统一，控制后自动刷新 (VISUAL-01 through VISUAL-06, SYNC-01, SYNC-02)
- [x] **Phase 7: 多网关架构** — 支持 10-20 个网关同时连接，设置页网关管理 UI，设备自动关联 (MG-01 through MG-07)
- [ ] **Phase 8: 面板场景联动** — 面板按键事件绑定场景，接收按键协议自动执行场景 (PSL-01 through PSL-05)

## Phase Details

### Phase 4: 控制面板基础架构
**Goal:** 组设备控制弹窗升级为抽屉式设计，完整展示设备信息和加载状态
**Depends on:** v1.0 Phase 3 (Operational Verification)
**Requirements:** PANEL-01, PANEL-02, PANEL-07
**Success Criteria** (what must be TRUE):
  1. 点击组设备列表中的"控制"按钮后，右侧滑入抽屉式面板（非居中弹窗），与设备管理TAB的 DeviceDrawer 样式一致
  2. 抽屉面板顶部清晰展示设备基本信息：设备ID、名称、所属Mesh、在线/离线状态、功能类型
  3. 设备数据加载时显示 loading 指示器，加载完成后自动显示控制面板内容
**Plans:** 1 plan

Plans:
- [ ] 04-01-PLAN.md — 抽屉式面板 + 设备信息卡片 + loading 状态 (PANEL-01, PANEL-02, PANEL-07)

**UI hint**: yes

### Phase 5: 控制面板控制组件
**Goal:** 用户可通过抽屉面板即时控制组设备（开关、亮度、色温），无需二次确认
**Depends on:** Phase 4
**Requirements:** PANEL-03, PANEL-04, PANEL-05, PANEL-06
**Success Criteria** (what must be TRUE):
  1. 点击开/关按钮后控制命令立即发送，无"确认发送"弹窗，设备状态即时更新
  2. 拖动亮度滑块时实时显示当前百分比（0-100%），松开后即时发送控制命令
  3. 双色温设备显示第二滑块（色温值），调节后即时发送控制命令，与设备管理TAB行为一致
  4. 控制面板仅展示与设备 func 类型匹配的控制组件（func=2 仅开关，func=3 开关+亮度，func=4 开关+亮度+色温）
**Plans:** 1 plan

Plans:
- [ ] 05-01-PLAN.md — 开关即时控制 + 亮度即时发送 + 色温滑块 + 动态组件显示 (PANEL-03, PANEL-04, PANEL-05, PANEL-06)

**UI hint**: yes

### Phase 6: 视觉一致性优化与数据同步
**Goal:** 组设备TAB的视觉风格与设备管理TAB完全统一，控制操作后数据自动同步
**Depends on:** Phase 5
**Requirements:** VISUAL-01, VISUAL-02, VISUAL-03, VISUAL-04, VISUAL-05, VISUAL-06, SYNC-01, SYNC-02
**Success Criteria** (what must be TRUE):
  1. 组设备列表表格的表头样式、行高、悬停效果、边框颜色与设备管理TAB的设备列表完全一致
  2. 操作按钮（控制、编辑等）的尺寸、图标、颜色方案与设备管理TAB统一
  3. 在线/离线状态标签（badge）的样式与设备管理TAB一致
  4. 编辑弹窗的背景色、边框、圆角、输入框样式与设备管理TAB统一
  5. 工具栏筛选组件（select、search input、清除按钮）样式与设备管理TAB统一
  6. 空状态和无数据提示的样式与设备管理TAB一致
  7. 执行控制操作后组设备列表自动刷新，无需手动点击"同步"按钮
  8. parseValue 函数在设备管理TAB和组设备TAB中行为一致（复用同一实现）
**Plans:** TBD
**UI hint**: yes

### Phase 7: 多网关架构
**Goal:** 系统支持同时连接多个网关（10-20个），设置页提供网关管理 UI，设备自动归属来源网关
**Depends on:** None (独立架构升级)
**Requirements:** MG-01, MG-02, MG-03, MG-04, MG-05, MG-06, MG-07
**Success Criteria** (what must be TRUE):
  1. GatewayService 可实例化（非单例），MultiGatewayService 单例管理多个实例
  2. 数据库 Gateway 表支持多条记录，Device 表有 gatewayId 关联
  3. 设置页显示网关列表，支持添加、连接、断开、诊断、删除
  4. 设备控制通过 gatewayId 路由到正确网关实例
  5. SSE 事件携带 gatewayId，前端透明消费
  6. 每个网关独立断线重连
  7. 无遗留的 gatewayService 单例引用
**Plans:** 1 plan

Plans:
- [ ] 07-01-PLAN.md — 数据库改造 + 去单例化 + MultiGatewayService + API 迁移 + 设置页 UI + 设备同步适配

**UI hint**: yes

### Phase 8: 面板场景联动
**Goal:** 用户可在控制面板中为面板设备（func=9）的按键绑定场景，网关推送 switch.key 事件时自动执行对应场景
**Depends on:** Phase 7 (多网关架构 — 事件路由)
**Requirements:** PSL-01, PSL-02, PSL-03, PSL-04, PSL-05
**Success Criteria** (what must be TRUE):
  1. 控制面板新增"面板联动"Tab，支持手动输入面板 DID，展示按键列表
  2. 每个按键可通过下拉菜单绑定已创建的场景，绑定关系持久化到数据库
  3. 网关推送 `s.event` + `switch.key` 事件时，系统查找绑定关系并自动调用场景激活接口
  4. 按键协议格式：`{"version":1,"uuid":10352,"method":"s.event","evt":"switch.key","did":"ECC57F10C831FF","func":9,"value":[0,1]}`，value[0] 为按键索引，value[1] 为按下状态
  5. 绑定关系支持解绑、切换场景操作
**Plans:** 1 plan

Plans:
- [ ] 08-01-PLAN.md — 数据库模型 + CRUD API + 网关事件处理 + 面板联动 UI (PSL-01, PSL-02, PSL-03, PSL-04, PSL-05)

**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 4. 控制面板基础架构 | 0/1 | Planned | - |
| 5. 控制面板控制组件 | 0/1 | Planned | - |
| 6. 视觉一致性优化与数据同步 | 0/0 | Not started | - |

## Coverage Map

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

**Coverage:** 15/15 v1.1 requirements mapped. No orphans.

---
*Requirements defined: 2026-04-14. v1.1 added: 2026-04-16. Roadmap created: 2026-04-16. Phase 4 planned: 2026-04-16. Phase 5 planned: 2026-04-16. Phase 8 planned: 2026-04-28*
