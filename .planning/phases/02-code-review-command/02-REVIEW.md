---
phase: 02-code-review-command
reviewed: 2026-07-22T10:30:00Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - prisma/schema.prisma
  - src/app/api/devices/route.ts
  - src/lib/gateway/GatewayService.ts
  - src/lib/prisma.ts
findings:
  critical: 5
  warning: 8
  info: 3
  total: 16
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-07-22
**Depth:** deep
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed major refactor of energy write batching and device ID handling. The changes introduce batch processing for energy events, add `lastPower`/`lastPercent` tracking to Device model, and modify group device ID resolution. Found several critical issues including potential silent data loss in disconnect flush, race conditions in batch processing, schema migration requirement, and inconsistent group device ID resolution between event handlers.

## Critical Issues

### CR-01: Disconnect flush could fail silently and lose data

**File:** `src/lib/gateway/GatewayService.ts:146-148`
**Issue:** In the `disconnect()` method, the energy batch flush uses `.catch(() => {})` which swallows all errors. If the flush fails (e.g., database locked, connection lost), all pending energy data is lost without any logging or notification to the user. Additionally, this happens during manual disconnect when the socket may already be closing.

```typescript
if (this._pendingEnergyWrites.length > 0) {
  await this._processEnergyBatch().catch(() => {}); // Silent failure - data loss risk
}
```

**Fix:** Log the error and broadcast an SSE event so the UI can show a warning:

```typescript
if (this._pendingEnergyWrites.length > 0) {
  try {
    await this._processEnergyBatch();
    debug("Energy batch flushed on disconnect");
  } catch (err) {
    logger.error("Gateway", `Failed to flush energy batch on disconnect: ${err.message}`);
    this._broadcast({ type: "energy_flush_failed", error: err.message });
  }
}
```

---

### CR-02: Schema change requires migration but none exists

**File:** `prisma/schema.prisma:56-57`
**Issue:** Added `lastPower Float @default(0)` and `lastPercent Int @default(0)` fields to Device model. The initial migration (`prisma/migrations/20260415_init/migration.sql`) does not include these columns. Running the app will cause Prisma client errors until `npx prisma migrate dev` is executed. Without migration, lines 1107-1108 in GatewayService.ts will fail with "column not found" errors.

**Fix:** Generate migration:
```bash
npx prisma migrate dev --name add_lastpower_lastpercent
```

---

### CR-03: Group device ID resolution inconsistency between _handleEnergyEvent and syncDevices

**File:** `src/lib/gateway/GatewayService.ts:951-956` vs `530-570`
**Issue:** In `_syncDevicesInternal()` (line 570), group devices use composite ID: `buildStoredDeviceId(devMeshId, did)`. But in `_handleEnergyEvent()` (line 951-956), it first tries plain DID, then falls back to composite only if meshid is present:

```typescript
let deviceId = did as string;
let device = await prisma.device.findUnique({ where: { id: deviceId } });
if (!device && isGroupDevice(deviceId) && meshid) {
  deviceId = buildStoredDeviceId(String(meshid), deviceId);
  device = await prisma.device.findUnique({ where: { id: deviceId } });
}
```

The problem: Group device DIDs are stored as composite IDs in DB (`meshId:did`). The plain DID lookup at line 952 will **never find a group device** because no such record exists. This causes unnecessary double queries for every energy event from group devices.

Additionally, if `meshid` is missing from the energy event message, the group device will never be found.

**Fix:** Always build composite ID for group devices upfront, matching the sync logic:

```typescript
const deviceId = isGroupDevice(did as string) && meshid 
  ? buildStoredDeviceId(String(meshid), did as string)
  : did as string;
const device = await prisma.device.findUnique({ where: { id: deviceId } });
```

---

### CR-04: Race condition in batch processing - concurrent batches possible

**File:** `src/lib/gateway/GatewayService.ts:1054-1056, 1138-1140`
**Issue:** The `_processEnergyBatch()` method checks `_processingEnergyBatch` flag (line 1055), but after processing completes and sets flag to false (line 1145), new writes could arrive before the recursive call at line 1139 executes. More critically, if an error occurs in the batch processing, the flag is reset in `finally` block (line 1145), but the recursive call at line 1139 could start a new batch while the current one's error handling is still running.

