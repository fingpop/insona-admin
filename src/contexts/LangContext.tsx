"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import zhCN from "@/lib/i18n/translations/zh-CN.json";
import enUS from "@/lib/i18n/translations/en-US.json";

export type Lang = "zh-CN" | "en-US";
type Translations = Record<string, string>;

const translations: Record<Lang, Translations> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

interface LangContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangContextType | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh-CN");

  // 从 localStorage 读取初始语言
  useEffect(() => {
    const saved = localStorage.getItem("insona-lang") as Lang;
    if (saved && (saved === "zh-CN" || saved === "en-US")) {
      setLangState(saved);
    }
  }, []);

  // 更新 html lang 属性
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // 保存语言到 localStorage
  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("insona-lang", newLang);
  };

  // 翻译函数
  const t = (key: string, vars?: Record<string, string | number>): string => {
    let text = translations[lang][key] || translations["zh-CN"][key] || key;

    // 如果 key 不存在，输出警告
    if (!translations[lang][key] && !translations["zh-CN"][key]) {
      console.warn(`Missing translation: ${key}`);
    }

    // 变量插值
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      });
    }

    return text;
  };

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
