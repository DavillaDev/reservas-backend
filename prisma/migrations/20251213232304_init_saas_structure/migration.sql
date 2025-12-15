-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "SpaceType" AS ENUM ('CAMAROTE', 'BISTRO', 'MESA');

-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED', 'COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "nightclubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nightclubs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "mapUrl" TEXT,
    "themeColor" TEXT DEFAULT '#ff8c00',
    "whatsapp" TEXT NOT NULL,
    "appFeePercent" DECIMAL(65,30) NOT NULL DEFAULT 5.0,
    "mpAccessToken" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nightclubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spaces" (
    "id" TEXT NOT NULL,
    "nightclubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SpaceType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "SpaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "price" DECIMAL(65,30) DEFAULT 0.0,
    "minConsumption" DECIMAL(65,30) DEFAULT 0.0,
    "description" TEXT,
    "mapPosition" JSONB,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "nightclubId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "isBirthday" BOOLEAN NOT NULL DEFAULT false,
    "birthdayDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "checkInTime" TIMESTAMP(3),
    "amount" DECIMAL(65,30) DEFAULT 0.0,
    "paymentId" TEXT,
    "paymentCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "nightclubs_slug_key" ON "nightclubs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_paymentId_key" ON "reservations"("paymentId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_nightclubId_fkey" FOREIGN KEY ("nightclubId") REFERENCES "nightclubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_nightclubId_fkey" FOREIGN KEY ("nightclubId") REFERENCES "nightclubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_nightclubId_fkey" FOREIGN KEY ("nightclubId") REFERENCES "nightclubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
