/*
  Warnings:

  - A unique constraint covering the columns `[validationToken]` on the table `vip_guests` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "vip_guests" ADD COLUMN     "validationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "vip_guests_validationToken_key" ON "vip_guests"("validationToken");
