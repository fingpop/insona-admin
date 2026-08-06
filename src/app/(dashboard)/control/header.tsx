"use client";

import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

export default function Header({
  currentPage,
  gatewayStatus,
}: {
  currentPage: string;
  gatewayStatus: string;
}) {
  const { t, lang, setLang } = useTranslation();
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const pageTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: t("header.dashboard.title"), subtitle: t("header.dashboard.subtitle") },
    devices: { title: t("header.devices.title"), subtitle: t("header.devices.subtitle") },
    groups: { title: t("header.groups.title"), subtitle: t("header.groups.subtitle") },
    rooms: { title: t("header.rooms.title"), subtitle: t("header.rooms.subtitle") },
    automation: { title: t("header.automation.title"), subtitle: t("header.automation.subtitle") },
    scenes: { title: t("header.scenes.title"), subtitle: t("header.scenes.subtitle") },
    "panel-linkage": { title: t("header.panelLinkage.title"), subtitle: t("header.panelLinkage.subtitle") },
    energy: { title: t("header.energy.title"), subtitle: t("header.energy.subtitle") },
    logs: { title: t("header.logs.title"), subtitle: t("header.logs.subtitle") },
    settings: { title: t("header.settings.title"), subtitle: t("header.settings.subtitle") },
  };

  const pageInfo = pageTitles[currentPage] || pageTitles.dashboard;

  const languages = [
    { code: "zh-CN", name: "简体中文" },
    { code: "en-US", name: "English" },
  ];

  return (
    <header className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 sticky top-0 z-40">
      <div className="px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm">
              <span className="text-gray-400">{t("header.projectCenter")}</span>
              <span className="text-gray-600">/</span>
              <span className="text-blue-400">{pageInfo.title}</span>
            </div>
            <h2 className="text-2xl font-bold text-white">{pageInfo.title}</h2>
            <p className="text-sm text-gray-400 mt-1">{pageInfo.subtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="btn btn-secondary relative">
              <i className="fas fa-bell" />
              <span className="badge badge-error absolute -top-1 -right-1 text-xs">3</span>
            </button>

            {/* 语言切换 */}
            <div className="lang-dropdown">
              <button
                id="langToggle"
                className="btn btn-primary flex items-center gap-2"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
              >
                <i className="fas fa-globe" />
                <span>{languages.find((l) => l.code === lang)?.name || "简体中文"}</span>
                <i className="fas fa-chevron-down text-xs" />
              </button>
              {langMenuOpen && (
                <div className="lang-menu active">
                  {languages.map((language) => (
                    <div
                      key={language.code}
                      className={`lang-menu-item ${lang === language.code ? "active" : ""}`}
                      onClick={() => {
                        setLang(language.code as "zh-CN" | "en-US");
                        setLangMenuOpen(false);
                      }}
                    >
                      <i className={`fas ${lang === language.code ? "fa-check" : "fa-circle"}`} style={{ fontSize: "8px", opacity: lang === language.code ? 1 : 0 }} />
                      <span>{language.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
