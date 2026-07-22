import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaInit: Promise<void> | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG_ERRORS === "true" ? ["error"] : [],
    // SQLite 连接池：减少连接争用，每个连接都会应用 PRAGMA
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// 启用 SQLite 优化：WAL 模式 + busy_timeout + 缓存
// 必须在任何查询之前 await 完成
async function initPrisma() {
  try {
    // PRAGMA journal_mode 和 busy_timeout 会返回结果，必须用 $queryRawUnsafe
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout=10000");
    await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL");
    await prisma.$queryRawUnsafe("PRAGMA cache_size=-8000"); // 8MB 缓存
    console.log("[Prisma] SQLite PRAGMAs applied successfully");
  } catch (err) {
    console.error("[Prisma] Failed to apply SQLite PRAGMAs:", err);
    throw err; // 不吞掉错误，让调用方知道初始化失败
  }
}

// 全局单例：确保 PRAGMA 只初始化一次
export const prismaReady = globalForPrisma.prismaInit ?? initPrisma();
globalForPrisma.prismaInit = prismaReady;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
