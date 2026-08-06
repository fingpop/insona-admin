"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useGatewayEvents } from "@/hooks/useGatewayEvents";
import { useTranslation } from "@/hooks/useTranslation";
import { InSonaDevice } from "@/lib/types";
import { DbDevice, SpaceNode } from "./types";
import { toInSonaDevice, parseDeviceValue, parseGatewayStatusValue, transformRoomsToSpaces } from "./utils";
import HomeLayout from "./home-layout";
import Sidebar from "./sidebar";
import Header from "./header";
import DeviceDrawer from "./device-drawer";
import DevicesPage from "./tabs/devices-page";
import RoomsPage from "./tabs/rooms-page";
import ScenesPage from "./tabs/scenes-page";
import EnergyPage from "./tabs/energy-page";
import LogsPage from "./tabs/logs-page";
import SettingsPage from "./tabs/settings-page";
import AutomationPage from "./tabs/automation-page";
import PanelSceneLinkage from "./tabs/panel-linkage";

// 动态导入组设备页面（避免打包问题）
const GroupsPage = dynamic(() => import("@/app/(dashboard)/groups/page"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <i className="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
    </div>
  ),
});

export default function ControlPanel() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState<string>("dashboard");
  const [gatewayStatus, setGatewayStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  const [dbDevices, setDbDevices] = useState<DbDevice[]>([]);
  const [spaces, setSpaces] = useState<SpaceNode[]>([]);
  const [devices, setDevices] = useState<InSonaDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<InSonaDevice | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 当 devices 列表更新时，同步 selectedDevice 的最新状态
  // Use ref to avoid re-triggering on selectedDevice changes
  const selectedDeviceRef = useRef(selectedDevice);
  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  useEffect(() => {
    if (!selectedDeviceRef.current || !drawerOpen) return;
    const updated = devices.find((d) => d.did === selectedDeviceRef.current!.did);
    if (updated && updated !== selectedDeviceRef.current) {
      setSelectedDevice(updated);
    }
  }, [devices, drawerOpen]); // Removed selectedDevice from deps to prevent render cascades

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
              let finalValue: number[];
              if (status.length >= 1) {
                const statusType = status[0];
                if (statusType === 4 && status.length >= 3) {
                  finalValue = [1, status[1], status[2]];
                } else {
                  finalValue = parseDeviceValue(rawValue, func);
                }
              } else {
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
        const scPayload = event.payload as Record<string, unknown>;
        const did = String(scPayload.did ?? "");
        const func = Number(scPayload.func ?? 0);
        const rawValue = (scPayload.value as number[]) ?? [];
        const rawStatus = (scPayload.status as number[]) ?? [];
        const meshid = scPayload.meshid ? String(scPayload.meshid) : undefined;

        const parsedValue = parseGatewayStatusValue(rawStatus, rawValue, func);

        const update: Partial<InSonaDevice> = {
          did,
          value: parsedValue,
          meshid: meshid as InSonaDevice["meshid"],
        };

        handleDeviceUpdate(update as InSonaDevice);
      } else if (event.type === "s.event" && event.payload) {
        const payload = event.payload as Record<string, unknown>;
        if (payload.evt === "status" && payload.did) {
          const did = String(payload.did);
          const func = Number(payload.func ?? 0);
          const rawValue = (payload.value as number[]) ?? [];
          const rawStatus = (payload.status as number[]) ?? [];
          const meshid = payload.meshid ? String(payload.meshid) : undefined;

          const parsedValue = parseGatewayStatusValue(rawStatus, rawValue, func);

          const update: Partial<InSonaDevice> = {
            did,
            value: parsedValue,
            meshid: meshid as InSonaDevice["meshid"],
          };

          handleDeviceUpdate(update as InSonaDevice);
        } else if (payload.evt === "energy" && payload.did) {
          const did = String(payload.did);
          const power = Number(payload.power ?? 0);

          handleDeviceUpdate({
            did,
            power,
          } as InSonaDevice);
        }
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // 页面加载时：获取网关状态 + 自动重连 + 加载设备
  useEffect(() => {
    const init = async () => {
      try {
        const [gateways] = await Promise.all([
          refreshGatewayStatus(),
          queryDevices(),
          (async () => {
            try {
              const todayEnergyRes = await fetch("/api/energy/today");
              const todayEnergyData = await todayEnergyRes.json();
              if (todayEnergyData.deviceStats) {
                const energyMap = new Map<string, { todayKwh: number; power: number }>(
                  todayEnergyData.deviceStats.map((stat: {
                    deviceId: string;
                    totalKwh: number;
                    latestPower: number;
                  }) => [stat.deviceId, { todayKwh: stat.totalKwh, power: stat.latestPower }])
                );
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
          })(),
        ]);

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
    if (["devices", "rooms", "scenes", "energy", "automation"].includes(currentPage)) {
      const needEnergy = ["devices", "energy"].includes(currentPage);
      queryDevices(needEnergy);
    }
  }, [currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const queryDevices = async (includeEnergy = true) => {
    try {
      const devicesUrl = includeEnergy ? "/api/devices" : "/api/devices?noEnergy=true";
      const [devicesRes, spacesRes] = await Promise.all([
        fetch(devicesUrl),
        fetch("/api/rooms"),
      ]);
      const devicesData = await devicesRes.json();
      const spacesData = await spacesRes.json();

      if (devicesData.devices) {
        setDbDevices(devicesData.devices);
        setDevices(devicesData.devices.map(toInSonaDevice));
      }
      if (spacesData.rooms) {
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

  // 只统计房间数量（排除建筑和楼层）
  const countRooms = (nodes: SpaceNode[]): number => {
    return nodes.reduce((sum, node) => {
      if (node.type === "room") {
        return sum + 1;
      }
      return sum + (node.children ? countRooms(node.children) : 0);
    }, 0);
  };

  const getDeviceRoomName = (roomId: string) => {
    if (!roomId) return t("devices.notBound");
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
    return name || t("devices.space", { roomId });
  };

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        gatewayStatus={gatewayStatus}
      />

      {/* 主内容 */}
      <main className="ml-[260px] w-[calc(100vw-260px)] min-w-0">
        {/* 顶部导航 */}
        <Header
          currentPage={currentPage}
          gatewayStatus={gatewayStatus}
        />

        {/* 页面内容 */}
        <div className="p-4">
          {currentPage === "dashboard" && (
            <HomeLayout
              gatewayStatus={gatewayStatus}
            />
          )}
          {currentPage === "devices" && (
            <DevicesPage
              devices={dbDevices.map(toInSonaDevice)}
              rooms={dbDevices}
              spaces={spaces}
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
            <ScenesPage onActivateScene={async (sceneId: number, meshid: string) => {
              await fetch("/api/scenes/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sceneId, meshid }),
              });
            }} devices={devices} spaces={spaces} />
          )}
          {currentPage === "panel-linkage" && (
            <PanelSceneLinkage />
          )}
          {currentPage === "automation" && (
            <AutomationPage devices={dbDevices} />
          )}
          {currentPage === "energy" && (
            <EnergyPage dbDevices={dbDevices} spaces={spaces} />
          )}
          {currentPage === "logs" && (
            <LogsPage />
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
