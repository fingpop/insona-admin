// Device 类型定义（供 useDeviceGroups 等模块引用）
// Hook 函数已废弃 — control/page.tsx 使用自有的设备获取逻辑
export interface Device {
  id: string;
  pid: number;
  type: number;
  alive: number;
  name: string;
  gatewayName: string;
  func: number;
  value: string;
  meshId: string | null;
  roomId: string | null;
  ratedPower: number;
  room?: { id: string; name: string } | null;
  power: number | null;    // 当前功率 (W)
  todayKwh: number | null; // 今日能耗 (kWh)
}
