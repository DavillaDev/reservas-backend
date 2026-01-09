-- CreateEnum
CREATE TYPE "VipGuestStatus" AS ENUM ('PENDING', 'CHECKED_IN', 'CANCELLED');

-- CreateTable
CREATE TABLE "vip_tokens" (
    "id" TEXT NOT NULL,
    "nightclubId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "maxGuests" INTEGER NOT NULL DEFAULT 50,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vip_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vip_guests" (
    "id" TEXT NOT NULL,
    "vipTokenId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "status" "VipGuestStatus" NOT NULL DEFAULT 'PENDING',
    "checkInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vip_guests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vip_tokens_code_key" ON "vip_tokens"("code");

-- AddForeignKey
ALTER TABLE "vip_tokens" ADD CONSTRAINT "vip_tokens_nightclubId_fkey" FOREIGN KEY ("nightclubId") REFERENCES "nightclubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_guests" ADD CONSTRAINT "vip_guests_vipTokenId_fkey" FOREIGN KEY ("vipTokenId") REFERENCES "vip_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
