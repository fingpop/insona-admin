"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useGatewayEvents } from "@/hooks/useGatewayEvents";
import { InSonaDevice, DEVICE_TYPE_LABELS, FUNC_LABELS, isGroupDevice, parseStoredDeviceId } from "@/lib/types";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from "recharts";
import HomeLayout from "./home-layout";

// 动态导入组设备页面（避免打包问题）
const GroupsPage = dynamic(() => import("@/app/(dashboard)/groups/page"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <i className="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
    </div>
  ),
});

// ==================== 类型定义 ====================
// 数据库设备类型
interface DbDevice {
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
interface SpaceNode {
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

// 从 funcs 数组解析设备最佳功能码（与后端 deriveFunc 逻辑一致）
function resolveDeviceFunc(rawFunc: number, funcs?: number[]): number {
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
function transformRoomsToSpaces(rooms: Record<string, unknown>[]): SpaceNode[] {
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

// ==================== 场景类型定义 ====================
interface SceneAction {
  id: string;
  sceneId: string;
  deviceId: string;
  action: string;
  value: string;
  order: number;
  meshId: string;
  deviceName: string;
}

interface Scene {
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

// 转换为 InSonaDevice 格式
function toInSonaDevice(db: DbDevice): InSonaDevice {
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

// ==================== 场景类型定义 ====================
// SceneAction and Scene interfaces defined at top of file

interface Schedule {
  id: string;
  name: string;
  time: string;
  days: string[];
  action: string;
  enabled: boolean;
}

interface Automation {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
}

interface EnergyData {
  date: string;
  value: number;
  carbonEmission?: number;
}

/**
 * 解析网关返回的设备状态值
 * 根据 func 类型解析 value 数组：
 * - func=2 (开关): value = [0/1] → 直接使用
 * - func=3 (亮度): value = [亮度] → 亮度>0表示开
 * - func=4 (色温): value = [亮度, 色温] → 亮度>0表示开
 * 返回格式统一为: [开关, 亮度, 色温]
 */
function parseDeviceValue(rawValue: number[], func: number): number[] {
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

function parseGatewayStatusValue(rawStatus: number[] | undefined, rawValue: number[], func: number): number[] {
  if (rawStatus && rawStatus.length >= 3 && rawStatus[0] === 4) {
    return [1, rawStatus[1] ?? 0, rawStatus[2] ?? 0];
  }

  return parseDeviceValue(rawValue, func);
}

// ==================== 主组件 ====================
export default function ControlPanel() {
  const [currentPage, setCurrentPage] = useState<string>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  const [gatewayIP, setGatewayIP] = useState("");
  const [dbDevices, setDbDevices] = useState<DbDevice[]>([]);
  const [spaces, setSpaces] = useState<SpaceNode[]>([]);
  const [devices, setDevices] = useState<InSonaDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<InSonaDevice | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState("zh-CN");

  // 当 devices 列表更新时，同步 selectedDevice 的最新状态
  useEffect(() => {
    if (selectedDevice && drawerOpen) {
      const updated = devices.find((d) => d.did === selectedDevice.did);
      if (updated && updated !== selectedDevice) {
        setSelectedDevice(updated);
      }
    }
  }, [devices, drawerOpen, selectedDevice]);

  // SSE 事件监听
  const { subscribe } = useGatewayEvents();

  const refreshGatewayStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/gateway/status");
      const data = await response.json();
      const gateways = data.gateways ?? [];
      const hasConnected = gateways.some((g: { status: string }) => g.status === "connected");
      const hasPendingConnection = gateways.some(
        (g: { status: string }) => g.status === "reconnecting" || g.status === "connecting"
      );

      setGatewayStatus(hasConnected ? "connected" : hasPendingConnection ? "connecting" : "disconnected");
      return gateways;
    } catch (err) {
      console.error("获取网关状态失败:", err);
      setGatewayStatus("disconnected");
      return [];
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === "connected") {
        refreshGatewayStatus().catch(() => {});
        queryDevices();
      } else if (event.type === "disconnected") {
        refreshGatewayStatus().catch(() => {});
      } else if (event.type === "s.query" && event.payload) {
        // c.query 响应 → 更新设备列表
        const payload = event.payload as Record<string, unknown>;
        if (payload.devices && Array.isArray(payload.devices)) {
          setDevices((prev) => {
            const map = new Map(prev.map((d) => [d.did, d]));
            for (const dev of payload.devices as Record<string, unknown>[]) {
              const did = String(dev.did);
              const func = Number(dev.func ?? 0);
              const rawValue = (dev.value as number[]) ?? [];
              const status = (dev.status as number[]) ?? [];
              const meshid = dev.meshid ? String(dev.meshid) : undefined;

              // 解析设备状态值
              // 如果有 status 数组，使用 status 解析（格式: [type, value1, value2]）
              // 否则使用 func 类型解析 value 数组
              let finalValue: number[];
              if (status.length >= 1) {
                const statusType = status[0];
                if (statusType === 4 && status.length >= 3) {
                  // status=[4, brightness, colorTemp]
                  // 假设设备为开状态
                  finalValue = [1, status[1], status[2]];
                } else {
                  // 其他 status 类型，保留原始 value
                  finalValue = parseDeviceValue(rawValue, func);
                }
              } else {
                // 没有 status，根据 func 类型解析
                finalValue = parseDeviceValue(rawValue, func);
              }

              const update: InSonaDevice = {
                did,
                func,
                value: finalValue,
                meshid: (meshid ?? "") as InSonaDevice["meshid"],
                type: Number(dev.type ?? 0),
                name: String(dev.name ?? ""),
                pid: Number(dev.pid ?? 0),
                ver: String(dev.ver ?? ""),
                roomId: String(dev.roomId ?? ""),
                funcs: (dev.funcs as number[]) ?? [],
                alive: Number(dev.alive ?? 0),
              };

              if (map.has(did)) {
                map.set(did, { ...map.get(did)!, ...update });
              } else {
                map.set(did, update);
              }
            }
            return Array.from(map.values());
          });
        }
      } else if (event.type === "s.control" && event.payload) {
        // s.control 响应 → c.control 的返回，更新设备状态
        // func 表示当前控制动作的类型，用于解析 value 格式
        const scPayload = event.payload as Record<string, unknown>;
        const did = String(scPayload.did ?? "");
        const func = Number(scPayload.func ?? 0);
        const rawValue = (scPayload.value as number[]) ?? [];
        const rawStatus = (scPayload.status as number[]) ?? [];
        const meshid = scPayload.meshid ? String(scPayload.meshid) : undefined;

        // 根据 func 类型解析 value 数组
        const parsedValue = parseGatewayStatusValue(rawStatus, rawValue, func);

        const update: Partial<InSonaDevice> = {
          did,
          value: parsedValue,
          meshid: meshid as InSonaDevice["meshid"],
        };

        handleDeviceUpdate(update as InSonaDevice);
      } else if (event.type === "s.event" && event.payload) {
        // s.event 事件 → 设备状态变化通知
        // func 表示当前控制动作的类型，用于解析 value 格式
        const payload = event.payload as Record<string, unknown>;
        if (payload.evt === "status" && payload.did) {
          const did = String(payload.did);
          const func = Number(payload.func ?? 0);
          const rawValue = (payload.value as number[]) ?? [];
          const rawStatus = (payload.status as number[]) ?? [];
          const meshid = payload.meshid ? String(payload.meshid) : undefined;

          // 根据 func 类型解析 value 数组
          // func=2: value=[开关], func=3: value=[亮度], func=4: value=[亮度, 色温]
          const parsedValue = parseGatewayStatusValue(rawStatus, rawValue, func);

          const update: Partial<InSonaDevice> = {
            did,
            value: parsedValue,
            meshid: meshid as InSonaDevice["meshid"],
          };

          handleDeviceUpdate(update as InSonaDevice);
        } else if (payload.evt === "energy" && payload.did) {
          // 能耗数据上报（新格式：包含 energy 数组）
          const did = String(payload.did);
          const power = Number(payload.power ?? 0); // 额定功率 (W)

          // 更新本地设备状态（只更新功率）
          handleDeviceUpdate({
            did,
            power,
          } as InSonaDevice);

          // GatewayService 已经在后端处理能耗数据保存，前端不需要再调用 API
        }
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // 页面加载时：获取网关状态 + 自动重连 + 加载设备
  useEffect(() => {
    const init = async () => {
      try {
        // 1. 获取网关配置
        const gateways = await refreshGatewayStatus();

        // 设置第一个网关的 IP（用于手动连接）
        const firstGw = gateways.find((g: { ip: string }) => g.ip);
        if (firstGw) {
          setGatewayIP(firstGw.ip);
        }

        // 2. 加载设备和空间数据（即使未连接也显示本地数据）
        await queryDevices();

        // 3. 加载今日能耗和功率数据
        try {
          const todayEnergyRes = await fetch("/api/energy/today");
          const todayEnergyData = await todayEnergyRes.json();

          if (todayEnergyData.deviceStats) {
            // 创建功率和能耗的映射
            const energyMap = new Map<string, { todayKwh: number; power: number }>(
              todayEnergyData.deviceStats.map((stat: {
                deviceId: string;
                totalKwh: number;
                latestPower: number;
              }) => [stat.deviceId, { todayKwh: stat.totalKwh, power: stat.latestPower }])
            );

            // 更新设备的今日能耗和功率
            setDevices((prev) =>
              prev.map((d) => {
                const energyInfo = energyMap.get(d.did);
                return {
                  ...d,
                  todayKwh: energyInfo?.todayKwh ?? d.todayKwh,
                  power: energyInfo?.power ?? d.power,
                };
              })
            );
          }
        } catch (err) {
          console.error("加载能耗数据失败:", err);
        }

        // 4. 如果网关未连接，尝试自动重连
        const hasConnected = gateways.some((g: { status: string }) => g.status === "connected");
        if (!hasConnected && gateways.length > 0) {
          setGatewayStatus("connecting");
          const connectRes = await fetch("/api/gateway/autoconnect", { method: "POST" });
          const connectData = await connectRes.json();
          if (connectData.status === "connected") {
            setGatewayStatus("connected");
          } else {
            setGatewayStatus("disconnected");
          }
        } else if (hasConnected) {
          setGatewayStatus("connected");
        } else {
          // 没有配置网关
          setGatewayStatus("disconnected");
        }
      } catch (err) {
        console.error("初始化失败:", err);
        setGatewayStatus("disconnected");
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshGatewayStatus]);

  // 当用户切换到不同页面时，刷新数据
  useEffect(() => {
    // 设备管理、空间管理、场景管理、能耗分析、自动化页面都需要最新设备数据
    if (["devices", "rooms", "scenes", "energy", "automation"].includes(currentPage)) {
      queryDevices();
    }
  }, [currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const queryDevices = async () => {
    try {
      const [devicesRes, spacesRes] = await Promise.all([
        fetch("/api/devices"),
        fetch("/api/rooms"),
      ]);
      const devicesData = await devicesRes.json();
      const spacesData = await spacesRes.json();

      if (devicesData.devices) {
        setDbDevices(devicesData.devices);
        setDevices(devicesData.devices.map(toInSonaDevice));
      }
      if (spacesData.rooms) {
        // 转换 API 返回的 _count.devices 为 deviceCount
        setSpaces(transformRoomsToSpaces(spacesData.rooms));
      }
    } catch (err) {
      console.error("Failed to query devices:", err);
    }
  };

  const handleDeviceUpdate = (device: InSonaDevice) => {
    setDevices((prev) => {
      const idx = prev.findIndex((d) => d.did === device.did);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...device };
        return updated;
      }
      return [...prev, device];
    });
  };

  const controlDevice = async (
    did: string,
    action: string,
    value: number[],
    meshid: string,
    transition = 1000
  ) => {
    try {
      await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ did, action, value, meshid, transition }),
      });
    } catch (err) {
      console.error("Control failed:", err);
    }
  };

  const openDeviceDrawer = (device: InSonaDevice) => {
    setSelectedDevice(device);
    setDrawerOpen(true);
  };

  const connectGateway = async () => {
    if (!gatewayIP) return;
    setGatewayStatus("connecting");
    try {
      const res = await fetch("/api/gateway/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: gatewayIP }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        setGatewayStatus("disconnected");
      } else if (data.status === "connected") {
        setGatewayStatus("connected");
      }
    } catch (err) {
      console.error("Connection failed:", err);
      setGatewayStatus("disconnected");
    }
  };

  const disconnectGateway = async () => {
    await fetch("/api/gateway/disconnect", { method: "POST" });
    setGatewayStatus("disconnected");
    setDevices([]);
  };

  // 统计数据
  // 递归统计所有空间数量
  const countAllSpaces = (nodes: SpaceNode[]): number => {
    return nodes.reduce((sum, node) => {
      return sum + 1 + (node.children ? countAllSpaces(node.children) : 0);
    }, 0);
  };

  // 只统计房间数量（排除建筑和楼层）
  const countRooms = (nodes: SpaceNode[]): number => {
    return nodes.reduce((sum, node) => {
      if (node.type === "room") {
        return sum + 1;
      }
      return sum + (node.children ? countRooms(node.children) : 0);
    }, 0);
  };

  const stats = {
    totalDevices: dbDevices.length,
    onlineDevices: dbDevices.filter((d) => d.alive === 1).length,
    offlineDevices: dbDevices.filter((d) => d.alive === 0).length,
    totalRooms: countRooms(spaces),
  };

  const getDeviceRoomName = (roomId: string) => {
    if (!roomId) return "未绑定";
    // 递归查找空间名称
    const findSpaceName = (items: SpaceNode[], id: string): string | null => {
      for (const item of items) {
        if (item.id === id) return item.name;
        if (item.children) {
          const found = findSpaceName(item.children, id);
          if (found) return found;
        }
      }
      return null;
    };
    const name = findSpaceName(spaces, roomId);
    return name || `空间${roomId}`;
  };

  return (
    <div className="min-h-screen bg-[#0f1419] text-[#e1e8ed]">
      {/* 侧边栏 */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        gatewayStatus={gatewayStatus}
      />

      {/* 主内容 */}
      <main
        className={`transition-all duration-300 ${
          sidebarCollapsed ? "ml-[70px]" : "ml-[260px]"
        }`}
      >
        {/* 顶部导航 */}
        <Header
          currentPage={currentPage}
          gatewayStatus={gatewayStatus}
          gatewayIP={gatewayIP}
          onGatewayIPChange={setGatewayIP}
          onConnect={connectGateway}
          onDisconnect={disconnectGateway}
          currentLang={currentLang}
          onLangChange={setCurrentLang}
        />

        {/* 页面内容 - 系统首页使用独立页面 */}
        <div className="p-4">
          {currentPage === "dashboard" && (
            <HomeLayout
              gatewayStatus={gatewayStatus}
              gatewayIP={gatewayIP}
              onConnect={connectGateway}
              onDisconnect={disconnectGateway}
              currentLang={currentLang}
              onLangChange={setCurrentLang}
            />
          )}
          {currentPage === "devices" && (
            <DevicesPage
              devices={dbDevices.map(toInSonaDevice)}
              rooms={dbDevices}
              spaces={spaces}
              gatewayIP={gatewayIP}
              gatewayStatus={gatewayStatus}
              onDeviceClick={openDeviceDrawer}
              onControl={controlDevice}
              onSync={queryDevices}
            />
          )}
          {currentPage === "groups" && (
            <GroupsPage />
          )}
          {currentPage === "rooms" && (
            <RoomsPage
              spaces={spaces}
              devices={dbDevices}
              onRefresh={() => queryDevices()}
            />
          )}
          {currentPage === "scenes" && (
            <ScenesPage onActivateScene={async (sceneId, meshid) => {
              // 调用场景激活 API
              await fetch("/api/scenes/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sceneId, meshid }),
              });
            }} devices={devices} spaces={spaces} />
          )}
          {currentPage === "automation" && (
            <AutomationPage devices={dbDevices} />
          )}
          {currentPage === "energy" && (
            <EnergyPage dbDevices={dbDevices} spaces={spaces} />
          )}
          {currentPage === "settings" && (
            <SettingsPage />
          )}
        </div>
      </main>

      {/* 设备控制抽屉 */}
      <DeviceDrawer
        device={selectedDevice}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onControl={controlDevice}
        roomName={selectedDevice ? getDeviceRoomName(selectedDevice.roomId) : ""}
      />
    </div>
  );
}

// ==================== 侧边栏组件 ====================
function Sidebar({
  collapsed,
  onToggle,
  currentPage,
  onNavigate,
  gatewayStatus,
}: {
  collapsed: boolean;
  onToggle: () => void;
  currentPage: string;
  onNavigate: (page: string) => void;
  gatewayStatus: string;
}) {
  const [version, setVersion] = useState("3.0");

  useEffect(() => {
    fetch("/api/system/version")
      .then((r) => r.json())
      .then((v) => setVersion(v.version ?? "3.0"))
      .catch(() => {});
  }, []);
  const navItems = [
    { id: "dashboard", label: "系统首页", icon: "fa-home" },
    { id: "devices", label: "设备管理", icon: "fa-lightbulb" },
    { id: "groups", label: "组设备", icon: "fa-object-group" },
    { id: "rooms", label: "空间管理", icon: "fa-layer-group" },
    { id: "automation", label: "自动化", icon: "fa-clock" },
    { id: "scenes", label: "场景管理", icon: "fa-magic" },
    { id: "energy", label: "能耗分析", icon: "fa-chart-line" },
    { id: "settings", label: "系统设置", icon: "fa-cog" },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-gradient-to-b from-[#1a1f2e] to-[#151a28] transition-all duration-300 z-50 flex flex-col border-r border-white/5 ${
        collapsed ? "w-[70px]" : "w-[260px]"
      }`}
      style={{ boxShadow: "4px 0 20px rgba(0,0,0,0.5)" }}
    >
      {/* 头部 */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-lightbulb text-white text-xl" />
            </div>
            {!collapsed && (
              <div>
                <h1 className="text-lg font-bold text-white">inSona商照平台</h1>
                <p className="text-xs text-gray-400">Pro v{version}</p>
              </div>
            )}
          </div>
          <button onClick={onToggle} className="text-gray-400 hover:text-white transition-colors">
            <i className={`fas ${collapsed ? "fa-bars" : "fa-times"} text-xl`} />
          </button>
        </div>
      </div>

      {/* 网关状态指示 */}
      <div className={`px-4 py-3 border-b border-white/5 ${collapsed ? "text-center" : ""}`}>
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <span className={`status-indicator ${gatewayStatus === "connected" ? "status-online" : gatewayStatus === "connecting" ? "status-warning" : "status-offline"}`} />
            <span className="text-xs text-gray-400">
              {gatewayStatus === "connected" ? "网关已连接" : gatewayStatus === "connecting" ? "连接中..." : "网关未连接"}
            </span>
          </div>
        ) : (
          <span className={`status-indicator mx-auto ${gatewayStatus === "connected" ? "status-online" : gatewayStatus === "connecting" ? "status-warning" : "status-offline"}`} />
        )}
      </div>

      {/* 导航 */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`nav-item w-full ${currentPage === item.id ? "active" : ""}`}
          >
            <i className={`fas ${item.icon}`} />
            {!collapsed && <span className="ml-3">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* 底部 */}
      <div className="p-6 border-t border-white/5">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <i className="fas fa-user text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">管理员</p>
              <p className="text-xs text-gray-400">admin@insona.com</p>
            </div>
          </div>
        ) : (
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
            <i className="fas fa-user text-white" />
          </div>
        )}
      </div>
    </aside>
  );
}

// ==================== 顶部导航组件 ====================
function Header({
  currentPage,
  gatewayStatus,
  gatewayIP,
  onGatewayIPChange,
  onConnect,
  onDisconnect,
  currentLang,
  onLangChange,
}: {
  currentPage: string;
  gatewayStatus: string;
  gatewayIP: string;
  onGatewayIPChange: (ip: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  currentLang: string;
  onLangChange: (lang: string) => void;
}) {
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const pageTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: "系统首页", subtitle: "实时监控与数据概览" },
    devices: { title: "设备管理", subtitle: "设备列表与控制" },
    groups: { title: "组设备", subtitle: "设备组列表与控制" },
    rooms: { title: "空间管理", subtitle: "房间与区域管理" },
    automation: { title: "自动化", subtitle: "定时任务管理" },
    scenes: { title: "场景管理", subtitle: "场景配置与执行" },
    energy: { title: "能耗分析", subtitle: "能耗数据与统计" },
    settings: { title: "系统设置", subtitle: "网关连接与配置" },
  };

  const pageInfo = pageTitles[currentPage] || pageTitles.dashboard;

  const languages = [
    { code: "zh-CN", name: "简体中文" },
    { code: "en-US", name: "English" },
    { code: "ja-JP", name: "日本語" },
  ];

  return (
    <header className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 sticky top-0 z-40">
      <div className="px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm">
              <span className="text-gray-400">项目中心</span>
              <span className="text-gray-600">/</span>
              <span className="text-blue-400">{pageInfo.title}</span>
            </div>
            <h2 className="text-2xl font-bold text-white">{pageInfo.title}</h2>
            <p className="text-sm text-gray-400 mt-1">{pageInfo.subtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* 网关快速连接 */}
            {gatewayStatus !== "connected" && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={gatewayIP}
                  onChange={(e) => onGatewayIPChange(e.target.value)}
                  placeholder="网关IP"
                  className="input-field w-36 text-sm"
                />
                <button
                  onClick={onConnect}
                  disabled={gatewayStatus === "connecting" || !gatewayIP}
                  className="btn btn-primary text-sm"
                >
                  {gatewayStatus === "connecting" ? "连接中..." : "连接"}
                </button>
              </div>
            )}
            {gatewayStatus === "connected" && (
              <button onClick={onDisconnect} className="btn btn-secondary text-sm">
                <i className="fas fa-plug" />
                <span>断开</span>
              </button>
            )}

            <button className="btn btn-secondary relative">
              <i className="fas fa-bell" />
              <span className="badge badge-error absolute -top-1 -right-1 text-xs">3</span>
            </button>

            {/* 语言切换 */}
            <div className="lang-dropdown">
              <button
                id="langToggle"
                className="btn btn-primary flex items-center gap-2"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
              >
                <i className="fas fa-globe" />
                <span>{languages.find((l) => l.code === currentLang)?.name || "简体中文"}</span>
                <i className="fas fa-chevron-down text-xs" />
              </button>
              {langMenuOpen && (
                <div className="lang-menu active">
                  {languages.map((lang) => (
                    <div
                      key={lang.code}
                      className={`lang-menu-item ${currentLang === lang.code ? "active" : ""}`}
                      onClick={() => {
                        onLangChange(lang.code);
                        setLangMenuOpen(false);
                      }}
                    >
                      <i className={`fas ${currentLang === lang.code ? "fa-check" : "fa-circle"}`} style={{ fontSize: "8px", opacity: currentLang === lang.code ? 1 : 0 }} />
                      <span>{lang.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

// ==================== 仪表盘页面 ====================
function DashboardPage({
  stats,
  devices,
  spaces,
  onDeviceClick,
}: {
  stats: { totalDevices: number; onlineDevices: number; offlineDevices: number; totalRooms: number };
  devices: InSonaDevice[];
  spaces: SpaceNode[];
  onDeviceClick: (device: InSonaDevice) => void;
}) {
  const [energyPeriod, setEnergyPeriod] = useState(7);
  const [realEnergyData, setRealEnergyData] = useState<EnergyData[]>([]);

  // 获取真实能耗数据
  useEffect(() => {
    const fetchEnergyData = async () => {
      const to = new Date().toISOString().split("T")[0];
      const from = new Date(Date.now() - energyPeriod * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      try {
        const res = await fetch(`/api/energy?from=${from}&to=${to}`);
        const data = await res.json();
        if (data.dailyTotals) {
          const chartData: EnergyData[] = data.dailyTotals.map((item: { date: string; _sum: { kwh: number | null } }) => ({
            date: `${new Date(item.date).getMonth() + 1}/${new Date(item.date).getDate()}`,
            value: Math.round((item._sum.kwh ?? 0) * 1000), // 转换为 Wh
          }));
          setRealEnergyData(chartData);
        }
      } catch (err) {
        console.error("获取能耗数据失败:", err);
      }
    };
    fetchEnergyData();
  }, [energyPeriod]);

  // 将空间树扁平化为房间列表
  const flattenRooms = (nodes: SpaceNode[]): SpaceNode[] => {
    const result: SpaceNode[] = [];
    const flatten = (nodeList: SpaceNode[]) => {
      for (const node of nodeList) {
        if (node.type === "room") {
          result.push(node);
        }
        if (node.children) {
          flatten(node.children);
        }
      }
    };
    flatten(nodes);
    return result;
  };

  const roomList = flattenRooms(spaces);

  // 使用真实能耗数据（如果没有数据则显示空）
  const energyData = realEnergyData.length > 0 ? realEnergyData : [];

  // 在线率计算
  const onlineRate = stats.totalDevices > 0 ? ((stats.onlineDevices / stats.totalDevices) * 100).toFixed(1) : "0";

  return (
    <div className="fade-in">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-blue-200 mb-1">总设备数</p>
              <h3 className="text-3xl font-bold text-white">{stats.totalDevices}</h3>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="fas fa-lightbulb text-white text-xl" />
            </div>
          </div>
        </div>

        <div className="stat-card" style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-green-200 mb-1">在线设备</p>
              <h3 className="text-3xl font-bold text-white">{stats.onlineDevices}</h3>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="fas fa-check-circle text-white text-xl" />
            </div>
          </div>
          <div className="flex items-center text-sm">
            <span className="text-green-200">在线率: {onlineRate}%</span>
          </div>
        </div>

        <div className="stat-card" style={{ background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-red-200 mb-1">离线设备</p>
              <h3 className="text-3xl font-bold text-white">{stats.offlineDevices}</h3>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="fas fa-exclamation-triangle text-white text-xl" />
            </div>
          </div>
        </div>

        <div className="stat-card" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-purple-200 mb-1">房间数量</p>
              <h3 className="text-3xl font-bold text-white">{stats.totalRooms}</h3>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="fas fa-building text-white text-xl" />
            </div>
          </div>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white">能耗趋势</h3>
            <select
              className="input-field"
              style={{ width: "auto" }}
              value={energyPeriod}
              onChange={(e) => setEnergyPeriod(Number(e.target.value))}
            >
              <option value={7}>近7天</option>
              <option value={30}>近30天</option>
              <option value={90}>近90天</option>
            </select>
          </div>
          <EnergyChart data={energyData} />
        </div>

        <div className="card">
          <h3 className="text-lg font-bold text-white mb-6">设备状态分布</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">在线</span>
                <span className="text-sm font-medium text-white">{onlineRate}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${onlineRate}%`, background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">离线</span>
                <span className="text-sm font-medium text-white">
                  {stats.totalDevices > 0 ? ((stats.offlineDevices / stats.totalDevices) * 100).toFixed(1) : "0"}%
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${stats.totalDevices > 0 ? ((stats.offlineDevices / stats.totalDevices) * 100).toFixed(1) : "0"}%`,
                    background: "linear-gradient(90deg, #64748b 0%, #475569 100%)",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <p className="text-sm text-blue-300 mb-2">
              <i className="fas fa-info-circle mr-2" />
              系统提示
            </p>
            <p className="text-xs text-gray-400">
              {stats.offlineDevices > 0 ? "建议对离线设备进行检修，确保系统稳定运行" : "所有设备运行正常"}
            </p>
          </div>
        </div>
      </div>

      {/* 设备列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-bold text-white mb-6">在线设备</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {devices.filter((d) => d.alive === 1).slice(0, 5).map((device) => (
              <div
                key={device.did}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all cursor-pointer"
                onClick={() => onDeviceClick(device)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <i className="fas fa-lightbulb text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{device.name}</p>
                    <p className="text-xs text-gray-400">{DEVICE_TYPE_LABELS[device.type] || `设备类型${device.type}`}</p>
                  </div>
                </div>
                <span className="badge badge-success">在线</span>
              </div>
            ))}
            {devices.filter((d) => d.alive === 1).length === 0 && (
              <p className="text-center text-gray-400 py-8">暂无在线设备</p>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-bold text-white mb-6">房间列表</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {roomList.slice(0, 5).map((room) => {
              const roomDevices = devices.filter((d) => d.roomId === room.id);
              const onlineCount = roomDevices.filter((d) => d.alive === 1).length;
              return (
                <div
                  key={room.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <i className="fas fa-door-open text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{room.name}</p>
                      <p className="text-xs text-gray-400">{room.deviceCount ?? 0} 个设备</p>
                    </div>
                  </div>
                  <span className="badge badge-info">{room.onlineDeviceCount ?? 0} 在线</span>
                </div>
              );
            })}
            {roomList.length === 0 && (
              <p className="text-center text-gray-400 py-8">暂无房间数据</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 能耗图表组件 ====================
function EnergyChart({ data }: { data: EnergyData[] }) {
  const maxValue = Math.max(...data.map((d) => d.value));
  const minValue = Math.min(...data.map((d) => d.value));
  const range = maxValue - minValue || 1;

  return (
    <div className="h-64 flex items-end justify-between gap-2 px-2">
      {data.map((item, index) => {
        const height = 40 + ((item.value - minValue) / range) * 160;
        const carbonEmission = item.carbonEmission ?? 0;
        return (
          <div key={index} className="flex-1 flex flex-col items-center gap-2">
            <div
              className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all duration-300 hover:from-blue-500 hover:to-blue-300"
              style={{ height: `${height}px`, minHeight: "20px" }}
              title={`${item.date}: ${item.value.toFixed(3)} kWh\n碳排放: ${carbonEmission.toFixed(3)} kgCO₂e`}
            />
            <span className="text-xs text-gray-500">{item.date}</span>
          </div>
        );
      })}
    </div>
  );
}

// 柱状图组件
function EnergyBarChart({ data }: { data: { name: string; value: number }[] }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  const colors = [
    "from-blue-600 to-blue-400",
    "from-green-600 to-green-400",
    "from-yellow-600 to-yellow-400",
    "from-red-600 to-red-400",
    "from-purple-600 to-purple-400",
    "from-pink-600 to-pink-400",
    "from-indigo-600 to-indigo-400",
    "from-teal-600 to-teal-400",
  ];

  return (
    <div className="space-y-3">
      {data.slice(0, 8).map((item, index) => {
        const height = (item.value / maxValue) * 120;
        return (
          <div key={item.name} className="flex items-center gap-3">
            <span className="text-sm text-gray-300 w-20 truncate" title={item.name}>{item.name}</span>
            <div className="flex-1 h-6 bg-gray-700/30 rounded overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${colors[index % colors.length]} rounded transition-all duration-300`}
                style={{ width: `${(item.value / maxValue) * 100}%`, minWidth: "2px" }}
                title={`${item.value.toFixed(2)} kWh`}
              />
            </div>
            <span className="text-sm text-gray-400 w-24 text-right">{item.value.toFixed(2)} kWh</span>
          </div>
        );
      })}
    </div>
  );
}

