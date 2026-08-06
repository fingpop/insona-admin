// i18n 类型定义

export type Lang = "zh-CN" | "en-US";

export type TranslationKey = string;

export type TranslationVars = Record<string, string | number>;

export interface TranslationDictionary {
  [key: string]: string;
}

export interface LangContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
}

// 命名空间列表
export const NAMESPACES = [
  "common",
  "sidebar",
  "header",
  "dashboard",
  "devices",
  "drawer",
  "rooms",
  "scenes",
  "energy",
  "automation",
  "logs",
  "settings",
  "panel",
  "groups",
  "errors",
  "charts",
  "deviceType",
  "func",
] as const;

export type Namespace = (typeof NAMESPACES)[number];
