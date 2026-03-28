"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useDevices, Device } from "@/hooks/useDevices";

export default function RoomDetailPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const { devices, controlDevice, refetch } = useDevices({ roomId });
  const [roomName, setRoomName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => {
        const room = d.rooms?.find((r: { id: string }) => r.id === roomId);
        if (room) setRoomName(room.name);
      })
      .finally(() => setLoading(false));
  }, [roomId]);

  const handleToggle = async (device: Device, e: React.MouseEvent) => {
    e.preventDefault();
    if (!device.meshId) return;
    const value = JSON.parse(device.value || "[]");
    const newValue = value[0] === 1 ? [0] : [1];
    try {
      await controlDevice(device.id, "onoff", newValue, device.meshId);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "控制失败");
    }
  };

  if (loading) return <div className="p-6 text-[#4a5b70] text-sm">加载中...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <Link href="/rooms" className="text-sm text-[#3b9eff] hover:underline">← 返回房间列表</Link>
      <h1 className="text-xl font-semibold text-white">{roomName || "房间"}</h1>

      {/* Batch controls */}
      {devices.length > 0 && devices.some((d) => d.alive === 1 && d.meshId) && (
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const online = devices.filter((d) => d.alive === 1 && d.meshId);
              await Promise.all(online.map((d) => controlDevice(d.id, "onoff", [1], d.meshId!)));
              refetch();
            }}
            className="px-4 py-2 bg-[#137fec] hover:bg-[#0d6dd9] text-white text-sm rounded-md transition-colors"
          >
            全部打开
          </button>
          <button
            onClick={async () => {
              const online = devices.filter((d) => d.alive === 1 && d.meshId);
              await Promise.all(online.map((d) => controlDevice(d.id, "onoff", [0], d.meshId!)));
              refetch();
            }}
            className="px-4 py-2 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-sm rounded-md transition-colors"
          >
            全部关闭
          </button>
        </div>
      )}

      {devices.length === 0 ? (
        <p className="text-[#4a5b70] text-sm py-10 text-center">此房间暂无设备</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {devices.map((device) => {
            const valueArr: number[] = JSON.parse(device.value || "[]");
            const isOn = valueArr[0] === 1;
            const online = device.alive === 1;
            return (
              <div key={device.id} className="bg-[#101922] border border-[#1c2630] rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{device.name}</p>
                  <p className="text-xs text-[#4a5b70]">{online ? "在线" : "离线"}</p>
                </div>
                <button
                  onClick={(e) => handleToggle(device, e)}
                  disabled={!online || !device.meshId}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    isOn ? "bg-[#137fec]" : "bg-[#253040]"
                  } ${!online || !device.meshId ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isOn ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
