# 能耗数据计算方式详解

本文档详细说明商照管理后台系统中能耗数据的完整计算流程和公式。

## 目录

1. [单个数据点的计算](#单个数据点的计算)
2. [小时聚合数据的计算](#小时聚合数据的计算)
3. [日汇总数据的计算](#日汇总数据的计算)
4. [数据上报周期分析](#数据上报周期分析)
5. [完整计算示例](#完整计算示例)
6. [防重机制说明](#防重机制说明)
7. [数据流向图](#数据流向图)

---

## 单个数据点的计算

### 网关上报数据格式

网关通过 `s.event` 消息上报能耗数据，JSON 格式如下：

```json
{
  "version": 1,
  "uuid": 5293,
  "method": "s.event",
  "evt": "energy",
  "did": "ECC57FB5134F00",
  "power": 30,              // 额定功率（W）
  "period": 3,              // 上报周期（分钟）
  "energy": [
    1060, 64,               // [sequence, percent] 成对出现
    1059, 64,
    1058, 64,
    1057, 64,
    1056, 64,
    1055, 64,
    1054, 64,
    1053, 60,
    1052, 64                // 共9对数据（18个数字）
  ]
}
```

**关键字段说明：**

| 字段 | 类型 | 含义 |
|------|------|------|
| `did` | String | 设备ID |
| `power` | Number | 设备额定功率（瓦特 W） |
| `period` | Number | 上报周期（分钟），表示每个数据点代表的时长 |
| `energy[]` | Array | 历史能耗数据数组，按 `[sequence, percent]` 成对存储 |

### Sequence（序号）的作用

**Sequence 是能耗周期的唯一标识：**

- 每个 sequence 代表一个 **3 分钟** 的周期
- 序号递增，最新数据在前（降序排列）
- 用于去重：防止同一周期数据被重复计算
- 时间戳映射：`sequence × 3分钟 ≈ 相对时间偏移`

**示例：**
```
sequence 1060 → 大约对应 18:53 的某个3分钟周期
sequence 1061 → 大约对应 18:56 的某个3分钟周期
```

### 计算公式

**核心公式**（来源：`src/lib/gateway/GatewayService.ts:521-524`）：

```
实际功率(W) = 额定功率(W) × 亮度百分比(%)

能耗(kWh) = 实际功率(W) × 周期(min) / 60(min) / 1000
```

**公式推导：**
1. 第一步：计算实际功率 = 额定功率 × 亮度百分比
2. 第二步：计算能耗 = 功率 × 时间 / 单位换算系数
3. 换算系数：`60`（分钟转小时） × `1000`（瓦转千瓦）

### 计算示例

**场景：30W灯具，亮度64%，上报周期3分钟**

```typescript
// 参数
额定功率: 30W
亮度百分比: 64%
上报周期: 3min

// 计算步骤
实际功率 = 30W × 64% = 19.2W
能耗(kWh) = 19.2W × 3min / 60min / 1000 = 0.00096 kWh
```

**结果：** 每个数据点的能耗为 **0.00096 kWh**

---

## 小时聚合数据的计算

### EnergyHourly 表结构

```prisma
model EnergyHourly {
  id        String   @id @default(cuid())
  deviceId  String   // 设备ID
  date      String   // YYYY-MM-DD
  hour      Int      // 0-23
  kwh       Float    @default(0)      // 该小时累计能耗
  peakWatts Float    @default(0)      // 该小时峰值功率
  dataCount Int      @default(0)      // 该小时数据点数量

  @@unique([deviceId, date, hour])  // 每小时唯一记录
}
```

### 聚合计算逻辑

**核心逻辑**（来源：`src/lib/gateway/GatewayService.ts:581-618`）：

```
小时能耗(kWh) = Σ 所有数据点的能耗（去重后）
小时峰值(W) = MAX 所有数据点的功率
数据点数 = 实际插入的新数据点数量
```

**累加公式：**
```typescript
// 更新小时聚合
kwh: existingHourly.kwh + newTotalKwh           // 累加能耗
peakWatts: Math.max(existingHourly.peakWatts, maxPower)  // 更新峰值
dataCount: existingHourly.dataCount + newPoints.length   // 累加数据点数
```

### 关键机制

1. **累加模式**
   - kwh 字段：累加所有新数据点的能耗值
   - 每次上报时累加，形成该小时的总能耗

2. **峰值功率**
   - peakWatts 字段：取该小时内所有数据点的最大功率值
   - 用于负载分析和电路容量规划
   - 不是累加，而是取最大值：`Math.max()`

3. **数据点计数**
   - dataCount 字段：记录去重后的真实数据点数量
   - 用于验证数据完整性

### 示例计算

**场景：1小时内收到20个数据点（去重后）**

```typescript
// 数据点明细
sequence 1060: 64%亮度 → 0.00096 kWh
sequence 1059: 64%亮度 → 0.00096 kWh
...
sequence 1041: 64%亮度 → 0.00096 kWh

// 小时聚合计算
小时能耗 = 20 × 0.00096 = 0.0192 kWh
峰值功率 = 19.2W（所有数据点功率相同）
数据点数 = 20
```

---

## 日汇总数据的计算

### EnergyRecord 表结构

```prisma
model EnergyRecord {
  id        String   @id @default(cuid())
  deviceId  String   // 设备ID
  date      String   // YYYY-MM-DD
  kwh       Float    @default(0)      // 当日累计能耗
  peakWatts Float    @default(0)      // 当日峰值功率

  @@unique([deviceId, date])
}
```

### 汇总计算逻辑

**核心逻辑**（来源：`src/lib/gateway/GatewayService.ts:620-652`）：

```
日能耗(kWh) = Σ 所有数据点的能耗（去重后）
日峰值(W) = MAX 全天数据点的功率
```

**累加公式：**
```typescript
// 更新日汇总
kwh: existingRecord.kwh + newTotalKwh         // 累加能耗
peakWatts: Math.max(existingRecord.peakWatts, maxPower)  // 更新峰值
```

### 与小时聚合的关系

**数据流向：**
```
EnergyData（明细）
    ↓ 直接累加
EnergyHourly（小时聚合） ← 独立计算
    ↓ 直接累加
EnergyRecord（日汇总） ← 独立计算
```

**注意：**
- EnergyRecord 的日汇总直接来自 EnergyData 的累加
- 不是来自 EnergyHourly 的二次聚合
- 两者独立计算，理论上应保持一致

---

## 数据上报周期分析

### Period 字段的含义

**Period = 3 分钟**

- 表示每个 sequence 代表的时间长度
- 网关固定的上报周期配置
- 用于能耗计算的时间参数

### 理论数据量

**每小时：**
```
周期: 3分钟/数据点
每小时点数: 60分钟 ÷ 3分钟 = 20个数据点
每次上报: 包含9个历史数据点（覆盖27分钟历史）
```

**每天：**
```
每天点数: 20个点/小时 × 24小时 = 480个数据点/设备
```

### 实际上报频率

**从日志分析（energy_events.log）：**

| 时间段 | 上报间隔 | 备注 |
|-------|---------|------|
| 初始阶段 | 约3分钟 | 18:32 → 18:35 → 18:38 |
| 稳定阶段 | 约3分钟 | 18:53 → 18:56 → 18:59 |
| 近期数据 | 约3分钟 | 12:14 → 12:17 → 12:20 |

**上报模式：**
- 基础频率：**每3分钟一次**
- 每次上报：**9个历史数据点**（覆盖最近27分钟）
- Sequence 递增：每次新 sequence = 上次最大 sequence + 1

### 重复数据现象

**重要发现：** 网关存在重复上报同一批数据的现象

```
示例（日志）：
12:14:12.658 - 同一毫秒内上报4次相同数据
12:17:12.650 - 同一毫秒内上报3次相同数据
```

**已通过防重机制处理：**
- 查询已存在的 sequence
- 过滤重复数据点
- 只累加新数据点

---

## 完整计算示例

### 场景：30W灯具连续运行1小时，亮度64%

**参数：**
```typescript
额定功率: 30W
亮度百分比: 64%
上报周期: 3min
运行时长: 60min
```

**计算步骤：**

#### 1. 单个数据点

```typescript
实际功率 = 30W × 64% = 19.2W
单点能耗 = 19.2W × 3min / 60min / 1000 = 0.00096 kWh
```

#### 2. 1小时累计（20个数据点）

```typescript
小时能耗 = 0.00096 kWh × 20 = 0.0192 kWh
峰值功率 = 19.2W（所有数据点功率相同）
数据点数 = 20
```

#### 3. 1天累计（480个数据点）

```typescript
日能耗 = 0.00096 kWh × 480 = 0.4608 kWh
日峰值 = 19.2W（假设全天亮度不变）
```

#### 4. 电费换算（假设0.6元/kWh）

```typescript
日电费 = 0.4608 kWh × 0.6元/kWh ≈ 0.28元
月电费 ≈ 0.28元 × 30天 ≈ 8.4元
年电费 ≈ 0.28元 × 365天 ≈ 102元
```

### 不同功率和亮度的对比表

| 额定功率 | 亮度 | 实际功率 | 单点能耗 | 小时能耗 | 日能耗 | 月电费 |
|---------|------|---------|---------|---------|---------|--------|
| 30W | 100% | 30W | 0.0015 kWh | 0.03 kWh | 0.72 kWh | 13元 |
| 30W | 64% | 19.2W | 0.00096 kWh | 0.0192 kWh | 0.46 kWh | 8.4元 |
| 30W | 50% | 15W | 0.00075 kWh | 0.015 kWh | 0.36 kWh | 6.5元 |
| 30W | 0% | 0W | 0 kWh | 0 kWh | 0 kWh | 0元 |
| 50W | 64% | 32W | 0.0016 kWh | 0.032 kWh | 0.768 kWh | 14元 |
| 100W | 64% | 64W | 0.0032 kWh | 0.064 kWh | 1.536 kWh | 28元 |

---

## 防重机制说明

### 为什么需要防重？

**问题根源：**
- 网关在短时间内重复发送同一批数据（5-9次）
- EnergyData 表有唯一约束，能正确跳过重复
- EnergyHourly 和 EnergyRecord 简单累加会导致数据翻倍

### Sequence 唯一约束

**数据库设计：**
```prisma
model EnergyData {
  deviceId  String
  sequence  Int      // 上报序号（唯一标识）
  @@unique([deviceId, sequence])  // 防止重复
}
```

### 防重流程

**核心逻辑**（来源：`src/lib/gateway/GatewayService.ts:537-577`）：

```typescript
// 1. 查询已存在的 sequence
const existingSequences = await prisma.energyData.findMany({
  where: {
    deviceId: did,
    sequence: { in: dataPoints.map(p => p.sequence) }
  },
  select: { sequence: true }
});

// 2. 构建 Set 用于快速判断
const existingSet = new Set(existingSequences.map(s => s.sequence));

// 3. 过滤出新数据点
const newPoints = dataPoints.filter(p => !existingSet.has(p.sequence));

// 4. 如果没有新数据，直接返回
if (newPoints.length === 0) {
  return;  // 避免重复累加
}

// 5. 只插入和累加新数据
await prisma.energyData.createMany({ data: newPoints });

// 6. 重新计算能耗（只累加新数据）
const totalKwh = newPoints.reduce((sum, p) => sum + p.kwh, 0);
const maxPower = newPoints.reduce((max, p) => {
  const powerWatts = power * (p.percent / 100);
  return Math.max(max, powerWatts);
}, 0);

// 7. 更新聚合表（使用过滤后的值）
existingHourly.kwh + totalKwh  // 只加新数据
existingHourly.dataCount + newPoints.length  // 只加新数量
```

### 防重效果

| 修复前 | 修复后 |
|--------|--------|
| 每小时 200 条记录 | 每小时 20 条记录 ✅ |
| 重复累加导致数据异常 | 精准防重，数据准确 ✅ |
| dataCount 与明细不一致 | dataCount 与明细一致 ✅ |

---

## 数据流向图

### 整体流程

```
┌─────────────────┐
│  网关上报数据   │
│ s.event.energy │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────┐
│ GatewayService              │
│ ._handleEnergyEvent         │
│                             │
│ 1. 解析 energy 数组         │
│ 2. 计算 kWh 公式            │
│ 3. 查询已存在 sequence      │
│ 4. 过滤重复数据             │
└────────┬────────────────────┘
         │
         ↓
┌────────────────────────────────────┐
│ 三写策略（并行写入）                │
├───────────────┬────────────┬───────┤
│ EnergyData    │EnergyHourly│Energy │
│ (明细)        │(小时聚合)  │Record │
│               │            │(日汇总)│
├───────────────┼────────────┼───────┤
│ - sequence    │ - kwh累加  │ - kwh │
│ - kWh         │ - peakWatts│累加   │
│ - percent     │ - dataCount│ - peak│
│ - 唯一约束    │            │ Watts │
│               │            │       │
│ 保留1小时     │ 长期存储   │长期存储│
│ 自动清理      │            │       │
└───────────────┴────────────┴───────┘
         │            │        │
         ↓            ↓        ↓
┌─────────────────────────────┐
│ 查询用途                     │
├─────────────┬───────┬────────┤
│ 实时查询    │趋势   │统计    │
│ (最近1小时) │分析   │报表    │
└─────────────┴───────┴────────┘
```

### 性能优化说明

| 层级 | 写入策略 | 查询用途 | 保留时长 | 性能影响 |
|------|---------|---------|---------|---------|
| EnergyData | 明细写入 | 实时展示 | 1小时 | 高写入，快速查询 |
| EnergyHourly | 小时聚合 | 趋势分析 | 长期 | 低写入，高效查询 |
| EnergyRecord | 日汇总 | 统计报表 | 长期 | 极低写入，极快查询 |

---

## 验证方法

### 1. 手动计算验证

```bash
# 查询设备额定功率
sqlite3 prisma/dev.db "SELECT id, ratedPower FROM Device WHERE id='ECC57FB5134F00';"

# 查询当前小时数据
node scripts/test-energy-fix.js
```

### 2. 数据一致性检查

**关键验证指标：**

- ✅ `dataCount` = 明细表实际记录数
- ✅ `EnergyHourly.kwh` = Σ `EnergyData.kwh`
- ✅ `EnergyRecord.kwh` = Σ 当天所有 `EnergyData.kwh`
- ✅ `peakWatts` ≥ 所有数据点的实际功率

### 3. 对比明细和聚合

```sql
-- 查询小时聚合
SELECT date, hour, kwh, dataCount
FROM EnergyHourly
WHERE deviceId='ECC57FB5134F00' AND date='2026-04-09';

-- 查询明细总和
SELECT SUM(kwh) as totalKwh, COUNT(*) as totalCount
FROM EnergyData
WHERE deviceId='ECC57FB5134F00' AND date='2026-04-09';

-- 两者应该相等
```

---

## 关键文件位置

| 文件 | 功能 | 关键代码行 |
|------|------|-----------|
| `src/lib/gateway/GatewayService.ts` | 能耗事件处理和计算 | 452-665 |
| `prisma/schema.prisma` | 数据表结构定义 | 111-156 |
| `src/app/api/energy/route.ts` | 历史能耗查询API | 77-148 |
| `src/app/api/energy/today/route.ts` | 今日能耗查询API | 10-144 |
| `scripts/test-energy-fix.js` | 测试验证脚本 | 全文 |
| `energy_events.log` | 实际上报数据日志 | - |

---

## 常见问题

### Q1: 为什么每小时只有20个数据点，而不是更多？

**答：** 上报周期固定为3分钟，因此每小时理论数据量为 60÷3=20个。虽然每次上报包含9个历史数据点，但这些数据点是过去27分钟的累积，不是新的独立数据点。

### Q2: Sequence 号是否会重置？

**答：** Sequence 是递增的序号，理论上不会重置。但在设备重启或固件更新等极低概率事件下，可能出现 sequence 重置，导致少量重复统计（可接受）。

### Q3: 峰值功率为什么取最大值而不是平均值？

**答：** 峰值功率用于负载分析和电路容量规划，需要关注最大负载情况。平均值对电路设计意义较小。

### Q4: EnergyHourly 和 EnergyRecord 的数据会不一致吗？

**答：** 两者独立计算但应保持一致。如果发现不一致，可能是：
- 数据去重逻辑问题（已修复）
- 跨小时边界的数据点归类差异
- 时区或时间戳精度问题

### Q5: 如何验证能耗数据的准确性？

**答：**
1. 使用测试脚本：`node scripts/test-energy-fix.js`
2. 对比明细总和与聚合值
3. 手动计算预期能耗值
4. 查看日志文件分析上报频率

---

## 参考资料

- [Prisma Schema 文档](../prisma/schema.prisma)
- [能耗实现文档](./energy_implementation.md)
- [GatewayService 源码](../src/lib/gateway/GatewayService.ts)
- [能耗 API 文档](../src/app/api/energy/)

---

**文档版本：** v1.0
**更新日期：** 2026-04-09
**维护人员：** Claude Code