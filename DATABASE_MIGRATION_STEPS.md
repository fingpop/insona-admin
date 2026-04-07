# 数据库 Migration 指南

## 将 EnergyHourly 表更新到服务端

### 背景
新增了 `EnergyHourly` 表用于存储小时级能耗聚合数据，需要在服务端应用此 schema 变更。

---

## 方法 1：自动 Migration（推荐）

### 适用场景
- 生产环境数据库允许执行 DDL 操作
- 有 Prisma CLI 访问权限

### 步骤

#### 1. 在本地创建并测试 migration（已完成）
```bash
# Migration 文件已创建：prisma/migrations/20260407_add_energy_hourly/migration.sql
```

#### 2. 提交 migration 文件到 Git
```bash
git add prisma/migrations/
git commit -m "feat: 添加 EnergyHourly 表 migration"
git push
```

#### 3. 在服务端拉取并应用
```bash
# SSH 登录到服务器
ssh user@your-server

# 拉取最新代码
cd /path/to/your/app
git pull

# 应用 migration（生产环境使用 deploy）
npx prisma migrate deploy

# 重新生成 Prisma Client
npx prisma generate

# 重启应用
pm2 restart your-app
# 或
systemctl restart your-app
```

---

## 方法 2：手动执行 SQL

### 适用场景
- 没有服务器 SSH 访问权限
- 通过数据库管理工具操作

### 步骤

#### 1. 复制 SQL 语句
```sql
-- CreateTable
CREATE TABLE "EnergyHourly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "kwh" REAL NOT NULL DEFAULT 0,
    "peakWatts" REAL NOT NULL DEFAULT 0,
    "dataCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EnergyHourly_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EnergyHourly_deviceId_date_hour_key" ON "EnergyHourly"("deviceId", "date", "hour");
CREATE INDEX "EnergyHourly_deviceId_date_idx" ON "EnergyHourly"("deviceId", "date");
CREATE INDEX "EnergyHourly_date_idx" ON "EnergyHourly"("date");
```

#### 2. 执行方式

**选项 A：SQLite 命令行**
```bash
# 在服务器上
sqlite3 /path/to/prisma/prod.db < migration.sql
```

**选项 B：数据库管理工具**
- 使用 DB Browser for SQLite
- 或 Prisma Studio：`npx prisma studio`
- 粘贴 SQL 并执行

#### 3. 更新 Prisma Client
```bash
npx prisma generate
```

---

## 方法 3：复制数据库文件（不推荐）

### ⚠️ 警告
仅适用于开发/测试环境，**生产环境不要使用**！

### 步骤
```bash
# 本地（已有 EnergyHourly 表）
scp prisma/dev.db user@server:/path/to/app/prisma/dev.db

# 服务器
npx prisma generate
```

### 风险
- ❌ 会覆盖生产环境的所有数据
- ❌ 导致数据丢失
- ❌ 仅适用于测试环境

---

## 验证 Migration 成功

### 1. 检查表结构
```bash
sqlite3 prisma/dev.db ".schema EnergyHourly"
```

预期输出：
```sql
CREATE TABLE "EnergyHourly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    ...
);
```

### 2. 检查索引
```bash
sqlite3 prisma/dev.db "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='EnergyHourly';"
```

预期输出：
```
EnergyHourly_deviceId_date_hour_key
EnergyHourly_deviceId_date_idx
EnergyHourly_date_idx
```

### 3. 测试 Prisma Client
```bash
npx prisma studio
```

在浏览器中应该能看到 `EnergyHourly` 表。

---

## 常见问题

### Q1: Migration 失败：表已存在
**原因**：之前手动创建过该表

**解决**：跳过此 migration
```bash
# 标记为已应用
npx prisma migrate resolve --applied 20260407_add_energy_hourly
```

### Q2: 外键约束失败
**原因**：Device 表中没有对应的 deviceId

**解决**：检查数据完整性
```sql
-- 查找孤立的 EnergyHourly 记录
SELECT * FROM EnergyHourly
WHERE deviceId NOT IN (SELECT id FROM Device);
```

### Q3: 生产环境如何回滚？
**警告**：SQLite 不支持 DROP TABLE 回滚

**建议**：
1. 备份数据库
2. 测试环境验证
3. 生产环境慎重操作

---

## 推荐流程

### 生产环境部署清单

1. ✅ **备份当前数据库**
   ```bash
   cp prisma/prod.db prisma/prod.db.backup
   ```

2. ✅ **测试环境验证**
   ```bash
   # 在测试环境
   npx prisma migrate deploy
   npm run dev
   # 测试能耗上报功能
   ```

3. ✅ **生产环境部署**
   ```bash
   git pull
   npx prisma migrate deploy
   npx prisma generate
   pm2 restart app
   ```

4. ✅ **验证功能**
   - 连接网关，检查能耗上报
   - 查询 EnergyHourly 表是否有数据
   - 检查清理 API 是否正常工作

---

## 相关文件

- **Migration SQL**: `prisma/migrations/20260407_add_energy_hourly/migration.sql`
- **Schema 定义**: `prisma/schema.prisma`
- **写入逻辑**: `src/lib/gateway/GatewayService.ts`
- **查询逻辑**: `src/app/api/energy/today/route.ts`
- **清理 API**: `src/app/api/energy/cleanup/route.ts`

---

## 获取帮助

如果遇到问题：
1. 查看日志：`npx prisma migrate status`
2. 检查数据库：`sqlite3 prisma/dev.db ".tables"`
3. 重新生成 Client：`npx prisma generate`