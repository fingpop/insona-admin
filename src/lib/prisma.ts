import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
    log: process.env.PRISMA_LOG_ERRORS === "true" ? ["error"] : [],
  })


// Enable WAL mode + busy timeout for better concurrent write performance
try {
  prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000")
} catch (_) { /* pragma may fail if already applied */ }
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
