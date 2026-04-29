"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDevices, Device } from "@/hooks/useDevices";
import { useGatewayEvents } from "@/hooks/useGatewayEvents";
import { DEVICE_TYPE_LABELS, FUNC_LABELS, isGroupDevice } from "@/lib/types";

const TYPE_OPTIONS = [
  { label: "全部类型", value: "" },
  { label: "灯具", value: "1984" },
  { label: "开合帘", value: "1860" },
  { label: "卷帘", value: "1861" },
  { label: "开合帘带角度", value: "1862" },
  { label: "面板", value: "1218" },
  { label: "传感器", value: "1344" },
];

export default function DevicesPage() {
  const [filterType, setFilterType] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [filterAlive, setFilterAlive] = useState<number | undefined>(undefined);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [controlDevice, setControlDevice] = useState<Device | null>(null);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total: number;
    bound: number;
    skipped: number;
    roomsCreated: number;
    errors: number;
  } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<{ deviceId: string; roomName: string }[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showNameImportModal, setShowNameImportModal] = useState(false);
  const [nameUploadFile, setNameUploadFile] = useState<File | null>(null);
  const [namePreviewData, setNamePreviewData] = useState<{ deviceId: string; name: string }[] | null>(null);
  const [namePreviewError, setNamePreviewError] = useState<string | null>(null);
  const [nameImportResult, setNameImportResult] = useState<{
    total: number;
    updated: number;
    skipped: number;
    errors: number;
  } | null>(null);
  // 默认网关离线，直到确认连接
  const [gatewayOffline, setGatewayOffline] = useState(true);
  const { devices, loading, error, syncDevices, controlDevice: control, refetch, updateDevice } = useDevices(
    filterType ? { type: parseInt(filterType) } : undefined
  );
  const gatewayStatus = useGatewayEvents();

  // 监听网关离线状态 - 默认离线，只有确认连接才显示在线
  useEffect(() => {
    if (gatewayStatus.status === "connected") {
      setGatewayOffline(false);
    } else {
      setGatewayOffline(true);
    }
  }, [gatewayStatus.status]);

  // 页面加载时立即检查网关状态
  useEffect(() => {
    fetch("/api/gateway/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "connected") {
          setGatewayOffline(false);
        } else {
          setGatewayOffline(true);
        }
      })
      .catch(() => {
        setGatewayOffline(true);
      });
  }, []);

  useEffect(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []));
  }, []);

  // 获取扁平化的空间列表
  const flattenRooms = (roomList: any[], result: { id: string; name: string }[] = []): { id: string; name: string }[] => {
    roomList.forEach((r) => {
      result.push({ id: r.id, name: r.name });
      if (r.children?.length > 0) {
        flattenRooms(r.children, result);
      }
    });
    return result;
  };

  const flatRooms = flattenRooms(rooms);

  const filtered = devices.filter((d) => {
    // 排除组设备（统一显示到组设备管理模块）
    if (isGroupDevice(d.id)) return false;
    if (filterRoom && d.roomId !== filterRoom) return false;
    if (filterAlive !== undefined && d.alive !== filterAlive) return false;
    return true;
  });

  const handleToggle = async (device: Device, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!device.meshId) return;
    const value = JSON.parse(device.value || "[]");
    const newValue = value[0] === 1 ? [0] : [1];
    try {
      await control(device.id, "onoff", newValue, device.meshId);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "控制失败");
    }
  };

  const handleOpenControl = (device: Device, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setControlDevice(device);
  };

  const handleOpenEdit = (device: Device, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditDevice(device);
  };

  const handleSaveDevice = async (data: { name: string; roomId: string }) => {
    if (!editDevice) return;
    try {
      await updateDevice(editDevice.id, { name: data.name, roomId: data.roomId || null });
      setEditDevice(null);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存失败");
    }
  };

  const handleImportBinding = async () => {
    setShowImportModal(true);
    setUploadFile(null);
    setPreviewData(null);
    setPreviewError(null);
  };

  const handleNameImport = () => {
    setShowNameImportModal(true);
    setNameUploadFile(null);
    setNamePreviewData(null);
    setNamePreviewError(null);
    setNameImportResult(null);
  };

  const handleNameFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNameUploadFile(file);
    setNamePreviewData(null);
    setNamePreviewError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result;
        if (typeof text !== 'string') throw new Error('读取文件失败');
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('文件格式错误：应为 JSON 数组');
        for (const item of parsed) {
          if (!item.deviceId || !item.name) {
            throw new Error('文件格式错误：每条记录需包含 deviceId 和 name');
          }
        }
        setNamePreviewData(parsed as { deviceId: string; name: string }[]);
      } catch (err) {
        setNamePreviewError(err instanceof Error ? err.message : '解析文件失败');
        setNamePreviewData(null);
      }
    };
    reader.onerror = () => {
      setNamePreviewError('读取文件失败');
      setNamePreviewData(null);
    };
    reader.readAsText(file);
  };

  const handleExecuteNameImport = async () => {
    if (!nameUploadFile) return;
    setImporting(true);
    setNameImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', nameUploadFile);
      const res = await fetch('/api/import-device-names', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '导入失败');
        return;
      }
      setNameImportResult({
        total: data.summary.total,
        updated: data.summary.updated,
        skipped: data.summary.skipped,
        errors: data.summary.errors,
      });
      refetch();
    } catch (err) {
      alert('导入失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setImporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    setPreviewData(null);
    setPreviewError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result;
        if (typeof text !== 'string') throw new Error('读取文件失败');
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('文件格式错误：应为 JSON 数组');
        // Validate structure
        for (const item of parsed) {
          if (!item.deviceId || !item.roomName) {
            throw new Error('文件格式错误：每条记录需包含 deviceId 和 roomName');
          }
        }
        setPreviewData(parsed as { deviceId: string; roomName: string }[]);
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : '解析文件失败');
        setPreviewData(null);
      }
    };
    reader.onerror = () => {
      setPreviewError('读取文件失败');
      setPreviewData(null);
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!uploadFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await fetch('/api/import-room-binding', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '导入失败');
        return;
      }
      setImportResult({
        total: data.summary.total,
        bound: data.summary.bound,
        skipped: data.summary.skipped,
        roomsCreated: data.summary.roomsCreated,
        errors: data.summary.errors,
      });
      setShowImportModal(false);
      refetch();
    } catch (err) {
      alert('导入失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">设备管理</h1>
        <div className="flex gap-2">
          <button
            onClick={handleNameImport}
            disabled={importing}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-md transition-colors disabled:opacity-50"
          >
            {importing ? "导入中..." : "导入名称"}
          </button>
          <button
            onClick={handleImportBinding}
            disabled={importing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-md transition-colors disabled:opacity-50"
          >
            {importing ? "导入中..." : "导入位置"}
          </button>
          <button
            onClick={syncDevices}
            disabled={loading}
            className="px-4 py-2 bg-[#137fec] hover:bg-[#0d6dd9] text-white text-sm rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? "同步中..." : "同步设备"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm rounded-md px-4 py-3">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-[#101922] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={filterRoom}
          onChange={(e) => setFilterRoom(e.target.value)}
          className="bg-[#101922] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2"
        >
          <option value="">全部房间</option>
          {flatRooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <div className="flex gap-1">
          {[
            { label: "全部", value: undefined },
            { label: "在线", value: 1 },
            { label: "离线", value: 0 },
          ].map((o) => (
            <button
              key={String(o.value)}
              onClick={() => setFilterAlive(o.value)}
              className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                filterAlive === o.value
                  ? "bg-[#137fec]/20 border-[#137fec] text-[#3b9eff]"
                  : "bg-[#101922] border-[#1c2630] text-[#8a9baf] hover:text-white"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Device grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[#4a5b70] text-sm">
          {loading ? "加载中..." : "暂无设备，请先点击「同步设备」"}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              gatewayOffline={gatewayOffline}
              onToggle={handleToggle}
              onOpenControl={handleOpenControl}
              onOpenEdit={handleOpenEdit}
            />
          ))}
        </div>
      )}

      {/* Control Drawer */}
      {controlDevice && (
        <ControlDrawer
          device={controlDevice}
          onClose={() => setControlDevice(null)}
          onControl={control}
          onRefresh={refetch}
        />
      )}

      {/* Edit Modal */}
      {editDevice && (
        <EditDeviceModal
          device={editDevice}
          rooms={flatRooms}
          onClose={() => setEditDevice(null)}
          onSave={handleSaveDevice}
        />
      )}

      {/* Import Upload Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1f2e] rounded-xl border border-white/10 p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-4">
              <i className="fa fa-upload mr-2 text-emerald-400"></i>
              导入位置绑定
            </h3>

            {/* File upload area */}
            <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-[#253040] hover:border-[#137fec] rounded-lg p-8 cursor-pointer transition-colors mb-4">
              <i className="fas fa-cloud-upload-alt text-3xl text-[#4a5b70] mb-2"></i>
              <p className="text-sm text-[#8a9baf] mb-1">
                {uploadFile ? `已选择: ${uploadFile.name}` : '点击或拖拽上传 JSON 文件'}
              </p>
              <p className="text-xs text-[#4a5b70]">支持任意名称的 JSON 文件</p>
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>

            {/* Preview error */}
            {previewError && (
              <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm rounded-md px-4 py-3 mb-4">
                {previewError}
              </div>
            )}

            {/* Preview table */}
            {previewData && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-[#c0cad8]">
                    预览数据：<span className="text-emerald-400 font-mono">{previewData.length}</span> 条记录
                  </p>
                  <span className="text-xs text-[#4a5b70]">deviceId → roomName</span>
                </div>
                <div className="flex-1 overflow-y-auto rounded-md border border-[#1c2630]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#0d1520] z-10">
                      <tr className="border-b border-[#1c2630]">
                        <th className="text-left px-3 py-2 text-[#8a9baf] font-medium">设备 ID</th>
                        <th className="text-left px-3 py-2 text-[#8a9baf] font-medium">房间名称</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((item, i) => (
                        <tr key={i} className="border-b border-[#1c2630]/50 hover:bg-white/[0.02]">
                          <td className="px-3 py-1.5 font-mono text-xs text-[#c0cad8]">{item.deviceId}</td>
                          <td className="px-3 py-1.5 text-[#c0cad8]">{item.roomName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-4 pt-4 border-t border-white/5">
              <button
                onClick={() => setShowImportModal(false)}
                className="flex-1 px-4 py-2 bg-[#1c2630] text-[#c0cad8] rounded-md hover:bg-[#253040] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={!uploadFile || !previewData || importing}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? '导入中...' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result Modal */}
      {importResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1f2e] rounded-xl border border-white/10 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">
              <i className="fa fa-check-circle mr-2 text-emerald-400"></i>
              位置导入完成
            </h3>
            <div className="space-y-2 text-sm text-gray-300 mb-6">
              <div className="flex justify-between py-2 border-b border-white/5">
                <span>总记录数</span>
                <span className="font-mono">{importResult.total}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-emerald-400">成功绑定</span>
                <span className="font-mono text-emerald-400">{importResult.bound}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span>跳过(设备不存在)</span>
                <span className="font-mono">{importResult.skipped}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span>自动创建房间</span>
                <span className="font-mono text-blue-400">{importResult.roomsCreated}</span>
              </div>
              {importResult.errors > 0 && (
                <div className="flex justify-between py-2">
                  <span className="text-red-400">失败</span>
                  <span className="font-mono text-red-400">{importResult.errors}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="w-full px-4 py-2 bg-[#137fec] hover:bg-[#0d6dd9] text-white rounded-md transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Name Import Upload Modal */}
      {showNameImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1f2e] rounded-xl border border-white/10 p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-4">
              <i className="fa fa-upload mr-2 text-amber-400"></i>
              导入设备名称
            </h3>

            {/* File upload area */}
            <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-[#253040] hover:border-[#137fec] rounded-lg p-8 cursor-pointer transition-colors mb-4">
              <i className="fas fa-cloud-upload-alt text-3xl text-[#4a5b70] mb-2"></i>
              <p className="text-sm text-[#8a9baf] mb-1">
                {nameUploadFile ? `已选择: ${nameUploadFile.name}` : '点击或拖拽上传 JSON 文件'}
              </p>
              <p className="text-xs text-[#4a5b70]">格式: [{`{ "deviceId": "...", "name": "..." }`}]</p>
              <input
                type="file"
                accept=".json"
                onChange={handleNameFileSelect}
                className="hidden"
              />
            </label>

            {/* Preview error */}
            {namePreviewError && (
              <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm rounded-md px-4 py-3 mb-4">
                {namePreviewError}
              </div>
            )}

            {/* Preview table */}
            {namePreviewData && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-[#c0cad8]">
                    预览数据：<span className="text-amber-400 font-mono">{namePreviewData.length}</span> 条记录
                  </p>
                  <span className="text-xs text-[#4a5b70]">deviceId → name</span>
                </div>
                <div className="flex-1 overflow-y-auto rounded-md border border-[#1c2630]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#0d1520] z-10">
                      <tr className="border-b border-[#1c2630]">
                        <th className="text-left px-3 py-2 text-[#8a9baf] font-medium">设备 ID</th>
                        <th className="text-left px-3 py-2 text-[#8a9baf] font-medium">设备名称</th>
                      </tr>
                    </thead>
                    <tbody>
                      {namePreviewData.map((item, i) => (
                        <tr key={i} className="border-b border-[#1c2630]/50 hover:bg-white/[0.02]">
                          <td className="px-3 py-1.5 font-mono text-xs text-[#c0cad8]">{item.deviceId}</td>
                          <td className="px-3 py-1.5 text-[#c0cad8]">{item.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-4 pt-4 border-t border-white/5">
              <button
                onClick={() => setShowNameImportModal(false)}
                className="flex-1 px-4 py-2 bg-[#1c2630] text-[#c0cad8] rounded-md hover:bg-[#253040] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleExecuteNameImport}
                disabled={!nameUploadFile || !namePreviewData || importing}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? '导入中...' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Name Import Result Modal */}
      {nameImportResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1f2e] rounded-xl border border-white/10 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">
              <i className="fa fa-check-circle mr-2 text-amber-400"></i>
              名称导入完成
            </h3>
            <div className="space-y-2 text-sm text-gray-300 mb-6">
              <div className="flex justify-between py-2 border-b border-white/5">
                <span>总记录数</span>
                <span className="font-mono">{nameImportResult.total}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-amber-400">成功更新</span>
                <span className="font-mono text-amber-400">{nameImportResult.updated}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span>跳过(设备不存在)</span>
                <span className="font-mono">{nameImportResult.skipped}</span>
              </div>
              {nameImportResult.errors > 0 && (
                <div className="flex justify-between py-2">
                  <span className="text-red-400">失败</span>
                  <span className="font-mono text-red-400">{nameImportResult.errors}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setNameImportResult(null)}
              className="w-full px-4 py-2 bg-[#137fec] hover:bg-[#0d6dd9] text-white rounded-md transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeviceCard({
  device,
  gatewayOffline,
  onToggle,
  onOpenControl,
  onOpenEdit,
}: {
  device: Device;
  gatewayOffline: boolean;
  onToggle: (d: Device, e: React.MouseEvent) => void;
  onOpenControl: (d: Device, e: React.MouseEvent) => void;
  onOpenEdit: (d: Device, e: React.MouseEvent) => void;
}) {
  const typeLabel = DEVICE_TYPE_LABELS[device.type] ?? `类型${device.type}`;
  const funcLabel = FUNC_LABELS[device.func] ?? `功能${device.func}`;
  const valueArr: number[] = JSON.parse(device.value || "[]");
  const isOn = valueArr[0] === 1;
  const brightness = device.func === 3 || device.func === 4 || device.func === 5 ? valueArr[0] ?? 0 : null;
  const online = !gatewayOffline && device.alive === 1;

  return (
    <Link href={`/devices/${device.id}`} className="block">
      <div
        className={`bg-[#101922] rounded-lg border transition-colors hover:border-[#253040] ${
          online ? "border-[#1c2630]" : "border-[#1c2630] opacity-60"
        }`}
      >
        {/* Card header */}
        <div className="flex items-start justify-between p-4">
          <div>
            <p className="text-sm font-medium text-white">{device.name || device.gatewayName || device.id}</p>
            <p className="text-xs text-[#4a5b70] mt-0.5">
              {typeLabel} · {funcLabel}
            </p>
            {device.room && (
              <p className="text-xs text-[#4a5b70] mt-0.5">
                <i className="fas fa-map-marker-alt mr-1"></i>
                {device.room.name}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                online
                  ? "bg-green-900/30 text-green-400"
                  : "bg-red-900/30 text-red-400"
              }`}
            >
              {online ? "在线" : "离线"}
            </span>
            {/* Action buttons */}
            <div className="flex gap-1">
              <button
                onClick={(e) => onOpenControl(device, e)}
                disabled={!online || !device.meshId}
                className="w-8 h-8 rounded flex items-center justify-center bg-[#137fec]/20 hover:bg-[#137fec]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="控制"
              >
                <i className="fas fa-sliders-h text-[#3b9eff] text-sm"></i>
              </button>
              <button
                onClick={(e) => onOpenEdit(device, e)}
                className="w-8 h-8 rounded flex items-center justify-center bg-[#1c2630] hover:bg-[#253040] transition-colors"
                title="编辑属性"
              >
                <i className="fas fa-edit text-[#8a9baf] text-sm"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Brightness bar for dimmable devices */}
        {brightness !== null && (
          <div className="px-4 pb-4">
            <div className="flex justify-between text-xs text-[#4a5b70] mb-1">
              <span>亮度</span>
              <span>{brightness}%</span>
            </div>
            <div className="h-1.5 bg-[#1c2630] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#137fec] rounded-full transition-all"
                style={{ width: `${brightness}%` }}
              />
            </div>
          </div>
        )}

      </div>
    </Link>
  );
}

function ControlDrawer({
  device,
  onClose,
  onControl,
  onRefresh,
}: {
  device: Device;
  onClose: () => void;
  onControl: (id: string, action: string, value: number[], meshId: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const valueArr: number[] = JSON.parse(device.value || "[]");
  const isOn = valueArr[0] === 1;
  const brightness = device.func === 3 || device.func === 4 || device.func === 5 ? valueArr[0] ?? 0 : null;
  const colorTemp = device.func === 4 ? (valueArr[1] ?? 4000) : null;
  const [localBrightness, setLocalBrightness] = useState(brightness ?? 0);
  const [localColorTemp, setLocalColorTemp] = useState(colorTemp ?? 4000);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalBrightness(brightness ?? 0);
    setLocalColorTemp(colorTemp ?? 4000);
  }, [brightness, colorTemp]);

  const handleOnOff = async () => {
    if (!device.meshId) return;
    setSaving(true);
    try {
      const newValue = isOn ? [0] : [1];
      await onControl(device.id, "onoff", newValue, device.meshId);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "控制失败");
    } finally {
      setSaving(false);
    }
  };

  const handleBrightnessChange = async (value: number) => {
    setLocalBrightness(value);
    if (!device.meshId) return;
    setSaving(true);
    try {
      await onControl(device.id, "dim", [value], device.meshId);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "控制失败");
    } finally {
      setSaving(false);
    }
  };

  const handleColorTempChange = async (value: number) => {
    setLocalColorTemp(value);
    if (!device.meshId) return;
    setSaving(true);
    try {
      await onControl(device.id, "cct", [localBrightness, value], device.meshId);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "控制失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Drawer */}
      <div className="ml-auto w-[400px] h-full bg-[#0d1520] border-l border-[#1c2630] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1c2630]">
          <h3 className="text-white font-medium">设备控制</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <i className="fas fa-times"></i>
          </button>
        </div>
        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Device info */}
          <div className="p-4 bg-white/5 rounded-lg">
            <p className="text-white font-medium">{device.name || device.gatewayName || device.id}</p>
            <p className="text-xs text-[#4a5b70] mt-1">
              <i className="fas fa-map-marker-alt mr-1"></i>
              {device.room?.name || "未绑定"}
            </p>
            <p className="text-xs text-[#4a5b70] mt-0.5">
              {DEVICE_TYPE_LABELS[device.type] || `类型${device.type}`} · {FUNC_LABELS[device.func] || `功能${device.func}`}
            </p>
          </div>

          {/* Power control */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-[#c0cad8]">电源</span>
              <button
                onClick={handleOnOff}
                disabled={saving || !device.meshId}
                className={`px-6 py-2 rounded text-sm transition-colors ${
                  isOn ? "bg-[#137fec]" : "bg-[#253040]"
                } ${saving ? "opacity-50" : ""}`}
              >
                {isOn ? "开启" : "关闭"}
              </button>
            </div>
          </div>

          {/* Brightness slider */}
          {brightness !== null && (
            <div>
              <div className="flex justify-between text-sm text-[#c0cad8] mb-2">
                <span>亮度</span>
                <span>{localBrightness}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={localBrightness}
                onChange={(e) => setLocalBrightness(parseInt(e.target.value))}
                onMouseUp={(e) => handleBrightnessChange(parseInt((e.target as HTMLInputElement).value))}
                className="w-full accent-[#137fec]"
              />
            </div>
          )}

          {/* Color temperature slider */}
          {colorTemp !== null && (
            <div>
              <div className="flex justify-between text-sm text-[#c0cad8] mb-2">
                <span>色温</span>
                <span>{localColorTemp}K</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#4a5b70]">2700K</span>
                <input
                  type="range"
                  min="2700"
                  max="6500"
                  step="100"
                  value={localColorTemp}
                  onChange={(e) => setLocalColorTemp(parseInt(e.target.value))}
                  onMouseUp={(e) => handleColorTempChange(parseInt((e.target as HTMLInputElement).value))}
                  className="flex-1 accent-[#137fec]"
                />
                <span className="text-xs text-[#4a5b70]">6500K</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditDeviceModal({
  device,
  rooms,
  onClose,
  onSave,
}: {
  device: Device;
  rooms: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: { name: string; roomId: string }) => void;
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
        <h3 className="text-lg font-medium text-white mb-6">编辑设备属性</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Device name */}
          <div>
            <label className="block text-sm font-medium text-[#8a9baf] mb-2">设备名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 focus:border-[#137fec] focus:outline-none"
              placeholder="请输入设备名称"
            />
          </div>

          {/* Device location */}
          <div>
            <label className="block text-sm font-medium text-[#8a9baf] mb-2">设备位置</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 focus:border-[#137fec] focus:outline-none"
            >
              <option value="">未绑定</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Light parameters (only for lights) */}
          {device.type === 1984 && (
            <div className="p-4 bg-[#137fec]/10 rounded-lg border border-[#137fec]/20">
              <h4 className="text-sm font-medium text-white mb-4">灯光参数</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#8a9baf] mb-2">渐变时长 (ms)</label>
                  <input
                    type="number"
                    defaultValue="1000"
                    min="0"
                    max="5000"
                    step="100"
                    className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 focus:border-[#137fec] focus:outline-none"
                  />
                  <p className="text-xs text-[#4a5b70] mt-1">灯光开关或调光时的渐变时间</p>
                </div>
                <div>
                  <label className="block text-xs text-[#8a9baf] mb-2">调光范围</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#4a5b70]">最小亮度 (%)</label>
                      <input
                        type="number"
                        defaultValue="10"
                        min="0"
                        max="100"
                        className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 mt-1 focus:border-[#137fec] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#4a5b70]">最大亮度 (%)</label>
                      <input
                        type="number"
                        defaultValue="100"
                        min="0"
                        max="100"
                        className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 mt-1 focus:border-[#137fec] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
                {device.func === 4 && (
                  <div>
                    <label className="block text-xs text-[#8a9baf] mb-2">色温范围</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[#4a5b70]">最低色温 (K)</label>
                        <input
                          type="number"
                          defaultValue="2700"
                          min="2000"
                          max="6500"
                          step="100"
                          className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 mt-1 focus:border-[#137fec] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[#4a5b70]">最高色温 (K)</label>
                        <input
                          type="number"
                          defaultValue="6500"
                          min="2000"
                          max="6500"
                          step="100"
                          className="w-full bg-[#101922] border border-[#1c2630] text-white rounded-md px-3 py-2 mt-1 focus:border-[#137fec] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-[#1c2630] text-[#c0cad8] rounded-md hover:bg-[#253040] transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-[#137fec] text-white rounded-md hover:bg-[#0d6dd9] transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
