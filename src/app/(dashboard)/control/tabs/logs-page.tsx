"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  module: string;
  message: string;
}

interface LogStats {
  total: number;
  byLevel: { debug: number; info: number; warn: number; error: number };
  byModule: Record<string, number>;
  oldest: string | null;
  newest: string | null;
}

export default function LogsPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (levelFilter) params.set("level", levelFilter);
      if (moduleFilter) params.set("module", moduleFilter);
      if (searchText) params.set("search", searchText);
      if (dateFilter) params.set("date", dateFilter);
      params.set("limit", "500");
      const res = await fetch(`/api/system/logs?${params.toString()}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
      setStats(data.stats ?? null);
    } catch {
      // 静默处理
    } finally {
      setLoading(false);
    }
  }, [levelFilter, moduleFilter, searchText, dateFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 自动刷新（仅查看今天时生效）
  useEffect(() => {
    if (!autoRefresh) return;
    const today = new Date().toISOString().split("T")[0];
    if (dateFilter && dateFilter !== today) return;
    const timer = setInterval(fetchLogs, 3000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchLogs, dateFilter]);

  const handleClear = async () => {
    if (!confirm(t("logs.confirmClear"))) return;
    await fetch("/api/system/logs?action=clear");
    fetchLogs();
  };

  const levelColors: Record<string, { bg: string; text: string; dot: string }> = {
    debug: { bg: "bg-gray-500/10", text: "text-gray-400", dot: "bg-gray-400" },
    info: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
    warn: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-400" },
    error: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
  };

  const modules = stats ? Object.keys(stats.byModule).sort() : [];

  return (
    <div className="fade-in space-y-4">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: t("logs.totalCount"), value: stats.total, sub: t("logs.items"), color: "text-[#3b9eff]" },
            { label: "INFO", value: stats.byLevel.info, sub: t("logs.info"), color: "text-blue-400" },
            { label: "WARN", value: stats.byLevel.warn, sub: t("logs.warn"), color: "text-yellow-400" },
            { label: "ERROR", value: stats.byLevel.error, sub: t("logs.error"), color: "text-red-400" },
            { label: "DEBUG", value: stats.byLevel.debug, sub: t("logs.debug"), color: "text-gray-400" },
          ].map((item) => (
            <div key={item.label} className="bg-[#101922] rounded-lg border border-[#1c2630] p-4 flex flex-col justify-center">
              <p className="text-xs text-[#4a5b70] mb-1">{item.label}</p>
              <p className={`text-xl font-semibold ${item.color}`}>{item.value}</p>
              <p className="text-xs text-[#4a5b70] mt-0.5">{item.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* 工具栏 */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <i className="fas fa-calendar-alt text-gray-400" />
            <input
              type="date"
              value={dateFilter}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => {
                const val = e.target.value;
                setDateFilter(val);
                // 选择历史日期时自动关闭自动刷新
                if (val && val !== new Date().toISOString().split("T")[0]) {
                  setAutoRefresh(false);
                }
              }}
              className="input-field text-sm"
              style={{ padding: "6px 12px", width: "auto" }}
            />
            {dateFilter !== new Date().toISOString().split("T")[0] && (
              <button
                onClick={() => setDateFilter(new Date().toISOString().split("T")[0])}
                className="text-xs text-[#3b9eff] hover:underline"
              >
                {t("logs.backToToday")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <i className="fas fa-search text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t("logs.search")}
              className="input-field flex-1 text-sm"
              style={{ padding: "6px 12px" }}
            />
          </div>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="input-field text-sm"
            style={{ padding: "6px 12px" }}
          >
            <option value="">{t("logs.allLevels")}</option>
            <option value="error">ERROR</option>
            <option value="warn">WARN</option>
            <option value="info">INFO</option>
            <option value="debug">DEBUG</option>
          </select>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="input-field text-sm"
            style={{ padding: "6px 12px" }}
          >
            <option value="">{t("logs.allModules")}</option>
            {modules.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn text-sm ${autoRefresh ? "btn-primary" : "btn-secondary"}`}
          >
            <i className={`fas fa-${autoRefresh ? "pause" : "play"}`} />
            <span>{autoRefresh ? t("logs.pauseRefresh") : t("logs.autoRefresh")}</span>
          </button>
          <button onClick={fetchLogs} className="btn btn-secondary text-sm">
            <i className="fas fa-sync-alt" />
            <span>{t("common.refresh")}</span>
          </button>
          <button onClick={handleClear} className="btn btn-secondary text-sm text-red-400 hover:text-red-300">
            <i className="fas fa-trash" />
            <span>{t("logs.clear")}</span>
          </button>
        </div>

        {/* 模块分布 */}
        {stats && modules.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-white/5">
            {modules.map((m) => (
              <span
                key={m}
                className="px-2 py-1 rounded text-xs bg-white/5 text-gray-400"
              >
                {m}
                <span className="ml-1 text-gray-500">({stats.byModule[m]})</span>
              </span>
            ))}
          </div>
        )}

        {/* 日志列表 */}
        <div
          ref={scrollRef}
          className="max-h-[600px] overflow-y-auto font-mono text-xs space-y-0.5"
        >
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <i className="fas fa-spinner fa-spin mr-2" />
              {t("logs.loading")}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <i className="fas fa-inbox text-3xl mb-2" />
              <p>{t("logs.noLogs")}</p>
            </div>
          ) : (
            logs.map((log) => {
              const color = levelColors[log.level] || levelColors.info;
              const time = new Date(log.timestamp).toLocaleString("zh-CN", {
                hour12: false,
                year: "2-digit",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                fractionalSecondDigits: 3,
              } as any);
              const isExpanded = expandedId === log.id;
              return (
                <div
                  key={log.id}
                  className={`flex gap-2 px-2 py-1 rounded hover:bg-white/5 cursor-pointer transition-colors ${color.bg}`}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  <span className="text-gray-500 flex-shrink-0">{time}</span>
                  <span
                    className={`px-1.5 py-0 rounded flex-shrink-0 text-[10px] font-bold ${color.text} ${color.bg}`}
                  >
                    {log.level.toUpperCase().padEnd(5)}
                  </span>
                  <span className="text-cyan-400 flex-shrink-0 w-20 truncate" title={log.module}>
                    [{log.module}]
                  </span>
                  <span className={`flex-1 ${isExpanded ? "whitespace-pre-wrap" : "truncate"} ${color.text}`}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* 底部信息 */}
        {stats && (
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
            <span>{t("logs.totalLogsCount", { count: stats.total })}</span>
            <span>
              {stats.oldest && t("logs.earliest", { time: new Date(stats.oldest).toLocaleTimeString("zh-CN") })}
              {stats.newest && ` | ${t("logs.latest", { time: new Date(stats.newest).toLocaleTimeString("zh-CN") })}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
