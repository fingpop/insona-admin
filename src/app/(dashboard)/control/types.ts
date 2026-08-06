// 共享类型定义 — control 模块各 Tab 组件公用

export interface DbDevice {
  id: string;
  pid: number;
  ver: string;
  type: number;
  alive: number;
  name: string;
  gatewayName: string;
  func: number;
  funcs?: number[];
  value: string;
  meshId: string | null;
  ratedPower: number;
  roomId: string | null;
  room?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  power?: number | null;    // 当前功率 (W)
  todayKwh?: number | null; // 今日能耗 (kWh)
}

// 空间类型
export interface SpaceNode {
  id: string;
  name: string;
  type: "building" | "floor" | "room";
  parentId: string | null;
  meshId: string | null;
  deviceCount?: number;
  onlineDeviceCount?: number;
  children?: SpaceNode[];
  devices?: DbDevice[];
}

// ==================== 场景类型定义 ====================
export interface SceneAction {
  id: string;
  sceneId: string;
  deviceId: string;
  action: string;
  value: string;
  order: number;
  meshId: string;
  deviceName: string;
}

export interface Scene {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  isCustom: boolean;
  showInQuick: boolean;
  sceneId?: number;
  meshId?: string;
  createdAt: string;
  actions: SceneAction[];
}
