import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG_ERRORS === "true" ? ["error"] : [],
  })


// Enable WAL mode + busy timeout for better concurrent write performance
// Must be awaited; split into separate calls (SQLite doesn't support ; separated)
async function initPrisma() {
  await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL")
  await prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000")
}
initPrisma().catch(() => {})
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
