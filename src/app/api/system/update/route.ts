import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const execAsync = promisify(exec);

// 配置: 从环境变量读取，默认值适用于容器内挂载 Docker socket 的场景
const COMPOSE_FILE = process.env.COMPOSE_FILE || "docker-compose.prod.yml";
const COMPOSE_PROJECT_DIR = process.env.COMPOSE_PROJECT_DIR || "/app/host";
const REGISTRY = process.env.REGISTRY || "registry.cn-hangzhou.aliyuncs.com";
const IMAGE_TAG = process.env.UPDATE_IMAGE_TAG || "latest";

async function runCompose(command: string): Promise<{ stdout: string; stderr: string }> {
  const fullCommand = `docker compose -f "${path.join(COMPOSE_PROJECT_DIR, COMPOSE_FILE)}" ${command}`;
  return execAsync(fullCommand, { timeout: 120000 });
}

export async function POST(request: Request) {
  try {
    const logs: string[] = [];

    // Step 1: Check Docker availability
    logs.push("检查 Docker 环境...");
    try {
      await execAsync("docker info");
      logs.push("Docker 可用");
    } catch {
      return NextResponse.json(
        { error: "Docker 不可用，请确保已挂载 /var/run/docker.sock", logs },
        { status: 500 }
      );
    }

    // Step 2: Backup database
    logs.push("备份数据库...");
    const dbPath = path.join(process.cwd(), "data", "dev.db");
    const backupPath = path.join(process.cwd(), "data", `dev.db.backup.${Date.now()}`);
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      logs.push(`数据库已备份: dev.db.backup.${Date.now()}`);
    } else {
      logs.push("未找到数据库文件，跳过备份");
    }

    // Step 3: Pull latest image
    logs.push("拉取最新镜像...");
    try {
      const pullResult = await runCompose("pull");
      logs.push("镜像拉取成功");
      if (pullResult.stdout) logs.push(pullResult.stdout.trim());
    } catch (err: any) {
      const stderr = err.stderr || err.message || "";
      logs.push(`镜像拉取失败: ${stderr}`);
      return NextResponse.json(
        { error: "镜像拉取失败", logs, recovery: "数据库备份未受影响" },
        { status: 500 }
      );
    }

    // Step 4: Restart containers
    logs.push("重启容器...");
    try {
      const upResult = await runCompose("up -d");
      logs.push("容器重启成功");
      if (upResult.stdout) logs.push(upResult.stdout.trim());
    } catch (err: any) {
      const stderr = err.stderr || err.message || "";
      logs.push(`容器重启失败: ${stderr}`);
      return NextResponse.json(
        { error: "容器重启失败", logs, recovery: "数据库备份未受影响" },
        { status: 500 }
      );
    }

    logs.push("升级完成");

    return NextResponse.json({
      status: "ok",
      message: "升级成功",
      logs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "升级失败";
    console.error("[SystemUpdate]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Check upgrade status (GET)
export async function GET() {
  try {
    // Get current image info
    const { stdout } = await execAsync("docker images --format '{{.Repository}}:{{.Tag}}' | grep insona-admin || echo 'not found'");

    return NextResponse.json({
      currentImage: stdout.trim(),
      registry: REGISTRY,
      availableTag: IMAGE_TAG,
    });
  } catch {
    return NextResponse.json({
      currentImage: "unknown",
      registry: REGISTRY,
      availableTag: IMAGE_TAG,
    });
  }
}