// ==================== 设备管理页面 ====================
function DevicesPage({
  devices,
  rooms,
  spaces,
  gatewayIP,
  gatewayStatus,
  onDeviceClick,
  onControl,
  onSync,
}: {
  devices: InSonaDevice[];
  rooms: DbDevice[];
  spaces: SpaceNode[];
  gatewayIP: string;
  gatewayStatus: "connected" | "disconnected" | "connecting";
  onDeviceClick: (device: InSonaDevice) => void;
  onControl: (did: string, action: string, value: number[], meshid: string, transition?: number) => Promise<void>;
  onSync: () => void;
}) {
  const [filter, setFilter] = useState({ status: "", search: "", meshId: "", roomId: "" });
  const [activeTab, setActiveTab] = useState<"lights" | "panels" | "sensors" | "other">("lights");
  const [editingDevice, setEditingDevice] = useState<InSonaDevice | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);

  // 扁平化空间列表
  const flattenSpaces = (list: SpaceNode[], result: { id: string; name: string }[] = []): { id: string; name: string }[] => {
    list.forEach((s) => {
      result.push({ id: s.id, name: s.name });
      if (s.children && s.children.length > 0) flattenSpaces(s.children, result);
    });
    return result;
  };

  const flatSpaces = flattenSpaces(spaces);

  // 获取设备绑定的空间名称
  const getSpaceName = (device: InSonaDevice) => {
    const dbDevice = rooms.find((d) => d.id === device.did);
    if (dbDevice?.roomId) {
      const space = flatSpaces.find((s) => s.id === dbDevice.roomId);
      return space?.name || `空间${dbDevice.roomId}`;
    }
    return "未绑定";
  };

  // 获取唯一的 meshId 列表
  const meshIds = [...new Set(devices.map((d) => d.meshid).filter(Boolean))];

  const filteredDevices = devices.filter((device) => {
    // 排除组设备（统一显示到组设备管理模块）
    // device.did 可能是 "1906146853:C1" 或 "ECC57F10D4CF00" 格式
    // 需要解析出原始 DID 进行判断
    const { did: originalDid } = parseStoredDeviceId(device.did);
    if (isGroupDevice(originalDid)) return false;

    // 按标签页筛选类型
    if (activeTab === "lights" && device.type !== 1984 && device.type !== 0) return false;
    if (activeTab === "panels" && device.type !== 1218) return false;
    if (activeTab === "sensors" && device.type !== 1344) return false;
    if (activeTab === "other" && (device.type === 1984 || device.type === 0 || device.type === 1218 || device.type === 1344)) return false;
    // 按位置筛选
    if (filter.roomId) {
      const dbDevice = rooms.find(d => d.id === device.did);
      if (dbDevice?.roomId !== filter.roomId) return false;
    }
    // 按状态筛选
    if (filter.status === "online" && device.alive !== 1) return false;
    if (filter.status === "offline" && device.alive !== 0) return false;
    // 按 Mesh 筛选
    if (filter.meshId && device.meshid !== filter.meshId) return false;
    // 按名称/ID 搜索
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const deviceName = device.name || "";
      if (!deviceName.toLowerCase().includes(searchLower) && !device.did.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    return true;
  });

  // 删除设备
  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm("确认删除该设备？删除后无法恢复。")) return;
    try {
      const res = await fetch(`/api/devices/${deviceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      onSync();
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  };

  // 快捷控制
  const quickToggle = async (device: InSonaDevice) => {
    const isOn = device.value?.[0] === 1;
    await onControl(device.did, "onoff", [isOn ? 0 : 1], device.meshid, 1000);
  };

  // 同步设备
  const handleSync = async () => {
    setSyncing(true);
    try {
      // 如果网关未连接，先连接
      if (gatewayStatus !== "connected" && gatewayIP) {
        const connectRes = await fetch("/api/gateway/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: gatewayIP }),
        });
        const connectData = await connectRes.json();
        if (connectData.error) {
          alert(`连接网关失败: ${connectData.error}`);
          return;
        }
      }

      // 同步设备
      const syncRes = await fetch("/api/devices", { method: "POST" });
      const syncData = await syncRes.json();
      if (syncData.error) {
        alert(`同步失败: ${syncData.error}`);
        return;
      }

      // 刷新数据
      onSync();
    } catch (err) {
      alert(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  // 保存设备属性
  const handleSaveDevice = async (data: { name: string; roomId: string }) => {
    if (!editingDevice) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: data.name };
      // 只有当 roomId 有值时才发送,否则发送 null 来解绑
      if (data.roomId) {
        body.roomId = data.roomId;
      } else {
        body.roomId = null;
      }
      const res = await fetch(`/api/devices/${editingDevice.did}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("保存失败");
      setEditingDevice(null);
      // 刷新数据
      onSync();
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 导入数据
  const handleImportData = async () => {
    if (!confirm("确认导入 insona-devices.json 的数据到数据库？\n这将创建/更新房间和设备信息。")) return;
    setImporting(true);
    try {
      const res = await fetch("/api/import-data", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(`导入失败: ${data.error || data.details}`);
        return;
      }
      alert(`导入成功！\n房间总数: ${data.summary.totalRooms}\n设备总数: ${data.summary.totalDevices}\n在线设备: ${data.summary.onlineDevices}\n离线设备: ${data.summary.offlineDevices}`);
      // 刷新数据
      onSync();
    } catch (err) {
      alert(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="card">
        {/* 筛选工具栏 - 按 index.html 设计 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-700">
          <div className="flex gap-3 flex-1">
            {/* 位置空间筛选 */}
            <select
              className="input-field"
              style={{ width: "200px" }}
              value={filter.roomId}
              onChange={(e) => setFilter({ ...filter, roomId: e.target.value })}
            >
              <option value="">全部位置</option>
              {flatSpaces.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* 设备状态筛选 */}
            <select
              className="input-field"
              style={{ width: "150px" }}
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            >
              <option value="">全部状态</option>
              <option value="online">在线</option>
              <option value="offline">离线</option>
            </select>

            {/* Mesh 筛选 */}
            {meshIds.length > 0 && (
              <select
                className="input-field"
                style={{ width: "150px" }}
                value={filter.meshId}
                onChange={(e) => setFilter({ ...filter, meshId: e.target.value })}
              >
                <option value="">全部 Mesh</option>
                {meshIds.map((meshId) => (
                  <option key={meshId} value={meshId}>Mesh {meshId}</option>
                ))}
              </select>
            )}

            {/* 名称搜索 */}
            <div className="relative flex-1" style={{ maxWidth: "300px" }}>
              <input
                type="text"
                placeholder="搜索设备名称或ID..."
                className="input-field pr-10 w-full"
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
              />
              <i className="fas fa-search absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            </div>

            {/* 清除筛选 */}
            <button
              onClick={() => setFilter({ status: "", search: "", meshId: "", roomId: "" })}
              className="btn btn-secondary"
            >
              <i className="fas fa-times"></i>
              <span>清除筛选</span>
            </button>
          </div>

          {/* 右侧按钮 */}
          <div className="flex gap-2 ml-4">
            <button
              onClick={handleImportData}
              disabled={importing}
              className="btn btn-secondary"
              title="从 insona-devices.json 导入数据"
            >
              <i className={`fas fa-file-import ${importing ? "animate-pulse" : ""}`}></i>
              <span>{importing ? "导入中..." : "导入数据"}</span>
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn btn-primary"
            >
              <i className={`fas fa-sync-alt ${syncing ? "animate-spin" : ""}`}></i>
              <span>{syncing ? "同步中..." : "同步设备"}</span>
            </button>
          </div>
        </div>

        {/* 标签页切换 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            {[
              { id: "lights", label: "灯光设备", icon: "fa-lightbulb" },
              { id: "panels", label: "控制面板", icon: "fa-tablet-alt" },
              { id: "sensors", label: "传感器", icon: "fa-broadcast-tower" },
              { id: "other", label: "其他设备", icon: "fa-cog" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
              >
                <i className={`fas ${tab.icon} mr-2`}></i>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="text-sm text-gray-400">
            共 <span className="text-blue-400 font-medium">{filteredDevices.length}</span> 个设备
          </div>
        </div>

        {/* 设备表格 */}
        <table className="data-table">
          <thead>
            <tr>
              <th>设备ID</th>
              <th>设备名称</th>
              <th>位置</th>
              <th>Groups</th>
              <th>状态</th>
              <th>Mesh</th>
              <th>今日能耗</th>
              <th>功率</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.length > 0 ? (
              filteredDevices.map((device) => {
                const dbDevice = rooms.find(d => d.id === device.did);
                return (
                  <tr key={device.did}>
                    <td><code className="text-blue-400">{device.did}</code></td>
                    <td className="font-medium text-white">{device.name || dbDevice?.gatewayName || "-"}</td>
                  <td className="text-gray-400">
                    <i className="fas fa-map-marker-alt mr-1 text-blue-400"></i>
                    {getSpaceName(device)}
                  </td>
                  <td className="text-gray-400 text-sm">
                    {device.groups && device.groups.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {device.groups.map((groupId, idx) => {
                          // 查找对应的房间名称
                          const room = rooms.find(r => r.roomId === String(groupId));
                          const roomName = room?.gatewayName || `组${groupId}`;
                          return (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-900/30 text-blue-300 border border-blue-700/30"
                            >
                              {groupId}
                              {roomName && <span className="ml-1 text-gray-400">({roomName})</span>}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-indicator ${device.alive === 1 ? "status-online" : "status-offline"}`} />
                    <span className={`badge ${device.alive === 1 ? "badge-success" : "badge-error"}`}>
                      {device.alive === 1 ? "在线" : "离线"}
                    </span>
                  </td>
                  <td className="text-gray-400 text-sm">{device.meshid || "-"}</td>
                  <td className="text-yellow-400 text-sm">
                    {device.todayKwh ? `${device.todayKwh.toFixed(3)} kWh` : "-"}
                  </td>
                  <td className="text-orange-400 text-sm">
                    {device.power ? `${device.power} W` : "-"}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onDeviceClick(device)}
                        className="btn btn-secondary text-sm px-3 py-1"
                        title="控制"
                      >
                        <i className="fas fa-sliders-h"></i>
                      </button>
                      <button
                        onClick={() => setEditingDevice(device)}
                        className="btn btn-secondary text-sm px-3 py-1"
                        title="编辑属性"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        onClick={() => handleDeleteDevice(device.did)}
                        className="btn btn-secondary text-sm px-3 py-1 text-red-400 hover:text-red-300"
                        title="删除设备"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9} className="text-center text-gray-400 py-8">
                  未找到符合条件的设备
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 编辑设备属性弹窗 */}
      {editingDevice && (
        <EditDeviceModal
          device={editingDevice}
          rooms={rooms}
          spaces={flatSpaces}
          onClose={() => setEditingDevice(null)}
          onSave={handleSaveDevice}
          saving={saving}
        />
      )}
    </div>
  );
}

// ==================== 编辑设备属性弹窗 ====================
function EditDeviceModal({
  device,
  rooms,
  spaces,
  onClose,
  onSave,
  saving,
}: {
  device: InSonaDevice;
  rooms: DbDevice[];
  spaces: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: { name: string; roomId: string }) => void;
  saving: boolean;
}) {
  const dbDevice = rooms.find((d) => d.id === device.did);
  const [name, setName] = useState(device.name || dbDevice?.gatewayName || "");
  const [roomId, setRoomId] = useState(dbDevice?.roomId || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, roomId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[480px] bg-[#0d1520] rounded-lg border border-[#1c2630] p-6">
        <h3 className="text-lg font-medium text-white mb-6">编辑设备属性</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 设备名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">设备名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="请输入设备名称"
            />
          </div>

          {/* 设备位置 */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">设备位置</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              <option value="">未绑定</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Groups 信息展示 */}
          {device.groups && device.groups.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">设备所属组 (Groups)</label>
              <div className="bg-[#101922] border border-[#1c2630] rounded-md px-3 py-2">
                <div className="flex gap-2 flex-wrap">
                  {device.groups.map((groupId, idx) => {
                    // 查找对应的房间名称
                    const room = rooms.find(r => r.roomId === String(groupId));
                    const roomName = room?.gatewayName || `组${groupId}`;
                    return (
                      <span
                        key={idx}
                        className="inline-flex items-center px-3 py-1 rounded text-sm bg-blue-900/30 text-blue-300 border border-blue-700/30"
                      >
                        <span className="font-medium">{groupId}</span>
                        <span className="mx-1 text-gray-500">-</span>
                        <span className="text-gray-400">{roomName}</span>
                      </span>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  * Groups 值对应房间 ID,表示设备所属的空间组
                </p>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-[#1c2630] text-gray-300 rounded-md hover:bg-[#253040] transition-colors whitespace-nowrap"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================== 房间/空间管理页面 ====================
function RoomsPage({
  spaces,
  devices,
  onRefresh,
}: {
  spaces: SpaceNode[];
  devices: DbDevice[];
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"hierarchy" | "devices" | "transfer" | "batch">("hierarchy");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedSpace, setSelectedSpace] = useState<SpaceNode | null>(null);
  const [editingSpace, setEditingSpace] = useState<SpaceNode | null>(null);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [sourceSpaceId, setSourceSpaceId] = useState("");
  const [targetSpaceId, setTargetSpaceId] = useState("");
  const [filterMeshId, setFilterMeshId] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(false);
  // 批量操作
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchTargetId, setBatchTargetId] = useState("");

  // 展开/收起节点
  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // 展开所有
  const expandAll = () => {
    const allIds = new Set<string>();
    const collectIds = (nodes: SpaceNode[]) => {
      nodes.forEach((node) => {
        if (node.children && node.children.length > 0) {
          allIds.add(node.id);
          collectIds(node.children);
        }
      });
    };
    collectIds(spaces);
    setExpandedNodes(allIds);
  };

  // 获取空间图标
  const getSpaceIcon = (type: string) => {
    switch (type) {
      case "building":
        return "fa-building";
      case "floor":
        return "fa-layer-group";
      default:
        return "fa-door-open";
    }
  };

  // 获取空间类型名称
  const getSpaceTypeName = (type: string) => {
    switch (type) {
      case "building":
        return "建筑";
      case "floor":
        return "楼层";
      default:
        return "房间";
    }
  };

  // 获取空间路径
  const getSpacePath = (space: SpaceNode): string => {
    // 简化版本，递归查找父级
    const findParent = (nodes: SpaceNode[], id: string, path: string[]): string[] | null => {
      for (const node of nodes) {
        if (node.id === id) {
          return [...path, node.name];
        }
        if (node.children) {
          const result = findParent(node.children, id, [...path, node.name]);
          if (result) return result;
        }
      }
      return null;
    };
    const path = findParent(spaces, space.id, []);
    return path ? path.join(" - ") : space.name;
  };

  // 获取空间下的设备
  const getSpaceDevices = (space: SpaceNode): DbDevice[] => {
    let result: DbDevice[] = [];

    // 直接绑定到此空间的设备
    const directDevices = devices.filter((d) => d.roomId === space.id);
    result = [...directDevices];

    // 子空间的设备
    if (space.children) {
      space.children.forEach((child) => {
        result = [...result, ...getSpaceDevices(child)];
      });
    }

    return result;
  };

  // 渲染树形节点
  const renderTreeNode = (node: SpaceNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const indent = level * 16;

    return (
      <div key={node.id} className="space-tree-node">
        <div
          className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-all ${
            selectedSpace?.id === node.id
              ? "bg-blue-500/20 border border-blue-500/30"
              : "hover:bg-white/10"
          }`}
          style={{ paddingLeft: `${indent + 8}px` }}
          onClick={() => {
            // 选中空间
            setSelectedSpace(node);
            // 如果有子节点，点击时切换展开/折叠
            if (hasChildren) {
              toggleNode(node.id);
            }
          }}
        >
          {hasChildren ? (
            <i
              className={`fas fa-chevron-right text-xs text-gray-400 transition-transform ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
          ) : (
            <span style={{ width: "12px" }} />
          )}
          <i className={`fas ${getSpaceIcon(node.type)} text-blue-400 text-sm`} />
          <span className="text-sm text-white flex-1 truncate">{node.name}</span>
          {node.deviceCount !== undefined && (
            <span className="text-xs text-gray-400">{node.deviceCount}设备</span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="tree-children">
            {node.children!.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // 新建空间
  const handleAddSpace = async (data: { name: string; type: string; parentId?: string }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowAddModal(false);
        onRefresh();
      }
    } finally {
      setLoading(false);
    }
  };

  // 编辑空间
  const handleEditSpace = async (data: { name: string; type: string; parentId?: string }) => {
    if (!editingSpace) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${editingSpace.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowEditModal(false);
        setEditingSpace(null);
        onRefresh();
      } else {
        const err = await res.json();
        alert(err.error || "编辑失败");
      }
    } finally {
      setLoading(false);
    }
  };

  // 批量移动空间
  const handleBatchMove = async () => {
    if (batchSelected.size === 0) return;
    if (!confirm(`确定将 ${batchSelected.size} 个空间移动到目标父级？`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/spaces/batch-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceIds: Array.from(batchSelected), targetParentId: batchTargetId }),
      });
      if (res.ok) {
        setBatchSelected(new Set());
        setBatchTargetId("");
        onRefresh();
      } else {
        const err = await res.json();
        alert(err.error || "批量移动失败");
      }
    } finally {
      setLoading(false);
    }
  };
  const handleDeleteSpace = async (spaceId: string) => {
    if (!confirm("确认删除该空间？")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${spaceId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setSelectedSpace(null);
        onRefresh();
      } else {
        alert(data.error || "删除失败");
      }
    } finally {
      setLoading(false);
    }
  };

  // 解绑设备
  const handleUnbindDevice = async (deviceId: string) => {
    setLoading(true);
    try {
      await fetch("/api/devices/bind", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceIds: [deviceId] }),
      });
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  // 绑定设备
  const handleBindDevices = async () => {
    if (selectedDevices.length === 0 || !targetSpaceId) return;
    setLoading(true);
    try {
      await fetch("/api/devices/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceIds: selectedDevices, roomId: targetSpaceId }),
      });
      setSelectedDevices([]);
      setTargetSpaceId("");
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  // 批量转移
  const handleTransfer = async () => {
    if (selectedDevices.length === 0 || !targetSpaceId) return;
    setLoading(true);
    try {
      await fetch("/api/devices/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceIds: selectedDevices, targetRoomId: targetSpaceId }),
      });
      setSelectedDevices([]);
      setSourceSpaceId("");
      setTargetSpaceId("");
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  // 收集所有空间（扁平列表）
  const flattenSpaces = (nodes: SpaceNode[], result: SpaceNode[] = []): SpaceNode[] => {
    nodes.forEach((node) => {
      result.push(node);
      if (node.children) {
        flattenSpaces(node.children, result);
      }
    });
    return result;
  };

  const allSpaces = flattenSpaces(spaces);
  const meshIds = [...new Set(devices
    .filter(d => d.meshId)
    .map(d => d.meshId as string))];
  const unboundDevices = devices.filter((d) => !d.roomId &&
    (!filterMeshId || d.meshId === filterMeshId));
  const sourceDevices = devices.filter((d) => d.roomId === sourceSpaceId);

  return (
    <div className="fade-in">
      <div className="card">
        {/* 标签页切换 */}
        <div className="flex items-center justify-between mb-6 border-b border-gray-700 pb-4">
          <div className="flex gap-2">
            <button
              className={`tab-button ${activeTab === "hierarchy" ? "active" : ""}`}
              onClick={() => setActiveTab("hierarchy")}
            >
              <i className="fas fa-sitemap mr-2"></i>层级结构
            </button>
            <button
              className={`tab-button ${activeTab === "devices" ? "active" : ""}`}
              onClick={() => setActiveTab("devices")}
            >
              <i className="fas fa-link mr-2"></i>设备绑定
            </button>
            <button
              className={`tab-button ${activeTab === "transfer" ? "active" : ""}`}
              onClick={() => setActiveTab("transfer")}
            >
              <i className="fas fa-exchange-alt mr-2"></i>批量转移
            </button>
            <button
              className={`tab-button ${activeTab === "batch" ? "active" : ""}`}
              onClick={() => setActiveTab("batch")}
            >
              <i className="fas fa-layer-group mr-2"></i>批量操作
            </button>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            <i className="fas fa-plus"></i>
            <span>新建空间</span>
          </button>
        </div>

        {/* 标签页内容 */}
        {activeTab === "hierarchy" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* 左侧：空间树 */}
            <div className="lg:col-span-1">
              <div className="p-4 bg-white/5 rounded-lg">
                <h4 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
                  <span>空间树</span>
                  <button
                    onClick={expandAll}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    <i className="fas fa-expand-alt"></i>
                  </button>
                </h4>
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {spaces.length > 0 ? (
                    spaces.map((space) => renderTreeNode(space))
                  ) : (
                    <p className="text-center text-gray-400 py-8">暂无空间，请创建空间</p>
                  )}
                </div>
              </div>
            </div>

            {/* 右侧：空间详情 */}
            <div className="lg:col-span-3">
              <div className="p-6 bg-white/5 rounded-lg">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-lg font-bold text-white">空间详情</h4>
                  {selectedSpace && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingSpace(selectedSpace); setShowEditModal(true); }}
                        className="btn btn-secondary text-sm"
                      >
                        <i className="fas fa-edit"></i>
                        <span>编辑</span>
                      </button>
                      <button
                        onClick={() => handleDeleteSpace(selectedSpace.id)}
                        className="btn btn-secondary text-sm text-red-400 hover:text-red-300"
                      >
                        <i className="fas fa-trash"></i>
                        <span>删除</span>
                      </button>
                    </div>
                  )}
                </div>

                {selectedSpace ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                          空间名称
                        </label>
                        <p className="text-white font-medium">{selectedSpace.name}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                          空间类型
                        </label>
                        <p className="text-white">{getSpaceTypeName(selectedSpace.type)}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                          所属空间
                        </label>
                        <p className="text-white">{getSpacePath(selectedSpace)}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                          绑定设备
                        </label>
                        <p className="text-blue-400 font-medium">
                          {selectedSpace.deviceCount || 0} 个设备
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-3">
                        设备列表
                      </label>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {getSpaceDevices(selectedSpace).length > 0 ? (
                          getSpaceDevices(selectedSpace).map((device) => (
                            <div
                              key={device.id}
                              className="flex items-center justify-between p-3 bg-black/20 rounded-lg hover:bg-black/30 transition-all"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-500/20 rounded flex items-center justify-center">
                                  <i
                                    className={`fas ${
                                      device.type === 1984
                                        ? "fa-lightbulb"
                                        : device.type === 1218
                                        ? "fa-tablet-alt"
                                        : "fa-broadcast-tower"
                                    } text-blue-400 text-sm`}
                                  />
                                </div>
                                <div>
                                  <p className="text-sm text-white font-medium">
                                    {device.name || device.gatewayName || device.id}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {DEVICE_TYPE_LABELS[device.type] || `类型${device.type}`} · ID:{" "}
                                    {device.id}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span
                                  className={`status-indicator ${
                                    device.alive === 1 ? "status-online" : "status-offline"
                                  }`}
                                />
                                <span
                                  className={`badge ${
                                    device.alive === 1 ? "badge-success" : "badge-error"
                                  }`}
                                >
                                  {device.alive === 1 ? "在线" : "离线"}
                                </span>
                                <button
                                  onClick={() => handleUnbindDevice(device.id)}
                                  className="text-gray-400 hover:text-red-400 transition-colors"
                                >
                                  <i className="fas fa-unlink"></i>
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-center text-gray-400 py-8">该空间暂无设备</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <i className="fas fa-hand-pointer text-gray-600 text-4xl mb-4"></i>
                    <p className="text-gray-400">请从左侧选择一个空间查看详情</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "devices" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧：未绑定设备 */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h4 className="text-lg font-bold text-white shrink-0">未绑定设备</h4>
                <span className="badge badge-info shrink-0">{unboundDevices.length}</span>
                {meshIds.length > 0 && (
                  <select
                    className="input-field text-sm py-1 ml-auto"
                    value={filterMeshId}
                    onChange={(e) => setFilterMeshId(e.target.value)}
                  >
                    <option value="">全部 Mesh</option>
                    {meshIds.map(meshId => (
                      <option key={meshId} value={meshId}>
                        Mesh {meshId} ({devices.filter(d => d.meshId === meshId && !d.roomId).length})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {/* 全选操作栏 */}
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unboundDevices.length > 0 && selectedDevices.length === unboundDevices.length}
                    onChange={() => {
                      if (selectedDevices.length === unboundDevices.length) {
                        setSelectedDevices([]);
                      } else {
                        setSelectedDevices(unboundDevices.map(d => d.id));
                      }
                    }}
                    className="form-checkbox"
                  />
                  <span className="text-sm text-gray-400">全选</span>
                </label>
                <span className="text-sm text-gray-500">
                  已选 {selectedDevices.length} 个
                </span>
              </div>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                {unboundDevices.length > 0 ? (
                  unboundDevices.map((device) => (
                    <div
                      key={device.id}
                      onClick={() => {
                        setSelectedDevices((prev) =>
                          prev.includes(device.id)
                            ? prev.filter((id) => id !== device.id)
                            : [...prev, device.id]
                        );
                      }}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                        selectedDevices.includes(device.id)
                          ? "bg-blue-500/20 border border-blue-500/30"
                          : "bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDevices.includes(device.id)}
                        onChange={() => {}}
                        className="form-checkbox"
                      />
                      <div className="w-8 h-8 bg-gray-600/30 rounded flex items-center justify-center">
                        <i
                          className={`fas ${
                            device.type === 1984
                              ? "fa-lightbulb"
                              : device.type === 1218
                              ? "fa-tablet-alt"
                              : "fa-broadcast-tower"
                          } text-gray-400 text-sm`}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-white font-medium">
                          {device.name || device.gatewayName || device.id}
                        </p>
                        <p className="text-xs text-gray-400">
                          {DEVICE_TYPE_LABELS[device.type] || `类型${device.type}`} · ID:{" "}
                          {device.id}
                        </p>
                      </div>
                      <i className="fas fa-arrow-right text-gray-400"></i>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-400 py-8">所有设备已绑定</p>
                )}
              </div>
            </div>

            {/* 右侧：绑定操作 */}
            <div>
              <div className="p-6 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <h4 className="text-lg font-bold text-white mb-6">
                  <i className="fas fa-link mr-2"></i>
                  设备绑定
                </h4>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      已选设备
                    </label>
                    <div className="min-h-[100px] p-3 bg-black/20 rounded-lg border border-dashed border-gray-600">
                      {selectedDevices.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedDevices.map((id) => {
                            const device = devices.find((d) => d.id === id);
                            return (
                              <span
                                key={id}
                                className="badge badge-info text-xs cursor-pointer"
                                onClick={() =>
                                  setSelectedDevices((prev) => prev.filter((i) => i !== id))
                                }
                              >
                                {device?.name || device?.gatewayName || id} ×
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 text-center py-4">
                          请从左侧选择设备
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      目标空间
                    </label>
                    <select
                      className="input-field"
                      value={targetSpaceId}
                      onChange={(e) => setTargetSpaceId(e.target.value)}
                    >
                      <option value="">选择空间</option>
                      {allSpaces.map((space) => (
                        <option key={space.id} value={space.id}>
                          {getSpacePath(space)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleBindDevices}
                    disabled={selectedDevices.length === 0 || !targetSpaceId || loading}
                    className="btn btn-primary w-full"
                  >
                    <i className="fas fa-check"></i>
                    <span>{loading ? "绑定中..." : "确认绑定"}</span>
                  </button>
                </div>

                <div className="mt-6 p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <p className="text-sm text-yellow-400 mb-2">
                    <i className="fas fa-info-circle mr-2"></i>
                    绑定说明
                  </p>
                  <ul className="text-xs text-gray-400 space-y-1 ml-6">
                    <li>• 支持单个或批量绑定设备</li>
                    <li>• 每个设备只能绑定到一个空间</li>
                    <li>• 绑定后可在层级结构中查看</li>
                    <li>• 可随时解绑或转移设备</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "transfer" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 源空间 */}
            <div>
              <h4 className="text-lg font-bold text-white mb-4">
                <i className="fas fa-sign-out-alt mr-2 text-red-400"></i>
                源空间
              </h4>
              <select
                className="input-field mb-4"
                value={sourceSpaceId}
                onChange={(e) => {
                  setSourceSpaceId(e.target.value);
                  setSelectedDevices([]);
                }}
              >
                <option value="">选择源空间</option>
                {allSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {getSpacePath(space)}
                  </option>
                ))}
              </select>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {sourceSpaceId ? (
                  sourceDevices.length > 0 ? (
                    sourceDevices.map((device) => (
                      <div
                        key={device.id}
                        onClick={() => {
                          setSelectedDevices((prev) =>
                            prev.includes(device.id)
                              ? prev.filter((id) => id !== device.id)
                              : [...prev, device.id]
                          );
                        }}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                          selectedDevices.includes(device.id)
                            ? "bg-blue-500/20 border border-blue-500/30"
                            : "bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDevices.includes(device.id)}
                          onChange={() => {}}
                        />
                        <div className="flex-1">
                          <p className="text-sm text-white font-medium">
                            {device.name || device.gatewayName || device.id}
                          </p>
                          <p className="text-xs text-gray-400">
                            {DEVICE_TYPE_LABELS[device.type] || `类型${device.type}`}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-gray-400 py-8">该空间暂无设备</p>
                  )
                ) : (
                  <p className="text-center text-gray-400 py-8">请先选择源空间</p>
                )}
              </div>
            </div>

            {/* 转移操作 */}
            <div className="flex flex-col items-center justify-center">
              <div className="p-6 bg-white/5 rounded-lg text-center">
                <div className="mb-6">
                  <i className="fas fa-exchange-alt text-blue-400 text-4xl"></i>
                </div>
                <p className="text-sm text-gray-400 mb-4">已选择</p>
                <p className="text-2xl font-bold text-white mb-6">{selectedDevices.length}</p>
                <button
                  onClick={handleTransfer}
                  disabled={selectedDevices.length === 0 || !targetSpaceId || loading}
                  className="btn btn-primary w-full"
                >
                  <i className="fas fa-arrow-right"></i>
                  <span>{loading ? "转移中..." : "开始转移"}</span>
                </button>
              </div>
            </div>

            {/* 目标空间 */}
            <div>
              <h4 className="text-lg font-bold text-white mb-4">
                <i className="fas fa-sign-in-alt mr-2 text-green-400"></i>
                目标空间
              </h4>
              <select
                className="input-field mb-4"
                value={targetSpaceId}
                onChange={(e) => setTargetSpaceId(e.target.value)}
              >
                <option value="">选择目标空间</option>
                {allSpaces
                  .filter((s) => s.id !== sourceSpaceId)
                  .map((space) => (
                    <option key={space.id} value={space.id}>
                      {getSpacePath(space)}
                    </option>
                  ))}
              </select>

              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                <p className="text-sm text-green-400 mb-2">
                  <i className="fas fa-info-circle mr-2"></i>
                  转移说明
                </p>
                <ul className="text-xs text-gray-400 space-y-1">
                  <li>✓ 支持批量选择设备</li>
                  <li>✓ 自动更新设备绑定关系</li>
                  <li>✓ 保留设备配置信息</li>
                  <li>✓ 支持跨层级转移</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === "batch" && (() => {
          // 构建父子映射
          const childMap = new Map<string, SpaceNode[]>();
          const rootSpaces: SpaceNode[] = [];
          for (const s of allSpaces) {
            if (!s.parentId) {
              rootSpaces.push(s);
            } else {
              const list = childMap.get(s.parentId) ?? [];
              list.push(s);
              childMap.set(s.parentId, list);
            }
          }
          // 递归渲染可勾选的树节点
          const renderBatchNode = (node: SpaceNode, level: number = 0) => (
            <div key={node.id}>
              <div
                onClick={() => {
                  setBatchSelected(prev => {
                    const next = new Set(prev);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  });
                }}
                style={{ paddingLeft: `${level * 20 + 8}px` }}
                className={`flex items-center gap-2 py-2 pr-2 rounded cursor-pointer transition-all ${
                  batchSelected.has(node.id)
                    ? "bg-blue-500/20 border border-blue-500/30"
                    : "hover:bg-white/10"
                }`}
              >
                <input
                  type="checkbox"
                  checked={batchSelected.has(node.id)}
                  onChange={() => {}}
                  className="form-checkbox"
                />
                <i className={`fas ${getSpaceIcon(node.type)} text-blue-400 text-sm`} />
                <span className="text-sm text-white flex-1 truncate">{node.name}</span>
                <span className="text-xs text-gray-500">{getSpaceTypeName(node.type)}</span>
              </div>
              {(childMap.get(node.id) ?? []).map(child => renderBatchNode(child, level + 1))}
            </div>
          );

          return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧：空间列表 */}
            <div>
              <h4 className="text-lg font-bold text-white mb-4">
                <i className="fas fa-check-square mr-2 text-blue-400"></i>
                选择要移动的空间
              </h4>
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSpaces.length > 0 && batchSelected.size === allSpaces.length}
                    onChange={() => {
                      if (batchSelected.size === allSpaces.length) {
                        setBatchSelected(new Set());
                      } else {
                        setBatchSelected(new Set(allSpaces.map(s => s.id)));
                      }
                    }}
                    className="form-checkbox"
                  />
                  <span className="text-sm text-gray-400">全选</span>
                </label>
                <span className="text-sm text-gray-500">
                  已选 {batchSelected.size} 个
                </span>
              </div>
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {allSpaces.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">暂无空间</p>
                ) : (
                  <>
                    {rootSpaces.map(space => renderBatchNode(space))}
                  </>
                )}
              </div>
            </div>

            {/* 右侧：移动目标 */}
            <div>
              <h4 className="text-lg font-bold text-white mb-4">
                <i className="fas fa-flag-checkered mr-2 text-green-400"></i>
                移动到
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">目标父级空间</label>
                  <select
                    className="input-field"
                    value={batchTargetId}
                    onChange={(e) => setBatchTargetId(e.target.value)}
                  >
                    <option value="">无（顶级空间）</option>
                    {allSpaces
                      .filter(s => !batchSelected.has(s.id))
                      .map((space) => (
                        <option key={space.id} value={space.id}>
                          {getSpacePath(space)}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    所选空间将移动到指定的目标父级下
                  </p>
                </div>

                <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <p className="text-sm text-blue-400 mb-2">
                    <i className="fas fa-info-circle mr-2"></i>
                    批量操作说明
                  </p>
                  <ul className="text-xs text-gray-400 space-y-1">
                    <li>✓ 支持批量选择多个空间</li>
                    <li>✓ 将选中空间移动到目标父级下</li>
                    <li>✓ 建筑、楼层、房间均可批量移动</li>
                    <li>✓ 子空间会跟随父空间一起移动</li>
                  </ul>
                </div>

                <button
                  onClick={handleBatchMove}
                  disabled={loading || batchSelected.size === 0}
                  className="btn btn-primary w-full"
                >
                  <i className="fas fa-exchange-alt mr-2"></i>
                  {loading ? "移动中..." : `移动 ${batchSelected.size} 个空间`}
                </button>
              </div>
            </div>
          </div>
          );
        })()}
      </div>

      {/* 新建空间弹窗 */}
      {showAddModal && (
        <AddSpaceModal
          spaces={allSpaces}
          onSave={handleAddSpace}
          onClose={() => setShowAddModal(false)}
          loading={loading}
        />
      )}

      {/* 编辑空间弹窗 */}
      {showEditModal && editingSpace && (
        <AddSpaceModal
          spaces={allSpaces}
          editingSpace={editingSpace}
          onSave={handleEditSpace}
          onClose={() => { setShowEditModal(false); setEditingSpace(null); }}
          loading={loading}
        />
      )}
    </div>
  );
}

// 新建/编辑空间弹窗组件
function AddSpaceModal({
  spaces,
  editingSpace,
  onSave,
  onClose,
  loading,
}: {
  spaces: SpaceNode[];
  editingSpace?: SpaceNode;
  onSave: (data: { name: string; type: string; parentId?: string }) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const isEdit = !!editingSpace;
  const [name, setName] = useState(editingSpace?.name ?? "");
  const [type, setType] = useState(editingSpace?.type ?? "room");
  const [parentId, setParentId] = useState(editingSpace?.parentId ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      type,
      parentId: parentId || undefined,
    });
  };

  // 根据类型过滤可选父级
  const availableParents = spaces.filter((s) => {
    if (type === "building") return false; // 建筑不能有父级
    if (type === "floor") return s.type === "building"; // 楼层只能是建筑的子级
    return s.type === "building" || s.type === "floor"; // 房间可以是建筑或楼层的子级
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50">
        <div className="bg-gradient-to-b from-[#1a1f2e] to-[#151a28] rounded-xl p-6 w-[450px] shadow-2xl border border-white/10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">{isEdit ? "编辑空间" : "新建空间"}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">空间类型</label>
              <select
                className="input-field"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as "room" | "building" | "floor");
                  setParentId("");
                }}
              >
                <option value="building">建筑</option>
                <option value="floor">楼层</option>
                <option value="room">房间</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">空间名称</label>
              <input
                type="text"
                className="input-field"
                placeholder="请输入空间名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">父级空间</label>
              <select
                className="input-field"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={type === "building"}
              >
                <option value="">无（顶级空间）</option>
                {availableParents.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button type="button" onClick={onClose} className="btn btn-secondary flex-1 whitespace-nowrap">
                取消
              </button>
              <button type="submit" disabled={loading || !name.trim()} className="btn btn-primary flex-1 whitespace-nowrap">
                {loading ? (isEdit ? "保存中..." : "创建中...") : (isEdit ? "保存修改" : "创建空间")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ==================== 场景编辑弹窗 ====================
function SceneEditModal({
  scene,
  devices,
  spaces,
  onClose,
  onSave,
}: {
  scene: Scene | null;
  devices: InSonaDevice[];
  spaces: SpaceNode[];
  onClose: () => void;
  onSave: (scene: Omit<Partial<Scene>, 'actions'> & { actions: { deviceId: string; action: string; value: number[]; meshId: string; deviceName: string }[] }) => Promise<void>;
}) {
  const isEditing = !!scene;
  const [name, setName] = useState(scene?.name ?? "");
  const [icon, setIcon] = useState(scene?.icon ?? "fa-star");
  const [color, setColor] = useState(scene?.color ?? "#3b9eff");
  const [selectedMeshId, setSelectedMeshId] = useState(scene?.meshId ?? "");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [search, setSearch] = useState("");
  const [showInQuick, setShowInQuick] = useState(scene?.showInQuick ?? false);
  const [selectedDevices, setSelectedDevices] = useState<
    Map<string, { action: string; value: number[]; deviceName: string }>
  >(new Map());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 弹窗模式：edit=编辑已配置设备，add=添加新设备
  const [mode, setMode] = useState<"edit" | "add">(() => isEditing ? "edit" : "add");
  // 同步弹窗状态
  const [syncModal, setSyncModal] = useState<{
    visible: boolean;
    sourceDeviceId: string | null;
  }>({ visible: false, sourceDeviceId: null });
  // 添加设备多选状态
  const [addSelectedIds, setAddSelectedIds] = useState<Set<string>>(new Set());
  const [addDefaultAction, setAddDefaultAction] = useState<{ action: string; value: number[] }>({ action: "onoff", value: [1] });

  // 初始化 selectedDevices（仅在客户端执行）
  useEffect(() => {
    if (!scene?.actions?.length) {
      setSelectedDevices(new Map());
      return;
    }
    const map = new Map<string, { action: string; value: number[]; deviceName: string }>();
    for (const a of scene.actions) {
      let parsedValue: number[];
      if (typeof a.value === "string") {
        parsedValue = a.value.replace(/[\[\]"]/g, "").split(",").map(Number);
      } else if (Array.isArray(a.value)) {
        parsedValue = a.value;
      } else {
        parsedValue = [Number(a.value) || 0];
      }
      map.set(a.deviceId, {
        action: a.action,
        value: parsedValue,
        deviceName: a.deviceName,
      });
    }
    setSelectedDevices(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id]);

  // Get all mesh IDs from devices
  const meshIds = Array.from(new Set(devices.map((d) => d.meshid).filter(Boolean) as string[]));

  // Flatten rooms from space tree
  const flattenRooms = (nodes: SpaceNode[]): SpaceNode[] => {
    const result: SpaceNode[] = [];
    const flatten = (list: SpaceNode[]) => {
      for (const node of list) {
        if (node.type === "room") result.push(node);
        if (node.children) flatten(node.children);
      }
    };
    flatten(nodes);
    return result;
  };
  const roomList = flattenRooms(spaces);

  // 获取设备所在空间名称
  const getDeviceRoomLabel = (roomId: string) => {
    if (!roomId) return "未绑定空间";
    const space = roomList.find((r) => r.id === roomId);
    return space ? space.name : `空间${roomId}`;
  };

  // Filter devices
  const filteredDevices = devices.filter((d) => {
    if (!d.alive) return false;
    if (selectedMeshId && d.meshid !== selectedMeshId) return false;
    if (selectedRoomId && d.roomId !== selectedRoomId) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // 设备分组：已配置 vs 未配置
  const configuredDevices = filteredDevices.filter(d => selectedDevices.has(d.did));
  const unconfiguredDevices = filteredDevices.filter(d => !selectedDevices.has(d.did) && d.type !== 1218);

  // 获取可同步的目标设备（已配置设备中同 func 类型的其他设备）
  const getSyncTargets = (sourceDeviceId: string): InSonaDevice[] => {
    const source = devices.find(d => d.did === sourceDeviceId);
    if (!source) return [];
    const sourceFunc = resolveDeviceFunc(source.func, source.funcs);
    return configuredDevices.filter(d => {
      if (d.did === sourceDeviceId) return false; // 排除源设备自身
      const func = resolveDeviceFunc(d.func, d.funcs);
      return func === sourceFunc;
    });
  };

  // 同步动作到目标设备
  const handleSync = (sourceDeviceId: string, targetDeviceIds: string[]) => {
    const sourceCfg = selectedDevices.get(sourceDeviceId);
    if (!sourceCfg) return;
    const newMap = new Map(selectedDevices);
    for (const targetId of targetDeviceIds) {
      newMap.set(targetId, {
        ...sourceCfg,
        deviceName: devices.find(d => d.did === targetId)?.name ?? "",
      });
    }
    setSelectedDevices(newMap);
    setSyncModal({ visible: false, sourceDeviceId: null });
  };

  // 添加设备到场景
  const addDeviceToScene = (device: InSonaDevice) => {
    const resolvedFunc = resolveDeviceFunc(device.func, device.funcs);
    let action = "onoff";
    let value: number[] = [1];
    if (resolvedFunc === 3) {
      action = "level";
      value = [100];
    } else if (resolvedFunc === 4) {
      action = "ctl";
      value = [100, 50];
    } else if (resolvedFunc === 5) {
      action = "hsl";
      value = [100, 100, 50];
    } else if (resolvedFunc === 7) {
      action = "onoff";
      value = [1];
    }
    const newMap = new Map(selectedDevices);
    newMap.set(device.did, { action, value, deviceName: device.name });
    setSelectedDevices(newMap);
  };

  // 批量添加设备到场景
  const addDevicesToScene = () => {
    const newMap = new Map(selectedDevices);
    for (const deviceId of addSelectedIds) {
      const device = filteredDevices.find(d => d.did === deviceId);
      if (device) {
        newMap.set(device.did, { action: addDefaultAction.action, value: addDefaultAction.value, deviceName: device.name });
      }
    }
    setSelectedDevices(newMap);
    setAddSelectedIds(new Set());
    setMode("edit");
  };

  // 移除设备
  const removeDevice = (deviceId: string) => {
    const newMap = new Map(selectedDevices);
    newMap.delete(deviceId);
    setSelectedDevices(newMap);
  };

  // Get device icon
  const getDeviceIcon = (func: number) => {
    switch (func) {
      case 2: return "fa-toggle-on"; // switch
      case 3: return "fa-lightbulb"; // dimmer
      case 4: return "fa-lightbulb"; // cct
      case 7: return "fa-blender";   // fan
      case 8: return "fa-faucet";    // valve
      case 11: return "fa-snowflake"; // ac
      default: return "fa-circle";
    }
  };

  // Toggle device selection
  const toggleDevice = (device: InSonaDevice) => {
    const newMap = new Map(selectedDevices);
    if (newMap.has(device.did)) {
      newMap.delete(device.did);
    } else {
      addDeviceToScene(device);
    }
    setSelectedDevices(newMap);
  };

  // Update device action
  const updateDeviceAction = (deviceId: string, action: string, value: number[]) => {
    const newMap = new Map(selectedDevices);
    const existing = newMap.get(deviceId);
    if (existing) {
      newMap.set(deviceId, { ...existing, action, value });
      setSelectedDevices(newMap);
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!name.trim()) {
      alert("请输入场景名称");
      return;
    }
    setSaving(true);
    try {
      const actions = Array.from(selectedDevices.entries()).map(([deviceId, cfg]) => ({
        deviceId,
        action: cfg.action,
        value: cfg.value,
        meshId: devices.find((d) => d.did === deviceId)?.meshid ?? "",
        deviceName: cfg.deviceName,
      }));
      await onSave({ name, icon, color, meshId: selectedMeshId, isCustom: true, showInQuick, actions });
      onClose();
    } catch (err) {
      console.error("Save failed:", err);
      alert("保存失败");
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!scene?.id) return;
    if (!confirm(`确定要删除场景"${scene.name}"吗？`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/scenes/${scene.id}`, { method: "DELETE" });
      onClose();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  // Icon options
  const iconOptions = [
    { value: "fa-lightbulb", label: "灯泡" },
    { value: "fa-moon", label: "月亮" },
    { value: "fa-sun", label: "太阳" },
    { value: "fa-users", label: "会客" },
    { value: "fa-film", label: "影院" },
    { value: "fa-leaf", label: "节能" },
    { value: "fa-star", label: "星星" },
    { value: "fa-heart", label: "爱心" },
    { value: "fa-home", label: "家居" },
    { value: "fa-bed", label: "睡眠" },
    { value: "fa-utensils", label: "用餐" },
    { value: "fa-book", label: "阅读" },
  ];

  // Color options
  const colorOptions = [
    "#3b9eff", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
  ];

  // Action types for a device
  const getDeviceActionTypes = (func: number) => {
    switch (func) {
      case 2: return [{ value: "onoff", label: "开关" }];
      case 3: return [{ value: "onoff", label: "开关" }, { value: "level", label: "调光" }];
      case 4: return [{ value: "onoff", label: "开关" }, { value: "level", label: "调光" }, { value: "ctl", label: "色温" }];
      case 5: return [{ value: "onoff", label: "开关" }, { value: "level", label: "调光" }, { value: "hsl", label: "彩光" }];
      case 7: return [{ value: "onoff", label: "开关" }, { value: "level", label: "调速" }];
      default: return [{ value: "onoff", label: "开关" }];
    }
  };

  // 同步目标选择弹窗状态（提升到顶层，避免条件 hooks）
  const [syncSelectedTargets, setSyncSelectedTargets] = useState<Set<string>>(new Set());
  const syncSourceDevice = syncModal.sourceDeviceId ? devices.find(d => d.did === syncModal.sourceDeviceId) : null;
  const syncSourceCfg = syncModal.sourceDeviceId ? selectedDevices.get(syncModal.sourceDeviceId) : null;
  const syncTargets = syncModal.sourceDeviceId ? getSyncTargets(syncModal.sourceDeviceId) : [];
  const syncTargetsKey = syncModal.sourceDeviceId ?? "";

  const SyncTargetModal = () => {
    if (!syncModal.visible || !syncModal.sourceDeviceId) return null;
    if (!syncSourceDevice || !syncSourceCfg) return null;

    const formatAction = (action: string, value: number[]) => {
      switch (action) {
        case "onoff": return value[0] === 1 ? "开" : "关";
        case "level": return `亮度 ${value[0]}%`;
        case "ctl": return `亮度 ${value[0]}% 色温 ${value[1]}%`;
        case "hsl": return `H:${value[0]} S:${value[1]} L:${value[2]}`;
        default: return action;
      }
    };

    const closeSync = () => {
      setSyncModal({ visible: false, sourceDeviceId: null });
      setSyncSelectedTargets(new Set());
    };

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]" onClick={closeSync}>
        <div className="bg-[#1a1a2e] rounded-xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              <i className="fas fa-exchange-alt text-blue-400 mr-2" />
              同步设备动作
            </h3>
            <button onClick={closeSync} className="text-gray-400 hover:text-white">
              <i className="fas fa-times" />
            </button>
          </div>

          {/* Source device info */}
          <div className="p-4 border-b border-white/10">
            <p className="text-xs text-gray-400 mb-2">源设备设置</p>
            <div className="bg-blue-500/10 rounded-lg p-3">
              <p className="text-sm text-white font-medium">{syncSourceDevice.name}</p>
              <p className="text-xs text-blue-400 mt-1">
                {getDeviceActionTypes(syncSourceDevice.func).find(t => t.value === syncSourceCfg.action)?.label ?? syncSourceCfg.action}
                {" "}
                {formatAction(syncSourceCfg.action, syncSourceCfg.value)}
              </p>
            </div>
          </div>

          {/* Target selection */}
          <div className="p-4">
            <p className="text-xs text-gray-400 mb-2">
              选择要同步的已配置设备
              {syncTargets.length > 0 && (
                <button
                  className="float-right text-blue-400 hover:text-blue-300"
                  onClick={() => {
                    if (syncSelectedTargets.size === syncTargets.length) {
                      setSyncSelectedTargets(new Set());
                    } else {
                      setSyncSelectedTargets(new Set(syncTargets.map(t => t.did)));
                    }
                  }}
                >
                  {syncSelectedTargets.size === syncTargets.length ? "取消全选" : "全选"}
                </button>
              )}
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {syncTargets.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  没有可同步的同类型设备
                </p>
              ) : (
                syncTargets.map(device => (
                  <div
                    key={device.did}
                    className={`p-2 rounded-lg border cursor-pointer transition-colors flex items-center gap-2 ${
                      syncSelectedTargets.has(device.did)
                        ? "border-blue-500/50 bg-blue-500/10"
                        : "border-white/5 bg-white/5 hover:border-white/10"
                    }`}
                    onClick={() => {
                      setSyncSelectedTargets(prev => {
                        const next = new Set(prev);
                        if (next.has(device.did)) next.delete(device.did);
                        else next.add(device.did);
                        return next;
                      });
                    }}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                      syncSelectedTargets.has(device.did)
                        ? "bg-blue-500 border-blue-500"
                        : "border-white/20"
                    }`}>
                      {syncSelectedTargets.has(device.did) && (
                        <i className="fas fa-check text-white text-xs" />
                      )}
                    </div>
                    <i className={`fas ${getDeviceIcon(device.func)} text-gray-400 text-sm shrink-0`} />
                    <span className="text-sm text-white flex-1 truncate">{device.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 border-t border-white/10 flex gap-3">
            <button
              onClick={closeSync}
              className="flex-1 py-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (syncSelectedTargets.size > 0) {
                  handleSync(syncModal.sourceDeviceId!, Array.from(syncSelectedTargets));
                  setSyncSelectedTargets(new Set());
                }
              }}
              disabled={syncSelectedTargets.size === 0}
              className={`flex-1 py-2 rounded-lg transition-colors ${
                syncSelectedTargets.size > 0
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-white/5 text-gray-500 cursor-not-allowed"
              }`}
            >
              同步到 {syncSelectedTargets.size} 个设备
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a1a2e] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {isEditing ? "编辑场景" : "新建场景"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <i className="fas fa-times text-lg" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Filter + Device list */}
          <div className="flex-1 flex flex-col border-r border-white/10 overflow-hidden">
            {/* Filter bar */}
            <div className="p-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3 mb-3">
                {/* Mesh filter */}
                <select
                  className="input-field text-sm flex-1"
                  value={selectedMeshId}
                  onChange={(e) => setSelectedMeshId(e.target.value)}
                >
                  <option value="">全部 Mesh</option>
                  {meshIds.map((m) => (
                    <option key={m} value={m}>Mesh: {m.slice(0, 8)}...</option>
                  ))}
                </select>
                {/* Room filter */}
                <select
                  className="input-field text-sm flex-1"
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                >
                  <option value="">全部空间</option>
                  {roomList.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              {/* Search */}
              <input
                type="text"
                className="input-field text-sm"
                placeholder="搜索设备名称..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Device list - inside left panel, scrolls independently */}
            <div className="flex-1 overflow-y-auto p-3">
              {/* 编辑模式：显示已配置设备 + 添加按钮 */}
              {mode === "edit" && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-blue-400">
                      <i className="fas fa-check-circle mr-1" />
                      已配置设备 ({configuredDevices.length})
                    </p>
                    {unconfiguredDevices.length > 0 && (
                      <button
                        onClick={() => setMode("add")}
                        className="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                      >
                        <i className="fas fa-plus mr-1" />
                        添加设备
                      </button>
                    )}
                  </div>

                  {/* 表头 */}
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500 border-b border-white/10">
                    <span className="shrink-0" style={{ width: 140 }}>设备名称</span>
                    <span className="text-center shrink-0" style={{ width: 80 }}>功能</span>
                    <span className="text-center flex-1">参数</span>
                    <span className="text-center shrink-0">操作</span>
                  </div>

                  {configuredDevices.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">
                      暂未配置任何设备，点击上方"添加设备"开始
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {configuredDevices.map((device) => {
                        const selected = selectedDevices.get(device.did);
                        return (
                          <div
                            key={device.did}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-colors overflow-x-auto"
                          >
                            {/* 设备名称 */}
                            <div className="flex flex-col gap-0.5 min-w-0 shrink-0" style={{ width: 140 }}>
                              <div className="flex items-center gap-2">
                                <i className={`fas ${getDeviceIcon(device.func)} text-blue-400 shrink-0`} />
                                <span className="text-sm text-white truncate">{device.name}</span>
                              </div>
                              <span className="text-xs text-gray-500 truncate pl-6">{getDeviceRoomLabel(device.roomId)}</span>
                            </div>

                            {/* 功能下拉 */}
                            <select
                              className="input-field text-sm py-1.5 text-center shrink-0"
                              style={{ width: 80 }}
                              value={selected?.action ?? "onoff"}
                              onChange={(e) => {
                                const val = e.target.value;
                                let newValue = selected?.value ?? [1];
                                if (val === "level") newValue = [100];
                                if (val === "ctl") newValue = [100, 50];
                                if (val === "hsl") newValue = [0, 100, 50];
                                if (val === "onoff") newValue = [1];
                                updateDeviceAction(device.did, val, newValue);
                              }}
                            >
                              {getDeviceActionTypes(device.func).map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>

                            {/* 参数控件 - 自适应，可横向滚动 */}
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
                              {/* 开/关 控制 */}
                              {selected?.action === "onoff" && (
                                <>
                                  <button
                                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                      selected.value[0] === 1
                                        ? "bg-green-500/30 text-green-400"
                                        : "bg-white/5 text-gray-400 hover:bg-white/10"
                                    }`}
                                    onClick={() => updateDeviceAction(device.did, "onoff", [1])}
                                  >
                                    开
                                  </button>
                                  <button
                                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                      selected.value[0] === 0
                                        ? "bg-red-500/30 text-red-400"
                                        : "bg-white/5 text-gray-400 hover:bg-white/10"
                                    }`}
                                    onClick={() => updateDeviceAction(device.did, "onoff", [0])}
                                  >
                                    关
                                  </button>
                                </>
                              )}

                              {/* 调光控制 */}
                              {selected?.action === "level" && (
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  className="input-field text-sm py-1.5 w-20 text-center"
                                  value={selected.value[0] ?? 100}
                                  onChange={(e) => {
                                    const v = [Math.max(0, Math.min(100, Number(e.target.value)))];
                                    updateDeviceAction(device.did, "level", v);
                                  }}
                                />
                              )}

                              {/* 色温控制 */}
                              {selected?.action === "ctl" && (
                                <>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="input-field text-sm py-1.5 w-16 text-center"
                                    placeholder="亮度"
                                    value={selected.value[0] ?? 100}
                                    onChange={(e) => {
                                      const v = [Math.max(0, Math.min(100, Number(e.target.value))), selected.value[1] ?? 50];
                                      updateDeviceAction(device.did, "ctl", v);
                                    }}
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="input-field text-sm py-1.5 w-16 text-center"
                                    placeholder="色温"
                                    value={selected.value[1] ?? 50}
                                    onChange={(e) => {
                                      const v = [selected.value[0] ?? 100, Math.max(0, Math.min(100, Number(e.target.value)))];
                                      updateDeviceAction(device.did, "ctl", v);
                                    }}
                                  />
                                </>
                              )}

                              {/* 彩光控制 */}
                              {selected?.action === "hsl" && (
                                <>
                                  <input
                                    type="number"
                                    min={0}
                                    max={360}
                                    className="input-field text-sm py-1.5 w-14 text-center"
                                    placeholder="H"
                                    value={selected.value[0] ?? 0}
                                    onChange={(e) => {
                                      const v = [Math.max(0, Math.min(360, Number(e.target.value))), selected.value[1] ?? 100, selected.value[2] ?? 50];
                                      updateDeviceAction(device.did, "hsl", v);
                                    }}
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="input-field text-sm py-1.5 w-14 text-center"
                                    placeholder="S"
                                    value={selected.value[1] ?? 100}
                                    onChange={(e) => {
                                      const v = [selected.value[0] ?? 0, Math.max(0, Math.min(100, Number(e.target.value))), selected.value[2] ?? 50];
                                      updateDeviceAction(device.did, "hsl", v);
                                    }}
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="input-field text-sm py-1.5 w-14 text-center"
                                    placeholder="L"
                                    value={selected.value[2] ?? 50}
                                    onChange={(e) => {
                                      const v = [selected.value[0] ?? 0, selected.value[1] ?? 100, Math.max(0, Math.min(100, Number(e.target.value)))];
                                      updateDeviceAction(device.did, "hsl", v);
                                    }}
                                  />
                                </>
                              )}
                            </div>

                            {/* 操作按钮 - 图标形式 */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => setSyncModal({ visible: true, sourceDeviceId: device.did })}
                                className="p-2 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                                disabled={getSyncTargets(device.did).length === 0}
                                title={getSyncTargets(device.did).length > 0 ? `同步到其他 ${getSyncTargets(device.did).length} 个设备` : "无目标"}
                              >
                                <i className="fas fa-exchange-alt" />
                              </button>
                              <button
                                onClick={() => removeDevice(device.did)}
                                className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                                title="移除"
                              >
                                <i className="fas fa-times" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* 添加设备模式 */}
              {mode === "add" && (
                <>
                  <button
                    onClick={() => { setMode("edit"); setAddSelectedIds(new Set()); }}
                    className="w-full py-2 mb-3 rounded-lg bg-white/5 text-gray-400 text-sm hover:bg-white/10 flex items-center justify-center gap-2 transition-colors"
                  >
                    <i className="fas fa-arrow-left" />
                    返回已配置设备 ({configuredDevices.length})
                  </button>

                  <p className="text-sm text-gray-400 mb-2">选择设备添加到场景</p>

                  {unconfiguredDevices.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">
                      没有可添加的设备
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1">
                        {unconfiguredDevices.map((device) => (
                          <div
                            key={device.did}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                              addSelectedIds.has(device.did)
                                ? "border-blue-500/50 bg-blue-500/10"
                                : "border-white/5 bg-white/5 hover:border-blue-500/30"
                            }`}
                            onClick={() => {
                              setAddSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(device.did)) next.delete(device.did);
                                else next.add(device.did);
                                return next;
                              });
                            }}
                          >
                            <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                              addSelectedIds.has(device.did)
                                ? "bg-blue-500 border-blue-500"
                                : "border-white/20"
                            }`}>
                              {addSelectedIds.has(device.did) && (
                                <i className="fas fa-check text-white text-xs" />
                              )}
                            </div>
                            <i className={`fas ${getDeviceIcon(device.func)} text-gray-400 text-sm shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-white truncate block">{device.name}</span>
                              <span className="text-xs text-gray-500 truncate block">{getDeviceRoomLabel(device.roomId)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* 批量添加按钮 */}
                      {addSelectedIds.size > 0 && (
                        <div className="sticky bottom-0 pt-3 mt-2">
                          <button
                            onClick={addDevicesToScene}
                            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <i className="fas fa-plus" />
                            确认添加 {addSelectedIds.size} 个设备
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: Scene config */}
          <div className="w-72 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Scene name */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">场景名称</label>
                <input
                  type="text"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="输入场景名称"
                />
              </div>

              {/* Icon */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">图标</label>
                <div className="grid grid-cols-6 gap-2">
                  {iconOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setIcon(opt.value)}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        icon === opt.value
                          ? "bg-blue-500/30 text-blue-400"
                          : "bg-white/5 text-gray-400 hover:bg-white/10"
                      }`}
                    >
                      <i className={`fas ${opt.value}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">颜色</label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full transition-all ${
                        color === c ? "ring-2 ring-white ring-offset-1 ring-offset-[#1a1a2e]" : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Show in quick bar */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInQuick}
                  onChange={(e) => setShowInQuick(e.target.checked)}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-blue-500"
                />
                <span className="text-sm text-gray-300">添加到快捷场景栏</span>
              </label>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/10 space-y-2">
              {/* 取消和保存在同一行 */}
              <div className="flex gap-2">
                <button className="btn btn-sm whitespace-nowrap flex-1 border border-gray-600 hover:bg-gray-700/50 justify-center" onClick={onClose}>
                  取消
                </button>
                <button
                  className="btn btn-sm whitespace-nowrap btn-primary flex-1 justify-center"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <i className="fas fa-save" />
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
              {/* 删除按钮单独一行 */}
              {isEditing && (
                <button
                  className="btn btn-sm w-full whitespace-nowrap bg-red-600 hover:bg-red-700 text-white justify-center"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <i className="fas fa-trash" />
                  {deleting ? "删除中..." : "删除"}
                </button>
              )}
            </div>
          </div>
          </div>
        </div>
        {/* 同步目标弹窗 */}
        <SyncTargetModal />
      </div>
    );
  }

function ScenesPage({
  onActivateScene,
  devices,
  spaces,
}: {
  onActivateScene: (sceneId: number, meshid: string) => Promise<void>;
  devices: InSonaDevice[];
  spaces: SpaceNode[];
}) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activating, setActivating] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load scenes from database
  const loadScenes = useCallback(async () => {
    try {
      const res = await fetch("/api/scenes");
      const data = await res.json();
      if (data.scenes) {
        setScenes(data.scenes);
      }
    } catch (err) {
      console.error("Failed to load scenes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  // Handle scene activation
  const handleActivate = async (scene: { id: string; sceneId?: number; name: string }) => {
    setActivating(scene.id);
    try {
      // 从数据库加载的场景
      const res = await fetch(`/api/scenes/${scene.id}/activate`, { method: "POST" });
      if (!res.ok) throw new Error("激活失败");
    } catch (err) {
      console.error("Failed to activate scene:", err);
      alert("执行场景失败");
    } finally {
      setTimeout(() => setActivating(null), 1000);
    }
  };

  // Save scene (create or update)
  const handleSaveScene = async (sceneData: Omit<Partial<Scene>, 'actions'> & { actions: { deviceId: string; action: string; value: number[]; meshId: string; deviceName: string }[] }) => {
    // Convert value array to JSON string for API
    const actionsPayload = sceneData.actions.map((a) => ({
      ...a,
      value: JSON.stringify(a.value),
    }));

    try {
      if (editingScene?.id) {
        // Update existing scene
        const res = await fetch(`/api/scenes/${editingScene.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: sceneData.name,
            icon: sceneData.icon,
            color: sceneData.color,
            meshId: sceneData.meshId,
            showInQuick: sceneData.showInQuick,
          }),
        });
        if (!res.ok) throw new Error("更新失败");

        // Update actions
        await fetch(`/api/scenes/${editingScene.id}/actions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actions: actionsPayload }),
        });
      } else {
        // Create new scene
        const res = await fetch("/api/scenes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: sceneData.name,
            icon: sceneData.icon,
            color: sceneData.color,
            meshId: sceneData.meshId,
            isCustom: true,
            showInQuick: sceneData.showInQuick,
          }),
        });
        if (!res.ok) throw new Error("创建失败");
        const data = await res.json();
        if (data.scene?.id) {
          await fetch(`/api/scenes/${data.scene.id}/actions`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actions: actionsPayload }),
          });
        }
      }
      await loadScenes();
    } catch (err) {
      console.error("Save scene failed:", err);
      throw err;
    }
  };

  // Edit scene
  const handleEditScene = (scene: Scene | null) => {
    setEditingScene(scene);
    setShowModal(true);
  };

  // Delete scene
  const handleDeleteScene = async (sceneId: string) => {
    if (!confirm("确定要删除此场景吗？")) return;
    try {
      await fetch(`/api/scenes/${sceneId}`, { method: "DELETE" });
      await loadScenes();
    } catch (err) {
      console.error("Delete scene failed:", err);
      alert("删除失败");
    }
  };

  const getColorClass = (color: string) => {
    const map: Record<string, string> = {
      blue: "blue", gray: "gray", green: "green", purple: "purple",
      emerald: "emerald", yellow: "yellow", red: "red", pink: "pink",
    };
    return map[color] ?? "blue";
  };

  // 转换 hex 颜色为 rgb 格式用于 rgba
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : "59, 158, 255";
  };

  const renderSceneCard = (scene: { id: string; name: string; icon: string; color: string; sceneId?: number; actions?: SceneAction[]; isDefault?: boolean }) => {
    const rgb = hexToRgb(scene.color);
    return (
      <div key={scene.id} className="relative group">
        <button
          onClick={() => handleActivate(scene as { id: string; sceneId?: number; name: string })}
          disabled={devices.length === 0}
          className={`w-full p-5 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 hover:border-white/20 flex flex-col items-center gap-2 ${
            activating === scene.id ? "scale-95" : ""
          }`}
          style={{ borderColor: `rgba(${rgb}, 0.15)` }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `rgba(${rgb}, 0.15)` }}
          >
            <i className={`fas ${scene.icon} text-xl`} style={{ color: scene.color }} />
          </div>
          <p className="text-sm text-white text-center">{scene.name}</p>
          {(scene.actions?.length ?? 0) > 0 && (
            <p className="text-xs text-gray-500">{scene.actions?.length} 个设备</p>
          )}
        </button>
        {/* Edit button - only for non-default scenes */}
        {!scene.isDefault && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const dbScene = scenes.find((s) => s.id === scene.id);
              handleEditScene(dbScene ?? null);
            }}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-white hover:bg-black/70"
            title="编辑场景"
          >
            <i className="fas fa-pen text-xs" />
          </button>
        )}
      </div>
    );
  };

  // Quick scenes from DB (showInQuick) - 排除假场景
  const quickScenes = scenes.filter((s) => s.showInQuick && !['下班模式', '会议模式', '全开模式', '全关模式'].includes(s.name));

  // Preset scenes from DB - 排除假场景和已显示的 quick scenes
  const presetScenes = scenes.filter((s) => s.isDefault && !['下班模式', '会议模式', '全开模式', '全关模式'].includes(s.name) && !s.showInQuick);

  return (
    <div className="fade-in">
      {/* Scene edit modal - only render after mounting to avoid hydration mismatch */}
      {mounted && showModal && (
        <SceneEditModal
          scene={editingScene}
          devices={devices}
          spaces={spaces}
          onClose={() => { setShowModal(false); setEditingScene(null); }}
          onSave={handleSaveScene}
        />
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">快捷场景</h3>
          <button
            className="btn btn-primary"
            onClick={() => handleEditScene(null)}
          >
            <i className="fas fa-plus" />
            <span>新建场景</span>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <i className="fas fa-spinner fa-spin text-blue-400 text-xl" />
          </div>
        ) : (
          <>
            {/* Quick scenes from database */}
            {quickScenes.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                {quickScenes.map((s) => renderSceneCard(s))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm mb-4">暂无快捷场景，点击上方按钮创建</p>
              </div>
            )}

            {/* Preset/DB scenes */}
            {presetScenes.length > 0 && (
              <>
                <div className="h-px bg-white/5 mb-6" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {presetScenes.map((s) => renderSceneCard(s))}
                </div>
              </>
            )}

            {/* Custom scenes */}
            {scenes.filter((s) => s.isCustom).length > 0 && (
              <>
                <div className="h-px bg-white/5 mb-6 mt-6" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {scenes.filter((s) => s.isCustom && !s.showInQuick).map((s) => renderSceneCard(s))}
                </div>
              </>
            )}

            {/* Empty state */}
            {scenes.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm mb-4">暂无自定义场景，点击上方按钮创建</p>
              </div>
            )}
          </>
        )}

        {devices.length === 0 && (
          <p className="text-center text-gray-400 mt-6">
            <i className="fas fa-info-circle mr-2" />
            请先连接网关获取设备数据
          </p>
        )}
      </div>
    </div>
  );
}

