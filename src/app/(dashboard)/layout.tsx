"use client";

import { LangProvider } from "@/contexts/LangContext";
import "../globals.css";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      {children}
    </LangProvider>
  );
}

