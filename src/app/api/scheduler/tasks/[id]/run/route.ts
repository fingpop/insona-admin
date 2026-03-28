import { NextResponse } from "next/server";
import { runTaskNow } from "@/lib/scheduler/SchedulerCore";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function POST(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const result = await runTaskNow(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Scheduler] Run now failed:", err);
    return NextResponse.json({ error: "执行失败" }, { status: 500 });
  }
}
