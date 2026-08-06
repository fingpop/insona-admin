"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { DbDevice, SceneAction } from "../types";

interface ScheduledTask {
  id: string;
  name: string;
  deviceId: string | null;
  sceneId: string | null;
  cronExpr: string;
  action: string;
  value: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string;
  device: { id: string; name: string; type: number; meshId: string | null; func: number } | null;
  scene: { id: string; name: string } | null;
}

interface AutomationScene {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  isCustom: boolean;
  showInQuick: boolean;
  sceneId?: number;
  meshId?: string | null;
  actions?: SceneAction[];
}

export default function AutomationPage({ devices }: { devices: DbDevice[] }) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [scenes, setScenes] = useState<AutomationScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load tasks and scenes
  const loadData = useCallback(async () => {
    try {
      const [tasksRes, scenesRes] = await Promise.all([
        fetch("/api/scheduler/tasks"),
        fetch("/api/scenes"),
      ]);
      const tasksData = await tasksRes.json();
      const scenesData = await scenesRes.json();
      if (tasksData.tasks) setTasks(tasksData.tasks);
      if (scenesData.scenes) setScenes(scenesData.scenes);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle task enabled/disabled
  const handleToggle = async (taskId: string) => {
    try {
      const res = await fetch(`/api/scheduler/tasks/${taskId}/toggle`, { method: "POST" });
      const data = await res.json();
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, enabled: data.enabled } : t))
      );
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  // Delete task
  const handleDelete = async (taskId: string) => {
    if (!confirm(t("automation.confirmDelete"))) return;
    try {
      await fetch(`/api/scheduler/tasks/${taskId}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      console.error("Delete failed:", err);
      alert(t("automation.deleteFailed"));
    }
  };

  // Run task immediately
  const handleRunNow = async (task: ScheduledTask) => {
    try {
      const res = await fetch(`/api/scheduler/tasks/${task.id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || t("automation.runFailed"));
        return;
      }
      alert(t("automation.taskExecuted", { name: task.name }));
      await loadData();
    } catch (err) {
      console.error("Run task failed:", err);
      alert(t("automation.runFailed"));
    }
  };

  // Edit task
  const handleEdit = (task: ScheduledTask | null) => {
    setEditingTask(task);
    setShowModal(true);
  };

  // Cron 表达式描述
  const describeCron = (cronExpr: string): string => {
    try {
      const parts = cronExpr.trim().split(/\s+/);
      if (parts.length !== 5) return cronExpr;
      const [minute, hour, , , dayOfWeek] = parts;
      const timeStr =
        hour !== "*" && minute !== "*"
          ? `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
          : null;
      if (dayOfWeek !== "*" && dayOfWeek !== "?") {
        const dayNames: Record<string, string> = {
          "0": t("automation.sunday"),
          "1": t("automation.monday"),
          "2": t("automation.tuesday"),
          "3": t("automation.wednesday"),
          "4": t("automation.thursday"),
          "5": t("automation.friday"),
          "6": t("automation.saturday"),
        };
        const days = dayOfWeek.split(",").map((d) => dayNames[d] || d);
        return timeStr ? t("automation.everyDayAtTime", { days: days.join("/"), time: timeStr }) : t("automation.everyDay", { days: days.join("/") });
      }
      if (timeStr) return t("automation.everyDayAtTimeOnly", { time: timeStr });
      return cronExpr;
    } catch {
      return cronExpr;
    }
  };

  // Get action description
  const getActionDesc = (task: ScheduledTask): string => {
    if (task.action === "scene" && task.scene) {
      return t("automation.activateScene", { name: task.scene.name });
    }
    const actionLabels: Record<string, string> = {
      onoff: t("func.0"),
      level: t("func.1"),
      curtain: t("deviceType.1860"),
      ctl: t("func.2"),
      color: t("func.3"),
    };
    try {
      const vals = JSON.parse(task.value || "[]");
      const valStr = vals.length > 0 ? vals.join(", ") : "";
      return `${actionLabels[task.action] || task.action}${valStr ? ` (${valStr})` : ""}`;
    } catch {
      return actionLabels[task.action] || task.action;
    }
  };

  // Get device type icon
  const getDeviceIcon = (task: ScheduledTask): string => {
    if (task.action === "scene") return "fa-magic";
    const typeMap: Record<number, string> = {
      1984: "fa-lightbulb",
      1860: "fa-warehouse",
      1861: "fa-warehouse",
      1862: "fa-warehouse",
      1218: "fa-th-large",
      1344: "fa-broadcast-tower",
    };
    return typeMap[task.device?.type || 0] || "fa-microchip";
  };

  return (
    <div className="fade-in">
      {mounted && showModal && (
        <TaskEditModal
          task={editingTask}
          devices={devices}
          scenes={scenes}
          onClose={() => {
            setShowModal(false);
            setEditingTask(null);
          }}
          onSave={async () => {
            await loadData();
            setShowModal(false);
            setEditingTask(null);
          }}
        />
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">{t("automation.scheduledTasks")}</h3>
          <button className="btn btn-primary" onClick={() => handleEdit(null)}>
            <i className="fas fa-plus" />
            <span>{t("automation.add")}</span>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <i className="fas fa-spinner fa-spin text-blue-400 text-xl" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-clock text-2xl text-gray-500" />
            </div>
            <p className="text-gray-400 mb-2">{t("automation.noTasks")}</p>
            <p className="text-gray-500 text-sm">{t("automation.createFirst")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`p-4 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-all ${
                  !task.enabled ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <i className={`fas ${getDeviceIcon(task)} text-blue-400`} />
                    </div>

                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-white">{task.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          task.action === "scene"
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-blue-500/20 text-blue-400"
                        }`}>
                          {task.action === "scene" ? t("automation.scene") : t("automation.device")}
                        </span>
                        {!task.enabled && (
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">
                            {t("automation.disabled")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {getActionDesc(task)}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>
                          <i className="fas fa-clock mr-1" />
                          {describeCron(task.cronExpr)}
                        </span>
                        {task.nextRun && (
                          <span>
                            <i className="fas fa-calendar mr-1" />
                            {t("automation.nextRun")}: {new Date(task.nextRun).toLocaleString("zh-CN")}
                          </span>
                        )}
                        {task.lastRun && (
                          <span>
                            <i className="fas fa-history mr-1" />
                            {t("automation.lastRun")}: {new Date(task.lastRun).toLocaleString("zh-CN")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(task.id)}
                      className={`w-12 h-6 rounded-full transition-all relative ${
                        task.enabled ? "bg-blue-500" : "bg-gray-600"
                      }`}
                      title={task.enabled ? t("automation.disable") : t("automation.enable")}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow ${
                          task.enabled ? "left-6" : "left-0.5"
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => handleRunNow(task)}
                      className="btn btn-secondary text-sm"
                      title={t("automation.runNow")}
                    >
                      <i className="fas fa-play" />
                    </button>
                    <button
                      onClick={() => handleEdit(task)}
                      className="btn btn-secondary text-sm"
                      title={t("common.edit")}
                    >
                      <i className="fas fa-pen" />
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="btn btn-secondary text-sm text-red-400 hover:text-red-300"
                      title={t("common.delete")}
                    >
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {devices.length === 0 && tasks.length === 0 && (
          <p className="text-center text-gray-400 mt-6">
            <i className="fas fa-info-circle mr-2" />
            {t("automation.connectGatewayFirst")}
          </p>
        )}
      </div>

      {/* Cron 配置说明 */}
      <div className="card mt-6">
        <h3 className="text-lg font-bold text-white mb-4">{t("automation.cronHelp")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="p-3 bg-white/5 rounded-lg">
            <code className="text-blue-400">0 8 * * *</code>
            <p className="text-gray-400 mt-1">{t("automation.cronExample1")}</p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg">
            <code className="text-blue-400">30 18 * * 1-5</code>
            <p className="text-gray-400 mt-1">{t("automation.cronExample2")}</p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg">
            <code className="text-blue-400">0 7 * * 0,6</code>
            <p className="text-gray-400 mt-1">{t("automation.cronExample3")}</p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg">
            <code className="text-blue-400">0 22 * * *</code>
            <p className="text-gray-400 mt-1">{t("automation.cronExample4")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 任务编辑弹窗 ====================
function TaskEditModal({
  task,
  devices,
  scenes,
  onClose,
  onSave,
}: {
  task: ScheduledTask | null;
  devices: DbDevice[];
  scenes: AutomationScene[];
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(task?.name || "");
  const [taskType, setTaskType] = useState<"device" | "scene">(
    task?.action === "scene" ? "scene" : "device"
  );
  const [selectedDeviceId, setSelectedDeviceId] = useState(task?.deviceId || "");
  const [selectedSceneId, setSelectedSceneId] = useState(task?.sceneId || "");
  const [action, setAction] = useState(task?.action || "onoff");
  const [value, setValue] = useState<number[]>(() => {
    try {
      return JSON.parse(task?.value || "[]");
    } catch {
      return [];
    }
  });
  const [time, setTime] = useState(() => {
    if (task?.cronExpr) {
      const parts = task.cronExpr.split(" ");
      if (parts.length === 5 && parts[1] !== "*" && parts[0] !== "*") {
        return `${parts[1].padStart(2, "0")}:${parts[0].padStart(2, "0")}`;
      }
    }
    return "08:00";
  });
  const [daysType, setDaysType] = useState<"daily" | "weekdays" | "weekends">("daily");
  const [saving, setSaving] = useState(false);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);

  // 获取设备可用的动作类型
  const getDeviceActions = (device: DbDevice): { value: string; label: string }[] => {
    const actions: { value: string; label: string }[] = [];
    const func = device.func;
    const funcs = device.funcs || [];

    // 基础开关
    if (func === 2 || funcs.includes(2)) actions.push({ value: "onoff", label: t("func.0") });

    // 调光
    if (func === 3 || funcs.includes(3)) actions.push({ value: "level", label: t("func.1") });

    // 色温
    if (func === 4 || funcs.includes(4)) actions.push({ value: "ctl", label: t("func.2") });

    // 彩光
    if (func === 5 || funcs.includes(5)) actions.push({ value: "color", label: t("func.3") });

    // 窗帘
    if (device.type === 1860 || device.type === 1861 || device.type === 1862) {
      actions.push({ value: "curtain", label: t("deviceType.1860") });
    }

    return actions.length > 0 ? actions : [{ value: "onoff", label: t("func.0") }];
  };

  // 构建 cron 表达式
  const buildCronExpr = (): string => {
    const [hour, minute] = time.split(":").map(Number);
    switch (daysType) {
      case "weekdays":
        return `${minute} ${hour} * * 1-5`;
      case "weekends":
        return `${minute} ${hour} * * 0,6`;
      default:
        return `${minute} ${hour} * * *`;
    }
  };

  // 处理保存
  const handleSave = async () => {
    if (!name.trim()) {
      alert(t("automation.enterName"));
      return;
    }

    if (taskType === "device" && !selectedDeviceId) {
      alert(t("automation.selectDevice"));
      return;
    }

    if (taskType === "scene" && !selectedSceneId) {
      alert(t("automation.selectScene"));
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        cronExpr: buildCronExpr(),
      };

      if (taskType === "device") {
        payload.deviceId = selectedDeviceId;
        payload.sceneId = null;
        payload.action = action;
        payload.value = value;
      } else {
        payload.deviceId = null;
        payload.sceneId = selectedSceneId;
        payload.action = "scene";
        payload.value = [];
      }

      const url = task
        ? `/api/scheduler/tasks/${task.id}`
        : "/api/scheduler/tasks";
      const method = task ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("automation.saveFailed"));
      }

      onSave();
    } catch (err) {
      console.error("Save failed:", err);
      alert(err instanceof Error ? err.message : t("automation.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  // 渲染值输入控件
  const renderValueInput = () => {
    if (taskType === "scene") {
      return (
        <div className="text-sm text-gray-400">
          {t("automation.sceneNoActionNeeded")}
        </div>
      );
    }

    switch (action) {
      case "onoff":
        return (
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="onoff"
                checked={value[0] === 1}
                onChange={() => setValue([1])}
                className="w-4 h-4"
              />
              <span className="text-white">{t("common.on")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="onoff"
                checked={value[0] === 0}
                onChange={() => setValue([0])}
                className="w-4 h-4"
              />
              <span className="text-white">{t("common.off")}</span>
            </label>
          </div>
        );

      case "level":
        return (
          <div>
            <input
              type="range"
              min="0"
              max="100"
              value={value[0] || 0}
              onChange={(e) => setValue([parseInt(e.target.value)])}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>0%</span>
              <span className="text-white">{value[0] || 0}%</span>
              <span>100%</span>
            </div>
          </div>
        );

      case "ctl":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">{t("drawer.brightness")}</label>
              <input
                type="range"
                min="0"
                max="100"
                value={value[0] || 0}
                onChange={(e) => setValue([parseInt(e.target.value), value[1] || 50])}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-right text-sm text-white">{value[0] || 0}%</div>
            </div>
            <div>
              <label className="text-sm text-gray-400">{t("drawer.colorTemp")}</label>
              <input
                type="range"
                min="0"
                max="100"
                value={value[1] || 50}
                onChange={(e) => setValue([value[0] || 0, parseInt(e.target.value)])}
                className="w-full h-2 bg-gradient-to-r from-blue-300 to-orange-300 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-sm text-gray-400">
                <span>{t("automation.cool")}</span>
                <span className="text-white">{value[1] || 50}</span>
                <span>{t("automation.warm")}</span>
              </div>
            </div>
          </div>
        );

      case "curtain":
        return (
          <div>
            <input
              type="range"
              min="0"
              max="100"
              value={value[0] || 0}
              onChange={(e) => setValue([parseInt(e.target.value)])}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>{t("automation.curtainClosed")}</span>
              <span className="text-white">{value[0] || 0}%</span>
              <span>{t("automation.curtainOpen")}</span>
            </div>
          </div>
        );

      case "color":
        return (
          <div>
            <input
              type="range"
              min="0"
              max="100"
              value={value[0] || 50}
              onChange={(e) => setValue([parseInt(e.target.value), value[1] || 50, value[2] || 50])}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>{t("automation.brightnessLabel")}: {value[0] || 50}%</span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const deviceActions = selectedDevice ? getDeviceActions(selectedDevice) : [];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className="bg-gradient-to-b from-[#1a1f2e] to-[#151a28] rounded-xl p-6 w-full max-w-lg shadow-2xl border border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white">
              {task ? t("automation.editTask") : t("automation.addTask")}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <i className="fas fa-times text-xl" />
            </button>
          </div>

          {/* Form */}
          <div className="space-y-5">
            {/* 任务名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {t("automation.taskName")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("automation.example")}
                className="input-field w-full"
              />
            </div>

            {/* 任务类型 */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {t("automation.taskType")}
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    checked={taskType === "device"}
                    onChange={() => setTaskType("device")}
                    className="w-4 h-4"
                  />
                  <span className="text-white">{t("automation.deviceControl")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="taskType"
                    checked={taskType === "scene"}
                    onChange={() => setTaskType("scene")}
                    className="w-4 h-4"
                  />
                  <span className="text-white">{t("automation.sceneActivation")}</span>
                </label>
              </div>
            </div>

            {/* 设备/场景选择 */}
            {taskType === "device" ? (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  {t("automation.selectDeviceLabel")}
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    setSelectedDeviceId(e.target.value);
                    const dev = devices.find((d) => d.id === e.target.value);
                    if (dev) {
                      const actions = getDeviceActions(dev);
                      if (actions.length > 0) setAction(actions[0].value);
                    }
                  }}
                  className="input-field w-full"
                >
                  <option value="">{t("automation.selectDevice")}</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.type === 1984 ? t("deviceType.1984") : d.type === 1218 ? t("deviceType.1218") : d.type === 1860 || d.type === 1861 || d.type === 1862 ? t("deviceType.1860") : d.type === 1344 ? t("deviceType.1344") : `${t("devices.type")}${d.type}`})
                    </option>
                  ))}
                </select>

                {/* 动作类型 */}
                {selectedDeviceId && deviceActions.length > 0 && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      {t("automation.actionType")}
                    </label>
                    <select
                      value={action}
                      onChange={(e) => {
                        setAction(e.target.value);
                        // 根据动作类型设置默认值
                        switch (e.target.value) {
                          case "onoff":
                            setValue([1]);
                            break;
                          case "level":
                            setValue([50]);
                            break;
                          case "ctl":
                            setValue([50, 50]);
                            break;
                          case "curtain":
                            setValue([100]);
                            break;
                          default:
                            setValue([]);
                        }
                      }}
                      className="input-field w-full"
                    >
                      {deviceActions.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  {t("automation.selectSceneLabel")}
                </label>
                <select
                  value={selectedSceneId}
                  onChange={(e) => setSelectedSceneId(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">{t("automation.selectScene")}</option>
                  {scenes.filter((s) => s.isCustom).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 执行时间 */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {t("automation.schedule")}
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="input-field w-full"
              />
            </div>

            {/* 重复模式 */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                {t("automation.repeatMode")}
              </label>
              <div className="flex gap-4">
                {[
                  { value: "daily", label: t("automation.everyDay") },
                  { value: "weekdays", label: t("automation.weekdays") },
                  { value: "weekends", label: t("automation.weekend") },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="daysType"
                      checked={daysType === opt.value}
                      onChange={() => setDaysType(opt.value as "daily" | "weekdays" | "weekends")}
                      className="w-4 h-4"
                    />
                    <span className="text-white">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 动作值配置 */}
            {(taskType === "device" && selectedDeviceId) && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  {t("automation.actionValue")}
                </label>
                {renderValueInput()}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="mt-6 p-3 bg-white/5 rounded-lg">
            <div className="text-sm text-gray-400">
              <i className="fas fa-clock mr-1" />
              {t("automation.executionPlan")}
            </div>
            <div className="text-white mt-1">
              {name || t("automation.unnamedTask")} - {time} - {
                daysType === "daily" ? t("automation.everyDay") :
                daysType === "weekdays" ? t("automation.weekdays") : t("automation.weekend")
              }
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="btn btn-secondary flex-1">
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary flex-1"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
