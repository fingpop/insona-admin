"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";

export default function PanelSceneLinkage() {
  const { t } = useTranslation();
  const [panelDid, setPanelDid] = useState("");
  const [buttonIndex, setButtonIndex] = useState(0);
  const [selectedScene, setSelectedScene] = useState("");
  const [bindings, setBindings] = useState<any[]>([]);
  const [scenes, setScenes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSceneId, setEditSceneId] = useState("");

  const loadBindings = async () => {
    try {
      const res = await fetch("/api/panel-bindings");
      const data = await res.json();
      if (data.bindings) setBindings(data.bindings);
      if (data.scenes) setScenes(data.scenes);
    } catch (err) {
      console.error("Failed to load panel bindings:", err);
    }
  };

  useEffect(() => {
    loadBindings();
  }, []);

  const handleCreate = async () => {
    if (!panelDid.trim()) {
      alert(t("panel.enterDID"));
      return;
    }
    if (!selectedScene) {
      alert(t("panel.selectScene"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/panel-bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panelDid: panelDid.trim(),
          buttonIndex,
          sceneId: selectedScene,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || t("panel.createFailed"));
        return;
      }
      setPanelDid("");
      setButtonIndex(0);
      setSelectedScene("");
      await loadBindings();
    } catch (err) {
      alert(t("panel.createFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("panel.confirmDelete"))) return;
    try {
      const res = await fetch(`/api/panel-bindings/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || t("panel.deleteFailed"));
        return;
      }
      await loadBindings();
    } catch (err) {
      alert(t("panel.deleteFailed"));
    }
  };

  const startEdit = (binding: any) => {
    setEditingId(binding.id);
    setEditSceneId(binding.sceneId);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editSceneId) return;
    try {
      const res = await fetch(`/api/panel-bindings/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId: editSceneId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || t("panel.updateFailed"));
        return;
      }
      setEditingId(null);
      setEditSceneId("");
      await loadBindings();
    } catch (err) {
      alert(t("panel.updateFailed"));
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSceneId("");
  };

  const buttonOptions = [0, 1, 2, 3, 4, 5];

  return (
    <div className="space-y-6">
      <div className="bg-[#1a1f2e] rounded-xl border border-white/5 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          <i className="fa fa-link mr-2 text-blue-400"></i>
          {t("panel.createNewBinding")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t("panel.panelDid")}</label>
            <input
              type="text"
              value={panelDid}
              onChange={(e) => setPanelDid(e.target.value.toUpperCase())}
              placeholder="ECC57F10C831FF"
              className="w-full px-3 py-2 bg-[#0f1520] border border-white/10 rounded-lg text-white text-sm uppercase font-mono focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t("panel.button")}</label>
            <select
              value={buttonIndex}
              onChange={(e) => setButtonIndex(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#0f1520] border border-white/10 rounded-lg text-white text-sm focus:border-blue-400 focus:outline-none"
            >
              {buttonOptions.map((idx) => (
                <option key={idx} value={idx}>{t("panel.buttonN", { n: idx + 1 })}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t("panel.boundScene")}</label>
            <select
              value={selectedScene}
              onChange={(e) => setSelectedScene(e.target.value)}
              className="w-full px-3 py-2 bg-[#0f1520] border border-white/10 rounded-lg text-white text-sm focus:border-blue-400 focus:outline-none"
            >
              <option value="">{t("panel.selectScene")}</option>
              {scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? t("panel.creating") : t("panel.add")}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#1a1f2e] rounded-xl border border-white/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h3 className="text-lg font-semibold text-white">
            <i className="fa fa-list mr-2 text-blue-400"></i>
            {t("panel.existingBindings")}
          </h3>
        </div>
        {bindings.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <i className="fa fa-link text-3xl mb-3"></i>
            <p>{t("panel.noBindings")}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">{t("panel.panelDid")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">{t("panel.button")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">{t("panel.boundScene")}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">{t("panel.createdAt")}</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {bindings.map((binding) => (
                <tr key={binding.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-6 py-3 font-mono text-sm text-gray-300">
                    {binding.panelDid}
                  </td>
                  <td className="px-6 py-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-500/20 text-blue-400 text-xs font-medium">
                      {t("panel.buttonN", { n: binding.buttonIndex + 1 })}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-300">
                    {editingId === binding.id ? (
                      <select
                        value={editSceneId}
                        onChange={(e) => setEditSceneId(e.target.value)}
                        className="px-2 py-1 bg-[#0f1520] border border-white/10 rounded text-sm text-white focus:border-blue-400 focus:outline-none"
                      >
                        {scenes.map((scene) => (
                          <option key={scene.id} value={scene.id}>{scene.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="flex items-center gap-2">
                        <i className={`fa ${binding.scene?.icon || "fa-star"} mr-1`} style={{ color: binding.scene?.color || "#3b9eff" }}></i>
                        {binding.scene?.name || t("panel.unknownScene")}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {new Date(binding.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {editingId === binding.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
                        >
                          <i className="fa fa-check mr-1"></i>{t("common.save")}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-2 py-1 text-xs bg-gray-500/20 text-gray-400 rounded hover:bg-gray-500/30 transition-colors"
                        >
                          <i className="fa fa-times mr-1"></i>{t("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(binding)}
                          className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors"
                        >
                          <i className="fa fa-edit mr-1"></i>{t("panel.changeButton")}
                        </button>
                        <button
                          onClick={() => handleDelete(binding.id)}
                          className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                        >
                          <i className="fa fa-trash mr-1"></i>{t("common.delete")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
