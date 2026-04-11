// inSona protocol types

export interface InSonaRequest {
  version: number;
  uuid: number;
  method: string;
  type?: string;
  did?: string;
  meshid?: string;
  action?: string;
  value?: number[];
  transition?: number;
}

export interface InSonaResponse {
  version: number;
  uuid: number;
  method: string;
  result?: string;
  rooms?: { roomId: number; name: string }[];
  devices?: InSonaDevice[];
}

export interface InSonaDevice {
  did: string;
  pid: number;
  ver: string;
  type: number;
  alive: number;
  roomId: string;
  meshid: string;
  name: string;
  func: number;
  funcs: number[];
  value: number[];
  groups?: number[]; // 设备所属组列表,数值对应 roomId
  // 能耗数据
  power?: number; // 当前功率 (W)
  todayKwh?: number; // 今日能耗 (kWh)
}

export interface InSonaEvent {
  version: number;
  uuid: number;
  method: "s.event";
  evt: "meshchange" | "status" | "sensor" | "switch.key" | "scene.recall" | "heartbeat" | "energy";
  did?: string;
  func?: number;
  value?: number[];
  // energy event fields
  kwh?: number;
  power?: number;
  voltage?: number;
  current?: number;
}

export interface InSonaScene {
  sceneId: number;
  name: string;
}

// Gateway connection status
export type GatewayStatus = "connected" | "disconnected" | "connecting" | "reconnecting";

// Device type labels
export const DEVICE_TYPE_LABELS: Record<number, string> = {
  1984: "灯具",
  1860: "开合帘",
  1861: "卷帘",
  1862: "开合帘带角度",
  1218: "面板",
  1344: "传感器",
};

// Device function labels
export const FUNC_LABELS: Record<number, string> = {
  2: "开关",
  3: "调光",
  4: "双色温",
  5: "HSL彩灯",
  9: "面板",
  10: "传感器",
  14: "空调",
  21: "地暖",
  24: "新风",
};

// Default rated power by device type (watts)
export const DEFAULT_RATED_POWER: Record<number, number> = {
  1984: 10,    // light
  1860: 30,    // curtain
  1861: 30,    // roller blind
  1862: 30,    // angled curtain
  1218: 2,     // panel
  1344: 0.5,   // sensor
  14: 800,     // AC
  21: 1200,    // floor heating
  24: 50,     // fresh air
};

// 判断设备 ID 是否为组设备（DID 长度为 2 的十六进制 00-FF）
export const isGroupDevice = (id: string): boolean => /^[0-9a-fA-F]{2}$/i.test(id);

// 解析存储的设备 ID（meshId:did 格式，用于组设备）
export function parseStoredDeviceId(storedId: string): { meshId: string | null; did: string } {
  const parts = storedId.split(":");
  if (parts.length === 2) {
    return { meshId: parts[0], did: parts[1] };
  }
  return { meshId: null, did: storedId };
}

// 组装存储用的设备 ID（组设备用 meshId:did 格式，普通设备用原始 did）
export function buildStoredDeviceId(meshId: string | null | undefined, did: string): string {
  // 只有组设备才使用 meshId:did 组合
  if (isGroupDevice(did) && meshId) {
    return `${meshId}:${did}`;
  }
  return did;
}

// Dashboard 相关类型
export interface DashboardStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  onlineRate: number;
  todayKwh: number;
  todayPeakWatts: number;
  yesterdayKwh: number;
  lastWeekKwh: number;
  deviceGrowthRate: number;
  energyGrowthRate: number;
}

export interface HourlyEnergyData {
  hour: string;
  kwh: number;
  peakWatts: number;
}

export interface DeviceTypeDistribution {
  type: number;
  label: string;
  count: number;
  online: number;
  percentage: number;
}

export interface RoomEnergyRanking {
  roomId: string;
  roomName: string;
  kwh: number;
  peakWatts: number;
  deviceCount: number;
}

export interface FloorStatus {
  floorId: string;
  floorName: string;
  total: number;
  online: number;
  offline: number;
  onlineRate: number;
  rooms: { roomId: string; roomName: string; deviceCount: number; onlineCount: number }[];
}

export interface FunctionDistribution {
  func: number;
  label: string;
  count: number;
}

export interface RealtimePowerData {
  timestamp: string;
  watts: number;
}

export interface DashboardEvent {
  id: string;
  timestamp: string;
  type: string;
  deviceId?: string;
  deviceName: string;
  message: string;
  status: "unread" | "read" | "resolved";
}

export interface CarbonEmissions {
  period: string;
  totalKwh: number;
  totalCarbon: number; // kg CO2
  prevCarbon: number; // kg CO2
  growthRate: number;
  emissionFactor: number;
  treesNeeded: number;
  peakWatts: number;
}
