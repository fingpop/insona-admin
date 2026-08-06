// 共享工具函数 — control 模块各 Tab 组件公用

import { InSonaDevice } from "@/lib/types";
import { DbDevice, SpaceNode } from "./types";

// 从 funcs 数组解析设备最佳功能码（与后端 deriveFunc 逻辑一致）
export function resolveDeviceFunc(rawFunc: number, funcs?: number[]): number {
  const list = funcs ?? [];
  if (list.length === 0) return rawFunc;
  if (rawFunc > 0 && !list.includes(rawFunc)) return list[0];
  if (rawFunc <= 0) {
    if (list.includes(5)) return 5;
    if (list.includes(4)) return 4;
    if (list.includes(3)) return 3;
    if (list.includes(2)) return 2;
    return list[0];
  }
  return rawFunc;
}

// 将 API 返回的 Room 数据转换为 SpaceNode 格式
// API 返回 _count.devices，但 SpaceNode 需要 deviceCount
export function transformRoomsToSpaces(rooms: Record<string, unknown>[]): SpaceNode[] {
  const transform = (room: Record<string, unknown>): SpaceNode => {
    const directCount = (room._count as { devices?: number })?.devices ?? 0;
    const onlineCount = ((room.devices as { id: string }[]) || []).length;
    const children = room.children ? (room.children as Record<string, unknown>[]).map(transform) : [];
    const childDeviceCount = children.reduce((sum, c) => sum + (c.deviceCount ?? 0), 0);
    const childOnlineCount = children.reduce((sum, c) => sum + (c.onlineDeviceCount ?? 0), 0);

    return {
      id: room.id as string,
      name: room.name as string,
      type: (room.type as SpaceNode["type"]) || "room",
      parentId: room.parentId as string | null,
      meshId: room.meshId as string | null,
      deviceCount: directCount + childDeviceCount, // 包含子空间设备
      onlineDeviceCount: onlineCount + childOnlineCount, // 包含子空间在线设备
      children,
    };
  };

  return rooms.map(transform);
}

// 转换为 InSonaDevice 格式
export function toInSonaDevice(db: DbDevice): InSonaDevice {
  return {
    did: db.id,
    pid: db.pid,
    ver: db.ver,
    type: db.type,
    alive: db.alive,
    roomId: db.roomId ? String(db.roomId) : "",
    meshid: db.meshId || "",
    name: db.name || db.gatewayName || "",
    func: db.func,
    funcs: [],
    value: JSON.parse(db.value || "[]"),
    power: db.power ?? undefined,
    todayKwh: db.todayKwh ?? undefined,
  };
}

/**
 * 解析网关返回的设备状态值
 * 根据 func 类型解析 value 数组：
 * - func=2 (开关): value = [0/1] → 直接使用
 * - func=3 (亮度): value = [亮度] → 亮度>0表示开
 * - func=4 (色温): value = [亮度, 色温] → 亮度>0表示开
 * 返回格式统一为: [开关, 亮度, 色温]
 */
export function parseDeviceValue(rawValue: number[], func: number): number[] {
  const result: number[] = [0, 0, 0]; // [开关, 亮度, 色温]

  switch (func) {
    case 2: // 开关控制
      // value = [开关状态]
      result[0] = rawValue[0] ?? 0;
      break;

    case 3: // 亮度控制
      // value = [亮度], 亮度>0表示开启
      result[1] = rawValue[0] ?? 0;
      if (result[1] > 0) result[0] = 1;
      break;

    case 4: // 色温控制
      // value = [亮度, 色温百分比], 亮度>0表示开启
      result[1] = rawValue[0] ?? 0;
      result[2] = rawValue[1] ?? 0;
      if (result[1] > 0) result[0] = 1;
      break;

    default:
      // 其他情况，保留原始值
      if (rawValue.length >= 1) result[0] = rawValue[0];
      if (rawValue.length >= 2) result[1] = rawValue[1];
      if (rawValue.length >= 3) result[2] = rawValue[2];
  }

  return result;
}

export function parseGatewayStatusValue(rawStatus: number[] | undefined, rawValue: number[], func: number): number[] {
  if (rawStatus && rawStatus.length >= 3 && rawStatus[0] === 4) {
    return [1, rawStatus[1] ?? 0, rawStatus[2] ?? 0];
  }

  return parseDeviceValue(rawValue, func);
}