// ==================== 能耗分析页面 ====================
// 碳排放系数 (中国平均电网排放因子, 2024年数据)
const CARBON_EMISSION_FACTOR = 0.5586; // kgCO₂e/kWh

function EnergyPage({ dbDevices, spaces }: { dbDevices: DbDevice[]; spaces: SpaceNode[] }) {
  const [period, setPeriod] = useState(30);
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [todayChartType, setTodayChartType] = useState<"hourly" | "room">("hourly"); // 今日能耗图表类型
  const [energyData, setEnergyData] = useState<{
    records: { deviceId: string; date: string; kwh: number; device: { name: string; room?: { name: string } } }[];
    totals: { kwh: number; carbonEmission: number };
    dailyTotals: { date: string; _sum: { kwh: number | null } }[];
  } | null>(null);
  const [todayEnergy, setTodayEnergy] = useState<{
    date: string;
    totalKwh: number;
    totalCarbonEmission: number;
    recordCount: number;
    deviceStats: any[];
    roomStats: any[];
    hourlyData: any[];
    latestData: any[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);

  // 获取查询日期范围
  const getDateRange = () => {
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    return { from, to };
  };

  // 加载能耗数据
  const loadEnergyData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getDateRange();
      let url = `/api/energy?from=${from}&to=${to}`;
      if (selectedRoom) {
        url += `&roomId=${selectedRoom}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setEnergyData(data);
    } catch (err) {
      console.error("加载能耗数据失败:", err);
    } finally {
      setLoading(false);
    }
  }, [period, selectedRoom]);

  // 加载今日能耗数据
  const loadTodayEnergy = useCallback(async () => {
    setTodayLoading(true);
    try {
      let url = "/api/energy/today";
      if (selectedRoom) {
        url += `?roomId=${selectedRoom}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setTodayEnergy(data);
    } catch (err) {
      console.error("加载今日能耗数据失败:", err);
    } finally {
      setTodayLoading(false);
    }
  }, [selectedRoom]);

  useEffect(() => {
    loadEnergyData();
    loadTodayEnergy();
  }, [loadEnergyData, loadTodayEnergy]);

  // 处理每日数据
  const dailyData = energyData?.dailyTotals?.map((d) => ({
    date: d.date.slice(5), // MM-DD
    value: d._sum.kwh ?? 0,
    carbonEmission: (d._sum.kwh ?? 0) * CARBON_EMISSION_FACTOR,
  })) ?? [];

  // 计算总能耗和总碳排放
  const totalKwh = energyData?.totals?.kwh ?? 0;
  const totalCarbonEmission = energyData?.totals?.carbonEmission ?? 0;
  const avgKwh = dailyData.length > 0 ? totalKwh / dailyData.length : 0;
  const avgCarbonEmission = dailyData.length > 0 ? totalCarbonEmission / dailyData.length : 0;

  // 按房间分组的能耗数据
  const roomEnergyData = useMemo(() => {
    if (!energyData?.records) return {};
    const grouped: Record<string, number> = {};
    for (const record of energyData.records) {
      const roomName = record.device.room?.name || "未绑定";
      grouped[roomName] = (grouped[roomName] || 0) + record.kwh;
    }
    return grouped;
  }, [energyData?.records]);

  // 获取所有房间列表
  const flattenRooms = (nodes: SpaceNode[]): SpaceNode[] => {
    const result: SpaceNode[] = [];
    const flatten = (nodeList: SpaceNode[]) => {
      for (const node of nodeList) {
        if (node.type === "room") result.push(node);
        if (node.children) flatten(node.children);
      }
    };
    flatten(nodes);
    return result;
  };

  const roomList = flattenRooms(spaces);

  return (
    <div className="fade-in">
      {/* 今日能耗统计卡片 */}
      {todayEnergy && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
          <div className="stat-card">
            <p className="text-sm text-blue-200 mb-1">今日总能耗 (kWh)</p>
            <h3 className="text-3xl font-bold text-white">{todayEnergy.totalKwh.toFixed(4)}</h3>
            <p className="text-xs text-gray-400 mt-2">
              {todayEnergy.recordCount} 条记录
            </p>
          </div>
          <div className="stat-card" style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)" }}>
            <p className="text-sm text-green-200 mb-1">今日碳排放 (kgCO₂e)</p>
            <h3 className="text-3xl font-bold text-white">{todayEnergy.totalCarbonEmission.toFixed(4)}</h3>
            <p className="text-xs text-gray-400 mt-2">
              EF: {CARBON_EMISSION_FACTOR}
            </p>
          </div>
          <div className="stat-card" style={{ background: "linear-gradient(135deg, #0891b2 0%, #0e7490 100%)" }}>
            <p className="text-sm text-cyan-200 mb-1">活跃设备</p>
            <h3 className="text-3xl font-bold text-white">{todayEnergy.deviceStats.length}</h3>
            <p className="text-xs text-gray-400 mt-2">
              {todayEnergy.roomStats.length} 个空间
            </p>
          </div>
          <div className="stat-card" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}>
            <p className="text-sm text-purple-200 mb-1">总能耗 (kWh)</p>
            <h3 className="text-3xl font-bold text-white">{totalKwh.toFixed(2)}</h3>
            <p className="text-xs text-gray-400 mt-2">历史累计</p>
          </div>
          <div className="stat-card" style={{ background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)" }}>
            <p className="text-sm text-red-200 mb-1">总碳排放 (kgCO₂e)</p>
            <h3 className="text-3xl font-bold text-white">{totalCarbonEmission.toFixed(2)}</h3>
            <p className="text-xs text-gray-400 mt-2">日均: {avgCarbonEmission.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* 今日能耗趋势 */}
      {todayEnergy && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white">今日能耗趋势</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTodayChartType("hourly")}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  todayChartType === "hourly"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <i className="fas fa-clock mr-2"></i>
                小时趋势
              </button>
              <button
                onClick={() => setTodayChartType("room")}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  todayChartType === "room"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <i className="fas fa-building mr-2"></i>
                空间对比
              </button>
            </div>
          </div>

          <div style={{ height: "300px" }}>
            {todayChartType === "hourly" && todayEnergy.hourlyData && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={todayEnergy.hourlyData}>
                  <defs>
                    <linearGradient id="colorToday" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="hour" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "none",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="kwh"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#colorToday)"
                    name="能耗(kWh)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {todayChartType === "room" && todayEnergy.roomStats && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={todayEnergy.roomStats.sort((a, b) => b.totalKwh - a.totalKwh)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="roomName"
                    stroke="#9ca3af"
                    fontSize={11}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "none",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`${value.toFixed(4)} kWh`, "能耗"]}
                  />
                  <Bar
                    dataKey="totalKwh"
                    fill="#3b82f6"
                    radius={[8, 8, 0, 0]}
                    name="能耗(kWh)"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 图表说明 */}
          {todayChartType === "hourly" && (
            <p className="text-xs text-gray-500 mt-4 text-center">
              24小时能耗分布趋势，展示每小时的累计能耗
            </p>
          )}
          {todayChartType === "room" && (
            <p className="text-xs text-gray-500 mt-4 text-center">
              各空间当日能耗对比，按能耗从高到低排序
            </p>
          )}
        </div>
      )}

      {/* 筛选条件 */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">时间范围:</label>
            <select
              className="input-field text-sm"
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
            >
              <option value={7}>近7天</option>
              <option value={30}>近30天</option>
              <option value={90}>近90天</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">空间:</label>
            <select
              className="input-field text-sm"
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
            >
              <option value="">全部空间</option>
              {roomList.map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
          </div>
          <button onClick={loadEnergyData} className="btn btn-secondary text-sm" disabled={loading}>
            <i className={`fas fa-sync-alt ${loading ? "animate-spin" : ""}`}></i>
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 总能耗趋势图 */}
      <div className="card mb-6">
        <h3 className="text-lg font-bold text-white mb-6">总能耗趋势</h3>
        {dailyData.length > 0 ? (
          <EnergyChart data={dailyData} />
        ) : (
          <p className="text-center text-gray-400 py-12">暂无数据</p>
        )}
      </div>

      {/* 各空间能耗分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-bold text-white mb-6">各空间能耗占比</h3>
          {Object.keys(roomEnergyData).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(roomEnergyData)
                .sort((a, b) => b[1] - a[1])
                .map(([room, kwh]) => {
                  const percent = totalKwh > 0 ? (kwh / totalKwh * 100) : 0;
                  return (
                    <div key={room}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300">{room}</span>
                        <span className="text-sm text-white font-medium">{kwh.toFixed(2)} kWh ({percent.toFixed(1)}%)</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${percent}%`, background: "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)" }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-center text-gray-400 py-8">暂无数据</p>
          )}
        </div>

        <div className="card">
          <h3 className="text-lg font-bold text-white mb-6">空间能耗对比</h3>
          {Object.keys(roomEnergyData).length > 0 ? (
            <EnergyBarChart data={Object.entries(roomEnergyData).map(([name, value]) => ({ name, value }))} />
          ) : (
            <p className="text-center text-gray-400 py-8">暂无数据</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 系统设置页面（多网关管理） ====================
interface GatewayInfo {
  id: string;
  name: string;
  ip: string;
  port: number;
  status: string;
  liveStatus?: string;
  lastSeen: string | null;
  createdAt: string;
}

function SettingsPage() {
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newIp, setNewIp] = useState("");
  const [newPort, setNewPort] = useState("8091");
  const [adding, setAdding] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const loadGateways = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway/list");
      const data = await res.json();
      setGateways(data.gateways ?? []);
    } catch {
      setGateways([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGateways(); }, [loadGateways]);

  const handleAddGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIp.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/gateway/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim() || undefined,
          ip: newIp.trim(),
          port: parseInt(newPort) || 8091,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "添加失败");
      setNewName(""); setNewIp(""); setNewPort("8091");
      await loadGateways();
    } catch (err) {
      alert(err instanceof Error ? err.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/system/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "重置失败");
      setResetMsg({ type: "success", text: "系统已重置，请重新连接网关" });
      setShowResetConfirm(false);
      setGateways([]);
    } catch (err) {
      setResetMsg({ type: "error", text: err instanceof Error ? err.message : "重置失败" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fade-in">
      {/* 多网关管理 */}
      <div className="card max-w-2xl">
        <h3 className="text-lg font-bold text-white mb-4">网关管理</h3>

        {/* 添加网关表单 */}
        <form onSubmit={handleAddGateway} className="flex flex-wrap items-end gap-3 mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400">名称</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="可选"
              className="input-field w-28"
              style={{ padding: '8px 12px', fontSize: '14px' }}
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <label className="text-xs text-gray-400">IP 地址</label>
            <input
              type="text"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              placeholder="例: 192.168.1.100"
              className="input-field"
              style={{ padding: '8px 12px', fontSize: '14px' }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400">端口</label>
            <input
              type="number"
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              placeholder="8091"
              className="input-field w-24"
              style={{ padding: '8px 12px', fontSize: '14px' }}
            />
          </div>
          <button
            type="submit"
            disabled={adding || !newIp.trim()}
            className="btn btn-primary"
            style={{
              padding: '8px 20px',
              fontSize: '14px',
              opacity: (adding || !newIp.trim()) ? 0.4 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {adding ? "添加中..." : "添加网关"}
          </button>
        </form>

        {/* 网关列表 */}
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-4">加载中...</p>
        ) : gateways.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">暂无网关，请添加</p>
        ) : (
          <div className="space-y-3">
            {gateways.map((gw) => (
              <GatewayCard key={gw.id} gateway={gw} onRefresh={loadGateways} />
            ))}
          </div>
        )}
      </div>

      {/* 协议信息 */}
      <div className="card mt-6 max-w-2xl">
        <h3 className="text-lg font-bold text-white mb-4">协议信息</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-400">传输协议</span><span className="text-white">TCP</span></div>
          <div className="flex justify-between"><span className="text-gray-400">默认端口</span><span className="text-white">8091</span></div>
          <div className="flex justify-between"><span className="text-gray-400">消息格式</span><span className="text-white">JSON</span></div>
          <div className="flex justify-between"><span className="text-gray-400">通信方式</span><span className="text-white">双向</span></div>
        </div>
      </div>

      {/* 系统重置 */}
      <div className="card mt-6 max-w-2xl border border-red-500/20">
        <h3 className="text-lg font-bold text-white mb-3">系统重置</h3>
        <p className="text-sm text-gray-500 mb-4">
          清空所有数据（设备、空间、场景、能耗记录），并解除网关绑定。执行后将返回初始状态，可重新连接新网关。
        </p>

        {resetMsg && (
          <div className={`text-sm rounded-md px-4 py-3 mb-4 ${
            resetMsg.type === "success"
              ? "bg-green-900/20 border border-green-800 text-green-400"
              : "bg-red-900/20 border border-red-800 text-red-400"
          }`}>
            {resetMsg.text}
          </div>
        )}

        {!showResetConfirm ? (
          <button onClick={() => setShowResetConfirm(true)} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors">
            重置系统
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-400">确定要重置系统吗？此操作不可撤销。</p>
            <div className="flex gap-3">
              <button onClick={handleReset} disabled={resetting} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors disabled:opacity-50">
                {resetting ? "重置中..." : "确认重置"}
              </button>
              <button onClick={() => { setShowResetConfirm(false); setResetMsg(null); }} className="px-5 py-2 bg-[#1c2630] hover:bg-[#253040] text-gray-400 text-sm rounded-md transition-colors">
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GatewayCard({ gateway, onRefresh }: { gateway: GatewayInfo; onRefresh: () => void }) {
  const [connecting, setConnecting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const liveStatus = gateway.liveStatus || gateway.status;
  const statusColor = liveStatus === "connected" ? "text-green-400" : liveStatus === "reconnecting" ? "text-yellow-400" : liveStatus === "error" ? "text-red-400" : "text-gray-400";
  const statusText = liveStatus === "connected" ? "已连接" : liveStatus === "reconnecting" ? "重连中" : liveStatus === "connecting" ? "连接中" : liveStatus === "error" ? "错误" : "未连接";
  const statusDot = liveStatus === "connected" ? "status-online" : liveStatus === "reconnecting" ? "status-warning" : liveStatus === "error" ? "bg-red-600 rounded-full w-2 h-2" : "status-offline";

  const handleConnect = async () => {
    setConnecting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gateway/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayId: gateway.id, ip: gateway.ip, port: gateway.port }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "连接失败");
      setMsg({ type: "success", text: `已连接到 ${gateway.ip}` });
      await onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "连接失败" });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await fetch("/api/gateway/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gatewayId: gateway.id }),
    });
    setMsg({ type: "success", text: "已断开连接" });
    await onRefresh();
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch("/api/gateway/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayId: gateway.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "删除失败");
      await onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "删除失败" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-[#0a1019] rounded-lg border border-white/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-white font-medium">{gateway.name || `${gateway.ip}:${gateway.port}`}</span>
          <span className="text-xs text-gray-500 ml-2">{gateway.ip}:{gateway.port}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`status-indicator ${statusDot}`} />
          <span className={`text-xs ${statusColor}`}>{statusText}</span>
        </div>
      </div>

      {msg && (
        <div className={`text-xs rounded px-3 py-1.5 ${
          msg.type === "success" ? "bg-green-900/20 text-green-400" : "bg-red-900/20 text-red-400"
        }`}>{msg.text}</div>
      )}

      <div className="flex gap-2">
        {liveStatus !== "connected" ? (
          <button onClick={handleConnect} disabled={connecting} className="btn btn-primary text-xs py-1 disabled:opacity-40">
            <i className="fas fa-plug" /><span>{connecting ? "连接中..." : "连接"}</span>
          </button>
        ) : (
          <button onClick={handleDisconnect} className="btn btn-secondary text-xs py-1">
            <i className="fas fa-plug" /><span>断开</span>
          </button>
        )}
        <button onClick={() => setShowDeleteConfirm(true)} disabled={removing} className="btn text-xs py-1 text-red-400 hover:text-red-300 bg-transparent border-0 disabled:opacity-40">
          {removing ? "删除中..." : "删除"}
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-red-400">确定删除？设备不会被删除。</span>
          <button onClick={handleRemove} className="px-2 py-1 bg-red-600 text-white rounded">确认</button>
          <button onClick={() => setShowDeleteConfirm(false)} className="px-2 py-1 bg-[#1c2630] text-gray-400 rounded">取消</button>
        </div>
      )}
    </div>
  );
}

