import { useLang } from "@/contexts/LangContext";

export function useTranslation() {
  return useLang();
}
