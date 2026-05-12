import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DEFAULT_PROJECT_NAME = "inSona商照系统";

export async function GET() {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "projectName" },
    });
    return NextResponse.json({ projectName: setting?.value ?? DEFAULT_PROJECT_NAME });
  } catch (err) {
    return NextResponse.json(
      { projectName: DEFAULT_PROJECT_NAME },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { projectName } = await request.json();
    if (!projectName || typeof projectName !== "string") {
      return NextResponse.json({ error: "projectName is required" }, { status: 400 });
    }

    await prisma.systemSetting.upsert({
      where: { key: "projectName" },
      update: { value: projectName },
      create: { key: "projectName", value: projectName },
    });

    return NextResponse.json({ projectName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update setting";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
