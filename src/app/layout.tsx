import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "inSona 商照管理后台",
  description: "智能照明控制系统管理后台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
