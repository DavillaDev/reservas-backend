/*
  Warnings:

  - A unique constraint covering the columns `[validationToken]` on the table `reservations` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "checkInAt" TIMESTAMP(3),
ADD COLUMN     "validationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "reservations_validationToken_key" ON "reservations"("validationToken");
