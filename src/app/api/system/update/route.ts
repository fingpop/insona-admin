import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const execAsync = promisify(exec);

export async function POST() {
  const logs: string[] = [];

  try {
    const scriptPath = path.join(process.cwd(), "deploy", "update.sh");
    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json(
        { error: "升级脚本不存在", logs },
        { status: 500 }
      );
    }

    logs.push("开始升级...");
    logs.push("执行升级脚本: deploy/update.sh");

    const { stdout, stderr } = await execAsync(`bash "${scriptPath}"`, {
      timeout: 300000,
      env: { ...process.env },
    });

    if (stdout) logs.push(...stdout.trim().split("\n").filter(Boolean));
    if (stderr) logs.push(...stderr.trim().split("\n").filter(Boolean));

    logs.push("升级完成");

    return NextResponse.json({
      status: "ok",
      message: "升级成功",
      logs,
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "升级失败";
    if (err.stdout) logs.push(...err.stdout.trim().split("\n").filter(Boolean));
    if (err.stderr) logs.push(...err.stderr.trim().split("\n").filter(Boolean));
    logs.push(`错误: ${message}`);

    return NextResponse.json(
      { error: message, logs },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    method: "script",
    script: "deploy/update.sh",
    note: "升级通过服务器端脚本执行，请确保已部署 docker-compose.prod.yml",
  });
}
