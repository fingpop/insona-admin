# 今日能耗趋势图表切换功能

## 功能说明

在今日能耗趋势区域新增了图表类型切换功能，可以在"小时趋势"和"空间对比"两种视图之间切换。

## 功能特性

### 1. 小时趋势图（默认）
- 展示24小时能耗分布
- 面积图可视化
- 每小时累计能耗

### 2. 空间对比图（新增）
- 展示各空间当日能耗
- 柱状图可视化
- 按能耗从高到低排序
- X轴显示空间名称（倾斜45度避免重叠）

## 使用方法

### 切换图表类型

1. 访问控制页面 → 能耗分析 Tab
2. 在"今日能耗趋势"卡片右上角
3. 点击按钮切换：
   - **小时趋势** - 查看24小时分布
   - **空间对比** - 查看各空间对比

### 图表说明

**小时趋势图**：
- X轴：时间（00:00 - 23:00）
- Y轴：能耗（kWh）
- 图表类型：面积图
- 适用场景：了解一天中的能耗峰值时段

**空间对比图**：
- X轴：空间名称
- Y轴：能耗（kWh）
- 图表类型：柱状图
- 排序：能耗从高到低
- 适用场景：对比不同空间的能耗情况

## 代码实现

### 状态管理

```typescript
const [todayChartType, setTodayChartType] = useState<"hourly" | "room">("hourly");
```

### 图表切换按钮

```tsx
<button
  onClick={() => setTodayChartType("hourly")}
  className={...}
>
  <i className="fas fa-clock mr-2"></i>
  小时趋势
</button>
<button
  onClick={() => setTodayChartType("room")}
  className={...}
>
  <i className="fas fa-building mr-2"></i>
  空间对比
</button>
```

### 图表渲染

```tsx
{todayChartType === "hourly" && (
  <AreaChart data={todayEnergy.hourlyData}>
    {/* 小时趋势面积图 */}
  </AreaChart>
)}

{todayChartType === "room" && (
  <BarChart data={todayEnergy.roomStats}>
    {/* 空间对比柱状图 */}
  </BarChart>
)}
```

## 数据来源

### 小时趋势数据

```json
{
  "hourlyData": [
    { "hour": "00:00", "kwh": 0, "count": 0 },
    { "hour": "01:00", "kwh": 0, "count": 0 },
    ...
    { "hour": "23:00", "kwh": 0, "count": 0 }
  ]
}
```

### 空间对比数据

```json
{
  "roomStats": [
    {
      "roomName": "技术部",
      "totalKwh": 0.102,
      "deviceCount": 8
    },
    {
      "roomName": "2F大办公室",
      "totalKwh": 0.117,
      "deviceCount": 10
    }
  ]
}
```

## 样式设计

### 按钮样式

**激活状态**：
- 背景：蓝色（bg-blue-600）
- 文字：白色
- 图标：时钟/建筑图标

**未激活状态**：
- 背景：灰色（bg-gray-700）
- 文字：浅灰色
- 悬停：深灰色（hover:bg-gray-600）

### 图表样式

**小时趋势**：
- 渐变填充
- 蓝色主题
- 平滑曲线

**空间对比**：
- 圆角柱状
- 蓝色填充
- 倾斜标签

## 性能优化

- 使用 ResponsiveContainer 自适应容器大小
- 数据按需渲染（只渲染当前选中的图表）
- 空间数据预先排序
- 缓存切换状态

## 扩展建议

### 未来可以添加的图表类型

- **设备对比** - 不同设备的能耗对比
- **周对比** - 本周vs上周同期能耗对比
- **分类统计** - 按设备类型分类统计

### 交互增强

- 图表缩放
- 数据筛选
- 导出图表
- 数据钻取

## 测试验证

### 功能测试

```bash
# 测试API返回空间数据
curl http://localhost:3000/api/energy/today | jq '.roomStats'

# 测试小时数据
curl http://localhost:3000/api/energy/today | jq '.hourlyData'
```

### UI测试

1. ✅ 页面加载正常
2. ✅ 切换按钮显示
3. ✅ 小时趋势图正常
4. ✅ 空间对比图正常
5. ✅ 数据排序正确
6. ✅ 标签显示清晰

## 使用场景

### 小时趋势图适用

- 查找能耗峰值时段
- 分析用能规律
- 优化用能计划
- 发现异常时段

### 空间对比图适用

- 识别高能耗区域
- 对比空间能效
- 制定节能措施
- 分配能耗预算

## 注意事项

1. **数据量**：空间过多时，柱状图可能拥挤
2. **标签长度**：空间名称过长会影响显示
3. **数据精度**：能耗值精确到小数点后4位
4. **排序规则**：默认按能耗降序排列