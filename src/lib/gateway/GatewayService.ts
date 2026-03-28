import net from "net";
import { InSonaRequest, InSonaResponse } from "@/lib/types";
import { prisma } from "@/lib/prisma";

type SSEConsumer = (data: string) => void;

function debug(...args: unknown[]) {
  console.log("[Gateway]", ...args);
}

class GatewayService {
  private socket: net.Socket | null = null;
  private ip: string = "";
  private port: number = 8091;
  private _status: "connected" | "disconnected" | "connecting" | "reconnecting" =
    "disconnected";
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private buffer: string = "";
  private pendingRequests: Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void; timeout: NodeJS.Timeout }
  > = new Map();
  private sseConsumers: Set<SSEConsumer> = new Set();
  // UUID counter capped at 9 digits for inSona gateway compatibility
  private _uuidCounter: number = 0;
  private _nextUuid(): number {
    this._uuidCounter = (this._uuidCounter + 1) % 1_000_000_000;
    return this._uuidCounter;
  }

  get status() {
    return this._status;
  }

  get isConnected() {
    return this._status === "connected";
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  connect(ip: string, port: number = 8091): Promise<void> {
    // Always disconnect any existing socket first
    if (this.socket) {
      try { this.socket.destroy(); } catch { /* ignore */ }
      this.socket = null;
    }
    this.ip = ip;
    this.port = port;
    this._status = "connecting";
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    debug(`Connecting to ${ip}:${port}...`);
    return this._doConnect();
  }

  disconnect() {
    debug("Disconnecting...");
    this._clearTimers();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try { this.socket.destroy(); } catch { /* ignore */ }
      this.socket = null;
    }
    this._status = "disconnected";
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error("disconnected"));
    });
    this.pendingRequests.clear();
  }

  private _doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.connect(this.port, this.ip, () => {
        this._status = "connected";
        this.reconnectAttempts = 0;
        debug(`Connected to ${this.ip}:${this.port}`);
        this._broadcast({ type: "connected" });
        this._startHeartbeatMonitor();
        resolve();
      });

      this.socket.on("data", (chunk: Buffer) => {
        const hex = chunk.toString("hex");
        const utf8 = chunk.toString("utf8");
        debug(`[RECV] hex=${hex} str=${JSON.stringify(utf8)}`);
        this.buffer += utf8;
        this._drainBuffer();
      });

      this.socket.on("close", () => {
        debug("Socket closed");
        this._handleDisconnect();
      });

      this.socket.on("error", (err) => {
        const wasConnecting = this._status === "connecting";
        debug(`Socket error: ${err.message}`);
        this._handleDisconnect(err);
        if (wasConnecting) reject(new Error(`连接失败: ${err.message}`));
      });

      // Timeout for initial connection
      setTimeout(() => {
        if (this._status === "connecting") {
          debug("Connection timeout");
          this.socket?.destroy();
          reject(new Error("连接超时，请检查 IP 地址和网络"));
        }
      }, 10000);
    });
  }

  private async _handleDisconnect(err?: Error) {
    this._clearTimers();
    this._status = "disconnected";
    this._broadcast({ type: "disconnected", error: err?.message });

    // 将所有设备标记为离线
    try {
      await prisma.device.updateMany({
        data: { alive: 0 },
      });
      debug("All devices marked as offline");
    } catch (dbErr) {
      debug("Failed to mark devices offline:", dbErr);
    }

    this._scheduleReconnect();
  }

  private _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      debug("Max reconnect attempts reached, giving up");
      return;
    }
    this._status = "reconnecting";
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;
    debug(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this._doConnect()
        .then(() => {
          debug("Reconnected, syncing devices...");
          this.queryDevices().catch(() => {});
        })
        .catch(() => {});
    }, delay);
  }

  private _clearTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.pendingRequests.forEach(({ timeout }) => clearTimeout(timeout));
    this.pendingRequests.clear();
  }

  private _startHeartbeatMonitor() {
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.destroyed) {
        debug("Heartbeat detected dead socket");
        this._handleDisconnect();
      }
    }, 120_000);
  }

  // ─── Message parsing ────────────────────────────────────────────────────────

  private _drainBuffer() {
    debug(`Buffer now: ${JSON.stringify(this.buffer)}`);
    while (this.buffer.includes("\r\n")) {
      const idx = this.buffer.indexOf("\r\n");
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      if (!line.trim()) continue;
      debug(`[MSG] raw=${JSON.stringify(line)}`);
      try {
        const msg = JSON.parse(line);
        debug(`[MSG] parsed=${JSON.stringify(msg)}`);
        this._handleMessage(msg);
      } catch {
        debug(`[MSG] Failed to parse JSON: ${line}`);
      }
    }
  }

  private _handleMessage(msg: Record<string, unknown>) {
    const method = msg.method as string;
    const uuid = msg.uuid as number;

    debug(`[HANDLE] method=${method} uuid=${uuid} pendingUuids=${Array.from(this.pendingRequests.keys())}`);

    if (method === "s.query" || method === "s.control") {
      const pending = this.pendingRequests.get(uuid);
      if (pending) {
        debug(`[MATCH] Found pending request for uuid=${uuid}`);
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(uuid);
        pending.resolve(msg);
      } else {
        debug(`[WARN] No pending request for uuid=${uuid} — fire-and-forget response`);
      }
      this._broadcast({ type: method, payload: msg });
    } else if (method === "s.event") {
      debug(`[EVENT] ${msg.evt}`);
      this._broadcast({ type: "s.event", payload: msg });
    } else {
      debug(`[WARN] Unknown message type: ${method}`);
    }
  }

  // ─── Request/Response ───────────────────────────────────────────────────────

  sendRequest(req: InSonaRequest, timeoutMs: number = 15000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this._status !== "connected") {
        reject(new Error("Not connected to gateway"));
        return;
      }
      const payload = JSON.stringify(req) + "\r\n";
      debug(`[SEND] ${JSON.stringify(req)}`);
      debug(`[SEND-RAW] value type: ${typeof req.value}, value: ${JSON.stringify(req.value)}`);
      this.socket.write(payload, (err) => {
        if (err) {
          debug(`[SEND] Error: ${err.message}`);
          reject(err);
          return;
        }
        debug(`[SEND] Written ${payload.length} bytes, waiting for response uuid=${req.uuid}`);
        const timer = setTimeout(() => {
          const exists = this.pendingRequests.delete(req.uuid);
          debug(`[TIMEOUT] uuid=${req.uuid} still pending=${exists}`);
          reject(new Error(`请求超时: ${req.method}，网关 ${this.ip}:${this.port} 未响应`));
        }, timeoutMs);
        this.pendingRequests.set(req.uuid, { resolve, reject, timeout: timer });
      });
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async queryDevices(): Promise<InSonaResponse> {
    const uuid = this._nextUuid();
    debug(`[QUERY] Sending c.query with uuid=${uuid}`);
    // Match exact field order expected by inSona gateway
    const req: InSonaRequest = { version: 1, uuid, method: "c.query", type: "all" };
    return (await this.sendRequest(req, 15000)) as InSonaResponse;
  }

  async controlDevice(
    did: string,
    action: string,
    value: number[],
    meshid: string,
    transition: number = 0,
    timeoutMs: number = 15000
  ): Promise<unknown> {
    const uuid = this._nextUuid();
    const req: InSonaRequest = {
      version: 1,
      uuid,
      method: "c.control",
      did,
      meshid,
      action,
      value,
      transition,
    };
    console.log(`[GatewayService.controlDevice] value type: ${typeof value}, isArray: ${Array.isArray(value)}, value: ${JSON.stringify(value)}`);
    return this.sendRequest(req, timeoutMs);
  }

  async queryScenes(): Promise<{ scenes: { sceneId: number; name: string }[] }> {
    const uuid = this._nextUuid();
    const req: InSonaRequest = { version: 1, uuid, method: "c.query.scene" };
    return (await this.sendRequest(req, 10000)) as { scenes: { sceneId: number; name: string }[] };
  }

  async activateScene(sceneId: number, meshid: string): Promise<unknown> {
    const uuid = this._nextUuid();
    const req: InSonaRequest = {
      version: 1,
      uuid,
      method: "c.control",
      meshid,
      action: "scene",
      value: [sceneId],
    };
    return this.sendRequest(req);
  }

  // ─── SSE subscription ──────────────────────────────────────────────────────

  subscribeSSE(onData: SSEConsumer): () => void {
    this.sseConsumers.add(onData);
    return () => this.sseConsumers.delete(onData);
  }

  private _broadcast(data: unknown) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const consumer of Array.from(this.sseConsumers)) {
      try {
        consumer(payload);
      } catch {
        this.sseConsumers.delete(consumer);
      }
    }
  }
}

// Singleton
export const gatewayService = new GatewayService();
