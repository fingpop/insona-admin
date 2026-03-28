import { NextResponse } from "next/server";
import { runSchedulerTick } from "@/lib/scheduler/SchedulerCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runSchedulerTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Scheduler] Tick failed:", err);
    return NextResponse.json({ error: "调度失败" }, { status: 500 });
  }
}
