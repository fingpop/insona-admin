# Phase 8: 面板场景联动 - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning
**Source:** User requirements (direct specification)

<domain>
## Phase Boundary

用户可通过控制面板为面板设备（func=9）的按键绑定场景。当网关推送 `switch.key` 事件时，系统自动查找绑定关系并执行对应场景。

**协议格式:** `{"version":1,"uuid":10352,"method":"s.event","evt":"switch.key","did":"ECC57F10C831FF","func":9,"value":[0,1]}`
- `did` — 面板设备唯一识别码
- `value[0]` — 按键索引（0=按键1, 1=按键2, ...）
- `value[1]` — 按键状态（1=按下, 0=抬起）

**用户交互流程:**
1. 用户在控制面板新增"面板联动"Tab
2. 手动填入面板 DID，系统展示该面板的按键列表
3. 对每个按键，从下拉菜单选择已创建的场景进行绑定
4. 网关推送按键事件 → 查找绑定关系 → 自动激活对应场景
</domain>

<decisions>
## Implementation Decisions

### 数据库设计
- 新增 `PanelSceneBinding` 表，字段：`id`, `panelDid`（面板设备DID）, `buttonIndex`（按键索引）, `sceneId`（绑定场景）, `createdAt`, `updatedAt`
- `panelDid` + `buttonIndex` 组合唯一约束，防止重复绑定
- `panelDid` 不需要是数据库中已存在的设备（用户可手动输入任意DID）

### 后端 API
- `GET /api/panel-bindings` — 获取所有绑定关系
- `POST /api/panel-bindings` — 创建绑定（body: `{ panelDid, buttonIndex, sceneId }`）
- `DELETE /api/panel-bindings/:id` — 删除绑定
- `PUT /api/panel-bindings/:id` — 更新绑定（更换场景）

### 按键事件处理
- 在 `GatewayService._handleMessage` 中新增 `switch.key` 事件处理分支
- 匹配 `PanelSceneBinding` 表，找到对应绑定后调用场景激活
- 场景激活复用已有的 `activateScene` 方法
- 记录执行日志到 `DashboardEvent` 表

### 前端 UI
- 在 `control/page.tsx` 新增"面板联动"Tab
- 表单：输入面板 DID → 设置按键索引 → 选择场景
- 表格：展示所有已有绑定关系，支持删除和修改
- UI 风格与现有 Tab 保持一致（暗色主题、Tailwind CSS）

### Claude's Discretion
- 面板按键索引上限：默认支持 0-5（6 个按键），具体取决于面板硬件
- 面板 DID 是否验证：用户输入的 DID 不需要在 Device 表中存在，直接存储
- 事件触发时机：按下（value[1]=1）时触发，抬起不触发
- 绑定关系是否按网关隔离：不隔离，全局有效（通过 sceneId 关联，场景已有 meshId 区分）
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gateway & Events
- `src/lib/gateway/GatewayService.ts` — 网关连接、消息解析、事件处理（`_handleMessage`, `activateScene`）
- `src/lib/gateway/MultiGatewayService.ts` — 多网关管理、SSE 广播
- `src/hooks/useGatewayEvents.ts` — 前端 SSE 事件订阅

### Scenes
- `src/app/api/scenes/route.ts` — 场景列表 API
- `src/app/api/scenes/activate/route.ts` — 场景激活 API
- `prisma/schema.prisma` — Scene / SceneAction 模型

### Control Panel UI
- `src/app/(dashboard)/control/page.tsx` — 控制面板主文件，所有 Tab 模块

### Types
- `src/lib/types.ts` — 设备类型、工具函数
</canonical_refs>

<specifics>
## Specific Ideas

- 按键协议 `value` 数组：`[0,1]` 表示按键1被按下，`[1,1]` 表示按键2被按下
- 场景激活需要 `sceneId`（网关场景ID，Int 类型）和 `meshId`
- 现有 Scene 表有 `sceneId` 字段（网关场景ID），可为 null
- 只有配置了 `sceneId` 的场景才能被面板按键触发（需在 UI 中标注）
- DashboardEvent 表已有，用于记录按键触发日志
</specifics>

<deferred>
## Deferred Ideas

- 面板按键长按/双击等复杂手势识别（当前仅支持单次按下）
- 面板按键与其他设备（非场景）的直接联动
- 可视化面板设备发现（非手动输入DID）
- None — 以上为 v1.3 候选
</deferred>

---

*Phase: 08-panel-scene-linkage*
*Context gathered: 2026-04-28 via user requirements*
