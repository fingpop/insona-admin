import { NextRequest, NextResponse } from "next/server";
import { logger, LogLevel, LogEntry } from "@/lib/logger";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const LOG_DIR = path.join(process.cwd(), "data", "logs");

/**
 * 从日志文件中读取指定日期的日志条目
 */
function readLogsFromFile(options: {
  limit: number;
  date?: string; // YYYY-MM-DD 格式，不传则默认今天
  level?: LogLevel;
  module?: string;
  search?: string;
}): LogEntry[] {
  const { limit, date, level, module: mod, search } = options;

  const targetDate = date || new Date().toISOString().split("T")[0];
  const file = path.join(LOG_DIR, `${targetDate}.log`);

  if (!fs.existsSync(file)) return [];

  const entries: LogEntry[] = [];

  try {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      const parsed = parseLogLine(line);
      if (!parsed) continue;

      // 过滤
      if (level && parsed.level !== level) continue;
      if (mod && parsed.module !== mod) continue;
      if (search) {
        const s = search.toLowerCase();
        if (
          !parsed.message.toLowerCase().includes(s) &&
          !parsed.module.toLowerCase().includes(s)
        )
          continue;
      }

      entries.push(parsed);
    }
  } catch {
    // 忽略文件读取错误
  }

  // 按时间倒序，取 limit 条
  entries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return entries.slice(0, limit);
}

/**
 * 解析单行日志文件内容
 * 格式：2026-07-18T09:40:25.690Z [DEBUG] [Gateway] 消息内容
 */
function parseLogLine(line: string): LogEntry | null {
  const match = line.match(
    /^(\S+)\s+\[(DEBUG|INFO|WARN|ERROR)\]\s+\[([^\]]+)\]\s+(.*)$/
  );
  if (!match) return null;

  const [, timestamp, level, module, message] = match;
  return {
    id: `${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp,
    level: level.toLowerCase() as LogLevel,
    module,
    message,
  };
}

// GET /api/system/logs - 获取运行日志
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "200");
    const level = searchParams.get("level") as LogLevel | null;
    const module = searchParams.get("module");
    const search = searchParams.get("search");
    const action = searchParams.get("action");
    const date = searchParams.get("date"); // YYYY-MM-DD 格式
    const today = new Date().toISOString().split("T")[0];

    // 清空日志
    if (action === "clear") {
      logger.clear();
      // 同时清空文件日志
      try {
        if (fs.existsSync(LOG_DIR)) {
          const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
          for (const file of files) {
            fs.unlinkSync(path.join(LOG_DIR, file));
          }
        }
      } catch {
        // 忽略文件删除错误
      }
      return NextResponse.json({ success: true, message: "日志已清空" });
    }

    // 获取统计
    if (action === "stats") {
      return NextResponse.json(logger.getStats());
    }

    // 指定了历史日期，直接从文件读取
    if (date && date !== today) {
      const logs = readLogsFromFile({
        limit: Math.min(limit, 1000),
        date,
        level: level || undefined,
        module: module || undefined,
        search: search || undefined,
      });

      const stats = logs.length > 0
        ? {
            total: logs.length,
            byLevel: {
              debug: logs.filter((l) => l.level === "debug").length,
              info: logs.filter((l) => l.level === "info").length,
              warn: logs.filter((l) => l.level === "warn").length,
              error: logs.filter((l) => l.level === "error").length,
            },
            byModule: logs.reduce(
              (acc, l) => ({ ...acc, [l.module]: (acc[l.module] || 0) + 1 }),
              {} as Record<string, number>
            ),
            oldest: logs[logs.length - 1]?.timestamp || null,
            newest: logs[0]?.timestamp || null,
          }
        : { total: 0, byLevel: { debug: 0, info: 0, warn: 0, error: 0 }, byModule: {}, oldest: null, newest: null };

      return NextResponse.json({ logs, stats });
    }

    // 今天：优先从内存缓冲获取
    let logs = logger.getLogs({
      limit: Math.min(limit, 1000),
      level: level || undefined,
      module: module || undefined,
      search: search || undefined,
    });

    // 如果内存缓冲为空，从文件读取（解决模块实例隔离问题）
    if (logs.length === 0) {
      logs = readLogsFromFile({
        limit: Math.min(limit, 1000),
        date: date || today,
        level: level || undefined,
        module: module || undefined,
        search: search || undefined,
      });
    }

    // 统计信息
    const stats = logs.length > 0
      ? {
          total: logs.length,
          byLevel: {
            debug: logs.filter((l) => l.level === "debug").length,
            info: logs.filter((l) => l.level === "info").length,
            warn: logs.filter((l) => l.level === "warn").length,
            error: logs.filter((l) => l.level === "error").length,
          },
          byModule: logs.reduce(
            (acc, l) => ({ ...acc, [l.module]: (acc[l.module] || 0) + 1 }),
            {} as Record<string, number>
          ),
          oldest: logs[logs.length - 1]?.timestamp || null,
          newest: logs[0]?.timestamp || null,
        }
      : logger.getStats();

    return NextResponse.json({
      logs,
      stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
