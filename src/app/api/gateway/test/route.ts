import { NextResponse } from "next/server";
import net from "net";

export const runtime = "nodejs";

// Raw TCP debug: sends a c.query and captures ALL responses for 5 seconds
// to diagnose what the gateway actually sends back
export async function POST(request: Request) {
  const { ip, port } = await request.json();

  if (!ip) {
    return NextResponse.json({ error: "IP required" }, { status: 400 });
  }

  const portNum = port ?? 8091;
  const messages: string[] = [];
  const errors: string[] = [];

  const result = await new Promise<{ messages: string[]; errors: string[] }>((resolve) => {
    const socket = new net.Socket();
    let buffer = "";

    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ messages, errors });
    }, 5000);

    socket.connect(portNum, ip, () => {
      // Match exact field order expected by inSona gateway: version, uuid, method, type
      // inSona gateway requires uuid <= 9 digits
      const uuid = Math.floor(Math.random() * 999_999_999);
      const req = JSON.stringify({ version: 1, uuid, method: "c.query", type: "all" }) + "\r\n";
      socket.write(req, () => {
        // Log what we sent
        messages.push(`[SENT] ${req.trim()}`);
      });
    });

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      // Keep draining buffer, accumulate complete messages
      while (buffer.includes("\n")) {
        // Try \r\n first, then \n
        let idx = buffer.indexOf("\r\n");
        let delimiter = "\r\n";
        if (idx === -1) {
          idx = buffer.indexOf("\n");
          delimiter = "\n";
        }
        if (idx === -1) break;
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + delimiter.length);
        if (!line) continue;
        // Try to parse as JSON
        let display = line;
        try {
          const parsed = JSON.parse(line);
          display = `[JSON] ${JSON.stringify(parsed)}`;
        } catch {
          display = `[RAW] ${line}`;
        }
        messages.push(display);
      }
    });

    socket.on("error", (err) => {
      errors.push(err.message);
      clearTimeout(timer);
      socket.destroy();
      resolve({ messages, errors });
    });

    socket.on("close", () => {
      clearTimeout(timer);
      resolve({ messages, errors });
    });
  });

  return NextResponse.json({
    ip,
    port: portNum,
    duration: "5s",
    rawMessages: result.messages,
    errors: result.errors,
  });
}
