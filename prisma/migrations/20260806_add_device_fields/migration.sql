-- AlterTable
ALTER TABLE "Device" ADD COLUMN "maxEnergySeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Device" ADD COLUMN "lastPower" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Device" ADD COLUMN "lastPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Device" ADD COLUMN "gatewayId" TEXT;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Device_gatewayId_idx" ON "Device"("gatewayId");
