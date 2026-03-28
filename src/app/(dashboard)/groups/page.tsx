"use client";

import { useState, useMemo, useCallback } from "react";
import { useDeviceGroups, GroupDevice } from "@/hooks/useDeviceGroups";
import { DEVICE_TYPE_LABELS } from "@/lib/types";

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
      setControllingDevice(null);
      refetch();
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
                style={{ width: "180px" }}
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
              style={{ width: "120px" }}
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
              <span>清除</span>
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
        <div className="flex gap-4 mb-4 text-sm text-gray-400">
          <span>
            <i className="fas fa-layer-group mr-1"></i>
            共 {filteredGroups.length} 个组设备
          </span>
          <span>
            <i className="fas fa-circle text-green-500 mr-1" style={{ fontSize: "8px" }}></i>
            {filteredGroups.filter((g) => g.alive === 1).length} 个在线
          </span>
          <span>
            <i className="fas fa-circle text-gray-500 mr-1" style={{ fontSize: "8px" }}></i>
            {filteredGroups.filter((g) => g.alive === 0).length} 个离线
          </span>
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
          <div className="text-center py-12 text-gray-400">
            <i className="fas fa-layer-group text-4xl opacity-50"></i>
            <p className="mt-4">暂无组设备</p>
            <p className="text-sm mt-1">组设备在设备同步时自动发现</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 text-left text-sm text-gray-400">
                  <th className="pb-3 font-medium">设备ID</th>
                  <th className="pb-3 font-medium">设备名称</th>
                  <th className="pb-3 font-medium">位置</th>
                  <th className="pb-3 font-medium">状态</th>
                  <th className="pb-3 font-medium">Mesh</th>
                  <th className="pb-3 font-medium">类型</th>
                  <th className="pb-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((device) => (
                  <tr
                    key={`${device.meshId}-${device.id}`}
                    className="border-b border-gray-700/50 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-sm font-mono">
                          {(device.displayId || device.id).toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="py-4">
                      <div>
                        <p className="font-medium text-white">
                          {device.name || device.gatewayName || `组设备 ${device.displayId || device.id}`}
                        </p>
                        {device.name && device.gatewayName && device.name !== device.gatewayName && (
                          <p className="text-xs text-gray-500">{device.gatewayName}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-4 text-gray-300">{getRoomName(device)}</td>
                    <td className="py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
                          device.alive === 1
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            device.alive === 1 ? "bg-green-400" : "bg-gray-400"
                          }`}
                        ></span>
                        {device.alive === 1 ? "在线" : "离线"}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="text-gray-400">{device.meshId || "-"}</span>
                    </td>
                    <td className="py-4">
                      <div>
                        <span className="text-gray-300">
                          {DEVICE_TYPE_LABELS[device.type] || `类型${device.type}`}
                        </span>
                        <p className="text-xs text-gray-500">{getDeviceFunc(device.func)}</p>
                      </div>
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* 快捷控制按钮 */}
                        <button
                          onClick={() => quickToggle(device)}
                          disabled={!device.meshId || device.alive !== 1}
                          className="btn btn-sm btn-secondary"
                          title="快捷开关"
                        >
                          <i
                            className={`fas ${parseValue(device.value)[0] === 1 ? "fa-power-off" : "fa-toggle-off"}`}
                          ></i>
                        </button>

                        {/* 控制按钮 */}
                        <button
                          onClick={() => setControllingDevice(device)}
                          disabled={!device.meshId || device.alive !== 1}
                          className="btn btn-sm btn-primary"
                          title="控制"
                        >
                          <i className="fas fa-sliders-h"></i>
                        </button>

                        {/* 编辑按钮 */}
                        <button
                          onClick={() => setEditingDevice(device)}
                          className="btn btn-sm btn-secondary"
                          title="编辑"
                        >
                          <i className="fas fa-edit"></i>
                        </button>

                        {/* 删除按钮 */}
                        <button
                          onClick={() => handleDelete(device.id)}
                          className="btn btn-sm btn-danger"
                          title="删除"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {/* 控制弹窗 */}
      {controllingDevice && (
        <ControlGroupDrawer
          device={controllingDevice}
          onControl={handleControl}
          onClose={() => setControllingDevice(null)}
          controlling={controlling}
        />
      )}
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-white mb-4">编辑组设备</h3>

        <div className="mb-4 p-3 bg-gray-700/50 rounded">
          <p className="text-sm text-gray-400">
            组ID: <span className="text-blue-400 font-mono">{device.id.toUpperCase()}</span>
          </p>
          <p className="text-sm text-gray-400">
            Mesh: <span className="text-gray-300">{device.meshId || "-"}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">设备名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field w-full"
              placeholder="输入设备名称"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-1">位置</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="input-field w-full"
              placeholder="输入位置或留空"
            />
          </div>

          <div className="flex justify-end gap-3">
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
  onControl,
  onClose,
  controlling,
}: {
  device: GroupDevice;
  onControl: (did: string, action: string, value: number[], meshid: string) => Promise<void>;
  onClose: () => void;
  controlling: boolean;
}) {
  const [action, setAction] = useState<string>("onoff");
  const [levelValue, setLevelValue] = useState<number>(100);

  // 解析当前值
  const currentValue = useMemo(() => {
    try {
      return JSON.parse(device.value || "[]");
    } catch {
      return [];
    }
  }, [device.value]);

  // 根据 func 类型设置默认值
  useMemo(() => {
    if (device.func === 2) {
      setAction("onoff");
    } else if (device.func === 3) {
      setAction("level");
      setLevelValue(currentValue[0] || 100);
    } else if (device.func === 4) {
      setAction("level");
      setLevelValue(currentValue[0] || 100);
    }
  }, [device.func, currentValue]);

  const handleControl = async () => {
    if (!device.meshId) return;

    let actionType: string;
    let value: number[];

    if (action === "onoff") {
      actionType = "onoff";
      value = [currentValue[0] === 1 ? 0 : 1];
    } else {
      actionType = "level";
      value = [levelValue];
    }

    await onControl(device.id, actionType, value, device.meshId);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">控制组设备</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-700/50 rounded">
          <p className="text-sm text-gray-400">
            组ID: <span className="text-blue-400 font-mono">{device.id.toUpperCase()}</span>
          </p>
          <p className="text-sm text-gray-400">
            名称: <span className="text-white">{device.name || device.gatewayName}</span>
          </p>
          <p className="text-sm text-gray-400">
            Mesh: <span className="text-gray-300">{device.meshId}</span>
          </p>
        </div>

        {/* 控制类型选择 */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">控制方式</label>
          <div className="flex gap-2">
            {device.func === 2 && (
              <button
                onClick={() => setAction("onoff")}
                className={`flex-1 py-2 px-4 rounded transition-colors ${
                  action === "onoff"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <i className="fas fa-power-off mr-2"></i>
                开关
              </button>
            )}
            {(device.func === 3 || device.func === 4) && (
              <button
                onClick={() => setAction("level")}
                className={`flex-1 py-2 px-4 rounded transition-colors ${
                  action === "level"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <i className="fas fa-sun mr-2"></i>
                亮度
              </button>
            )}
          </div>
        </div>

        {/* 开关控制 */}
        {action === "onoff" && (
          <div className="mb-6">
            <div className="flex gap-4">
              <button
                onClick={async () => {
                  setAction("onoff");
                  if (device.meshId) {
                    await onControl(device.id, "onoff", [1], device.meshId);
                  }
                }}
                disabled={controlling || !device.meshId}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white transition-colors"
              >
                <i className="fas fa-power-off mr-2"></i>
                开
              </button>
              <button
                onClick={async () => {
                  setAction("onoff");
                  if (device.meshId) {
                    await onControl(device.id, "onoff", [0], device.meshId);
                  }
                }}
                disabled={controlling || !device.meshId}
                className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded text-white transition-colors"
              >
                <i className="fas fa-power-off mr-2"></i>
                关
              </button>
            </div>
          </div>
        )}

        {/* 亮度控制 */}
        {action === "level" && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">亮度</span>
              <span className="text-blue-400 font-mono">{levelValue}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={levelValue}
              onChange={(e) => setLevelValue(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
        )}

        {/* 发送控制按钮 */}
        {action === "level" && (
          <button
            onClick={handleControl}
            disabled={controlling || !device.meshId}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white transition-colors"
          >
            {controlling ? "控制中..." : "发送控制"}
          </button>
        )}

        {/* 提示 */}
        <p className="mt-4 text-xs text-gray-500 text-center">
          组设备控制将影响该 Mesh 下所有组内设备
        </p>
      </div>
    </div>
  );
}
