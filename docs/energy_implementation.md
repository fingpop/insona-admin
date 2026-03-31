# 能耗数据格式分析与实现方案

## 数据格式分析

### JSON结构
```json
{
  "version": 1,
  "uuid": 5293,
  "method": "s.event",
  "evt": "energy",
  "did": "ECC57FB5134F00",  // 设备ID
  "power": 30,              // 额定功率(W)
  "period": 3,              // 上报周期(分钟)
  "energy": [               // 历史数据数组
    1060, 64,  // [序号, 百分比]
    1059, 64,
    1058, 64,
    1057, 64,
    1056, 64,
    1055, 64,
    1054, 64,
    1053, 60,
    1052, 64
  ]
}
```

### energy数组解析

**格式**: `[序号1, 百分比1, 序号2, 百分比2, ...]`

**特点**:
- 成对数据：序号和百分比交替出现
- 序号降序：最新序号在前（1060 → 1052）
- 百分比含义：该周期内的亮度/功率百分比
- 历史数据：每次包含9个历史数据点
- 上报周期：period=3 表示每3分钟一个周期

### 能耗计算公式

**单个周期能耗**:
```
实际功率(W) = power × (percent / 100)
周期能耗(kWh) = 实际功率(W) × period(min) / 60(h) / 1000
```

**示例计算**:
```
序号1060: 实际功率 = 30W × 64% = 19.2W
         能耗 = 19.2W × 3min / 60min / 1000 = 0.00096 kWh
```

## 实现方案

### 1. 数据处理流程

```
网关上报 → 解析energy数组 → 提取序号和百分比
          ↓
    计算每个周期能耗
          ↓
    去重处理（避免重复累加）
          ↓
    保存到数据库
```

### 2. 去重策略

**问题**: 每次上报包含9个历史数据点，会与之前上报重叠

**方案**: 使用序号作为唯一标识

```typescript
// 数据库模型
EnergyRecord {
  id: String
  deviceId: String
  date: String       // YYYY-MM-DD
  sequence: Number   // 序号（唯一）
  kwh: Float         // 该周期能耗
  percent: Number    // 百分比
  timestamp: DateTime
}

// 唯一约束
@@unique([deviceId, sequence])
```

### 3. 数据库设计

#### 方案A：序号级别记录（推荐）

**优点**:
- 精确记录每个周期
- 自动去重
- 可追溯历史

**缺点**:
- 数据量大（每3分钟一条）

```prisma
model EnergyData {
  id        String   @id @default(cuid())
  deviceId  String
  sequence  Int      // 序号
  date      String   // YYYY-MM-DD
  kwh       Float    // 能耗(kWh)
  percent   Int      // 百分比
  power     Float    // 额定功率(W)
  period    Int      // 周期(分钟)
  timestamp DateTime @default(now())

  device Device @relation(fields: [deviceId], references: [id])

  @@unique([deviceId, sequence])  // 防止重复
  @@index([deviceId, date])
  @@index([date])
}
```

#### 方案B：每日汇总记录

**优点**:
- 数据量小
- 查询快

**缺点**:
- 无法追溯细节
- 去重复杂

```prisma
model EnergyRecord {
  id        String   @id @default(cuid())
  deviceId  String
  date      String   // YYYY-MM-DD
  kwh       Float    // 当日总能耗
  peakWatts Float    // 峰值功率

  @@unique([deviceId, date])
}
```

### 4. 代码实现

```typescript
async function handleEnergyEvent(msg: Record<string, unknown>) {
  const { did, power, period, energy } = msg;

  if (!did || !energy || !Array.isArray(energy)) return;

  // 解析energy数组
  const dataPoints: Array<{ sequence: number; percent: number; kwh: number }> = [];

  for (let i = 0; i < energy.length; i += 2) {
    const sequence = energy[i];      // 序号
    const percent = energy[i + 1];   // 百分比

    // 计算能耗
    const actualPower = (power as number) * (percent / 100);
    const kwh = actualPower * (period as number) / 60 / 1000;

    dataPoints.push({ sequence, percent, kwh });
  }

  // 批量保存（自动去重）
  for (const point of dataPoints) {
    await prisma.energyData.upsert({
      where: {
        deviceId_sequence: {
          deviceId: did as string,
          sequence: point.sequence
        }
      },
      update: { kwh: point.kwh },  // 如果已存在，更新能耗值
      create: {
        deviceId: did as string,
        sequence: point.sequence,
        date: new Date().toISOString().split('T')[0],
        kwh: point.kwh,
        percent: point.percent,
        power: power as number,
        period: period as number
      }
    });
  }
}
```

### 5. 查询统计

#### 获取设备当天总能耗
```typescript
const today = new Date().toISOString().split('T')[0];
const result = await prisma.energyData.aggregate({
  where: { deviceId: 'ECC57FB5134F00', date: today },
  _sum: { kwh: true }
});
console.log(`今日能耗: ${result._sum.kwh} kWh`);
```

#### 获取小时能耗分布
```typescript
// 按时间戳的小时分组
const hourlyEnergy = await prisma.energyData.groupBy({
  by: ['date'],  // 需要添加小时字段
  where: { deviceId: 'ECC57FB5134F00', date: today },
  _sum: { kwh: true }
});
```

## 测试计划

### 单元测试
1. 解析energy数组正确性
2. 能耗计算公式准确性
3. 去重逻辑有效性

### 集成测试
1. 数据库写入和查询
2. 并发上报处理
3. 数据完整性验证

### 压力测试
1. 连续上报处理
2. 大量设备并发
3. 数据库性能

## 实施步骤

1. ✅ 分析数据格式
2. ⬜ 创建数据库模型（选择方案A）
3. ⬜ 实现能耗处理逻辑
4. ⬜ 编写单元测试
5. ⬜ 集成到GatewayService
6. ⬜ 验证和监控