import net from "net";
import fs from "fs";
import path from "path";
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
  private _isManualDisconnect: boolean = false; // 区分手动断开和意外断开
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
    this._isManualDisconnect = false; // 重置手动断开标志（用户主动连接）
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    debug(`Connecting to ${ip}:${port}...`);
    return this._doConnect();
  }

  async disconnect() {
    debug("Disconnecting...");
    this._isManualDisconnect = true; // 标记为手动断开
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

    // 更新数据库中的网关状态
    try {
      await prisma.gateway.update({
        where: { id: "default" },
        data: {
          status: "disconnected",
          lastSeen: new Date(),
        },
      });
      debug("Gateway status updated to disconnected in database");
    } catch (err) {
      debug("Failed to update gateway status in database:", err);
    }

    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error("disconnected"));
    });
    this.pendingRequests.clear();
  }

  private _doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.connect(this.port, this.ip, async () => {
        this._status = "connected";
        this.reconnectAttempts = 0;
        debug(`Connected to ${this.ip}:${this.port}`);
        this._broadcast({ type: "connected" });
        this._startHeartbeatMonitor();

        // 更新数据库中的网关状态
        try {
          await prisma.gateway.update({
            where: { id: "default" },
            data: {
              ip: this.ip,
              port: this.port,
              status: "connected",
              lastSeen: new Date(),
            },
          });
          debug("Gateway status updated to connected in database");
        } catch (err) {
          debug("Failed to update gateway status in database:", err);
        }

        // 连接成功后延迟同步设备数据，给前端时间建立 SSE 连接
        setTimeout(() => {
          this.syncDevices()
            .then(() => {
              debug("Auto-sync completed after connection");
              // syncDevices() 会调用 queryDevices()，结果会通过 SSE 广播
            })
            .catch((err) => {
              debug("Auto-sync failed after connection:", err.message);
            });
        }, 1000); // 延迟1秒，确保前端 SSE 已连接

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

    // 只有非手动断开才自动重连
    if (!this._isManualDisconnect) {
      debug("Unexpected disconnect, will attempt to reconnect");
      this._scheduleReconnect();
    } else {
      debug("Manual disconnect, skipping auto-reconnect");
      this._isManualDisconnect = false; // 重置标志
    }
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
          debug("Reconnected successfully");
          // queryDevices() 已在 _doConnect 中自动调用，无需重复
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

      // 处理能耗上报事件
      if (msg.evt === "energy") {
        this._handleEnergyEvent(msg).catch((err) => {
          debug("[ENERGY] Failed to save:", err);
        });
      }
      // 处理设备状态变化事件（创建 DashboardEvent）
      else if (msg.evt === "onoff" || msg.evt === "status") {
        this._handleDeviceEvent(msg).catch((err) => {
          debug("[DEVICE EVENT] Failed to save:", err);
        });
      }
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

  async syncDevices(): Promise<void> {
    debug("[SYNC] Starting device synchronization...");

    // 查询设备列表
    const result = await this.queryDevices();

    // 保存设备数据到数据库
    if (result && typeof result === "object" && "devices" in result) {
      // 先同步房间数据（确保 roomId 外键约束有效）
      if ("rooms" in result && Array.isArray(result.rooms)) {
        const gatewayRooms = (result as unknown as { rooms: Array<{ roomId: number; name: string }> }).rooms;
        for (const room of gatewayRooms) {
          try {
            await prisma.room.upsert({
              where: { id: String(room.roomId) },
              update: { name: room.name },
              create: {
                id: String(room.roomId),
                name: room.name,
                type: this.inferRoomType(room.name),
              },
            });
          } catch (err) {
            debug(`[SYNC] Failed to save room ${room.roomId}:`, err);
          }
        }
      }

      const gatewayDevices = (result as unknown as { devices: Array<Record<string, unknown>> }).devices;

      for (const dev of gatewayDevices) {
        const did = String(dev.did);
        const pid = Number(dev.pid ?? 0);
        const ver = String(dev.ver ?? "");
        const type = Number(dev.type);
        const name = String(dev.name || `设备${did.slice(-6)}`);
        const meshId = dev.meshid ? String(dev.meshid) : undefined;
        const func = Number(dev.func || 0);
        const alive = Number(dev.alive ?? 1);
        const value = dev.value !== undefined ? JSON.stringify(dev.value) : "[]";
        const funcs = dev.funcs ? JSON.stringify(dev.funcs) : "[]";
        const groups = dev.groups ? JSON.stringify(dev.groups) : "[]";

        // 从 groups 或网关 roomId 提取房间 ID（仅在创建新设备时设置）
        let roomId: string | undefined = undefined;

        // 优先从 groups 提取
        if (dev.groups && Array.isArray(dev.groups) && dev.groups.length >= 2) {
          // groups 格式：[0, room_id]
          const groupId = dev.groups[1];
          if (groupId && groupId !== 0) {
            roomId = String(groupId);
          }
        }

        // 如果 groups 为空或无效，使用网关返回的 roomId
        if (!roomId && dev.roomId) {
          roomId = String(dev.roomId);
        }

        try {
          // Upsert 设备数据
          await prisma.device.upsert({
            where: { id: did },
            update: {
              pid,
              ver,
              type,
              name,
              meshId,
              func,
              alive,
              value,
              funcs,
              groups,
              gatewayName: name,
            },
            create: {
              id: did,
              pid,
              ver,
              type,
              name,
              meshId,
              func,
              alive,
              value,
              funcs,
              groups,
              gatewayName: name,
              ratedPower: 10.0,
              roomId,
            },
          });
        } catch (err) {
          debug(`[SYNC] Failed to save device ${did}:`, err);
        }
      }

      debug(`[SYNC] Successfully synchronized ${gatewayDevices.length} devices`);
    } else {
      debug("[SYNC] No devices in response");
    }
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

  // ─── Device event handling ─────────────────────────────────────────────────

  private async _handleDeviceEvent(msg: Record<string, unknown>) {
    const { did, evt, value } = msg;

    if (!did) {
      debug("[DEVICE EVENT] Missing device ID");
      return;
    }

    // 查询设备信息
    const device = await prisma.device.findUnique({ where: { id: did as string } });
    if (!device) {
      debug("[DEVICE EVENT] Device not found in database:", did);
      return;
    }

    // 根据事件类型创建不同的事件记录
    let eventType: string;
    let eventMessage: string;

    if (evt === "onoff") {
      const isOn = Array.isArray(value) && value[0] === 1;
      eventType = "device_action";
      eventMessage = `${device.name} ${isOn ? "已开启" : "已关闭"}`;
    } else if (evt === "status") {
      const isOnline = Array.isArray(value) && value[0] === 1;
      eventType = isOnline ? "online" : "offline";
      eventMessage = `${device.name} ${isOnline ? "已上线" : "已离线"}`;
    } else {
      eventType = "device_event";
      eventMessage = `${device.name}: ${JSON.stringify(msg)}`;
    }

    try {
      await prisma.dashboardEvent.create({
        data: {
          type: eventType,
          deviceId: did as string,
          message: eventMessage,
          status: "unread",
          metadata: JSON.stringify(msg),
        },
      });
      debug(`[DEVICE EVENT] Created event for ${did}: ${eventMessage}`);
    } catch (err) {
      debug(`[DEVICE EVENT] Failed to create event:`, err);
    }
  }

  // ─── Energy event handling ─────────────────────────────────────────────────

  private async _handleEnergyEvent(msg: Record<string, unknown>) {
    const { did, power, percent, period, meshid, energy } = msg;

    if (!did) {
      debug("[ENERGY] Missing device ID");
      return;
    }

    // 记录 ECC57FB5134F00 设备的能耗事件到日志文件（测试用）
    if (did === "ECC57FB5134F00") {
      const timestamp = new Date();
      const hours = timestamp.getHours().toString().padStart(2, '0');
      const minutes = timestamp.getMinutes().toString().padStart(2, '0');
      const seconds = timestamp.getSeconds().toString().padStart(2, '0');
      const ms = timestamp.getMilliseconds().toString().padStart(3, '0');
      const timeStr = `${hours}:${minutes}:${seconds}.${ms}`;

      // 解析 energy 数组（序号-百分比成对）
      let analysis = "";
      if (energy && Array.isArray(energy)) {
        const pairs: string[] = [];
        for (let i = 0; i < energy.length; i += 2) {
          const seq = energy[i];      // 序号
          const pct = energy[i + 1];   // 百分比
          pairs.push(`${seq}(${pct}%)`);
        }
        analysis = ` [${pairs.join(', ')}]`;
      }

      const logEntry = `[${timeStr}] ${JSON.stringify(msg)}${analysis}\n`;
      const logPath = path.join(process.cwd(), "energy_events.log");

      try {
        fs.appendFileSync(logPath, logEntry, "utf8");
      } catch (err) {
        debug("[ENERGY LOG] Failed to write:", err);
      }
    }

    // 检查设备是否存在
    const device = await prisma.device.findUnique({ where: { id: did as string } });
    if (!device) {
      debug("[ENERGY] Device not found in database:", did);
      return;
    }

    // 处理新的能耗数据格式（energy数组）
    if (energy && Array.isArray(energy) && energy.length >= 2) {
      debug(`[ENERGY] Processing ${energy.length / 2} data points for device ${did}`);

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const currentHour = now.getHours();

      const dataPoints: Array<{
        sequence: number;
        percent: number;
        kwh: number;
      }> = [];

      let totalKwh = 0;
      let maxPower = 0;

      // 解析 energy 数组
      for (let i = 0; i < energy.length; i += 2) {
        const sequence = energy[i] as number;      // 序号
        const percentValue = energy[i + 1] as number; // 百分比

        // 计算能耗
        // 实际功率 = 额定功率 × 百分比
        const actualPowerWatts = (power as number) * (percentValue / 100);
        // 能耗 = 功率(W) × 周期(min) / 60(h) / 1000
        const kwh = actualPowerWatts * (period as number) / 60 / 1000;

        dataPoints.push({
          sequence,
          percent: percentValue,
          kwh
        });

        totalKwh += kwh;
        maxPower = Math.max(maxPower, actualPowerWatts);
      }

      try {
        // 1. 查询已存在的 sequence，过滤重复数据
        const existingSequences = await prisma.energyData.findMany({
          where: {
            deviceId: did as string,
            sequence: { in: dataPoints.map(p => p.sequence) }
          },
          select: { sequence: true }
        });

        const existingSet = new Set(existingSequences.map(s => s.sequence));
        const newPoints = dataPoints.filter(p => !existingSet.has(p.sequence));

        // 如果没有新数据，直接返回（避免重复累加）
        if (newPoints.length === 0) {
          debug(`[ENERGY] All data points are duplicates for device ${did}, skipping`);
          return;
        }

        debug(`[ENERGY] Inserting ${newPoints.length} new points (filtered ${dataPoints.length - newPoints.length} duplicates)`);

        // 2. 写入新数据到明细表
        await prisma.energyData.createMany({
          data: newPoints.map(p => ({
            deviceId: did as string,
            sequence: p.sequence,
            date: today,
            kwh: p.kwh,
            percent: p.percent,
            power: power as number,
            period: period as number,
          }))
        });

        // 3. 计算新数据的能耗值（只累加新插入的）
        totalKwh = newPoints.reduce((sum, p) => sum + p.kwh, 0);
        maxPower = newPoints.reduce((max, p) => {
          const powerWatts = (power as number) * (p.percent / 100);
          return Math.max(max, powerWatts);
        }, 0);

        // 更新 dataPoints 为新插入的数据点（用于后续聚合）
        dataPoints.length = 0;
        dataPoints.push(...newPoints);

        // 2. 更新小时聚合
        const existingHourly = await prisma.energyHourly.findUnique({
          where: {
            deviceId_date_hour: {
              deviceId: did as string,
              date: today,
              hour: currentHour
            }
          }
        });

        if (existingHourly) {
          await prisma.energyHourly.update({
            where: {
              deviceId_date_hour: {
                deviceId: did as string,
                date: today,
                hour: currentHour
              }
            },
            data: {
              kwh: existingHourly.kwh + totalKwh,
              peakWatts: Math.max(existingHourly.peakWatts, maxPower),
              dataCount: existingHourly.dataCount + dataPoints.length
            }
          });
        } else {
          await prisma.energyHourly.create({
            data: {
              deviceId: did as string,
              date: today,
              hour: currentHour,
              kwh: totalKwh,
              peakWatts: maxPower,
              dataCount: dataPoints.length
            }
          });
        }

        // 3. 更新日汇总
        const existingRecord = await prisma.energyRecord.findUnique({
          where: {
            deviceId_date: {
              deviceId: did as string,
              date: today
            }
          }
        });

        if (existingRecord) {
          await prisma.energyRecord.update({
            where: {
              deviceId_date: {
                deviceId: did as string,
                date: today
              }
            },
            data: {
              kwh: existingRecord.kwh + totalKwh,
              peakWatts: Math.max(existingRecord.peakWatts, maxPower)
            }
          });
        } else {
          await prisma.energyRecord.create({
            data: {
              deviceId: did as string,
              date: today,
              kwh: totalKwh,
              peakWatts: maxPower
            }
          });
        }

        // 4. 清理旧明细（保留最近 1 小时）
        const cutoff = new Date(Date.now() - 3600000);
        await prisma.energyData.deleteMany({
          where: { timestamp: { lt: cutoff } }
        });

        debug(`[ENERGY] Saved ${dataPoints.length} data points, hourly=${currentHour}, total=${totalKwh.toFixed(4)}kWh`);
      } catch (err) {
        debug(`[ENERGY] Failed to save energy data:`, err);
      }
    }
  }

  // 根据房间名称推断房间类型（参考 import-data/route.ts）
  private inferRoomType(name: string): string {
    if (name.includes('F') && name.match(/\dF/)) {
      const floorMatch = name.match(/(\d)F/);
      if (floorMatch && !name.includes('会议室') && !name.includes('办公室') && !name.includes('卫生间')) {
        return 'floor';
      }
    }
    return 'room';
  }
}

// Singleton
export const gatewayService = new GatewayService();