// ==================== 设备控制抽屉 ====================
function DeviceDrawer({
  device,
  open,
  onClose,
  onControl,
  roomName,
}: {
  device: InSonaDevice | null;
  open: boolean;
  onClose: () => void;
  onControl: (did: string, action: string, value: number[], meshid: string, transition?: number) => Promise<void>;
  roomName: string;
}) {
  const [brightness, setBrightness] = useState(100);
  const [colorTemp, setColorTemp] = useState(50); // 0-100, 0=最暖, 100=最冷

  useEffect(() => {
    if (device && device.value) {
      // value[0] = 开关状态 (0=关, 1=开)
      // value[1] = 亮度 (0-100)
      // value[2] = 色温 (0-100)
      const brightnessVal = device.value[1];
      const colorTempVal = device.value[2];
      if (brightnessVal !== undefined) {
        setBrightness(brightnessVal);
      }
      if (colorTempVal !== undefined) {
        setColorTemp(colorTempVal);
      }
    }
  }, [device]);

  if (!device) return null;

  const isLight = device.type === 1984;
  const resolvedFunc = resolveDeviceFunc(device.func, device.funcs);
  const isDimmable = resolvedFunc === 3 || resolvedFunc === 4 || resolvedFunc === 5; // 可调光
  const hasColorTemp = resolvedFunc === 4; // 双色温
  const hasRGB = resolvedFunc === 5; // HSL灯
  const isOn = device.value?.[0] > 0;

  const handleSwitch = async (on: boolean) => {
    await onControl(device.did, "onoff", [on ? 1 : 0], device.meshid, 1000);
  };

  const handleBrightness = async (value: number) => {
    setBrightness(value);
    await onControl(device.did, "level", [value], device.meshid, 1000);
  };

  const handleColorTemp = async (value: number) => {
    setColorTemp(value);
    // 设备控制页面使用 temperature action
    await onControl(device.did, "temperature", [value], device.meshid, 1000);
  };

  const handleRGB = async (color: string) => {
    // Parse hex color to HSL values
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    const brightnessPct = brightness;
    const hue = Math.round(h * 360);
    const saturation = max === 0 ? 0 : Math.round((max - min) / (1 - Math.abs(2 * l - 1)) * 100);

    await onControl(device.did, "hsl", [brightnessPct, hue, saturation], device.meshid, 1000);
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* 抽屉 */}
      <div
        className={`fixed right-0 top-0 h-full w-[400px] bg-gradient-to-b from-[#1a1f2e] to-[#151a28] shadow-[-4px_0_20px_rgba(0,0,0,0.5)] z-50 transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-6 overflow-y-auto h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">设备控制</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <i className="fas fa-times text-xl" />
            </button>
          </div>

          {/* 设备信息卡片 */}
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20 mb-6">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-lg font-bold text-white">{device.name || "未命名设备"}</h4>
              <span className={`badge ${device.alive === 1 ? "badge-success" : "badge-error"}`}>
                {device.alive === 1 ? "在线" : "离线"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="text-xs font-mono bg-gray-700/50 px-2 py-0.5 rounded">{device.did}</span>
              <span>·</span>
              <span>{roomName}</span>
            </div>
            {device.funcs && device.funcs.length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                <span>功能码: </span>
                <span className="font-mono text-blue-400">[{device.funcs.join(", ")}]</span>
                <span className="ml-2">→ 解析为: </span>
                <span className={`font-mono ${resolvedFunc === 4 ? "text-green-400" : resolvedFunc === 5 ? "text-purple-400" : "text-gray-400"}`}>
                  {resolvedFunc === 4 ? "双色温" : resolvedFunc === 5 ? "HSL彩灯" : resolvedFunc === 3 ? "调光灯" : resolvedFunc === 2 ? "开关" : `func=${resolvedFunc}`}
                </span>
              </div>
            )}
          </div>

          {isLight && (
            <div className="space-y-6">
              {/* 开关控制 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">开关控制</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSwitch(true)}
                    className={`btn flex-1 ${isOn ? "btn-primary" : "btn-secondary"}`}
                  >
                    <i className="fas fa-power-off"></i>
                    <span>开启</span>
                  </button>
                  <button
                    onClick={() => handleSwitch(false)}
                    className={`btn flex-1 ${!isOn ? "btn-primary" : "btn-secondary"}`}
                  >
                    <i className="fas fa-power-off"></i>
                    <span>关闭</span>
                  </button>
                </div>
              </div>

              {/* 亮度控制 */}
              {isDimmable && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-400">亮度</label>
                    <span className="text-white font-medium">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    className="slider"
                    min="0"
                    max="100"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    onMouseUp={(e) => handleBrightness(Number((e.target as HTMLInputElement).value))}
                  />
                </div>
              )}

              {/* 色温控制 */}
              {hasColorTemp && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-400">色温</label>
                    <span className="text-white font-medium">{colorTemp}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">暖光</span>
                    <input
                      type="range"
                      className="slider flex-1"
                      min="0"
                      max="100"
                      value={colorTemp}
                      onChange={(e) => setColorTemp(Number(e.target.value))}
                      onMouseUp={(e) => handleColorTemp(Number((e.target as HTMLInputElement).value))}
                    />
                    <span className="text-xs text-gray-400">冷光</span>
                  </div>
                </div>
              )}

              {/* RGB颜色控制 */}
              {hasRGB && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-3">RGB颜色</label>
                  <div className="grid grid-cols-6 gap-2">
                    {["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#FFFFFF", "#FFA500", "#800080", "#008000", "#000080", "#808080"].map((color) => (
                      <button
                        key={color}
                        onClick={() => handleRGB(color)}
                        className="w-full h-10 rounded-lg border-2 border-white/20 hover:border-white/50 transition-all"
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 场景切换 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">场景切换</label>
                <div className="grid grid-cols-2 gap-3">
                  <button className="btn btn-secondary">会议模式</button>
                  <button className="btn btn-secondary">演示模式</button>
                  <button className="btn btn-secondary">休息模式</button>
                  <button className="btn btn-secondary">清洁模式</button>
                </div>
              </div>
            </div>
          )}

          {/* 窗帘设备 */}
          {(device.type === 1860 || device.type === 1861 || device.type === 1862) && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">窗帘控制</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => onControl(device.did, "level", [0], device.meshid, 1000)}
                    className="btn btn-secondary flex-1"
                  >
                    <i className="fas fa-arrow-up"></i>
                    <span>打开</span>
                  </button>
                  <button
                    onClick={() => onControl(device.did, "level", [50], device.meshid, 0)}
                    className="btn btn-secondary flex-1"
                  >
                    <i className="fas fa-stop"></i>
                    <span>停止</span>
                  </button>
                  <button
                    onClick={() => onControl(device.did, "level", [100], device.meshid, 1000)}
                    className="btn btn-secondary flex-1"
                  >
                    <i className="fas fa-arrow-down"></i>
                    <span>关闭</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 面板设备 */}
          {device.type === 1218 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">按键配置</label>
                <p className="text-sm text-gray-500">面板设备支持场景绑定</p>
              </div>
            </div>
          )}

          {/* 传感器设备 */}
          {device.type === 1344 && (
            <div className="space-y-6">
              <div className="p-4 bg-white/5 rounded-lg">
                <label className="block text-sm font-medium text-gray-400 mb-2">传感器状态</label>
                <p className="text-lg text-white font-medium">{device.value?.[0] || "N/A"}</p>
              </div>
            </div>
          )}

          {/* 设备详情 */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <h4 className="text-sm font-medium text-gray-400 mb-3">设备信息</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">设备类型</span>
                <span className="text-white">{DEVICE_TYPE_LABELS[device.type] || `类型${device.type}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">产品ID</span>
                <span className="text-white">{device.pid}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">固件版本</span>
                <span className="text-white">{device.ver}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Mesh ID</span>
                <span className="text-white text-xs">{device.meshid}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ==================== 自动化页面 ====================
interface ScheduledTask {
  id: string;
  name: string;
  deviceId: string | null;
  sceneId: string | null;
  cronExpr: string;
  action: string;
  value: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string;
  device: { id: string; name: string; type: number; meshId: string | null; func: number } | null;
  scene: { id: string; name: string } | null;
}

interface AutomationScene {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  isCustom: boolean;
  showInQuick: boolean;
  sceneId?: number;
  meshId?: string | null;
  actions?: SceneAction[];
}

function AutomationPage({ devices }: { devices: DbDevice[] }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [scenes, setScenes] = useState<AutomationScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load tasks and scenes
  const loadData = useCallback(async () => {
    try {
      const [tasksRes, scenesRes] = await Promise.all([
        fetch("/api/scheduler/tasks"),
        fetch("/api/scenes"),
      ]);
      const tasksData = await tasksRes.json();
      const scenesData = await scenesRes.json();
      if (tasksData.tasks) setTasks(tasksData.tasks);
      if (scenesData.scenes) setScenes(scenesData.scenes);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle task enabled/disabled
  const handleToggle = async (taskId: string) => {
    try {
      const res = await fetch(`/api/scheduler/tasks/${taskId}/toggle`, { method: "POST" });
      const data = await res.json();
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, enabled: data.enabled } : t))
      );
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  // Delete task
  const handleDelete = async (taskId: string) => {
    if (!confirm("确定要删除此定时任务吗？")) return;
    try {
      await fetch(`/api/scheduler/tasks/${taskId}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("删除失败");
    }
  };

  // Run task immediately
  const handleRunNow = async (task: ScheduledTask) => {
    try {
      const res = await fetch(`/api/scheduler/tasks/${task.id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "执行失败");
        return;
      }
      alert(`已执行任务 "${task.name}"`);
      await loadData();
    } catch (err) {
      console.error("Run task failed:", err);
      alert("执行失败");
    }
  };

  // Edit task
  const handleEdit = (task: ScheduledTask | null) => {
    setEditingTask(task);
    setShowModal(true);
  };

  // Cron 表达式描述
  const describeCron = (cronExpr: string): string => {
    try {
      const parts = cronExpr.trim().split(/\s+/);
      if (parts.length !== 5) return cronExpr;
      const [minute, hour, , , dayOfWeek] = parts;
      const timeStr =
        hour !== "*" && minute !== "*"
          ? `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
          : null;
      if (dayOfWeek !== "*" && dayOfWeek !== "?") {
        const dayNames: Record<string, string> = { "0": "周日", "1": "周一", "2": "周二", "3": "周三", "4": "周四", "5": "周五", "6": "周六" };
        const days = dayOfWeek.split(",").map((d) => dayNames[d] || d);
        return timeStr ? `每${days.join("/")} ${timeStr}` : `每${days.join("/")}`;
      }
      if (timeStr) return `每天 ${timeStr}`;
      return cronExpr;
    } catch {
      return cronExpr;
    }
  };

  // Get action description
  const getActionDesc = (task: ScheduledTask): string => {
    if (task.action === "scene" && task.scene) {
      return `激活场景: ${task.scene.name}`;
    }
    const valueMap: Record<string, string> = {
      onoff: "开关",
      level: "调光",
      curtain: "窗帘",
      ctl: "色温",
      color: "彩光",
    };
    try {
      const vals = JSON.parse(task.value || "[]");
      const valStr = vals.length > 0 ? vals.join(", ") : "";
      return `${valueMap[task.action] || task.action}${valStr ? ` (${valStr})` : ""}`;
    } catch {
      return valueMap[task.action] || task.action;
    }
  };

  // Get device type icon
  const getDeviceIcon = (task: ScheduledTask): string => {
    if (task.action === "scene") return "fa-magic";
    const typeMap: Record<number, string> = {
      1984: "fa-lightbulb",
      1860: "fa-warehouse",
      1861: "fa-warehouse",
      1862: "fa-warehouse",
      1218: "fa-th-large",
      1344: "fa-broadcast-tower",
    };
    return typeMap[task.device?.type || 0] || "fa-microchip";
  };

  return (
    <div className="fade-in">
      {mounted && showModal && (
        <TaskEditModal
          task={editingTask}
          devices={devices}
          scenes={scenes}
          onClose={() => {
            setShowModal(false);
            setEditingTask(null);
          }}
          onSave={async () => {
            await loadData();
            setShowModal(false);
            setEditingTask(null);
          }}
        />
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">定时任务</h3>
          <button className="btn btn-primary" onClick={() => handleEdit(null)}>
            <i className="fas fa-plus" />
            <span>新建任务</span>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <i className="fas fa-spinner fa-spin text-blue-400 text-xl" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-clock text-2xl text-gray-500" />
            </div>
            <p className="text-gray-400 mb-2">暂无定时任务</p>
            <p className="text-gray-500 text-sm">点击上方按钮创建第一个自动化任务</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-all ${
                  !task.enabled ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <i className={`fas ${getDeviceIcon(task)} text-blue-400`} />
                    </div>

                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-white">{task.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          task.action === "scene"
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-blue-500/20 text-blue-400"
                        }`}>
                          {task.action === "scene" ? "场景" : "设备"}
                        </span>
                        {!task.enabled && (
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">
                            已禁用
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {getActionDesc(task)}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>
                          <i className="fas fa-clock mr-1" />
                          {describeCron(task.cronExpr)}
                        </span>
                        {task.nextRun && (
                          <span>
                            <i className="fas fa-calendar mr-1" />
                            下次: {new Date(task.nextRun).toLocaleString("zh-CN")}
                          </span>
                        )}
                        {task.lastRun && (
                          <span>
                            <i className="fas fa-history mr-1" />
                            上次: {new Date(task.lastRun).toLocaleString("zh-CN")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(task.id)}
                      className={`w-12 h-6 rounded-full transition-all relative ${
                        task.enabled ? "bg-blue-500" : "bg-gray-600"
                      }`}
                      title={task.enabled ? "点击禁用" : "点击启用"}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow ${
                          task.enabled ? "left-6" : "left-0.5"
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => handleRunNow(task)}
                      className="btn btn-secondary text-sm"
                      title="立即执行"
                    >
                      <i className="fas fa-play" />
                    </button>
                    <button
                      onClick={() => handleEdit(task)}
                      className="btn btn-secondary text-sm"
                      title="编辑"
                    >
                      <i className="fas fa-pen" />
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="btn btn-secondary text-sm text-red-400 hover:text-red-300"
                      title="删除"
                    >
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {devices.length === 0 && tasks.length === 0 && (
          <p className="text-center text-gray-400 mt-6">
            <i className="fas fa-info-circle mr-2" />
            请先连接网关获取设备数据
          </p>
        )}
      </div>

      {/* Cron 配置说明 */}
      <div className="card mt-6">
        <h3 className="text-lg font-bold text-white mb-4">Cron 表达式说明</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="p-3 bg-white/5 rounded-lg">
            <code className="text-blue-400">0 8 * * *</code>
            <p className="text-gray-400 mt-1">每天 08:00</p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg">
            <code className="text-blue-400">30 18 * * 1-5</code>
            <p className="text-gray-400 mt-1">工作日 18:30</p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg">
            <code className="text-blue-400">0 7 * * 0,6</code>
            <p className="text-gray-400 mt-1">周末 07:00</p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg">
            <code className="text-blue-400">0 22 * * *</code>
            <p className="text-gray-400 mt-1">每天 22:00</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 任务编辑弹窗 ====================
function TaskEditModal({
  task,
  devices,
  scenes,
  onClose,
  onSave,
}: {
  task: ScheduledTask | null;
  devices: DbDevice[];
  scenes: AutomationScene[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(task?.name || "");
  const [taskType, setTaskType] = useState<"device" | "scene">(
    task?.action === "scene" ? "scene" : "device"
  );
  const [selectedDeviceId, setSelectedDeviceId] = useState(task?.deviceId || "");
  const [selectedSceneId, setSelectedSceneId] = useState(task?.sceneId || "");
  const [action, setAction] = useState(task?.action || "onoff");
  const [value, setValue] = useState<number[]>(() => {
    try {
      return JSON.parse(task?.value || "[]");
    } catch {
      return [];
    }
  });
  const [time, setTime] = useState(() => {
    if (task?.cronExpr) {
      const parts = task.cronExpr.split(" ");
      if (parts.length === 5 && parts[1] !== "*" && parts[0] !== "*") {
        return `${parts[1].padStart(2, "0")}:${parts[0].padStart(2, "0")}`;
      }
    }
    return "08:00";
  });
  const [daysType, setDaysType] = useState<"daily" | "weekdays" | "weekends">("daily");
  const [saving, setSaving] = useState(false);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);

  // 获取设备可用的动作类型
  const getDeviceActions = (device: DbDevice): { value: string; label: string }[] => {
    const actions: { value: string; label: string }[] = [];
    const func = device.func;
    const funcs = device.funcs || [];

    // 基础开关
    if (func === 2 || funcs.includes(2)) actions.push({ value: "onoff", label: "开关" });

    // 调光
    if (func === 3 || funcs.includes(3)) actions.push({ value: "level", label: "调光" });

    // 色温
    if (func === 4 || funcs.includes(4)) actions.push({ value: "ctl", label: "色温" });

    // 彩光
    if (func === 5 || funcs.includes(5)) actions.push({ value: "color", label: "彩光" });

    // 窗帘
    if (device.type === 1860 || device.type === 1861 || device.type === 1862) {
      actions.push({ value: "curtain", label: "窗帘" });
    }

    return actions.length > 0 ? actions : [{ value: "onoff", label: "开关" }];
  };

  // 构建 cron 表达式
  const buildCronExpr = (): string => {
    const [hour, minute] = time.split(":").map(Number);
    switch (daysType) {
      case "weekdays":
        return `${minute} ${hour} * * 1-5`;
      case "weekends":
        return `${minute} ${hour} * * 0,6`;
      default:
        return `${minute} ${hour} * * *`;
    }
  };

  // 处理保存
  const handleSave = async () => {
    if (!name.trim()) {
      alert("请输入任务名称");
      return;
    }

    if (taskType === "device" && !selectedDeviceId) {
      alert("请选择设备");
      return;
    }

    if (taskType === "scene" && !selectedSceneId) {
      alert("请选择场景");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        cronExpr: buildCronExpr(),
      };

      if (taskType === "device") {
        payload.deviceId = selectedDeviceId;
        payload.sceneId = null;
        payload.action = action;
        payload.value = value;
      } else {
        payload.deviceId = null;
        payload.sceneId = selectedSceneId;
        payload.action = "scene";
        payload.value = [];
      }

      const url = task
        ? `/api/scheduler/tasks/${task.id}`
        : "/api/scheduler/tasks";
      const method = task ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "保存失败");
      }

      onSave();
    } catch (err) {
      console.error("Save failed:", err);
      alert(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 渲染值输入控件
  const renderValueInput = () => {
    if (taskType === "scene") {
      return (
        <div className="text-sm text-gray-400">
          执行场景时不需要配置动作值
        </div>
      );
    }

    switch (action) {
      case "onoff":
        return (
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="onoff"
                checked={value[0] === 1}
                onChange={() => setValue([1])}
                className="w-4 h-4"
              />
              <span className="text-white">开</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="onoff"
                checked={value[0] === 0}
                onChange={() => setValue([0])}
                className="w-4 h-4"
              />
              <span className="text-white">关</span>
            </label>
          </div>
        );

      case "level":
        return (
          <div>
            <input
              type="range"
              min="0"
              max="100"
              value={value[0] || 0}
              onChange={(e) => setValue([parseInt(e.target.value)])}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>0%</span>
              <span className="text-white">{value[0] || 0}%</span>
              <span>100%</span>
            </div>
          </div>
        );

      case "ctl":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">亮度</label>
              <input
                type="range"
                min="0"
                max="100"
                value={value[0] || 0}
                onChange={(e) => setValue([parseInt(e.target.value), value[1] || 50])}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-right text-sm text-white">{value[0] || 0}%</div>
            </div>
            <div>
              <label className="text-sm text-gray-400">色温</label>
              <input
                type="range"
                min="0"
                max="100"
                value={value[1] || 50}
                onChange={(e) => setValue([value[0] || 0, parseInt(e.target.value)])}
                className="w-full h-2 bg-gradient-to-r from-blue-300 to-orange-300 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-sm text-gray-400">
                <span>冷</span>
                <span className="text-white">{value[1] || 50}</span>
                <span>暖</span>
              </div>
            </div>
          </div>
        );

      case "curtain":
        return (
          <div>
            <input
              type="range"
              min="0"
              max="100"
              value={value[0] || 0}
              onChange={(e) => setValue([parseInt(e.target.value)])}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>关闭</span>
              <span className="text-white">{value[0] || 0}%</span>
              <span>打开</span>
            </div>
          </div>
        );

      case "color":
        return (
          <div>
            <input
              type="range"
              min="0"
              max="100"
              value={value[0] || 50}
              onChange={(e) => setValue([parseInt(e.target.value), value[1] || 50, value[2] || 50])}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>亮度: {value[0] || 50}%</span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const deviceActions = selectedDevice ? getDeviceActions(selectedDevice) : [];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className="bg-gradient-to-b from-[#1a1f2e] to-[#151a28] rounded-xl p-6 w-full max-w-lg shadow-2xl border border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white">
              {task ? "编辑定时任务" : "新建定时任务"}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <i className="fas fa-times text-xl" />
            </button>
          </div>

          {/* Form */}
          <div className="space-y-5">
            {/* 任务名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                任务名称
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：每天早上开灯"
                className="input-field w-full"
              />
            </div>

            {/* 任务类型 */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                任务类型
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    checked={taskType === "device"}
                    onChange={() => setTaskType("device")}
                    className="w-4 h-4"
                  />
                  <span className="text-white">设备控制</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    checked={taskType === "scene"}
                    onChange={() => setTaskType("scene")}
                    className="w-4 h-4"
                  />
                  <span className="text-white">场景激活</span>
                </label>
              </div>
            </div>

            {/* 设备/场景选择 */}
            {taskType === "device" ? (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  选择设备
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    setSelectedDeviceId(e.target.value);
                    const dev = devices.find((d) => d.id === e.target.value);
                    if (dev) {
                      const actions = getDeviceActions(dev);
                      if (actions.length > 0) setAction(actions[0].value);
                    }
                  }}
                  className="input-field w-full"
                >
                  <option value="">请选择设备</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({DEVICE_TYPE_LABELS[d.type] || `类型${d.type}`})
                    </option>
                  ))}
                </select>

                {/* 动作类型 */}
                {selectedDeviceId && deviceActions.length > 0 && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      动作类型
                    </label>
                    <select
                      value={action}
                      onChange={(e) => {
                        setAction(e.target.value);
                        // 根据动作类型设置默认值
                        switch (e.target.value) {
                          case "onoff":
                            setValue([1]);
                            break;
                          case "level":
                            setValue([50]);
                            break;
                          case "ctl":
                            setValue([50, 50]);
                            break;
                          case "curtain":
                            setValue([100]);
                            break;
                          default:
                            setValue([]);
                        }
                      }}
                      className="input-field w-full"
                    >
                      {deviceActions.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  选择场景
                </label>
                <select
                  value={selectedSceneId}
                  onChange={(e) => setSelectedSceneId(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">请选择场景</option>
                  {scenes.filter((s) => s.isCustom).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 执行时间 */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                执行时间
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="input-field w-full"
              />
            </div>

            {/* 重复模式 */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                重复模式
              </label>
              <div className="flex gap-4">
                {[
                  { value: "daily", label: "每天" },
                  { value: "weekdays", label: "工作日" },
                  { value: "weekends", label: "周末" },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="daysType"
                      checked={daysType === opt.value}
                      onChange={() => setDaysType(opt.value as "daily" | "weekdays" | "weekends")}
                      className="w-4 h-4"
                    />
                    <span className="text-white">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 动作值配置 */}
            {(taskType === "device" && selectedDeviceId) && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  动作值
                </label>
                {renderValueInput()}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="mt-6 p-3 bg-white/5 rounded-lg">
            <div className="text-sm text-gray-400">
              <i className="fas fa-clock mr-1" />
              执行计划：
            </div>
            <div className="text-white mt-1">
              {name || "未命名任务"} - {time} - {
                daysType === "daily" ? "每天" :
                daysType === "weekdays" ? "工作日" : "周末"
              }
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="btn btn-secondary flex-1">
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary flex-1"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
