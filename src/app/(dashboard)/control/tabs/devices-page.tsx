"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { InSonaDevice, DEVICE_TYPE_LABELS, isGroupDevice, parseStoredDeviceId } from "@/lib/types";
import { DbDevice, SpaceNode } from "../types";
import { resolveDeviceFunc, parseDeviceValue } from "../utils";

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
  const { t } = useTranslation();
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
        <h3 className="text-lg font-medium text-white mb-6">{t("devices.editTitle")}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 设备名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">{t("devices.name")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder={t("devices.enterName")}
            />
          </div>

          {/* 设备位置 */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">{t("devices.location")}</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              <option value="">{t("devices.notBound")}</option>
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
              <label className="block text-sm font-medium text-gray-400 mb-2">{t("devices.belongsToGroups")}</label>
              <div className="bg-[#101922] border border-[#1c2630] rounded-md px-3 py-2">
                <div className="flex gap-2 flex-wrap">
                  {device.groups.map((groupId, idx) => {
                    // 查找对应的房间名称
                    const room = rooms.find(r => r.roomId === String(groupId));
                    const roomName = room?.gatewayName || t("devices.group", { groupId });
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
                  {t("devices.groupsHint")}
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
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DevicesPage({
  devices,
  rooms,
  spaces,
  gatewayStatus,
  onDeviceClick,
  onControl,
  onSync,
}: {
  devices: InSonaDevice[];
  rooms: DbDevice[];
  spaces: SpaceNode[];
  gatewayStatus: string;
  onDeviceClick: (device: InSonaDevice) => void;
  onControl: (did: string, action: string, value: number[], meshid: string, transition?: number) => void;
  onSync: () => void;
}) {
  const { t } = useTranslation();
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
      return space?.name || t("devices.space", { roomId: dbDevice.roomId });
    }
    return t("devices.notBound");
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
    if (!confirm(t("devices.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/devices/${deviceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("devices.deleteFailed"));
      onSync();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("devices.deleteFailed"));
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
      // 同步设备
      const syncRes = await fetch("/api/devices", { method: "POST" });
      const syncData = await syncRes.json();
      if (syncRes.status === 503) {
        alert(t("devices.gatewayConnectFailed"));
        return;
      }
      if (syncData.error) {
        alert(t("devices.syncFailed", { error: syncData.error }));
        return;
      }

      // 刷新数据
      onSync();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("errors.syncFailed"));
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
      if (!res.ok) throw new Error(t("devices.saveFailed"));
      setEditingDevice(null);
      // 刷新数据
      onSync();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("devices.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  // 导入数据
  const handleImportData = async () => {
    if (!confirm(t("devices.importConfirm"))) return;
    setImporting(true);
    try {
      const res = await fetch("/api/import-data", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(t("devices.importFailed", { error: data.error || data.details }));
        return;
      }
      alert(t("devices.importSuccess", {
        totalRooms: data.summary.totalRooms,
        totalDevices: data.summary.totalDevices,
        onlineDevices: data.summary.onlineDevices,
        offlineDevices: data.summary.offlineDevices,
      }));
      // 刷新数据
      onSync();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("errors.importFailed"));
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
              <option value="">{t("devices.allLocations")}</option>
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
              <option value="">{t("devices.allStatus")}</option>
              <option value="online">{t("devices.online")}</option>
              <option value="offline">{t("devices.offline")}</option>
            </select>

            {/* Mesh 筛选 */}
            {meshIds.length > 0 && (
              <select
                className="input-field"
                style={{ width: "150px" }}
                value={filter.meshId}
                onChange={(e) => setFilter({ ...filter, meshId: e.target.value })}
              >
                <option value="">{t("devices.allMesh")}</option>
                {meshIds.map((meshId) => (
                  <option key={meshId} value={meshId}>Mesh {meshId}</option>
                ))}
              </select>
            )}

            {/* 名称搜索 */}
            <div className="relative flex-1" style={{ maxWidth: "300px" }}>
              <input
                type="text"
                placeholder={t("devices.search")}
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
              <span>{t("devices.clearFilter")}</span>
            </button>
          </div>

          {/* 右侧按钮 */}
          <div className="flex gap-2 ml-4">
            <button
              onClick={handleImportData}
              disabled={importing}
              className="btn btn-secondary"
              title={t("devices.importTitle")}
            >
              <i className={`fas fa-file-import ${importing ? "animate-pulse" : ""}`}></i>
              <span>{importing ? t("devices.importing") : t("devices.import")}</span>
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn btn-primary"
            >
              <i className={`fas fa-sync-alt ${syncing ? "animate-spin" : ""}`}></i>
              <span>{syncing ? t("devices.syncing") : t("devices.sync")}</span>
            </button>
          </div>
        </div>

        {/* 标签页切换 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            {[
              { id: "lights", label: t("devices.lights"), icon: "fa-lightbulb" },
              { id: "panels", label: t("devices.panels"), icon: "fa-tablet-alt" },
              { id: "sensors", label: t("devices.sensors"), icon: "fa-broadcast-tower" },
              { id: "other", label: t("devices.other"), icon: "fa-cog" },
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
            {t("devices.totalCount", { count: filteredDevices.length })}
          </div>
        </div>

        {/* 设备表格 */}
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("devices.id")}</th>
              <th>{t("devices.name")}</th>
              <th>{t("devices.room")}</th>
              <th>Groups</th>
              <th>{t("devices.status")}</th>
              <th>Mesh</th>
              <th>{t("devices.todayEnergy")}</th>
              <th>{t("devices.power")}</th>
              <th>{t("devices.actions")}</th>
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
                          const roomName = room?.gatewayName || t("devices.group", { groupId });
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
                      {device.alive === 1 ? t("devices.online") : t("devices.offline")}
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
                        title={t("devices.control")}
                      >
                        <i className="fas fa-sliders-h"></i>
                      </button>
                      <button
                        onClick={() => setEditingDevice(device)}
                        className="btn btn-secondary text-sm px-3 py-1"
                        title={t("devices.editProps")}
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        onClick={() => handleDeleteDevice(device.did)}
                        className="btn btn-secondary text-sm px-3 py-1 text-red-400 hover:text-red-300"
                        title={t("devices.delete")}
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
                <td colSpan={9} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    {devices.length === 0 ? (
                      <span className="text-gray-400">
                        {gatewayStatus === "connected"
                          ? t("devices.noData")
                          : t("devices.gatewayDisconnected")}
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        {t("devices.noMatch")}
                        <span className="text-gray-500 text-sm ml-2">{t("devices.tryAdjust")}</span>
                      </span>
                    )}
                  </div>
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
