"use client";

import { useState, useMemo, useCallback } from "react";
import { useDeviceGroups, GroupDevice } from "@/hooks/useDeviceGroups";
import { DEVICE_TYPE_LABELS } from "@/lib/types";

// 提取原始 DID（从 meshId:did 格式中取 did 部分）
const getRawDid = (id: string): string => id.includes(":") ? id.split(":")[1] : id;

export default function GroupsPage() {
  const [filterMeshId, setFilterMeshId] = useState<string>("");
  const [filterAlive, setFilterAlive] = useState<number | undefined>(undefined);
  const [searchText, setSearchText] = useState("");
  const [editingDevice, setEditingDevice] = useState<GroupDevice | null>(null);
  const [controllingDevice, setControllingDevice] = useState<GroupDevice | null>(null);
  const [saving, setSaving] = useState(false);
  const [controlling, setControlling] = useState(false);

  // 获取组设备
  const { groups, loading, error, refetch, controlGroup, updateGroup } = useDeviceGroups(
    filterMeshId ? { meshId: filterMeshId } : undefined
  );

  // 获取所有 Mesh ID
  const meshIds = useMemo(() => {
    const ids = [...new Set(groups.map((g) => g.meshId).filter(Boolean))];
    return ids as string[];
  }, [groups]);

  // 筛选后的组设备
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      // 按 Mesh 筛选
      if (filterMeshId && g.meshId !== filterMeshId) return false;
      // 按在线状态筛选
      if (filterAlive !== undefined && g.alive !== filterAlive) return false;
      // 按名称/ID 搜索（使用 displayId）
      if (searchText) {
        const search = searchText.toLowerCase();
        const name = (g.name || g.gatewayName || "").toLowerCase();
        const displayId = (g.displayId || g.id).toLowerCase();
        if (!name.includes(search) && !displayId.includes(search)) return false;
      }
      return true;
    });
  }, [groups, filterMeshId, filterAlive, searchText]);

  // 获取设备对应的房间名
  const getRoomName = (device: GroupDevice) => {
    if (device.room?.name) return device.room.name;
    if (device.roomId) return `房间 ${device.roomId}`;
    return "-";
  };

  // 解析设备值
  const parseValue = (valueStr: string): number[] => {
    try {
      return JSON.parse(valueStr || "[]");
    } catch {
      return [];
    }
  };

  // 解析 func 获取设备功能
  const getDeviceFunc = (func: number): string => {
    const labels: Record<number, string> = {
      2: "开关",
      3: "调光",
      4: "双色温",
      5: "HSL彩灯",
      9: "面板",
      10: "传感器",
    };
    return labels[func] || `功能${func}`;
  };

  // 控制组设备
  const handleControl = async (did: string, action: string, value: number[], meshid: string) => {
    if (!meshid) {
      alert("缺少 Mesh ID，无法控制设备");
      return;
    }
    setControlling(true);
    try {
      await controlGroup(did, action, value, meshid);
    } catch (err) {
      alert(err instanceof Error ? err.message : "控制失败");
    } finally {
      setControlling(false);
    }
  };

  // 快捷开关
  const quickToggle = async (device: GroupDevice) => {
    if (!device.meshId) return;
    const currentValue = parseValue(device.value);
    const isOn = currentValue[0] === 1;
    await handleControl(device.id, "onoff", [isOn ? 0 : 1], device.meshId);
  };

  // 保存设备信息
  const handleSave = async (data: { name: string; roomId: string }) => {
    if (!editingDevice) return;
    setSaving(true);
    try {
      const body: { name: string; roomId?: string | null } = { name: data.name };
      if (data.roomId) {
        body.roomId = data.roomId;
      } else {
        body.roomId = null;
      }
      await updateGroup(editingDevice.id, body);
      setEditingDevice(null);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 删除组设备
  const handleDelete = async (deviceId: string) => {
    if (!confirm("确认删除该组设备？删除后无法恢复。")) return;
    try {
      const res = await fetch(`/api/devices/${deviceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  };

  // 同步组设备
  const handleSync = async () => {
    try {
      const res = await fetch("/api/devices", { method: "POST" });
      const data = await res.json();
      if (res.status === 503) {
        alert("网关连接失败，请检查网关配置后重试");
        return;
      }
      if (data.error) {
        alert(`同步失败: ${data.error}`);
        return;
      }
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "同步失败");
    }
  };

  // 获取当前控制值
  const getControlValue = (device: GroupDevice): { action: string; value: number[] } => {
    const val = parseValue(device.value);
    // 根据 func 类型决定控制方式
    if (device.func === 2) {
      // 开关
      return { action: "onoff", value: val[0] === 1 ? [0] : [1] };
    } else if (device.func === 3) {
      // 调光
      const level = val[0] || 0;
      return { action: "level", value: [level] };
    } else if (device.func === 4) {
      // 色温
      const level = val[0] || 0;
      const temp = val[1] || 0;
      return { action: "level", value: [level, temp] };
    }
    // 默认开关
    return { action: "onoff", value: val[0] === 1 ? [0] : [1] };
  };

  return (
    <div className="fade-in">
      {/* 顶部工具栏 */}
      <div className="card">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-700">
          <div className="flex gap-3 flex-1">
            {/* Mesh 筛选 */}
            {meshIds.length > 0 && (
              <select
                className="input-field"
                style={{ width: "150px" }}
                value={filterMeshId}
                onChange={(e) => setFilterMeshId(e.target.value)}
              >
                <option value="">全部 Mesh</option>
                {meshIds.map((meshId) => (
                  <option key={meshId} value={meshId}>
                    Mesh {meshId}
                  </option>
                ))}
              </select>
            )}

            {/* 在线状态筛选 */}
            <select
              className="input-field"
              style={{ width: "150px" }}
              value={filterAlive === undefined ? "" : filterAlive === 1 ? "online" : "offline"}
              onChange={(e) => {
                if (e.target.value === "") setFilterAlive(undefined);
                else if (e.target.value === "online") setFilterAlive(1);
                else setFilterAlive(0);
              }}
            >
              <option value="">全部状态</option>
              <option value="online">在线</option>
              <option value="offline">离线</option>
            </select>

            {/* 名称搜索 */}
            <div className="relative flex-1" style={{ maxWidth: "300px" }}>
              <input
                type="text"
                placeholder="搜索组ID或名称..."
                className="input-field pr-10 w-full"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <i className="fas fa-search absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            </div>

            {/* 清除筛选 */}
            <button
              onClick={() => {
                setFilterMeshId("");
                setFilterAlive(undefined);
                setSearchText("");
              }}
              className="btn btn-secondary"
            >
              <i className="fas fa-times"></i>
              <span>清除筛选</span>
            </button>
          </div>

          {/* 同步按钮 */}
          <div className="flex gap-2 ml-4">
            <button onClick={handleSync} className="btn btn-primary">
              <i className="fas fa-sync-alt"></i>
              <span>同步组设备</span>
            </button>
          </div>
        </div>

        {/* 统计信息 */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-sm text-gray-400">
            共 <span className="text-blue-400 font-medium">{filteredGroups.length}</span> 个组设备
          </div>
          <div className="flex gap-3 text-sm text-gray-400">
            <span>
              <span className="status-indicator status-online mr-1"></span>
              {filteredGroups.filter((g) => g.alive === 1).length} 个在线
            </span>
            <span>
              <span className="status-indicator status-offline mr-1"></span>
              {filteredGroups.filter((g) => g.alive === 0).length} 个离线
            </span>
          </div>
        </div>

        {/* 组设备表格 */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <i className="fas fa-spinner fa-spin text-2xl"></i>
            <p className="mt-2">加载中...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-400">
            <i className="fas fa-exclamation-triangle text-2xl"></i>
            <p className="mt-2">{error}</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            暂无组设备
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>设备ID</th>
                <th>设备名称</th>
                <th>位置</th>
                <th>状态</th>
                <th>Mesh</th>
                <th>类型</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((device) => (
                <tr key={`${device.meshId}-${device.id}`}>
                  <td><code className="text-blue-400">{(device.displayId || device.id).toUpperCase()}</code></td>
                  <td className="font-medium text-white">
                    {device.name || device.gatewayName || `组设备 ${device.displayId || device.id}`}
                  </td>
                  <td className="text-gray-400">
                    <i className="fas fa-map-marker-alt mr-1 text-blue-400"></i>
                    {getRoomName(device)}
                  </td>
                  <td>
                    <span className={`status-indicator ${device.alive === 1 ? "status-online" : "status-offline"}`} />
                    <span className={`badge ${device.alive === 1 ? "badge-success" : "badge-error"}`}>
                      {device.alive === 1 ? "在线" : "离线"}
                    </span>
                  </td>
                  <td className="text-gray-400 text-sm">{device.meshId || "-"}</td>
                  <td className="text-gray-400">
                    {DEVICE_TYPE_LABELS[device.type] || `类型${device.type}`}
                    <p className="text-xs text-gray-500">{getDeviceFunc(device.func)}</p>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      {/* 控制按钮 */}
                      <button
                        onClick={() => setControllingDevice(device)}
                        disabled={!device.meshId || device.alive !== 1}
                        className="btn btn-secondary text-sm px-3 py-1"
                        title="控制"
                      >
                        <i className="fas fa-sliders-h"></i>
                      </button>

                      {/* 编辑按钮 */}
                      <button
                        onClick={() => setEditingDevice(device)}
                        className="btn btn-secondary text-sm px-3 py-1"
                        title="编辑属性"
                      >
                        <i className="fas fa-edit"></i>
                      </button>

                      {/* 删除按钮 */}
                      <button
                        onClick={() => handleDelete(device.id)}
                        className="btn btn-secondary text-sm px-3 py-1 text-red-400 hover:text-red-300"
                        title="删除组设备"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 编辑弹窗 */}
      {editingDevice && (
        <EditGroupModal
          device={editingDevice}
          onSave={handleSave}
          onClose={() => setEditingDevice(null)}
          saving={saving}
        />
      )}

      {/* 控制抽屉 */}
      <ControlGroupDrawer
        device={controllingDevice}
        open={!!controllingDevice}
        onClose={() => setControllingDevice(null)}
        onControl={handleControl}
        controlling={controlling}
        loading={false}
      />
    </div>
  );
}

// 编辑组设备弹窗
function EditGroupModal({
  device,
  onSave,
  onClose,
  saving,
}: {
  device: GroupDevice;
  onSave: (data: { name: string; roomId: string }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(device.name || device.gatewayName || "");
  const [roomId, setRoomId] = useState(device.roomId || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, roomId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[480px] bg-[#0d1520] rounded-lg border border-[#1c2630] p-6">
        <h3 className="text-lg font-medium text-white mb-6">编辑组设备</h3>

        <div className="mb-4 p-3 bg-gray-700/50 rounded">
          <p className="text-sm text-gray-400">
            组ID: <span className="text-blue-400 font-mono">{device.id.toUpperCase()}</span>
          </p>
          <p className="text-sm text-gray-400">
            Mesh: <span className="text-gray-300">{device.meshId || "-"}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">设备位置</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="请输入位置或留空"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              取消
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 控制组设备抽屉
function ControlGroupDrawer({
  device,
  open,
  onControl,
  onClose,
  controlling,
  loading,
}: {
  device: GroupDevice | null;
  open: boolean;
  onControl: (did: string, action: string, value: number[], meshid: string) => Promise<void>;
  onClose: () => void;
  controlling: boolean;
  loading: boolean;
}) {
  if (!device) return null;

  const valueArr: number[] = useMemo(() => {
    try {
      return JSON.parse(device.value || "[]");
    } catch {
      return [];
    }
  }, [device.value]);

  const initialOn = valueArr[0] === 1;
  const brightnessPct = device.func === 3 ? (valueArr[0] ?? 0) : (device.func === 4 ? (valueArr[0] ?? 0) : 100);
  const colorTempPct = device.func === 4 ? (valueArr[1] ?? 50) : 50;

  const [localOn, setLocalOn] = useState(initialOn);
  const [brightnessValue, setBrightnessValue] = useState(brightnessPct);
  const [colorTempValue, setColorTempValue] = useState(colorTempPct);

  const rawDid = getRawDid(device.id);

  // 即时控制：亮度松开即发送
  const handleBrightnessRelease = async () => {
    if (!device.meshId) return;
    const action = device.func === 4 ? "ctl" : "dim";
    const value = device.func === 4 ? [brightnessValue, colorTempValue] : [brightnessValue];
    await onControl(rawDid, action, value, device.meshId);
  };

  // 即时控制：色温松开即发送
  const handleColorTempRelease = async () => {
    if (!device.meshId) return;
    await onControl(rawDid, "ctl", [brightnessValue, colorTempValue], device.meshId);
  };

  const isDimmable = device.func === 3 || device.func === 4;
  const hasColorTemp = device.func === 4;

  const funcLabels: Record<number, string> = {
    2: "开关",
    3: "调光",
    4: "双色温",
    5: "HSL彩灯",
    9: "面板",
    10: "传感器",
  };
  const funcLabel = funcLabels[device.func] || `功能${device.func}`;

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 h-full w-[400px] bg-gradient-to-b from-[#1a1f2e] to-[#151a28] shadow-[-4px_0_20px_rgba(0,0,0,0.5)] z-50 transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-6 overflow-y-auto h-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">组设备控制</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <i className="fas fa-times text-xl" />
            </button>
          </div>

          {/* Device info card */}
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20 mb-6">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-lg font-bold text-white">
                {device.name || device.gatewayName || `组设备 ${(device.displayId || rawDid).toUpperCase()}`}
              </h4>
              <span className={`badge ${device.alive === 1 ? "badge-success" : "badge-error"}`}>
                {device.alive === 1 ? "在线" : "离线"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
              <span className="text-xs font-mono bg-gray-700/50 px-2 py-0.5 rounded">
                {(device.displayId || rawDid).toUpperCase()}
              </span>
              <span>·</span>
              <span>Mesh {device.meshId || "-"}</span>
              <span>·</span>
              <span>{funcLabel}</span>
            </div>
          </div>

          {/* Loading state or control UI */}
          {loading ? (
            <div className="text-center py-12 text-gray-400">
              <i className="fas fa-spinner fa-spin text-2xl"></i>
              <p className="mt-2">加载设备数据中...</p>
            </div>
          ) : (
            <div>
              {/* 开关控制 — func=2/3/4 均显示 */}
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-3">
                  <i className="fas fa-power-off mr-1"></i>开关
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      setLocalOn(true);
                      if (device.meshId) {
                        await onControl(rawDid, "onoff", [1], device.meshId);
                      }
                    }}
                    disabled={controlling || !device.meshId}
                    className={`flex-1 py-3 rounded text-white font-medium transition-colors ${
                      localOn
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-gray-600 hover:bg-gray-700"
                    } disabled:bg-gray-600 disabled:cursor-not-allowed`}
                  >
                    <i className="fas fa-power-off mr-2"></i>开
                  </button>
                  <button
                    onClick={async () => {
                      setLocalOn(false);
                      if (device.meshId) {
                        await onControl(rawDid, "onoff", [0], device.meshId);
                      }
                    }}
                    disabled={controlling || !device.meshId}
                    className={`flex-1 py-3 rounded text-white font-medium transition-colors ${
                      !localOn
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-gray-600 hover:bg-gray-700"
                    } disabled:bg-gray-600 disabled:cursor-not-allowed`}
                  >
                    <i className="fas fa-power-off mr-2"></i>关
                  </button>
                </div>
              </div>

              {/* 亮度控制 — func=3/4 显示，松开即发送 */}
              {isDimmable && (
                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-3">
                    <i className="fas fa-sun mr-1"></i>亮度
                  </label>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">0%</span>
                    <span className="text-blue-400 font-mono text-lg">{brightnessValue}%</span>
                    <span className="text-xs text-gray-500">100%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={brightnessValue}
                    onChange={(e) => setBrightnessValue(Number(e.target.value))}
                    onMouseUp={handleBrightnessRelease}
                    onTouchEnd={handleBrightnessRelease}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              )}

              {/* 色温控制 — func=4 显示，松开即发送 */}
              {hasColorTemp && (
                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-3">
                    <i className="fas fa-thermometer-half mr-1"></i>色温
                  </label>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">冷光</span>
                    <span className="text-amber-400 font-mono text-lg">{colorTempValue}%</span>
                    <span className="text-xs text-gray-500">暖光</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={colorTempValue}
                    onChange={(e) => setColorTempValue(Number(e.target.value))}
                    onMouseUp={handleColorTempRelease}
                    onTouchEnd={handleColorTempRelease}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              )}

              {/* 提示 */}
              <div className="mt-6 p-3 bg-gray-700/30 rounded-lg border border-gray-700/50">
                <p className="text-xs text-gray-500 text-center">
                  <i className="fas fa-info-circle mr-1"></i>
                  拖动滑块松开后即时发送控制命令
                </p>
                <p className="text-xs text-gray-500 text-center mt-1">
                  组设备控制将影响该 Mesh 下所有组内设备
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