The real issue: The check-then-splice pattern isn't atomic. Two rapid calls could both pass the guard at line 1055 before either sets the flag.

```typescript
private async _processEnergyBatch() {
  if (this._processingEnergyBatch) return;  // Not atomic!
  if (this._pendingEnergyWrites.length === 0) return;
  
  this._processingEnergyBatch = true;  // Set AFTER the guard check
  // ...
}
```

**Fix:** Use a promise-based lock to ensure only one batch processes at a time:

```typescript
private _batchPromise: Promise<void> | null = null;

private async _processEnergyBatch() {
  if (this._batchPromise) return; // Already processing, wait
  
  const batch = this._pendingEnergyWrites.splice(0);
  if (batch.length === 0) return;
  
  this._batchPromise = (async () => {
    try {
      // ... existing transaction logic ...
    } finally {
      this._batchPromise = null;
      // Process any accumulated writes
      if (this._pendingEnergyWrites.length > 0) {
        this._scheduleEnergyBatch();
      }
    }
  })();
  
  await this._batchPromise;
}
```

---

### CR-05: lastPower calculation is incorrect - should use ratedPower from device, not from event

**File:** `src/lib/gateway/GatewayService.ts:998-999, 1011`
**Issue:** The code calculates actual power using `power` from the event message:
```typescript
const actualPowerWatts = (power as number) * (percentValue / 100);
// ...
lastPower = actualPowerWatts;
```

But `power` comes from the gateway event (`msg.power`), which may vary per event. The Device table has `ratedPower` field that represents the device's fixed rated power. The calculation should use `device.ratedPower`, not the event's `power` value. Using event power leads to inconsistent `lastPower` values if the gateway reports different power values across events.

Additionally, line 1011 stores `actualPowerWatts` as `lastPower`, but this is recalculated per data point. If there are multiple data points in a batch, `lastPower` will be the power of the **last data point**, not necessarily the most recent actual reading.

**Fix:** Use device's ratedPower for consistency:

```typescript
// Calculate using device's rated power, not event power
const actualPowerWatts = device.ratedPower * (percentValue / 100);
```

This ensures `lastPower` reflects the expected power consumption based on the device's specification and current brightness.

## Warnings

### WR-01: prismaReady initialization could deadlock if initPrisma throws

**File:** `src/lib/prisma.ts:37-38`
**Issue:** The `prismaReady` export uses `??` operator:
```typescript
export const prismaReady = globalForPrisma.prismaInit ?? initPrasma();
globalForPrisma.prismaInit = prismaReady;
```

If `initPrisma()` throws an error (e.g., SQLite file locked), the rejected promise is stored in `globalForPrisma.prismaInit`. On subsequent imports, `globalForPrisma.prismaInit` is now defined (as a rejected promise), so the `??` operator won't trigger a retry. This means all code awaiting `prismaReady` will get the same rejection forever until process restart.

More critically, if two modules import `prismaReady` simultaneously before `initPrisma()` completes, both will see `globalForPrisma.prismaInit` as undefined and both will call `initPrisma()`, creating a race condition.

**Fix:** Assign the promise to global state BEFORE calling initPrisma:

```typescript
// Ensure only one initialization attempt
if (!globalForPrisma.prismaInit) {
  globalForPrisma.prismaInit = initPrisma();
}
export const prismaReady = globalForPrisma.prismaInit;
```

---

### WR-02: EnergyData INSERT OR IGNORE silently drops duplicates without logging

**File:** `src/lib/gateway/GatewayService.ts:1098-1101`
**Issue:** The query uses `INSERT OR IGNORE` which silently skips duplicate sequences. While this is intentional for deduplication, there's no visibility into how many records were actually inserted vs ignored. If the deduplication logic at lines 992-994 fails (e.g., `maxEnergySeq` not updated correctly), all future batches will be silently ignored, leading to data loss without any error indication.

```typescript
await tx.$executeRaw`
  INSERT OR IGNORE INTO EnergyData (deviceId, sequence, date, kwh, percent, power, period)
  VALUES ${Prisma.join(values)}
`;
```

