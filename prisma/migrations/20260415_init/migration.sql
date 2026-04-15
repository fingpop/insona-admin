-- CreateTable
CREATE TABLE "Gateway" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 8091,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastSeen" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'room',
    "parentId" TEXT,
    "meshId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Room_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pid" INTEGER NOT NULL,
    "ver" TEXT,
    "type" INTEGER NOT NULL,
    "alive" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "gatewayName" TEXT NOT NULL DEFAULT '',
    "func" INTEGER NOT NULL,
    "funcs" TEXT NOT NULL DEFAULT '[]',
    "value" TEXT NOT NULL DEFAULT '[]',
    "groups" TEXT NOT NULL DEFAULT '[]',
    "meshId" TEXT,
    "originalDid" TEXT,
    "ratedPower" REAL NOT NULL DEFAULT 10.0,
    "roomId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'fa-star',
    "color" TEXT NOT NULL DEFAULT '#3b9eff',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "showInQuick" BOOLEAN NOT NULL DEFAULT false,
    "sceneId" INTEGER,
    "meshId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SceneAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "meshId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "SceneAction_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnergySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kwh" REAL NOT NULL,
    "rawPayload" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "EnergySnapshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnergyData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "kwh" REAL NOT NULL,
    "percent" INTEGER NOT NULL,
    "power" REAL NOT NULL,
    "period" INTEGER NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnergyData_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnergyRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kwh" REAL NOT NULL DEFAULT 0,
    "peakWatts" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "EnergyRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnergyHourly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "kwh" REAL NOT NULL DEFAULT 0,
    "peakWatts" REAL NOT NULL DEFAULT 0,
    "dataCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EnergyHourly_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "deviceId" TEXT,
    "sceneId" TEXT,
    "cronExpr" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRun" DATETIME,
    "nextRun" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledTask_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduledTask_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DashboardEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "deviceId" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DashboardEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Device_roomId_idx" ON "Device"("roomId");

-- CreateIndex
CREATE INDEX "Device_alive_idx" ON "Device"("alive");

-- CreateIndex
CREATE INDEX "Device_type_idx" ON "Device"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Device_id_meshId_key" ON "Device"("id", "meshId");

-- CreateIndex
CREATE INDEX "Scene_isDefault_idx" ON "Scene"("isDefault");

-- CreateIndex
CREATE INDEX "Scene_isCustom_idx" ON "Scene"("isCustom");

-- CreateIndex
CREATE INDEX "Scene_showInQuick_idx" ON "Scene"("showInQuick");

-- CreateIndex
CREATE INDEX "SceneAction_sceneId_idx" ON "SceneAction"("sceneId");

-- CreateIndex
CREATE INDEX "EnergySnapshot_deviceId_timestamp_idx" ON "EnergySnapshot"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "EnergyData_deviceId_date_idx" ON "EnergyData"("deviceId", "date");

-- CreateIndex
CREATE INDEX "EnergyData_date_idx" ON "EnergyData"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EnergyData_deviceId_sequence_key" ON "EnergyData"("deviceId", "sequence");

-- CreateIndex
CREATE INDEX "EnergyRecord_date_idx" ON "EnergyRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EnergyRecord_deviceId_date_key" ON "EnergyRecord"("deviceId", "date");

-- CreateIndex
CREATE INDEX "EnergyHourly_deviceId_date_idx" ON "EnergyHourly"("deviceId", "date");

-- CreateIndex
CREATE INDEX "EnergyHourly_date_idx" ON "EnergyHourly"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EnergyHourly_deviceId_date_hour_key" ON "EnergyHourly"("deviceId", "date", "hour");

-- CreateIndex
CREATE INDEX "DashboardEvent_type_idx" ON "DashboardEvent"("type");

-- CreateIndex
CREATE INDEX "DashboardEvent_status_idx" ON "DashboardEvent"("status");

-- CreateIndex
CREATE INDEX "DashboardEvent_timestamp_idx" ON "DashboardEvent"("timestamp");

┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 7.7.0                       │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
