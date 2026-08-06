"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { InSonaDevice, DEVICE_TYPE_LABELS } from "@/lib/types";
import { DbDevice, SpaceNode } from "../types";
import { resolveDeviceFunc } from "../utils";

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
  const { t } = useTranslation();
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
            <h3 className="text-xl font-bold text-white">{isEdit ? t("rooms.editSpace") : t("rooms.addSpace")}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">{t("rooms.spaceType")}</label>
              <select
                className="input-field"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as "room" | "building" | "floor");
                  setParentId("");
                }}
              >
                <option value="building">{t("rooms.typeBuilding")}</option>
                <option value="floor">{t("rooms.typeFloor")}</option>
                <option value="room">{t("rooms.typeRoom")}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">{t("rooms.spaceName")}</label>
              <input
                type="text"
                className="input-field"
                placeholder={t("rooms.enterName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">{t("rooms.parentSpace")}</label>
              <select
                className="input-field"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={type === "building"}
              >
                <option value="">{t("rooms.noneTopLevel")}</option>
                {availableParents.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button type="button" onClick={onClose} className="btn btn-secondary flex-1 whitespace-nowrap">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={loading || !name.trim()} className="btn btn-primary flex-1 whitespace-nowrap">
                {loading ? (isEdit ? t("rooms.saving") : t("rooms.creating")) : (isEdit ? t("common.saveModify") : t("rooms.addSpace"))}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default function RoomsPage({
  spaces,
  devices,
  onRefresh,
}: {
  spaces: SpaceNode[];
  devices: DbDevice[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
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
        return t("rooms.typeBuilding");
      case "floor":
        return t("rooms.typeFloor");
      default:
        return t("rooms.typeRoom");
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
            <span className="text-xs text-gray-400">{t("rooms.deviceCountLabel", { count: node.deviceCount })}</span>
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
        alert(err.error || t("rooms.saveFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

  // 批量移动空间
  const handleBatchMove = async () => {
    if (batchSelected.size === 0) return;
    if (!confirm(t("rooms.confirmBatchMove", { count: batchSelected.size }))) return;
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
        alert(err.error || t("rooms.batchMoveFailed"));
      }
    } finally {
      setLoading(false);
    }
  };
  const handleDeleteSpace = async (spaceId: string) => {
    if (!confirm(t("rooms.confirmDelete"))) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${spaceId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setSelectedSpace(null);
        onRefresh();
      } else {
        alert(data.error || t("rooms.deleteFailed"));
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
              <i className="fas fa-sitemap mr-2"></i>{t("rooms.hierarchy")}
            </button>
            <button
              className={`tab-button ${activeTab === "devices" ? "active" : ""}`}
              onClick={() => setActiveTab("devices")}
            >
              <i className="fas fa-link mr-2"></i>{t("rooms.deviceBinding")}
            </button>
            <button
              className={`tab-button ${activeTab === "transfer" ? "active" : ""}`}
              onClick={() => setActiveTab("transfer")}
            >
              <i className="fas fa-exchange-alt mr-2"></i>{t("rooms.batchTransfer")}
            </button>
            <button
              className={`tab-button ${activeTab === "batch" ? "active" : ""}`}
              onClick={() => setActiveTab("batch")}
            >
              <i className="fas fa-layer-group mr-2"></i>{t("rooms.batchOperations")}
            </button>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            <i className="fas fa-plus"></i>
            <span>{t("rooms.addSpace")}</span>
          </button>
        </div>

        {/* 标签页内容 */}
        {activeTab === "hierarchy" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* 左侧：空间树 */}
            <div className="lg:col-span-1">
              <div className="p-4 bg-white/5 rounded-lg">
                <h4 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
                  <span>{t("rooms.spaceTree")}</span>
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
                    <p className="text-center text-gray-400 py-8">{t("rooms.noSpaces")}</p>
                  )}
                </div>
              </div>
            </div>

            {/* 右侧：空间详情 */}
            <div className="lg:col-span-3">
              <div className="p-6 bg-white/5 rounded-lg">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-lg font-bold text-white">{t("rooms.spaceDetails")}</h4>
                  {selectedSpace && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingSpace(selectedSpace); setShowEditModal(true); }}
                        className="btn btn-secondary text-sm"
                      >
                        <i className="fas fa-edit"></i>
                        <span>{t("common.edit")}</span>
                      </button>
                      <button
                        onClick={() => handleDeleteSpace(selectedSpace.id)}
                        className="btn btn-secondary text-sm text-red-400 hover:text-red-300"
                      >
                        <i className="fas fa-trash"></i>
                        <span>{t("common.delete")}</span>
                      </button>
                    </div>
                  )}
                </div>

                {selectedSpace ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                          {t("rooms.spaceName")}
                        </label>
                        <p className="text-white font-medium">{selectedSpace.name}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                          {t("rooms.spaceType")}
                        </label>
                        <p className="text-white">{getSpaceTypeName(selectedSpace.type)}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                          {t("rooms.belongsToSpace")}
                        </label>
                        <p className="text-white">{getSpacePath(selectedSpace)}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                          {t("rooms.boundDevices")}
                        </label>
                        <p className="text-blue-400 font-medium">
                          {t("rooms.deviceCountText", { count: selectedSpace.deviceCount || 0 })}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-3">
                        {t("rooms.deviceList")}
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
                                    {DEVICE_TYPE_LABELS[device.type] || t("rooms.unknownType", { type: device.type })} · ID:{" "}
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
                                  {device.alive === 1 ? t("devices.online") : t("devices.offline")}
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
                          <p className="text-center text-gray-400 py-8">{t("rooms.noDevicesInSpace")}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <i className="fas fa-hand-pointer text-gray-600 text-4xl mb-4"></i>
                    <p className="text-gray-400">{t("rooms.selectSpacePrompt")}</p>
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
                <h4 className="text-lg font-bold text-white shrink-0">{t("rooms.unboundDevices")}</h4>
                <span className="badge badge-info shrink-0">{unboundDevices.length}</span>
                {meshIds.length > 0 && (
                  <select
                    className="input-field text-sm py-1 ml-auto"
                    value={filterMeshId}
                    onChange={(e) => setFilterMeshId(e.target.value)}
                  >
                    <option value="">{t("devices.allMesh")}</option>
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
                  <span className="text-sm text-gray-400">{t("common.selectAll")}</span>
                </label>
                <span className="text-sm text-gray-500">
                  {t("rooms.selectedCount", { count: selectedDevices.length })}
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
                          {DEVICE_TYPE_LABELS[device.type] || t("rooms.unknownType", { type: device.type })} · ID:{" "}
                          {device.id}
                        </p>
                      </div>
                      <i className="fas fa-arrow-right text-gray-400"></i>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-400 py-8">{t("rooms.allDevicesBound")}</p>
                )}
              </div>
            </div>

            {/* 右侧：绑定操作 */}
            <div>
              <div className="p-6 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <h4 className="text-lg font-bold text-white mb-6">
                  <i className="fas fa-link mr-2"></i>
                  {t("rooms.deviceBinding")}
                </h4>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      {t("rooms.selectedDevices")}
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
                          {t("rooms.selectDevicesPrompt")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      {t("rooms.targetSpace")}
                    </label>
                    <select
                      className="input-field"
                      value={targetSpaceId}
                      onChange={(e) => setTargetSpaceId(e.target.value)}
                    >
                      <option value="">{t("rooms.selectSpace")}</option>
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
                    <span>{loading ? t("groups.binding") : t("panel.confirmBind")}</span>
                  </button>
                </div>

                <div className="mt-6 p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <p className="text-sm text-yellow-400 mb-2">
                    <i className="fas fa-info-circle mr-2"></i>
                    {t("rooms.bindingInfoTitle")}
                  </p>
                  <ul className="text-xs text-gray-400 space-y-1 ml-6">
                    <li>• {t("rooms.bindingInfoSingleOrBatch")}</li>
                    <li>• {t("rooms.bindingInfoOnePerSpace")}</li>
                    <li>• {t("rooms.bindingInfoViewInHierarchy")}</li>
                    <li>• {t("rooms.bindingInfoUnbindAnytime")}</li>
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
                {t("rooms.sourceSpace")}
              </h4>
              <select
                className="input-field mb-4"
                value={sourceSpaceId}
                onChange={(e) => {
                  setSourceSpaceId(e.target.value);
                  setSelectedDevices([]);
                }}
              >
                <option value="">{t("rooms.selectSourceSpace")}</option>
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
                            {DEVICE_TYPE_LABELS[device.type] || t("rooms.unknownType", { type: device.type })}
                            {device.meshId && ` · Mesh ${device.meshId}`}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-gray-400 py-8">{t("rooms.noDevicesInSpace")}</p>
                  )
                ) : (
                  <p className="text-center text-gray-400 py-8">{t("rooms.selectSourceSpacePrompt")}</p>
                )}
              </div>
            </div>

            {/* 转移操作 */}
            <div className="flex flex-col items-center justify-center">
              <div className="p-6 bg-white/5 rounded-lg text-center">
                <div className="mb-6">
                  <i className="fas fa-exchange-alt text-blue-400 text-4xl"></i>
                </div>
                <p className="text-sm text-gray-400 mb-4">{t("rooms.selectedLabel")}</p>
                <p className="text-2xl font-bold text-white mb-6">{selectedDevices.length}</p>
                <button
                  onClick={handleTransfer}
                  disabled={selectedDevices.length === 0 || !targetSpaceId || loading}
                  className="btn btn-primary w-full"
                >
                  <i className="fas fa-arrow-right"></i>
                  <span>{loading ? t("panel.transferring") : t("panel.startTransfer")}</span>
                </button>
              </div>
            </div>

            {/* 目标空间 */}
            <div>
              <h4 className="text-lg font-bold text-white mb-4">
                <i className="fas fa-sign-in-alt mr-2 text-green-400"></i>
                {t("rooms.targetSpace")}
              </h4>
              <select
                className="input-field mb-4"
                value={targetSpaceId}
                onChange={(e) => setTargetSpaceId(e.target.value)}
              >
                <option value="">{t("rooms.selectTargetSpace")}</option>
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
                  {t("rooms.transferInfoTitle")}
                </p>
                <ul className="text-xs text-gray-400 space-y-1">
                  <li>✓ {t("rooms.transferInfo1")}</li>
                  <li>✓ {t("rooms.transferInfo2")}</li>
                  <li>✓ {t("rooms.transferInfo3")}</li>
                  <li>✓ {t("rooms.transferInfo4")}</li>
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
                {t("rooms.selectSpacesToMove")}
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
                  <span className="text-sm text-gray-400">{t("common.selectAll")}</span>
                </label>
                <span className="text-sm text-gray-500">
                  {t("rooms.selectedCount", { count: batchSelected.size })}
                </span>
              </div>
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {allSpaces.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">{t("rooms.noSpacesSimple")}</p>
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
                {t("rooms.moveTo")}
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">{t("rooms.targetParentSpace")}</label>
                  <select
                    className="input-field"
                    value={batchTargetId}
                    onChange={(e) => setBatchTargetId(e.target.value)}
                  >
                    <option value="">{t("rooms.noneTopLevel")}</option>
                    {allSpaces
                      .filter(s => !batchSelected.has(s.id))
                      .map((space) => (
                        <option key={space.id} value={space.id}>
                          {getSpacePath(space)}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    {t("rooms.moveDescription")}
                  </p>
                </div>

                <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <p className="text-sm text-blue-400 mb-2">
                    <i className="fas fa-info-circle mr-2"></i>
                    {t("rooms.batchInfoTitle")}
                  </p>
                  <ul className="text-xs text-gray-400 space-y-1">
                    <li>✓ {t("rooms.batchInfo1")}</li>
                    <li>✓ {t("rooms.batchInfo2")}</li>
                    <li>✓ {t("rooms.batchInfo3")}</li>
                    <li>✓ {t("rooms.batchInfo4")}</li>
                  </ul>
                </div>

                <button
                  onClick={handleBatchMove}
                  disabled={loading || batchSelected.size === 0}
                  className="btn btn-primary w-full"
                >
                  <i className="fas fa-exchange-alt mr-2"></i>
                  {loading ? t("rooms.moving") : t("rooms.moveCount", { count: batchSelected.size })}
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