**Fix:** After insertion, verify how many rows were affected and log if all were ignored:

```typescript
const result = await tx.$executeRaw`...`;
debug(`[ENERGY] Inserted ${result.count} new data points for ${deviceId}`);
if (dataPoints.length > 0 && result.count === 0) {
  logger.warn("Gateway", `All ${dataPoints.length} energy data points for ${deviceId} were duplicates`);
}
```

---

### WR-03: maxEnergySeq update relies on MAX() SQL function which may not work as expected

**File:** `src/lib/gateway/GatewayService.ts:1104-1110`
**Issue:** The UPDATE statement uses SQL `MAX()` aggregate function:
```typescript
await tx.$executeRaw`
  UPDATE Device SET
    maxEnergySeq = MAX(maxEnergySeq, ${maxSeqInBatch}),
    lastPower = ${lastPower},
    lastPercent = ${lastPercent}
  WHERE id = ${deviceId}
`;
```

SQLite's `MAX()` with two arguments returns the larger of the two values, which is correct here. However, this assumes `maxEnergySeq` is never NULL. If a device was created before the `maxEnergySeq` field was added to the schema (line 55 shows `@default(0)`), the column might be NULL in existing records, causing `MAX(NULL, value)` to return NULL.

**Fix:** Coalesce NULL to 0:

```typescript
await tx.$executeRaw`
  UPDATE Device SET
    maxEnergySeq = COALESCE(MAX(maxEnergySeq, ${maxSeqInBatch}), ${maxSeqInBatch}),
    lastPower = ${lastPower},
    lastPercent = ${lastPercent}
  WHERE id = ${deviceId}
`;
```

---

### WR-04: Batch timer doesn't unref, could prevent graceful shutdown

**File:** `src/lib/gateway/GatewayService.ts:1048-1051`
**Issue:** The `_scheduleEnergyBatch()` method creates a setTimeout but doesn't call `.unref()` on it (unlike `_cleanupTimer` at line 358). This means if there are pending energy writes, Node.js will wait for the timer to fire before exiting, preventing graceful shutdown.

```typescript
this._energyBatchTimer = setTimeout(() => {
  this._energyBatchTimer = null;
  this._processEnergyBatch();
}, 100);
```

**Fix:** Add `.unref()` to allow process exit:

```typescript
this._energyBatchTimer = setTimeout(() => {
  this._energyBatchTimer = null;
  this._processEnergyBatch();
}, 100);
this._energyBatchTimer.unref();
```

---

### WR-05: enrichDevices queries EnergyRecord but API comment says it uses lastPower

**File:** `src/app/api/devices/route.ts:23-25, 33-36`
**Issue:** The comment at line 33 says "lastPower 已经是实际功率（GatewayService 中 = 额定功率 × 百分比），直接使用", implying the power value comes directly from Device.lastPower. However, the code at line 23-25 queries `EnergyRecord` to get `todayKwh`, which is a separate aggregation. This is confusing - the power display uses `lastPower` (correct), but the comment suggests the entire energy calculation was simplified when it wasn't.

The real issue: The query fetches `EnergyRecord` for all devices (line 23-25), but if a device has no energy record for today (e.g., newly added device, device offline all day), `energyMap.get(d.id)` returns undefined and falls back to null. This is fine, but there's no handling for devices that have `lastPower > 0` but no EnergyRecord - this could indicate a data inconsistency that should be logged.

**Fix:** Add validation to detect inconsistency:

