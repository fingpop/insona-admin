"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Device, useDevices } from "@/hooks/useDevices";
import { DEVICE_TYPE_LABELS, FUNC_LABELS } from "@/lib/types";
import Link from "next/link";

export default function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { controlDevice, updateDevice, refetch } = useDevices();
  const [device, setDevice] = useState<Device | null>(null);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [controlling, setControlling] = useState(false);

  useEffect(() => {
    fetch(`/api/devices/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { router.push("/devices"); return; }
        setDevice(d.device);
      })
      .finally(() => setLoading(false));

    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []));
  }, [id, router]);

  const handleControl = useCallback(
    async (action: string, value: number[]) => {
      if (!device?.meshId) return;
      setControlling(true);
      try {
        await controlDevice(device.id, action, value, device.meshId);
        refetch();
        // Refresh device detail
        const res = await fetch(`/api/devices/${id}`);
        const d = await res.json();
        if (d.device) setDevice(d.device);
      } catch (err) {
        alert(err instanceof Error ? err.message : "控制失败");
      } finally {
        setControlling(false);
      }
    },
    [device, controlDevice, refetch, id]
  );

  const handleUpdate = useCallback(
    async (updates: Partial<Pick<Device, "name" | "roomId" | "ratedPower">>) => {
      if (!device) return;
      const updated = await updateDevice(device.id, updates);
      setDevice((prev) => (prev ? { ...prev, ...updated } : prev));
    },
    [device, updateDevice]
  );

  if (loading) {
    return <div className="p-6 text-[#4a5b70] text-sm">加载中...</div>;
  }

  if (!device) {
    return <div className="p-6 text-red-400 text-sm">设备未找到</div>;
  }

  const valueArr: number[] = JSON.parse(device.value || "[]");
  const online = device.alive === 1;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/devices" className="text-sm text-[#3b9eff] hover:underline flex items-center gap-1">
        ← 返回设备列表
      </Link>

      {/* Header */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-white">{device.name}</h1>
          <span className={`text-xs px-2 py-1 rounded-full ${
            online ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"
          }`}>
            {online ? "在线" : "离线"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoItem label="设备类型" value={DEVICE_TYPE_LABELS[device.type] ?? `类型${device.type}`} />
          <InfoItem label="功能类型" value={FUNC_LABELS[device.func] ?? `功能${device.func}`} />
          <InfoItem label="设备ID" value={device.id} />
          <InfoItem label="房间" value={device.room?.name ?? "未分配"} />
          <InfoItem label="网关名称" value={device.gatewayName || device.name} />
          <InfoItem label="额定功率" value={`${device.ratedPower} W`} />
        </div>
      </div>

      {/* Controls */}
      {online && device.meshId && (
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5 space-y-5">
          <h2 className="text-sm font-medium text-white">设备控制</h2>

          {/* Power toggle */}
          <ControlRow label="电源开关">
            <button
              onClick={() => handleControl("onoff", valueArr[0] === 1 ? [0] : [1])}
              disabled={controlling}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                valueArr[0] === 1
                  ? "bg-[#137fec] text-white"
                  : "bg-[#1c2630] text-[#8a9baf]"
              } ${controlling ? "opacity-50" : ""}`}
            >
              {valueArr[0] === 1 ? "关闭" : "打开"}
            </button>
          </ControlRow>

          {/* Brightness (func 3, 4, 5) */}
          {(device.func === 3 || device.func === 4 || device.func === 5) && (
            <ControlRow label={`亮度 (${valueArr[0] ?? 0}%)`}>
              <input
                type="range"
                min={0}
                max={100}
                value={valueArr[0] ?? 0}
                onChange={(e) => handleControl("level", [parseInt(e.target.value)])}
                disabled={controlling}
                className="flex-1 accent-[#137fec]"
              />
            </ControlRow>
          )}

          {/* Color temperature (func 4) */}
          {device.func === 4 && (
            <ControlRow label={`色温 (${valueArr[1] ?? 0}%)`}>
              <div className="flex items-center gap-2 text-xs text-[#4a5b70]">
                <span>暖</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={valueArr[1] ?? 0}
                  onChange={(e) => handleControl("temperature", [parseInt(e.target.value)])}
                  disabled={controlling}
                  className="flex-1 accent-orange-400"
                />
                <span>冷</span>
              </div>
            </ControlRow>
          )}

          {/* Curtain controls (func 3 + curtain types) */}
          {[1860, 1861, 1862].includes(device.type) && (
            <ControlRow label="窗帘控制">
              <div className="flex gap-2">
                <button
                  onClick={() => handleControl("level", [0])}
                  disabled={controlling}
                  className="px-4 py-2 bg-[#1c2630] text-[#c0cad8] text-sm rounded-md hover:bg-[#253040] disabled:opacity-50"
                >
                  关闭
                </button>
                <button
                  onClick={() => handleControl("curtainStop", [])}
                  disabled={controlling}
                  className="px-4 py-2 bg-[#1c2630] text-[#c0cad8] text-sm rounded-md hover:bg-[#253040] disabled:opacity-50"
                >
                  停止
                </button>
                <button
                  onClick={() => handleControl("level", [100])}
                  disabled={controlling}
                  className="px-4 py-2 bg-[#1c2630] text-[#c0cad8] text-sm rounded-md hover:bg-[#253040] disabled:opacity-50"
                >
                  打开
                </button>
              </div>
            </ControlRow>
          )}
        </div>
      )}

      {/* Settings */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white">参数设置</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#4a5b70] mb-1">设备名称</label>
            <input
              type="text"
              defaultValue={device.name}
              onBlur={(e) => handleUpdate({ name: e.target.value })}
              className="w-full bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#137fec]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#4a5b70] mb-1">所属房间</label>
            <select
              defaultValue={device.roomId ?? ""}
              onChange={(e) => handleUpdate({ roomId: e.target.value || undefined })}
              className="w-full bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#137fec]"
            >
              <option value="">未分配</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#4a5b70] mb-1">额定功率 (W)</label>
            <input
              type="number"
              defaultValue={device.ratedPower}
              onBlur={(e) => handleUpdate({ ratedPower: parseFloat(e.target.value) })}
              className="w-full bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#137fec]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#4a5b70]">{label}</p>
      <p className="text-[#c0cad8] text-sm truncate" title={value}>{value}</p>
    </div>
  );
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-[#8a9baf] whitespace-nowrap">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
