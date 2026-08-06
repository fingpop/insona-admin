"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";

export default function Sidebar({
  currentPage,
  onNavigate,
  gatewayStatus,
}: {
  currentPage: string;
  onNavigate: (page: string) => void;
  gatewayStatus: string;
}) {
  const { t } = useTranslation();
  const [version, setVersion] = useState("3.0");
  const [projectName, setProjectName] = useState("inSona");
  const [versionInfo, setVersionInfo] = useState<{
    buildTime?: string;
    commitHash?: string;
    branch?: string;
    runtime?: string;
    nodeVersion?: string;
    platform?: string;
    arch?: string;
  } | null>(null);
  const [showVersionDetail, setShowVersionDetail] = useState(false);

  useEffect(() => {
    fetch("/api/system/version")
      .then((r) => r.json())
      .then((v) => {
        setVersion(v.version ?? "3.0");
        setVersionInfo({
          buildTime: v.buildTime,
          commitHash: v.commitHash,
          branch: v.branch,
          runtime: v.runtime,
          nodeVersion: v.nodeVersion,
          platform: v.platform,
          arch: v.arch,
        });
      })
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setProjectName(data.projectName ?? "inSona"))
      .catch(() => {});
  }, []);
  const navItems = [
    { id: "dashboard", label: t("sidebar.home"), icon: "fa-home" },
    { id: "devices", label: t("sidebar.devices"), icon: "fa-lightbulb" },
    { id: "groups", label: t("sidebar.groups"), icon: "fa-object-group" },
    { id: "rooms", label: t("sidebar.rooms"), icon: "fa-layer-group" },
    { id: "automation", label: t("sidebar.automation"), icon: "fa-clock" },
    { id: "scenes", label: t("sidebar.scenes"), icon: "fa-magic" },
    { id: "panel-linkage", label: t("sidebar.panelLinkage"), icon: "fa-link" },
    { id: "energy", label: t("sidebar.energy"), icon: "fa-chart-line" },
    { id: "logs", label: t("sidebar.logs"), icon: "fa-file-alt" },
    { id: "settings", label: t("sidebar.settings"), icon: "fa-cog" },
  ];

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-gradient-to-b from-[#1a1f2e] to-[#151a28] z-50 flex flex-col border-r border-white/5 w-[260px]"
      style={{ boxShadow: "4px 0 20px rgba(0,0,0,0.5)" }}
    >
      {/* 头部 */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <i className="fas fa-lightbulb text-white text-xl" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">{projectName}</h1>
              <button
                onClick={() => setShowVersionDetail(!showVersionDetail)}
                className="text-xs text-gray-400 hover:text-blue-400 transition-colors flex items-center gap-1"
                title={t("sidebar.clickToViewVersion")}
              >
                <span>Pro v{version}</span>
                {versionInfo?.runtime && (
                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                    versionInfo.runtime === "production"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-yellow-500/20 text-yellow-400"
                  }`}>
                    {versionInfo.runtime === "production" ? "PROD" : "DEV"}
                  </span>
                )}
                <i className="fas fa-chevron-down text-[10px]" />
              </button>
            </div>
          </div>
        </div>
        {/* 版本详情展开区 */}
        {showVersionDetail && versionInfo && (
          <div className="mt-3 pt-3 border-t border-white/5 space-y-1 text-xs">
            {versionInfo.commitHash && versionInfo.commitHash !== "unknown" && (
              <div className="flex justify-between text-gray-400">
                <span>{t("sidebar.commit")}</span>
                <span className="font-mono text-gray-300">{versionInfo.commitHash}</span>
              </div>
            )}
            {versionInfo.branch && versionInfo.branch !== "unknown" && (
              <div className="flex justify-between text-gray-400">
                <span>{t("sidebar.branch")}</span>
                <span className="text-gray-300">{versionInfo.branch}</span>
              </div>
            )}
            {versionInfo.buildTime && (
              <div className="flex justify-between text-gray-400">
                <span>{t("sidebar.build")}</span>
                <span className="text-gray-300">{new Date(versionInfo.buildTime).toLocaleString("zh-CN")}</span>
              </div>
            )}
            {versionInfo.nodeVersion && (
              <div className="flex justify-between text-gray-400">
                <span>Node</span>
                <span className="text-gray-300">{versionInfo.nodeVersion}</span>
              </div>
            )}
            {versionInfo.platform && (
              <div className="flex justify-between text-gray-400">
                <span>{t("sidebar.platform")}</span>
                <span className="text-gray-300">{versionInfo.platform}/{versionInfo.arch}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 网关状态指示 */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className={`status-indicator ${gatewayStatus === "connected" ? "status-online" : gatewayStatus === "connecting" ? "status-warning" : "status-offline"}`} />
          <span className="text-xs text-gray-400">
            {gatewayStatus === "connected" ? t("sidebar.gatewayConnected") : gatewayStatus === "connecting" ? t("sidebar.gatewayConnecting") : t("sidebar.gatewayDisconnected")}
          </span>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`nav-item w-full ${currentPage === item.id ? "active" : ""}`}
          >
            <i className={`fas ${item.icon}`} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* 底部 */}
      <div className="p-6 border-t border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
            <i className="fas fa-user text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">{t("sidebar.admin")}</p>
            <p className="text-xs text-gray-400">admin@insona.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
