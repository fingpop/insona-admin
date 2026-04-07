# 数据库 Schema 同步指南

## 重要说明

⚠️ **数据库文件 `prisma/dev.db` 不应该提交到 Git**

- 运行时数据（设备、能耗、场景等）是环境独立的，不应该跨环境同步
- Schema 变更应该通过 Prisma Migration 管理，而不是提交数据库文件
- 每个环境应该有独立的数据库文件

## 正确的 Schema 同步流程

### 1. 新增/修改数据库字段

当需要修改数据库表结构时（新增字段、修改索引等）：

**开发环境流程**：

```bash
# 1. 修改 schema.prisma 文件（添加新字段）
# 例如：在 Device 表添加 newField 字段

# 2. 创建 migration（会生成 SQL 文件）
npx prisma migrate dev --name add_device_new_field

# 3. Prisma 会自动：
#    - 创建 migration SQL 文件（prisma/migrations/目录）
#    - 应用 migration 到本地数据库
#    - 生成新的 Prisma Client 类型

# 4. 提交变更到 Git
git add prisma/schema.prisma
git add prisma/migrations/
git commit -m "feat: 添加 Device 表 newField 字段"
```

**其他协作者同步流程**：

```bash
# 1. 拉取最新代码
git pull

# 2. 应用新的 migration 到本地数据库
npx prisma migrate deploy

# 3. 本地数据库 schema 自动更新，数据保留
```

### 2. 生产环境部署

```bash
# 生产环境只运行 migrate deploy（不会创建新 migration）
npx prisma migrate deploy
```

## 当前状态

项目已从 Git 追踪中移除 `prisma/dev.db`：

- ✅ 本地数据库文件仍然存在（`prisma/dev.db`）
- ✅ 所有运行时数据（设备、能耗数据）都保留
- ❌ 未来不再同步数据库文件到 Git
- ✅ 使用 Prisma Migration 管理 Schema 变更

## 新环境初始化

当其他协作者克隆项目时：

```bash
# 1. 克隆项目
git clone <repo-url>
cd <project>

# 2. 安装依赖
npm install

# 3. 应用所有 migrations（创建数据库）
npx prisma migrate deploy

# 4. 启动开发服务器
npm run dev

# 5. 连接网关后，设备数据会自动同步到数据库
```

## 初始化测试数据（可选）

如果需要初始测试数据（示例房间、设备），可以创建 seed 脚本：

```bash
# 创建 prisma/seed.ts
# 定义示例房间、设备类型等基础数据

# 运行 seed 脚本
npx prisma db seed
```

## 常见问题

### Q: 我的能耗数据会丢失吗？
A: 不会。本地 `dev.db` 文件仍然存在，所有数据都保留。

### Q: 其他协作者如何获得设备数据？
A: 连接网关后，系统会自动同步设备数据到数据库。

### Q: 历史能耗数据如何共享？
A: 能耗数据不应该共享，每个环境应该有独立的能耗记录。如果需要，可以导出 CSV 文件手动迁移。

### Q: 生产环境如何部署？
A: 生产环境使用独立的数据库文件（如 `prod.db`），运行 `prisma migrate deploy` 应用 schema。

## Migration 文件示例

Prisma 会生成以下文件结构：

```
prisma/
├── schema.prisma          # Schema 定义（提交到 Git）
├── migrations/            # Migration SQL 文件（提交到 Git）
│   ├── 20260407120000_init/
│   │   └── migration.sql
│   ├── 20260407130000_add_device_new_field/
│   │   └── migration.sql
│   └── migration_lock.toml
└── dev.db                 # 数据库文件（不提交到 Git）
```

**Migration SQL 文件内容示例**：

```sql
-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "newField" TEXT,
    ...
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_id_key" ON "Device"("id");
```

## 总结

- ✅ **Schema 变更**：修改 `schema.prisma` + 运行 `prisma migrate dev`
- ✅ **Migration 文件**：提交到 Git，其他协作者运行 `prisma migrate deploy`
- ❌ **数据库文件**：不提交到 Git，每个环境独立
- ✅ **运行时数据**：环境隔离，不会互相覆盖