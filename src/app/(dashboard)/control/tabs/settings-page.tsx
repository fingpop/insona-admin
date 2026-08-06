"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useGatewayEvents } from "@/hooks/useGatewayEvents";

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
  const { t } = useTranslation();
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newIp, setNewIp] = useState("");
  const [newPort, setNewPort] = useState("8091");
  const [adding, setAdding] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

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

  useEffect(() => { loadGateways(); }, [loadGateways]);

  // 订阅 SSE 事件，实时更新网关连接状态
  const { subscribe } = useGatewayEvents()
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === "connected" || event.type === "disconnected") {
        loadGateways()
      }
    })
    return unsubscribe
  }, [subscribe, loadGateways])

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
      if (!res.ok) throw new Error(data.error ?? t("settings.addFailed"));
      setNewName(""); setNewIp(""); setNewPort("8091");
      await loadGateways();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("settings.addFailed"));
    } finally {
      setAdding(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/system/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("settings.resetFailed"));
      setResetMsg({ type: "success", text: t("settings.resetSuccess") });
      setShowResetConfirm(false);
      setGateways([]);
    } catch (err) {
      setResetMsg({ type: "error", text: err instanceof Error ? err.message : t("settings.resetFailed") });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fade-in">
      {/* 多网关管理 */}
      <div className="card max-w-2xl">
        <h3 className="text-lg font-bold text-white mb-4">{t("settings.gatewayManagement")}</h3>

        {/* 添加网关表单 */}
        <form onSubmit={handleAddGateway} className="flex flex-wrap items-end gap-3 mb-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400">{t("settings.name")}</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("settings.optional")}
              className="input-field w-28"
              style={{ padding: '8px 12px', fontSize: '14px' }}
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <label className="text-xs text-gray-400">{t("settings.ipAddress")}</label>
            <input
              type="text"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              placeholder={t("settings.ipExample")}
              className="input-field"
              style={{ padding: '8px 12px', fontSize: '14px' }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400">{t("settings.port")}</label>
            <input
              type="number"
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              placeholder="8091"
              className="input-field w-24"
              style={{ padding: '8px 12px', fontSize: '14px' }}
            />
          </div>
          <button
            type="submit"
            disabled={adding || !newIp.trim()}
            className="btn btn-primary"
            style={{
              padding: '8px 20px',
              fontSize: '14px',
              opacity: (adding || !newIp.trim()) ? 0.4 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {adding ? t("settings.adding") : t("settings.addGateway")}
          </button>
        </form>

        {/* 网关列表 */}
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-4">{t("common.loading")}</p>
        ) : gateways.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">{t("settings.noGateways")}</p>
        ) : (
          <div className="space-y-3">
            {gateways.map((gw) => (
              <GatewayCard key={gw.id} gateway={gw} onRefresh={loadGateways} />
            ))}
          </div>
        )}
      </div>

      {/* 协议信息 */}
      <div className="card mt-6 max-w-2xl">
        <h3 className="text-lg font-bold text-white mb-4">{t("settings.protocolInfo")}</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-400">{t("settings.transport")}</span><span className="text-white">TCP</span></div>
          <div className="flex justify-between"><span className="text-gray-400">{t("settings.defaultPort")}</span><span className="text-white">8091</span></div>
          <div className="flex justify-between"><span className="text-gray-400">{t("settings.messageFormat")}</span><span className="text-white">JSON</span></div>
          <div className="flex justify-between"><span className="text-gray-400">{t("settings.communication")}</span><span className="text-white">{t("settings.bidirectional")}</span></div>
        </div>
      </div>

      {/* 系统重置 */}
      <div className="card mt-6 max-w-2xl border border-red-500/20">
        <h3 className="text-lg font-bold text-white mb-3">{t("settings.reset")}</h3>
        <p className="text-sm text-gray-500 mb-4">
          {t("settings.resetDescription")}
        </p>

        {resetMsg && (
          <div className={`text-sm rounded-md px-4 py-3 mb-4 ${
            resetMsg.type === "success"
              ? "bg-green-900/20 border border-green-800 text-green-400"
              : "bg-red-900/20 border border-red-800 text-red-400"
          }`}>
            {resetMsg.text}
          </div>
        )}

        {!showResetConfirm ? (
          <button onClick={() => setShowResetConfirm(true)} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors">
            {t("settings.resetSystem")}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-400">{t("settings.confirmResetDescription")}</p>
            <div className="flex gap-3">
              <button onClick={handleReset} disabled={resetting} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors disabled:opacity-50">
                {resetting ? t("settings.resetting") : t("settings.confirmReset")}
              </button>
              <button onClick={() => { setShowResetConfirm(false); setResetMsg(null); }} className="px-5 py-2 bg-[#1c2630] hover:bg-[#253040] text-gray-400 text-sm rounded-md transition-colors">
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GatewayCard({ gateway, onRefresh }: { gateway: GatewayInfo; onRefresh: () => void }) {
  const { t } = useTranslation();
  const [connecting, setConnecting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const liveStatus = gateway.liveStatus || gateway.status;
  const statusColor = liveStatus === "connected" ? "text-green-400" : liveStatus === "reconnecting" ? "text-yellow-400" : liveStatus === "error" ? "text-red-400" : "text-gray-400";
  const statusText = liveStatus === "connected" ? t("settings.connected") : liveStatus === "reconnecting" ? t("settings.reconnecting") : liveStatus === "connecting" ? t("settings.connecting") : liveStatus === "error" ? t("common.error") : t("settings.disconnected");
  const statusDot = liveStatus === "connected" ? "status-online" : liveStatus === "reconnecting" ? "status-warning" : liveStatus === "error" ? "bg-red-600 rounded-full w-2 h-2" : "status-offline";

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
      if (!res.ok) throw new Error(data.error ?? t("settings.connectFailed"));
      setMsg({ type: "success", text: t("settings.connectedTo", { ip: gateway.ip }) });
      await onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : t("settings.connectFailed") });
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
    setMsg({ type: "success", text: t("settings.disconnected") });
    await onRefresh();
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
      if (!res.ok) throw new Error(data.error ?? t("settings.deleteFailed"));
      await onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : t("settings.deleteFailed") });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-[#0a1019] rounded-lg border border-white/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-white font-medium">{gateway.name || `${gateway.ip}:${gateway.port}`}</span>
          <span className="text-xs text-gray-500 ml-2">{gateway.ip}:{gateway.port}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`status-indicator ${statusDot}`} />
          <span className={`text-xs ${statusColor}`}>{statusText}</span>
        </div>
      </div>

      {msg && (
        <div className={`text-xs rounded px-3 py-1.5 ${
          msg.type === "success" ? "bg-green-900/20 text-green-400" : "bg-red-900/20 text-red-400"
        }`}>{msg.text}</div>
      )}

      <div className="flex gap-2">
        {liveStatus !== "connected" ? (
          <button onClick={handleConnect} disabled={connecting} className="btn btn-primary text-xs py-1 disabled:opacity-40">
            <i className="fas fa-plug" /><span>{connecting ? t("settings.connecting") : t("settings.connect")}</span>
          </button>
        ) : (
          <button onClick={handleDisconnect} className="btn btn-secondary text-xs py-1">
            <i className="fas fa-plug" /><span>{t("settings.disconnect")}</span>
          </button>
        )}
        <button onClick={() => setShowDeleteConfirm(true)} disabled={removing} className="btn text-xs py-1 text-red-400 hover:text-red-300 bg-transparent border-0 disabled:opacity-40">
          {removing ? t("settings.deleting") : t("common.delete")}
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-red-400">{t("settings.confirmDeleteGateway")}</span>
          <button onClick={handleRemove} className="px-2 py-1 bg-red-600 text-white rounded">{t("common.confirm")}</button>
          <button onClick={() => setShowDeleteConfirm(false)} className="px-2 py-1 bg-[#1c2630] text-gray-400 rounded">{t("common.cancel")}</button>
        </div>
      )}
    </div>
  );
}
