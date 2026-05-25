# Phase 9: 项目名称设置

**Goal:** 系统设置中新增"项目名称"设置项，用户输入的项目名称实时显示在页面左上角侧边栏，替代硬编码的"博鳌论坛照明管理平台"。

**Depends on:** None (独立功能)

**Success Criteria** (what must be TRUE):
  1. 系统设置页新增"项目名称"设置区域，位于"网关管理"之上
  2. 输入框显示当前项目名称（默认"博鳌论坛照明管理平台"），可编辑
  3. 点击保存后，项目名称持久化到数据库，侧边栏即时更新显示新名称
  4. 页面刷新后，侧边栏仍显示上次保存的项目名称
  5. 数据库 Schema 新增 SystemSetting 模型（key-value 存储）
  6. 新增 `/api/settings` API 支持 GET（查询）和 PUT（更新）项目名称

## Tasks

### Task 1: 数据库模型 — SystemSetting
- [x] 在 `prisma/schema.prisma` 中新增 `SystemSetting` 模型
  - 字段: `key` (String, @unique), `value` (String), `createdAt`, `updatedAt`
- [x] 创建 `prisma/seed.ts`（如不存在）
  - 初始化种子数据: key="projectName", value="博鳌论坛照明管理平台"
  - 确保 package.json 中 `"prisma": { "seed": "tsx prisma/seed.ts" }`
- [x] 执行 `npx prisma db push` 应用 schema 变更
- [x] 执行 `npx prisma db seed` 初始化数据

### Task 2: API — `/api/settings`
- [x] 创建 `src/app/api/settings/route.ts`
  - GET: 返回所有系统设置 `{ projectName: "..." }`
  - PUT: 接收 `{ projectName: "..." }`，更新数据库
  - 默认值回退: 如果数据库中无记录，返回默认值 "博鳌论坛照明管理平台"

### Task 3: 系统设置页 UI
- [x] 在 `src/app/(dashboard)/settings/page.tsx` 顶部（网关管理之上）新增"项目名称"设置区域
  - 样式与其他设置区域一致（bg-[#101922], border, rounded-lg）
  - 输入框 + 保存按钮
  - 保存后重新加载设置数据
  - 初始加载时从 API 获取当前项目名称

### Task 4: 侧边栏读取项目名称
- [x] 在 `src/app/(dashboard)/control/page.tsx` 的 Sidebar 组件中
  - 新增状态 `projectName`，初始默认值 "博鳌论坛照明管理平台"
  - 组件挂载时从 `/api/settings` 获取项目名称
  - 将 `<h1 className="text-lg font-bold text-white">博鳌论坛照明管理平台</h1>` 中的硬编码替换为 `{projectName}`

## 文件变更

| 文件 | 操作 |
|------|------|
| `prisma/schema.prisma` | 新增 SystemSetting 模型 |
| `prisma/seed.ts` | 新建 — projectName 初始化 |
| `package.json` | 新增 prisma.seed 配置 + tsx 依赖 |
| `src/app/api/settings/route.ts` | 新建 — GET/PUT 设置 API |
| `src/app/(dashboard)/settings/page.tsx` | 修改 — 新增项目名称设置区域 |
| `src/app/(dashboard)/control/page.tsx` | 修改 — Sidebar 动态读取项目名称 |

## Verification

- TypeScript: `npx tsc --noEmit` passes with no errors
- API GET: `{"projectName":"博鳌论坛照明管理平台"}`
- API PUT round-trip: verified write + read cycle works
- Dev server restarted to pick up regenerated Prisma client
