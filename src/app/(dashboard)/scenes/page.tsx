"use client";

import { useCallback, useEffect, useState } from "react";

interface Scene {
  id: string;
  sceneId: number;
  name: string;
  color: string;
  icon: string;
}

export default function ScenesPage() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<number | null>(null);
  const [activatingMsg, setActivatingMsg] = useState("");

  const fetchScenes = useCallback(() => {
    setLoading(true);
    fetch("/api/scenes")
      .then((r) => r.json())
      .then((d) => setScenes(d.scenes ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchScenes(); }, [fetchScenes]);

  const activateScene = async (sceneId: number, sceneName: string) => {
    setActivating(sceneId);
    setActivatingMsg(`正在触发「${sceneName}」...`);
    try {
      // Need to get meshId from devices for the control command
      const res = await fetch("/api/devices");
      const data = await res.json();
      const devices: { meshId: string | null }[] = data.devices ?? [];
      const meshIds = Array.from(new Set(devices.map((d) => d.meshId).filter(Boolean) as string[]));

      if (meshIds.length === 0) {
        alert("未找到网络区域，无法触发场景");
        return;
      }

      // Use first meshId (could be improved to use scene's meshId)
      const res2 = await fetch("/api/scenes/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId, meshid: meshIds[0] }),
      });
      const result = await res2.json();
      if (!res2.ok) throw new Error(result.error);
      setActivatingMsg(`「${sceneName}」已触发`);
    } catch (err) {
      setActivatingMsg(err instanceof Error ? err.message : "触发失败");
    } finally {
      setTimeout(() => {
        setActivating(null);
        setActivatingMsg("");
      }, 2000);
    }
  };

  // 全开/全关功能
  const controlAllDevices = async (action: "on" | "off") => {
    setActivating(-1);
    setActivatingMsg(`正在执行${action === "on" ? "全开" : "全关"}...`);
    try {
      const res = await fetch("/api/devices");
      const data = await res.json();
      const devices: { meshId: string | null }[] = data.devices ?? [];
      const meshIds = Array.from(new Set(devices.map((d) => d.meshId).filter(Boolean) as string[]));

      if (meshIds.length === 0) {
        alert("未找到网络区域");
        return;
      }

      // 对每个 mesh 发送全开/全关指令
      for (const meshid of meshIds) {
        const res2 = await fetch("/api/devices/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            did: "00",
            action: "onoff",
            value: action === "on" ? [1] : [0],
            meshid,
            transition: 750,
          }),
        });
        const result = await res2.json();
        if (!res2.ok) {
          throw new Error(result.error || `控制 mesh ${meshid} 失败`);
        }
      }

      setActivatingMsg(`${action === "on" ? "全开" : "全关"}执行成功`);
    } catch (err) {
      setActivatingMsg(err instanceof Error ? err.message : "执行失败");
    } finally {
      setTimeout(() => {
        setActivating(null);
        setActivatingMsg("");
      }, 2000);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">场景管理</h1>
        <div className="flex gap-2">
          <button
            onClick={() => controlAllDevices("on")}
            disabled={activating !== null}
            className="px-4 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 text-sm rounded-md transition-colors disabled:opacity-50"
          >
            <i className="fas fa-power-off mr-1"></i>
            全开
          </button>
          <button
            onClick={() => controlAllDevices("off")}
            disabled={activating !== null}
            className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-md transition-colors disabled:opacity-50"
          >
            <i className="fas fa-power-off mr-1"></i>
            全关
          </button>
          <button
            onClick={fetchScenes}
            className="px-4 py-2 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-sm rounded-md transition-colors"
          >
            同步场景
          </button>
        </div>
      </div>

      {activatingMsg && (
        <div className="bg-[#137fec]/10 border border-[#137fec]/30 text-[#3b9eff] text-sm rounded-md px-4 py-3">
          {activatingMsg}
        </div>
      )}

      {loading ? (
        <p className="text-[#4a5b70] text-sm">加载中...</p>
      ) : scenes.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[#4a5b70] text-sm mb-3">暂无场景数据</p>
          <p className="text-[#3a4b5a] text-xs">
            请在 inSona APP 中配置场景后，点击「同步场景」获取
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              onClick={() => activateScene(scene.sceneId, scene.name)}
              disabled={activating !== null}
              className="bg-[#101922] border border-[#1c2630] rounded-lg p-5 text-center hover:border-[#253040] hover:bg-[#0d1520] transition-all group disabled:opacity-50"
            >
              {/* Scene icon circle */}
              <div
                className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl"
                style={{ backgroundColor: `${scene.color}20`, color: scene.color }}
              >
                ⚡
              </div>
              <p className="text-sm font-medium text-white group-hover:text-[#3b9eff] transition-colors">
                {scene.name}
              </p>
              <p className="text-xs text-[#4a5b70] mt-1">场景 {scene.sceneId}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
