import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/energy/cleanup
 *
 * 清理超过指定时间的能耗明细数据
 *
 * Query Parameters:
 * - hours: 保留最近多少小时的数据（默认 1 小时）
 * - dryRun: 是否只返回统计信息而不实际删除（默认 false）
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get("hours") || "1");
    const dryRun = searchParams.get("dryRun") === "true";

    const cutoff = new Date(Date.now() - hours * 3600000);

    if (dryRun) {
      // 只统计，不删除
      const count = await prisma.energyData.count({
        where: { timestamp: { lt: cutoff } }
      });

      return Response.json({
        message: "Dry run completed",
        cutoff: cutoff.toISOString(),
        hoursToKeep: hours,
        recordsToDelete: count,
        action: "none (dry run)"
      });
    }

    // 实际删除
    const result = await prisma.energyData.deleteMany({
      where: { timestamp: { lt: cutoff } }
    });

    console.log(`[CLEANUP] Deleted ${result.count} old EnergyData records before ${cutoff.toISOString()}`);

    return Response.json({
      success: true,
      message: `Cleaned up ${result.count} old energy data records`,
      cutoff: cutoff.toISOString(),
      hoursToKeep: hours,
      deletedCount: result.count
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Failed to cleanup energy data", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/energy/cleanup
 *
 * 查看清理统计信息
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get("hours") || "1");

    const cutoff = new Date(Date.now() - hours * 3600000);

    // 统计各时间段的记录数
    const [
      totalCount,
      recentCount,
      oldCount,
      hourlyCount,
      recordCount
    ] = await Promise.all([
      prisma.energyData.count(),
      prisma.energyData.count({
        where: { timestamp: { gte: cutoff } }
      }),
      prisma.energyData.count({
        where: { timestamp: { lt: cutoff } }
      }),
      prisma.energyHourly.count(),
      prisma.energyRecord.count()
    ]);

    // 查询最老和最新的记录时间
    const oldest = await prisma.energyData.findFirst({
      orderBy: { timestamp: "asc" },
      select: { timestamp: true }
    });
    const newest = await prisma.energyData.findFirst({
      orderBy: { timestamp: "desc" },
      select: { timestamp: true }
    });

    return Response.json({
      cutoff: cutoff.toISOString(),
      hoursToKeep: hours,
      energyData: {
        total: totalCount,
        recent: recentCount,
        old: oldCount,
        oldestRecord: oldest?.timestamp || null,
        newestRecord: newest?.timestamp || null
      },
      energyHourly: {
        total: hourlyCount
      },
      energyRecord: {
        total: recordCount
      },
      recommendation: oldCount > 10000
        ? `建议清理：发现 ${oldCount} 条超过 ${hours} 小时的旧数据`
        : "无需清理：旧数据量正常"
    });
  } catch (error) {
    console.error("Cleanup stats error:", error);
    return NextResponse.json(
      { error: "Failed to get cleanup statistics" },
      { status: 500 }
    );
  }
}