import { gatewayService } from "@/lib/gateway/GatewayService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepAlive: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connected event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));

      // Subscribe to gateway events
      unsubscribe = gatewayService.subscribeSSE((payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream closed, cleanup immediately
          if (unsubscribe) unsubscribe();
          if (keepAlive) clearInterval(keepAlive);
        }
      });

      // Heartbeat keep-alive every 30s
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // Stream closed, cleanup immediately
          if (keepAlive) clearInterval(keepAlive);
        }
      }, 30_000);
    },
    cancel() {
      // 确保在流被取消时清理资源
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
