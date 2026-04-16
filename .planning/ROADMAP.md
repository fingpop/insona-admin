# Roadmap: 商照管理后台 — v1.1 组设备控制优化

**Core Value:** 优化组设备TAB的控制体验和视觉一致性，使其与设备管理TAB保持一致。

**Granularity:** standard
**Phases:** 3 (continuing from v1.0 Phase 3)
**Coverage:** 15/15 v1.1 requirements mapped

## Phases

- [ ] **Phase 4: 控制面板基础架构** — 抽屉式面板组件、设备信息展示、加载状态 (PANEL-01, PANEL-02, PANEL-07)
- [ ] **Phase 5: 控制面板控制组件** — 开关、亮度、色温即时控制，动态组件显示 (PANEL-03, PANEL-04, PANEL-05, PANEL-06)
- [ ] **Phase 6: 视觉一致性优化与数据同步** — 表格/按钮/弹窗样式统一，控制后自动刷新 (VISUAL-01 through VISUAL-06, SYNC-01, SYNC-02)

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
**Plans:** TBD
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

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 4. 控制面板基础架构 | 0/1 | Planned | - |
| 5. 控制面板控制组件 | 0/0 | Not started | - |
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
*Requirements defined: 2026-04-14. v1.1 added: 2026-04-16. Roadmap created: 2026-04-16. Phase 4 planned: 2026-04-16*
