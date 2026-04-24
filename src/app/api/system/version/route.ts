import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Read version from package.json
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    // Read VERSION file if exists
    let versionFile = pkg.version;
    try {
      const verPath = path.join(process.cwd(), "VERSION");
      versionFile = fs.readFileSync(verPath, "utf-8").trim();
    } catch {
      // fallback to package.json version
    }

    return NextResponse.json({
      version: versionFile,
      name: pkg.name,
      buildTime: process.env.BUILD_TIME || null,
      runtime: process.env.NODE_ENV || "development",
      platform: process.arch,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get version";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
