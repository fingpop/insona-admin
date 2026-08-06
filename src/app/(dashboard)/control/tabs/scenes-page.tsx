"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { InSonaDevice } from "@/lib/types";
import { SpaceNode, Scene, SceneAction } from "../types";

// ==================== 工具函数 ====================
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
  const { t } = useTranslation();
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

  // 初始化 selectedDevices（仅在客户端执行，memo 化避免重复解析）
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
  }, [scene?.id, scene?.actions]);

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
    if (!roomId) return t("scenes.unboundSpace");
    const space = roomList.find((r) => r.id === roomId);
    return space ? space.name : t("devices.space", { roomId });
  };

  // Filter devices (不根据在线状态过滤，所有设备都可选)
  const filteredDevices = devices.filter((d) => {
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
      alert(t("scenes.enterName"));
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
      alert(t("scenes.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!scene?.id) return;
    if (!confirm(t("scenes.confirmDeleteNamed", { name: scene.name }))) return;
    setDeleting(true);
    try {
      await fetch(`/api/scenes/${scene.id}`, { method: "DELETE" });
      onClose();
    } catch (err) {
      console.error("Delete failed:", err);
      alert(t("scenes.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  // Icon options
  const iconOptions = [
    { value: "fa-lightbulb", label: t("deviceIcon.lightbulb") },
    { value: "fa-moon", label: t("deviceIcon.moon") },
    { value: "fa-sun", label: t("deviceIcon.sun") },
    { value: "fa-users", label: t("deviceIcon.meeting") },
    { value: "fa-film", label: t("deviceIcon.movie") },
    { value: "fa-leaf", label: t("deviceIcon.energySaving") },
    { value: "fa-star", label: t("deviceIcon.star") },
    { value: "fa-heart", label: t("deviceIcon.heart") },
    { value: "fa-home", label: t("deviceIcon.home") },
    { value: "fa-bed", label: t("deviceIcon.sleep") },
    { value: "fa-utensils", label: t("deviceIcon.dining") },
    { value: "fa-book", label: t("deviceIcon.reading") },
  ];

  // Color options
  const colorOptions = [
    "#3b9eff", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
  ];

  // Action types for a device
  const getDeviceActionTypes = (func: number) => {
    switch (func) {
      case 2: return [{ value: "onoff", label: t("func.0") }];
      case 3: return [{ value: "onoff", label: t("func.0") }, { value: "level", label: t("func.1") }];
      case 4: return [{ value: "onoff", label: t("func.0") }, { value: "level", label: t("func.1") }, { value: "ctl", label: t("scenes.colorTemp") }];
      case 5: return [{ value: "onoff", label: t("func.0") }, { value: "level", label: t("func.1") }, { value: "hsl", label: t("scenes.colorful") }];
      case 7: return [{ value: "onoff", label: t("func.0") }, { value: "level", label: t("scenes.setSpeed") }];
      default: return [{ value: "onoff", label: t("func.0") }];
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
        case "onoff": return value[0] === 1 ? t("common.on") : t("common.off");
        case "level": return t("scenes.brightnessPercent", { value: value[0] });
        case "ctl": return t("scenes.brightnessColorTempPercent", { brightness: value[0], colorTemp: value[1] });
        case "hsl": return t("scenes.hslFormat", { h: value[0], s: value[1], l: value[2] });
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
              {t("scenes.syncDeviceAction")}
            </h3>
            <button onClick={closeSync} className="text-gray-400 hover:text-white">
              <i className="fas fa-times" />
            </button>
          </div>

          {/* Source device info */}
          <div className="p-4 border-b border-white/10">
            <p className="text-xs text-gray-400 mb-2">{t("scenes.sourceDeviceSettings")}</p>
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
              {t("scenes.selectConfiguredToSync")}
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
                  {syncSelectedTargets.size === syncTargets.length ? t("common.deselectAll") : t("common.selectAll")}
                </button>
              )}
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {syncTargets.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  {t("scenes.noSyncTargets")}
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
              {t("common.cancel")}
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
              {t("scenes.syncToDevices", { count: syncSelectedTargets.size })}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a1a2e] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {isEditing ? t("scenes.edit") : t("scenes.createNew")}
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
                  <option value="">{t("groups.allMesh")}</option>
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
                  <option value="">{t("energy.allSpaces")}</option>
                  {roomList.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              {/* Search */}
              <input
                type="text"
                className="input-field text-sm"
                placeholder={t("scenes.searchDeviceName")}
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
                      {t("scenes.configuredDevicesCount", { count: configuredDevices.length })}
                    </p>
                    {unconfiguredDevices.length > 0 && (
                      <button
                        onClick={() => setMode("add")}
                        className="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                      >
                        <i className="fas fa-plus mr-1" />
                        {t("scenes.addDevice")}
                      </button>
                    )}
                  </div>

                  {/* 表头 */}
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500 border-b border-white/10">
                    <span className="shrink-0 whitespace-nowrap">{t("devices.name")}</span>
                    <span className="text-center shrink-0" style={{ width: 80 }}>{t("scenes.function")}</span>
                    <span className="text-center flex-1">{t("scenes.parameter")}</span>
                    <span className="text-center shrink-0">{t("devices.actions")}</span>
                  </div>

                  {configuredDevices.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">
                      {t("scenes.noConfiguredDevicesHint")}
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
                            <div className="flex flex-col gap-0.5 min-w-0 shrink-0">
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
                                    {t("common.on")}
                                  </button>
                                  <button
                                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                      selected.value[0] === 0
                                        ? "bg-red-500/30 text-red-400"
                                        : "bg-white/5 text-gray-400 hover:bg-white/10"
                                    }`}
                                    onClick={() => updateDeviceAction(device.did, "onoff", [0])}
                                  >
                                    {t("common.off")}
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
                                    placeholder={t("drawer.brightness")}
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
                                    placeholder={t("scenes.colorTemp")}
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
                                title={getSyncTargets(device.did).length > 0 ? t("scenes.syncToOtherDevices", { count: getSyncTargets(device.did).length }) : t("scenes.noTarget")}
                              >
                                <i className="fas fa-exchange-alt" />
                              </button>
                              <button
                                onClick={() => removeDevice(device.did)}
                                className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                                title={t("common.remove")}
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
                    {t("scenes.backToConfiguredDevices", { count: configuredDevices.length })}
                  </button>

                  <p className="text-sm text-gray-400 mb-2">{t("scenes.selectDeviceToAdd")}</p>

                  {unconfiguredDevices.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">
                      {t("scenes.noDevicesToAdd")}
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
                            {t("scenes.confirmAddDevices", { count: addSelectedIds.size })}
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
                <label className="text-xs text-gray-400 mb-1 block">{t("scenes.name")}</label>
                <input
                  type="text"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("scenes.enterName")}
                />
              </div>

              {/* Icon */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">{t("scenes.icon")}</label>
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
                <label className="text-xs text-gray-400 mb-2 block">{t("scenes.color")}</label>
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
                <span className="text-sm text-gray-300">{t("scenes.addToQuickBar")}</span>
              </label>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/10 space-y-2">
              {/* 取消和保存在同一行 */}
              <div className="flex gap-2">
                <button className="btn btn-sm whitespace-nowrap flex-1 border border-gray-600 hover:bg-gray-700/50 justify-center" onClick={onClose}>
                  {t("common.cancel")}
                </button>
                <button
                  className="btn btn-sm whitespace-nowrap btn-primary flex-1 justify-center"
                  onClick={handleSave}
                  disabled={saving || deleting}
                >
                  <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-save"} mr-2`} />
                  {saving ? t("scenes.saving") : t("common.save")}
                </button>
              </div>
              {/* 删除按钮单独一行 */}
              {isEditing && (
                <button
                  className="btn btn-sm w-full whitespace-nowrap bg-red-600 hover:bg-red-700 text-white justify-center"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                >
                  <i className={`fas ${deleting ? "fa-spinner fa-spin" : "fa-trash"} mr-2`} />
                  {deleting ? t("scenes.deleting") : t("common.delete")}
                </button>
              )}
            </div>
          </div>
          </div>
        </div>

        {/* Loading overlay */}
        {(saving || deleting) && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 rounded-2xl">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
              <span className="text-white text-sm">{saving ? t("scenes.savingOverlay") : t("scenes.deletingOverlay")}</span>
            </div>
          </div>
        )}
        {/* 同步目标弹窗 */}
        <SyncTargetModal />
      </div>
    );
  }

// ==================== 场景管理页面 ====================
export default function ScenesPage({
  onActivateScene,
  devices,
  spaces,
}: {
  onActivateScene: (sceneId: number, meshid: string) => Promise<void>;
  devices: InSonaDevice[];
  spaces: SpaceNode[];
}) {
  const { t } = useTranslation();
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
      if (!res.ok) throw new Error(t("scenes.activateFailed"));
    } catch (err) {
      console.error("Failed to activate scene:", err);
      alert(t("scenes.executeFailed"));
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
        // Update existing scene + actions in single atomic call
        const res = await fetch(`/api/scenes/${editingScene.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: sceneData.name,
            icon: sceneData.icon,
            color: sceneData.color,
            meshId: sceneData.meshId,
            showInQuick: sceneData.showInQuick,
            actions: actionsPayload,
          }),
        });
        if (!res.ok) throw new Error(t("scenes.updateFailed"));
        const data = await res.json();

        // Partial state update — no full reload
        setScenes((prev) =>
          prev.map((s) => (s.id === editingScene.id ? data.scene : s))
        );
      } else {
        // Create new scene + actions in single atomic call
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
            actions: actionsPayload,
          }),
        });
        if (!res.ok) throw new Error(t("scenes.createFailed"));
        const data = await res.json();

        // Partial state update — no full reload
        setScenes((prev) => [...prev, data.scene]);
      }
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
    if (!confirm(t("scenes.confirmDelete"))) return;
    try {
      await fetch(`/api/scenes/${sceneId}`, { method: "DELETE" });
      await loadScenes();
    } catch (err) {
      console.error("Delete scene failed:", err);
      alert(t("scenes.deleteFailed"));
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
            <p className="text-xs text-gray-500">{t("scenes.deviceCount", { count: scene.actions?.length ?? 0 })}</p>
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
            title={t("scenes.edit")}
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
          <h3 className="text-lg font-bold text-white">{t("dashboard.quickScenes")}</h3>
          <button
            className="btn btn-primary"
            onClick={() => handleEditScene(null)}
          >
            <i className="fas fa-plus" />
            <span>{t("scenes.createNew")}</span>
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
                <p className="text-gray-400 text-sm mb-4">{t("scenes.noQuickScenes")}</p>
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
                <p className="text-gray-400 text-sm mb-4">{t("scenes.noCustomScenes")}</p>
              </div>
            )}
          </>
        )}

        {devices.length === 0 && (
          <p className="text-center text-gray-400 mt-6">
            <i className="fas fa-info-circle mr-2" />
            {t("scenes.connectGatewayFirst")}
          </p>
        )}
      </div>
    </div>
  );
}
