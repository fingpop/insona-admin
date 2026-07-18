// 本地化日志记录器 - 内存环形缓冲区 + 可选文件持久化
import fs from "fs";
import path from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: any;
}

class Logger {
  private buffer: LogEntry[] = [];
  private maxSize: number = 500;
  private logDir: string;
  private enableFile: boolean = false;

  constructor() {
    this.logDir = path.join(process.cwd(), "data", "logs");
    // 尝试启用文件日志
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.enableFile = true;
    } catch {
      this.enableFile = false;
    }
  }

  private formatMessage(level: LogLevel, module: string, args: any[]): { message: string; data?: any } {
    const message = args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return `${arg.message}\n${arg.stack}`;
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      })
      .join(" ");

    return { message };
  }

  private addEntry(level: LogLevel, module: string, args: any[]) {
    const { message } = this.formatMessage(level, module, args);
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
    };

    // 添加到内存缓冲区（环形缓冲）
    this.buffer.push(entry);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }

    // 输出到 console
    const prefix = `[${new Date().toLocaleString("zh-CN")}] [${level.toUpperCase()}] [${module}]`;
    if (level === "error") {
      console.error(prefix, ...args);
    } else if (level === "warn") {
      console.warn(prefix, ...args);
    } else {
      console.log(prefix, ...args);
    }

    // 异步写入文件（按天分割），不阻塞事件循环
    if (this.enableFile) {
      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(this.logDir, `${date}.log`);
      const logLine = `${entry.timestamp} [${level.toUpperCase()}] [${module}] ${message}\n`;
      fs.appendFile(logFile, logLine, "utf-8", (err) => {
        if (err) console.error("[Logger] File write failed:", err.message);
      });
    }

    return entry;
  }

  info(module: string, ...args: any[]) {
    return this.addEntry("info", module, args);
  }

  warn(module: string, ...args: any[]) {
    return this.addEntry("warn", module, args);
  }

  error(module: string, ...args: any[]) {
    return this.addEntry("error", module, args);
  }

  debug(module: string, ...args: any[]) {
    return this.addEntry("debug", module, args);
  }

  // 获取日志（支持过滤）
  getLogs(options: {
    limit?: number;
    level?: LogLevel;
    module?: string;
    search?: string;
  } = {}): LogEntry[] {
    let result = [...this.buffer];

    if (options.level) {
      result = result.filter((e) => e.level === options.level);
    }
    if (options.module) {
      result = result.filter((e) => e.module === options.module);
    }
    if (options.search) {
      const search = options.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(search) ||
          e.module.toLowerCase().includes(search)
      );
    }

    // 按时间倒序
    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 限制数量
    const limit = options.limit ?? 200;
    return result.slice(0, limit);
  }

  // 清空日志
  clear() {
    this.buffer = [];
  }

  // 获取统计信息
  getStats() {
    const stats = {
      total: this.buffer.length,
      byLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
      },
      byModule: {} as Record<string, number>,
      oldest: this.buffer[0]?.timestamp || null,
      newest: this.buffer[this.buffer.length - 1]?.timestamp || null,
    };

    this.buffer.forEach((entry) => {
      stats.byLevel[entry.level]++;
      stats.byModule[entry.module] = (stats.byModule[entry.module] || 0) + 1;
    });

    return stats;
  }
}

// 使用 globalThis 确保跨模块上下文（instrumentation.ts / API routes / services）的真正单例
// Next.js 15 中不同模块上下文可能各自实例化模块，导致内存 buffer 不一致
declare global {
  // eslint-disable-next-line no-var
  var __insonaLogger: Logger | undefined;
}

function getLogger(): Logger {
  if (!globalThis.__insonaLogger) {
    globalThis.__insonaLogger = new Logger();
  }
  return globalThis.__insonaLogger;
}

// 代理对象：所有方法调用都转发到 globalThis 上的真正单例
export const logger = new Proxy({} as Logger, {
  get(_target, prop: keyof Logger) {
    const instance = getLogger();
    const value = instance[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
