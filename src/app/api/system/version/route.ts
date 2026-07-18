import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export const runtime = "nodejs";

export async function GET() {
  try {
    // 读取 package.json 版本
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    // 读取 VERSION 文件（优先）
    let versionFile = pkg.version;
    try {
      const verPath = path.join(process.cwd(), "VERSION");
      versionFile = fs.readFileSync(verPath, "utf-8").trim();
    } catch {
      // 回退到 package.json 版本
    }

    // 获取构建时间（环境变量或当前时间）
    const buildTime = process.env.BUILD_TIME || new Date().toISOString();

    // 获取 Git 提交哈希（如果可用）
    let commitHash = "unknown";
    try {
      commitHash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    } catch {
      // Git 不可用时忽略
    }

    // 获取构建分支
    let branch = "unknown";
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    } catch {
      // Git 不可用时忽略
    }

    return NextResponse.json({
      version: versionFile,
      name: pkg.name,
      buildTime,
      commitHash,
      branch,
      runtime: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get version";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
