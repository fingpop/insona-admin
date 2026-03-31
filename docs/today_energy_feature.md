# 今日能耗分析功能

## 功能说明

在能耗分析模块中新增了"今日能耗"实时统计功能，展示当天的能耗数据。

## 功能特性

### 1. 今日能耗统计卡片
- **今日总能耗** (kWh) - 精确到4位小数
- **活跃设备数** - 当前有能耗记录的设备数量
- **活跃空间数** - 有设备产生能耗的空间数量
- **记录总数** - 今日总记录数

### 2. 今日能耗趋势图
- 24小时能耗分布
- 每小时能耗统计
- 可视化面积图表

### 3. 设备和空间统计
- 按设备分组的能耗统计
- 按空间分组的能耗统计
- 最新能耗记录

## API接口

### GET /api/energy/today

获取今日能耗统计

**请求参数**:
- `deviceId` (可选) - 指定设备ID
- `roomId` (可选) - 指定房间ID

**返回数据**:
```json
{
  "date": "2026-03-31",
  "totalKwh": 0.258,
  "recordCount": 415,
  "deviceStats": [
    {
      "deviceId": "ECC57FB5134F00",
      "deviceName": "技术部2",
      "roomName": "技术部",
      "recordCount": 13,
      "totalKwh": 0.01248,
      "latestSequence": 1397,
      "latestPercent": 64
    }
  ],
  "roomStats": [
    {
      "roomName": "技术部",
      "totalKwh": 0.102,
      "deviceCount": 8
    }
  ],
  "hourlyData": [
    {
      "hour": "00:00",
      "kwh": 0,
      "count": 0
    }
  ],
  "latestData": [最新10条记录]
}
```

## 使用方法

### 1. 前端页面

访问控制页面 → 能耗分析 Tab，即可看到今日能耗统计卡片和趋势图。

### 2. API调用

```bash
# 获取今日所有能耗
curl http://localhost:3000/api/energy/today

# 获取指定房间的今日能耗
curl "http://localhost:3000/api/energy/today?roomId=技术部"

# 获取指定设备的今日能耗
curl "http://localhost:3000/api/energy/today?deviceId=ECC57FB5134F00"
```

### 3. 数据查询

```sql
-- 查看今日能耗统计
SELECT
  COUNT(*) as total_records,
  SUM(kwh) as total_kwh,
  COUNT(DISTINCT deviceId) as device_count
FROM EnergyData
WHERE date = date('now');

-- 按小时统计
SELECT
  strftime('%H', timestamp) as hour,
  SUM(kwh) as kwh,
  COUNT(*) as count
FROM EnergyData
WHERE date = date('now')
GROUP BY hour
ORDER BY hour;

-- 按设备统计
SELECT
  d.name as device_name,
  COUNT(*) as record_count,
  SUM(ed.kwh) as total_kwh
FROM EnergyData ed
JOIN Device d ON ed.deviceId = d.id
WHERE ed.date = date('now')
GROUP BY ed.deviceId
ORDER BY total_kwh DESC;
```

## 数据结构

### 能耗数据模型 (EnergyData)

```prisma
model EnergyData {
  id        String   @id
  deviceId  String
  sequence  Int      // 序号（唯一标识）
  date      String   // YYYY-MM-DD
  kwh       Float    // 能耗(kWh)
  percent   Int      // 百分比
  power     Float    // 额定功率(W)
  period    Int      // 周期(分钟)
  timestamp DateTime

  @@unique([deviceId, sequence])
  @@index([deviceId, date])
}
```

## 统计维度

### 1. 时间维度
- 今日总能耗
- 24小时分布
- 实时更新

### 2. 设备维度
- 设备能耗排名
- 设备活跃状态
- 最新上报数据

### 3. 空间维度
- 空间能耗占比
- 空间设备数量
- 空间能耗对比

## 性能优化

- 数据库索引优化
- 聚合查询缓存
- 前端状态管理
- 按需加载

## 注意事项

1. **数据精度**: 能耗精确到小数点后6位，显示时保留4位
2. **时区问题**: 使用服务器本地时间
3. **数据去重**: 基于序号唯一约束自动去重
4. **实时性**: 每次上报自动更新今日统计

## 测试验证

```bash
# 测试API
curl http://localhost:3000/api/energy/today

# 查看数据库统计
node scripts/check_energy.js

# 检查今日数据
sqlite3 prisma/dev.db "
SELECT COUNT(*) as count,
       SUM(kwh) as total_kwh
FROM EnergyData
WHERE date = date('now');
"
```

## 后续扩展

- [ ] 能耗对比（同比、环比）
- [ ] 能耗预测
- [ ] 能耗告警
- [ ] 能耗报表导出
- [ ] 能耗成本计算