```typescript
return devices.map((d) => {
  const realTimePower = d.lastPower > 0
    ? Math.round(d.lastPower * 10) / 10
    : null;
  const todayKwh = energyMap.get(d.id) ?? null;
  
  if (realTimePower && !todayKwh) {
    debug(`Device ${d.id} has power ${realTimePower}W but no today's energy record`);
  }
  
  return {
    ...d,
    funcs: parseJsonArray(d.funcs),
    groups: parseJsonArray(d.groups),
    power: realTimePower,
    todayKwh,
  };
});
```

---

### WR-06: No validation that energy array length is even

**File:** `src/lib/gateway/GatewayService.ts:987-994`
**Issue:** The code assumes `energy` array always has even length (pairs of sequence + percent):
```typescript
for (let i = 0; i < energy.length; i += 2) {
  const sequence = energy[i] as number;
  const percentValue = energy[i + 1] as number;
}
```

If the gateway sends an odd-length array (e.g., malformed data, network corruption), `energy[i + 1]` will be `undefined`, causing `percentValue / 100` to produce `NaN`, which propagates through all calculations and could corrupt the database.

**Fix:** Validate array structure before processing:

```typescript
if (energy.length % 2 !== 0) {
  logger.error("Gateway", `Malformed energy array for ${deviceId}: odd length ${energy.length}`);
  return;
}
```

---

### WR-07: Cleanup timer runs on every connection, no deduplication

**File:** `src/lib/gateway/GatewayService.ts:343-359`
**Issue:** The `_startCleanupTimer()` method is called in `_doConnect()` (line 179), which means every reconnection creates a new cleanup timer. While there's a guard at line 344 (`if (this._cleanupTimer) return;`), this only prevents multiple timers within the same instance. If the GatewayService instance is recreated (e.g., hot reload in development), old timers from previous instances could still be running.

More importantly, the cleanup deletes ALL energy data older than 1 hour (line 348-350). This is aggressive - if a device was offline for 2 hours and comes back online, its historical data from 2 hours ago is deleted before it can be aggregated into EnergyRecord/EnergyHourly.

**Fix:** Increase retention window and make it configurable:

```typescript
const cutoff = new Date(Date.now() - 24 * 3600000); // Keep 24 hours instead of 1
```

---

### WR-08: Type safety issue - msg properties accessed without validation

**File:** `src/lib/gateway/GatewayService.ts:937`
**Issue:** The `_handleEnergyEvent` method destructures properties from `msg` without type checking:
```typescript
const { did, power, percent, period, meshid, energy } = msg;
```

These are typed as `unknown` in the parameter (`msg: Record<string, unknown>`), but the code immediately uses them as numbers (e.g., `power as number` at line 1028). If the gateway sends malformed data (e.g., `power: "high"` instead of a number), the type assertion will cause runtime errors or incorrect calculations.

**Fix:** Add type validation:

```typescript
if (typeof power !== 'number' || typeof period !== 'number') {
  debug("[ENERGY] Invalid types:", { power, period });
  return;
}
```

## Info

### IN-01: Unused variable `totalKwh` in batch write object

**File:** `src/lib/gateway/GatewayService.ts:1030`
**Issue:** The `totalKwh` field is calculated and stored in the batch write object, but it's only used inside the transaction at line 1116 and 1127 for upserting EnergyHourly and EnergyRecord. It's not exposed anywhere else and doesn't need to be part of the batch object since it's derived from `dataPoints`. Could be calculated inline to reduce memory footprint.

**Fix:** Remove `totalKwh` from batch object, calculate inline:

```typescript
// In batch object, store raw dataPoints only
// Calculate totalKwh inside transaction:
const totalKwh = dataPoints.reduce((sum, p) => sum + p.kwh, 0);
```

---

### IN-02: Magic number 100ms for batch window should be configurable

**File:** `src/lib/gateway/GatewayService.ts:1051`
**Issue:** The batch window is hardcoded as 100ms. This value affects latency vs throughput tradeoff - too short and batches don't merge effectively, too long and users perceive delay. Should be configurable via environment variable.

**Fix:** Make configurable:

```typescript
private readonly _batchWindowMs = parseInt(process.env.ENERGY_BATCH_WINDOW_MS || "100", 10);
// ...
this._energyBatchTimer = setTimeout(() => {
  // ...
}, this._batchWindowMs);
```

---

### IN-03: Missing index on Device.lastPower for querying active devices

**File:** `prisma/schema.prisma:56`
**Issue:** Added `lastPower` field but no database index. If the frontend needs to query "show all devices with power > 0", it will require a full table scan. Given that energy dashboard likely filters by active devices, an index would improve performance.

**Fix:** Add index to schema:

```prisma
model Device {
  // ...
  lastPower   Float     @default(0)
  lastPercent Int       @default(0)
  // ...
  @@index([lastPower])
}
```

---

_Reviewed: 2026-07-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
