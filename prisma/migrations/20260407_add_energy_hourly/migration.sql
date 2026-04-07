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

-- CreateIndex
CREATE UNIQUE INDEX "EnergyHourly_deviceId_date_hour_key" ON "EnergyHourly"("deviceId", "date", "hour");

-- CreateIndex
CREATE INDEX "EnergyHourly_deviceId_date_idx" ON "EnergyHourly"("deviceId", "date");

-- CreateIndex
CREATE INDEX "EnergyHourly_date_idx" ON "EnergyHourly"("date");