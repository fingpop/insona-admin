"use client";

import { useCallback, useEffect, useState } from "react";
import { useGatewayEvents } from "@/hooks/useGatewayEvents";

interface DiagnosticResult {
  ping: "ok" | "fail" | "unknown";
  tcp: "ok" | "fail" | "unknown";
  rawMessages?: string[];
  errors?: string[];
  error?: string;
}

interface GatewayInfo {
  id: string;
  name: string;
  ip: string;
  port: number;
  status: string;
  liveStatus?: string;
  lastSeen: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const { status } = useGatewayEvents();
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Add gateway form state
  const [newName, setNewName] = useState("");
  const [newIp, setNewIp] = useState("");
  const [newPort, setNewPort] = useState("8091");
  const [adding, setAdding] = useState(false);

  // Device power settings
  const [devices, setDevices] = useState<{
    id: string;
    name: string;
    type: number;
    ratedPower: number;
  }[]>([]);
  const [powerDrafts, setPowerDrafts] = useState<Record<string, string>>({});
  const [savingPower, setSavingPower] = useState(false);

  // System reset
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // System update
  const [version, setVersion] = useState<{ version: string; platform: string } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateLogs, setUpdateLogs] = useState<string[]>([]);
  const [updateMsg, setUpdateMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const loadGateways = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway/list");
      const data = await res.json();
      setGateways(data.gateways ?? []);
    } catch {
      setGateways([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGateways();
    fetch("/api/devices")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices ?? []));
    fetch("/api/system/version")
      .then((r) => r.json())
      .then((v) => setVersion(v))
      .catch(() => {});
  }, [loadGateways]);

  const handleAddGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIp.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/gateway/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim() || undefined,
          ip: newIp.trim(),
          port: parseInt(newPort) || 8091,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "添加失败");
      setNewName(""); setNewIp(""); setNewPort("8091");
      await loadGateways();
    } catch (err) {
      alert(err instanceof Error ? err.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const savePower = useCallback(async (deviceId: string) => {
    const value = powerDrafts[deviceId];
    if (value === undefined) return;
    setSavingPower(true);
    try {
      await fetch(`/api/devices/${deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratedPower: parseFloat(value) }),
      });
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, ratedPower: parseFloat(value) } : d))
      );
      const next = { ...powerDrafts };
      delete next[deviceId];
      setPowerDrafts(next);
    } finally {
      setSavingPower(false);
    }
  }, [powerDrafts]);

  const handleReset = async () => {
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/system/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "重置失败");
      setResetMsg({ type: "success", text: "系统已重置，所有数据已清空" });
      setShowResetConfirm(false);
      setDevices([]);
      setGateways([]);
    } catch (err) {
      setResetMsg({ type: "error", text: err instanceof Error ? err.message : "重置失败" });
    } finally {
      setResetting(false);
    }
  };

  // System update handlers
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateMsg(null);
    try {
      await fetch("/api/system/version", { cache: "no-store" });
      setUpdateMsg({ type: "success", text: `当前版本: ${version?.version}，如需更新请执行升级` });
    } catch {
      setUpdateMsg({ type: "error", text: "检查更新失败" });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateMsg(null);
    setUpdateLogs(["开始升级..."]);
    try {
      const res = await fetch("/api/system/update", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "升级失败");
      setUpdateLogs(data.logs ?? []);
      setUpdateMsg({ type: "success", text: "升级成功，页面将在 3 秒后刷新" });
      setTimeout(() => window.location.reload(), 3000);
    } catch (err) {
      setUpdateLogs((prev) => [...prev, `错误: ${err instanceof Error ? err.message : "未知错误"}`]);
      setUpdateMsg({ type: "error", text: err instanceof Error ? err.message : "升级失败" });
    } finally {
      setUpdating(false);
    }
  };

  const overallStatus = gateways.some((g) => g.liveStatus === "connected")
    ? "connected"
    : gateways.some((g) => g.liveStatus === "reconnecting")
      ? "reconnecting"
      : "disconnected";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-white">系统设置</h1>

      {/* Overall status bar */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[#8a9baf]">网关状态:</span>
        <span className={`w-2 h-2 rounded-full ${overallStatus === "connected" ? "bg-green-500 animate-pulse" : overallStatus === "reconnecting" ? "bg-yellow-500" : "bg-red-500"}`} />
        <span className={overallStatus === "connected" ? "text-green-400" : "text-[#8a9baf]"}>
          {overallStatus === "connected" ? "已连接" : overallStatus === "reconnecting" ? "重连中" : "未连接"}
        </span>
        {gateways.length > 0 && (
          <span className="text-[#4a5b70]">({gateways.length} 个网关)</span>
        )}
      </div>

      {/* Gateway management */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white">网关管理</h2>

        {/* Add gateway form */}
        <form onSubmit={handleAddGateway} className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="网关名称（可选）"
            className="w-32 bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#137fec]"
          />
          <input
            type="text"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            placeholder="网关 IP 地址"
            className="flex-1 bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#137fec]"
          />
          <input
            type="number"
            value={newPort}
            onChange={(e) => setNewPort(e.target.value)}
            placeholder="端口"
            className="w-24 bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#137fec]"
          />
          <button
            type="submit"
            disabled={adding || !newIp.trim()}
            className="px-5 py-2 bg-[#137fec] hover:bg-[#0d6dd9] text-white text-sm rounded-md transition-colors disabled:opacity-40"
          >
            {adding ? "添加中..." : "添加网关"}
          </button>
        </form>

        {/* Gateway list */}
        {loading ? (
          <p className="text-sm text-[#4a5b70] text-center py-4">加载中...</p>
        ) : gateways.length === 0 ? (
          <p className="text-sm text-[#4a5b70] text-center py-4">暂无网关，请添加</p>
        ) : (
          <div className="space-y-3">
            {gateways.map((gw) => (
              <GatewayCard key={gw.id} gateway={gw} onRefresh={loadGateways} />
            ))}
          </div>
        )}
      </div>

      {/* Device power settings */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1c2630]">
          <h2 className="text-sm font-medium text-white">设备额定功率设置</h2>
          <p className="text-xs text-[#4a5b70] mt-1">
            用于能耗统计的参考功率值（单位：瓦特 W）
          </p>
        </div>

        {devices.length === 0 ? (
          <p className="text-[#4a5b70] text-sm text-center py-8">
            暂无设备，连接网关后点击「同步设备」获取
          </p>
        ) : (
          <div className="divide-y divide-[#1c2630]">
            {devices.map((device) => (
              <div key={device.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#c0cad8] truncate">{device.name}</p>
                  <p className="text-xs text-[#4a5b70]">ID: {device.id}</p>
                </div>
                <div className="flex items-center gap-2 w-40">
                  <input
                    type="number"
                    defaultValue={device.ratedPower}
                    onChange={(e) =>
                      setPowerDrafts((prev) => ({ ...prev, [device.id]: e.target.value }))
                    }
                    className="w-full bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[#137fec]"
                    step="0.1"
                  />
                  <span className="text-xs text-[#4a5b70] w-5">W</span>
                </div>
                {powerDrafts[device.id] !== undefined && (
                  <button
                    onClick={() => savePower(device.id)}
                    disabled={savingPower}
                    className="px-3 py-1.5 bg-[#137fec] text-white text-xs rounded-md disabled:opacity-50"
                  >
                    保存
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System update */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white">系统更新</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-xs text-[#4a5b70]">当前版本</p>
            <p className="text-sm text-[#c0cad8] font-mono">{version?.version ?? "—"}</p>
          </div>
          <div className="flex-1">
            <p className="text-xs text-[#4a5b70]">运行平台</p>
            <p className="text-sm text-[#c0cad8] font-mono">{version?.platform ?? "—"}</p>
          </div>
        </div>

        {updateMsg && (
          <div className={`text-sm rounded-md px-4 py-3 ${
            updateMsg.type === "success"
              ? "bg-green-900/20 border border-green-800 text-green-400"
              : "bg-red-900/20 border border-red-800 text-red-400"
          }`}>
            {updateMsg.text}
          </div>
        )}

        {updateLogs.length > 0 && (
          <div className="bg-[#0a1019] rounded border border-[#1c2630] p-3 max-h-48 overflow-y-auto space-y-1">
            {updateLogs.map((log, i) => (
              <pre key={i} className="text-xs text-[#8a9baf] whitespace-pre-wrap break-all font-mono">
                {log}
              </pre>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleCheckUpdate}
            disabled={checkingUpdate || updating}
            className="px-5 py-2 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-sm rounded-md transition-colors disabled:opacity-40"
          >
            {checkingUpdate ? "检查中..." : "检查更新"}
          </button>
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="px-5 py-2 bg-[#137fec] hover:bg-[#0d6dd9] text-white text-sm rounded-md transition-colors disabled:opacity-40"
          >
            {updating ? "升级中..." : "立即更新"}
          </button>
        </div>
        <p className="text-xs text-[#4a5b70]">
          注意: 升级通过服务器端脚本执行，需确保部署环境已配置 docker-compose.prod.yml。
        </p>
        <p className="text-xs text-[#3b9eff]">
          手动升级: SSH 到服务器后执行 bash deploy/update.sh
        </p>
      </div>

      {/* System reset */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5 space-y-4">
        <h2 className="text-sm font-medium text-white">系统重置</h2>
        <p className="text-xs text-[#4a5b70]">
          清空所有数据（设备、空间、场景、能耗记录），并解除网关绑定。执行后将返回初始状态，可重新连接新网关。
        </p>

        {resetMsg && (
          <div
            className={`text-sm rounded-md px-4 py-3 ${
              resetMsg.type === "success"
                ? "bg-green-900/20 border border-green-800 text-green-400"
                : "bg-red-900/20 border border-red-800 text-red-400"
            }`}
          >
            {resetMsg.text}
          </div>
        )}

        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors"
          >
            重置系统
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-400">确定要重置系统吗？此操作不可撤销。</p>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                disabled={resetting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors disabled:opacity-50"
              >
                {resetting ? "重置中..." : "确认重置"}
              </button>
              <button
                onClick={() => { setShowResetConfirm(false); setResetMsg(null); }}
                className="px-5 py-2 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-sm rounded-md transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GatewayCard({
  gateway,
  onRefresh,
}: {
  gateway: GatewayInfo;
  onRefresh: () => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [removing, setRemoving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const liveStatus = gateway.liveStatus || gateway.status;
  const statusColor =
    liveStatus === "connected"
      ? "bg-green-500"
      : liveStatus === "reconnecting"
        ? "bg-yellow-500"
        : liveStatus === "error"
          ? "bg-red-600"
          : "bg-red-500";
  const statusText =
    liveStatus === "connected"
      ? "已连接"
      : liveStatus === "reconnecting"
        ? "重连中"
        : liveStatus === "connecting"
          ? "连接中"
          : liveStatus === "error"
            ? "错误"
            : "未连接";

  const handleConnect = async () => {
    setConnecting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gateway/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayId: gateway.id, ip: gateway.ip, port: gateway.port }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "连接失败");
      setMsg({ type: "success", text: `已连接到 ${gateway.ip}` });
      await onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "连接失败" });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await fetch("/api/gateway/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gatewayId: gateway.id }),
    });
    setMsg({ type: "success", text: "已断开连接" });
    await onRefresh();
  };

  const runDiagnostic = async () => {
    setDiagnosing(true);
    setDiagnostic({ ping: "unknown", tcp: "unknown" });
    try {
      const res = await fetch("/api/gateway/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: gateway.ip, port: gateway.port }),
      });
      const data = await res.json();
      setDiagnostic(data);
    } catch (err) {
      setDiagnostic({ ping: "fail", tcp: "fail", error: err instanceof Error ? err.message : "检测失败" });
    } finally {
      setDiagnosing(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch("/api/gateway/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayId: gateway.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "删除失败");
      await onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "删除失败" });
      setShowDeleteConfirm(false);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-[#0a1019] rounded-lg border border-[#1c2630] p-4 space-y-3">
      {/* Header: name + status */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white">{gateway.name || `${gateway.ip}:${gateway.port}`}</h3>
          <p className="text-xs text-[#4a5b70]">{gateway.ip}:{gateway.port}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor} ${liveStatus === "connected" ? "animate-pulse" : ""}`} />
          <span className="text-xs text-[#8a9baf]">{statusText}</span>
        </div>
      </div>

      {/* Messages */}
      {msg && (
        <div className={`text-sm rounded-md px-3 py-2 ${
          msg.type === "success"
            ? "bg-green-900/20 border border-green-800 text-green-400"
            : "bg-red-900/20 border border-red-800 text-red-400"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {liveStatus !== "connected" ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-4 py-1.5 bg-[#137fec] hover:bg-[#0d6dd9] text-white text-xs rounded-md transition-colors disabled:opacity-40"
          >
            {connecting ? "连接中..." : "连接"}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="px-4 py-1.5 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-xs rounded-md transition-colors"
          >
            断开
          </button>
        )}
        <button
          onClick={runDiagnostic}
          disabled={diagnosing}
          className="px-4 py-1.5 bg-[#1c2630] hover:bg-[#253040] text-[#3b9eff] text-xs rounded-md transition-colors disabled:opacity-40"
        >
          {diagnosing ? "检测中..." : "诊断"}
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={removing}
          className="px-4 py-1.5 text-red-400 hover:text-red-300 text-xs transition-colors disabled:opacity-40"
        >
          {removing ? "删除中..." : "删除"}
        </button>
      </div>

      {/* Diagnostic results */}
      {diagnostic && (
        <div className="space-y-2">
          <DiagnosticRow
            label="TCP 连接"
            status={diagnostic.tcp}
            detail={diagnostic.errors?.length ? diagnostic.errors.join(", ") : "连接成功"}
          />
          {diagnostic.rawMessages && diagnostic.rawMessages.length > 0 ? (
            <div>
              <p className="text-xs text-[#4a5b70] mb-1">网关原始响应:</p>
              <div className="bg-[#0a1019] rounded border border-[#1c2630] p-3 max-h-32 overflow-y-auto space-y-1">
                {diagnostic.rawMessages.map((m, i) => (
                  <pre key={i} className="text-xs text-[#3b9eff] whitespace-pre-wrap break-all font-mono">
                    {m}
                  </pre>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-yellow-400">⚠️ 未收到任何响应</p>
          )}
          {diagnostic.tcp === "ok" && (diagnostic.rawMessages?.length ?? 0) > 0 && (
            <p className="text-xs text-green-400">✅ 网关响应正常！</p>
          )}
          {diagnostic.error && (
            <p className="text-xs text-red-400">错误: {diagnostic.error}</p>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-red-400">确定要删除此网关吗？设备不会被删除。</span>
          <button onClick={handleRemove} className="px-3 py-1 bg-red-600 text-white text-xs rounded-md">确认</button>
          <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1 bg-[#1c2630] text-[#8a9baf] text-xs rounded-md">取消</button>
        </div>
      )}
    </div>
  );
}

function DiagnosticRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: "ok" | "fail" | "unknown";
  detail: string;
}) {
  const icon = status === "ok" ? "✅" : status === "fail" ? "❌" : "⏳";
  const textColor =
    status === "ok" ? "text-green-400" : status === "fail" ? "text-red-400" : "text-[#4a5b70]";
  return (
    <div className="flex items-center gap-3 text-xs">
      <span>{icon}</span>
      <div>
        <span className={textColor}>{label}</span>
        <span className="text-[#4a5b70] ml-2">{detail}</span>
      </div>
    </div>
  );
}
