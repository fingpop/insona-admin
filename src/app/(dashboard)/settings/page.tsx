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

export default function SettingsPage() {
  const { status } = useGatewayEvents();
  const [gatewayIp, setGatewayIp] = useState("");
  const [gatewayPort, setGatewayPort] = useState("8091");
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [devices, setDevices] = useState<{
    id: string;
    name: string;
    type: number;
    ratedPower: number;
  }[]>([]);
  const [powerDrafts, setPowerDrafts] = useState<Record<string, string>>({});
  const [savingPower, setSavingPower] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/gateway/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.ip) setGatewayIp(d.ip);
        if (d.port) setGatewayPort(String(d.port ?? "8091"));
      });

    fetch("/api/devices")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices ?? []));
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gatewayIp.trim()) return;
    setConnecting(true);
    setMsg(null);
    setDiagnostic(null);
    try {
      const res = await fetch("/api/gateway/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: gatewayIp.trim(),
          port: parseInt(gatewayPort) || 8091,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "连接失败");
      setMsg({ type: "success", text: `已连接到 ${gatewayIp}` });
      // Trigger device sync in background
      fetch("/api/devices", { method: "POST" });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "连接失败" });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await fetch("/api/gateway/disconnect", { method: "POST" });
    setMsg({ type: "success", text: "已断开连接" });
  };

  const runDiagnostic = async () => {
    if (!gatewayIp.trim()) return;
    setDiagnosing(true);
    setDiagnostic({ ping: "unknown", tcp: "unknown" });

    // Test 1: ping via HTTP proxy (browser can't ping, but we can check if port is open via fetch)
    // Since we can't ping from browser, we'll test TCP via our own API
    try {
      const res = await fetch("/api/gateway/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: gatewayIp.trim(), port: parseInt(gatewayPort) || 8091 }),
      });
      const data = await res.json();
      setDiagnostic(data);
    } catch (err) {
      setDiagnostic({ ping: "fail", tcp: "fail", error: err instanceof Error ? err.message : "检测失败" });
    } finally {
      setDiagnosing(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/system/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "重置失败");
      setResetMsg({ type: "success", text: "系统已重置，所有数据已清空，请重新连接网关" });
      setShowResetConfirm(false);
      setDevices([]);
      setGatewayIp("");
      setGatewayPort("8091");
    } catch (err) {
      setResetMsg({ type: "error", text: err instanceof Error ? err.message : "重置失败" });
    } finally {
      setResetting(false);
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

  const statusColor =
    status === "connected"
      ? "bg-green-500"
      : status === "reconnecting"
      ? "bg-yellow-500"
      : "bg-red-500";
  const statusText =
    status === "connected"
      ? "已连接"
      : status === "reconnecting"
      ? "重新连接中"
      : status === "connecting"
      ? "连接中"
      : "未连接";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-white">系统设置</h1>

      {/* Gateway connection */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-white">网关连接</h2>
          <div className="flex items-center gap-3">
            {status === "connected" && (
              <button
                onClick={handleDisconnect}
                className="text-xs text-[#8a9baf] hover:text-red-400 transition-colors"
              >
                断开连接
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${statusColor} ${status === "connected" ? "animate-pulse" : ""}`} />
              <span className="text-xs text-[#8a9baf]">{statusText}</span>
            </div>
          </div>
        </div>

        {msg && (
          <div
            className={`text-sm rounded-md px-4 py-3 ${
              msg.type === "success"
                ? "bg-green-900/20 border border-green-800 text-green-400"
                : "bg-red-900/20 border border-red-800 text-red-400"
            }`}
          >
            {msg.text}
          </div>
        )}

        <form onSubmit={handleConnect} className="flex gap-3">
          <input
            type="text"
            value={gatewayIp}
            onChange={(e) => setGatewayIp(e.target.value)}
            placeholder="网关 IP 地址 (例如 192.168.10.100)"
            className="flex-1 bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#137fec]"
          />
          <input
            type="number"
            value={gatewayPort}
            onChange={(e) => setGatewayPort(e.target.value)}
            placeholder="端口"
            className="w-24 bg-[#0a1019] border border-[#1c2630] text-[#c0cad8] text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#137fec]"
          />
          <button
            type="submit"
            disabled={connecting || !gatewayIp.trim()}
            className="px-5 py-2 bg-[#137fec] hover:bg-[#0d6dd9] text-white text-sm rounded-md transition-colors disabled:opacity-40"
          >
            {connecting ? "连接中..." : "连接"}
          </button>
        </form>

        {/* Connection diagnostic */}
        <div className="border-t border-[#1c2630] pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-[#8a9baf]">网络诊断</h3>
            <button
              onClick={runDiagnostic}
              disabled={diagnosing || !gatewayIp.trim()}
              className="text-xs text-[#3b9eff] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {diagnosing ? "检测中..." : "运行诊断"}
            </button>
          </div>

          {diagnostic && (
            <div className="space-y-3">
              <DiagnosticRow
                label="TCP 连接"
                status={diagnostic.tcp}
                detail={diagnostic.errors?.length ? diagnostic.errors.join(", ") : "连接成功"}
              />
              {diagnostic.rawMessages && diagnostic.rawMessages.length > 0 ? (
                <div>
                  <p className="text-xs text-[#4a5b70] mb-1">网关原始响应:</p>
                  <div className="bg-[#0a1019] rounded border border-[#1c2630] p-3 max-h-48 overflow-y-auto space-y-1">
                    {diagnostic.rawMessages.map((msg, i) => (
                      <pre key={i} className="text-xs text-[#3b9eff] whitespace-pre-wrap break-all font-mono">
                        {msg}
                      </pre>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-yellow-400">
                  ⚠️ 未收到任何响应 — 网关可能不支持 c.query 方法，或使用了不同的协议格式
                </p>
              )}
              {diagnostic.error && (
                <p className="text-xs text-red-400 mt-2">错误详情: {diagnostic.error}</p>
              )}
              {diagnostic.tcp === "ok" && diagnostic.rawMessages?.length === 0 && (
                <p className="text-xs text-yellow-400 mt-1">
                  连接成功但网关未响应。请检查网关协议版本是否与文档一致。
                </p>
              )}
              {diagnostic.tcp === "ok" && (diagnostic.rawMessages?.length ?? 0) > 0 && (
                <p className="text-xs text-green-400 mt-1">
                  ✅ 网关响应正常！请点击「同步设备」获取设备列表
                </p>
              )}
              {diagnostic.ping === "fail" && (
                <p className="text-xs text-yellow-400 mt-1">
                  ⚠️ 网关不可达。请确认：<br />
                  1. IP 地址 {gatewayIp} 是否正确？<br />
                  2. Mac 与网关在同一局域网？<br />
                  3. 网关设备已开机且网络正常？
                </p>
              )}
            </div>
          )}

          {!diagnostic && (
            <p className="text-xs text-[#4a5b70]">
              点击「运行诊断」检查网关 {gatewayIp || "192.168.10.100"} 是否可连接
            </p>
          )}
        </div>
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

function DiagnosticRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: "ok" | "fail" | "unknown";
  detail: string;
}) {
  const icon =
    status === "ok" ? "✅" : status === "fail" ? "❌" : "⏳";
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
