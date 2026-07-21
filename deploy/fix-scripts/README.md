# 远程服务器能耗数据时区修复指南

## 背景

旧代码使用 `new Date().toISOString()` 获取日期/小时，在 UTC+8 下凌晨 00:00-07:59 的数据会被错误记录到前一天。本修复脚本把所有能耗数据按本地时区（UTC+8）重新对齐。

## 服务器环境假设

- Docker 部署（参考 `docker-compose.prod.yml`）
- SQLite 数据库位于宿主机 `./data/dev.db`，容器内挂载为 `/app/data/dev.db`
- 容器里有 Node 20、Prisma client、所有必要系统库

## 方案 A：在容器内运行（推荐，环境与应用一致）

### 1. 本地准备（在你的开发机）

```bash
# 确认脚本已编译（如果还没编译）
npx esbuild scripts/fix-energy-timezone.ts \
  --bundle --platform=node --target=node20 \
  --outfile=deploy/fix-scripts/fix-energy-timezone.js \
  --external:better-sqlite3

# 上传到服务器
scp deploy/fix-scripts/fix-energy-timezone.js user@server:/path/to/project/
```

### 2. 服务器上执行

```bash
# SSH 到服务器
ssh user@server
cd /path/to/project

# ① 备份数据库
cp data/dev.db data/dev.db.backup.$(date +%Y%m%d_%H%M%S)

# ② 停止应用容器（避免脚本运行期间有新数据写入造成冲突）
docker compose -f docker-compose.prod.yml stop

# ③ 把脚本拷进容器
docker cp fix-energy-timezone.js insona-admin-isona-admin-1:/app/data/
# 注：容器名根据实际 `docker ps` 输出调整

# ④ 先预览（--dry-run 不会修改数据，只查看会做什么改动）
docker compose -f docker-compose.prod.yml exec insona-admin \
  node /app/data/fix-energy-timezone.js --dry-run

# ⑤ 确认输出符合预期后，实际执行
docker compose -f docker-compose.prod.yml exec insona-admin \
  node /app/data/fix-energy-timezone.js

# ⑥ 清理脚本文件
docker compose -f docker-compose.prod.yml exec insona-admin \
  rm /app/data/fix-energy-timezone.js

# ⑦ 重启应用
docker compose -f docker-compose.prod.yml up -d

# ⑧ 验证数据一致性
docker compose -f docker-compose.prod.yml exec insona-admin sh -c '
  node -e "
    const { PrismaClient } = require(\"@prisma/client\");
    const p = new PrismaClient();
    (async () => {
      const [h, r] = await Promise.all([
        p.energyHourly.groupBy({ by: [\"date\"], _sum: { kwh: true } }),
        p.energyRecord.groupBy({ by: [\"date\"], _sum: { kwh: true } }),
      ]);
      const hm = Object.fromEntries(h.map(x => [x.date, x._sum.kwh ?? 0]));
      const rm = Object.fromEntries(r.map(x => [x.date, x._sum.kwh ?? 0]));
      const dates = [...new Set([...Object.keys(hm), ...Object.keys(rm)])].sort();
      for (const d of dates) {
        const match = Math.abs((hm[d] ?? 0) - (rm[d] ?? 0)) < 0.001;
        console.log(d + \": hourly=\" + (hm[d] ?? 0).toFixed(3) + \" record=\" + (rm[d] ?? 0).toFixed(3) + (match ? \" ✓\" : \" ✗\"));
      }
      await p.\$disconnect();
    })();
  "
'
```

### 3. 预期输出

```
=== 能耗数据时区修复 [执行模式] ===

[1/4] EnergyData：用 timestamp 重算 date
  总数 N，需修正 X

[2/4] EnergyHourly：(date,hour) UTC → UTC+8
  总数 N，需修正 N
    ...

[3/4] EnergyRecord：基于 EnergyHourly 的移动同步修正
  ...

[4/4] 最终对齐：EnergyRecord 按 EnergyHourly 真实聚合校准
  新增 X，更新 Y，删除 Z

=== 完成  ===
  EnergyData   修正 X 条
  EnergyHourly 修正 N 条
  EnergyRecord 移动 M 条，对齐新增 X 更新 Y 删除 Z
  ✓ 已写入修复标记，重复运行将被拒绝（可用 --force 强制）
```

## 方案 B：宿主机直接运行（适合服务器已装 Node 环境）

```bash
# ① 备份
cp data/dev.db data/dev.db.backup.$(date +%Y%m%d_%H%M%S)

# ② 停容器
docker compose -f docker-compose.prod.yml stop

# ③ 设置数据库路径并运行
DATABASE_URL="file:./data/dev.db" node fix-energy-timezone.js

# ④ 重启
docker compose -f docker-compose.prod.yml up -d
```

## 方案 C：把 DB 拉回本地修好再推回去（DB 较大时不推荐）

```bash
# 本地
scp user@server:/path/to/project/data/dev.db ./server-dev.db
DATABASE_URL="file:./server-dev.db" npx tsx scripts/fix-energy-timezone.ts
scp ./server-dev.db user@server:/path/to/project/data/dev.db
ssh user@server 'cd /path/to/project && docker compose -f docker-compose.prod.yml restart'
```

## 安全机制

1. **幂等保护**：脚本在 `SystemSetting` 表写入 `timezone_fix_applied` 标记，第二次运行会自动拒绝
2. **预览模式**：`--dry-run` 只打印计划动作，不实际修改数据
3. **强制重跑**：`--force` 跳过标记检查（确需重跑时用，会把数据再偏移一次，谨慎）
4. **备份**：任何操作前务必先备份 `data/dev.db`

## 验证检查表

修复完成后应满足：

- [ ] EnergyHourly 与 EnergyRecord 的按日 kwh 完全一致
- [ ] 凌晨时段（本地 0-8 点）的数据归属到正确的本地日期
- [ ] SystemSetting 表中有 `timezone_fix_applied` 记录
- [ ] 应用重启后新的能耗数据继续按本地时间正确存储

## 回滚

如果修复后发现异常，立即用备份回滚：

```bash
docker compose -f docker-compose.prod.yml stop
cp data/dev.db.backup.YYYYMMDD_HHMMSS data/dev.db
docker compose -f docker-compose.prod.yml up -d
```
