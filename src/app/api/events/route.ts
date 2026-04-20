import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";

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

      // Subscribe to multi-gateway events
      unsubscribe = multiGatewayService.subscribeSSE((payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          if (unsubscribe) unsubscribe();
          if (keepAlive) clearInterval(keepAlive);
        }
      });

      // Heartbeat keep-alive every 30s
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          if (keepAlive) clearInterval(keepAlive);
        }
      }, 30_000);
    },
    cancel() {
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
