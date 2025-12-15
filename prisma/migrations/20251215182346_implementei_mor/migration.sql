-- AlterTable
ALTER TABLE "nightclubs" ADD COLUMN     "repassPixKey" TEXT,
ADD COLUMN     "repassPixKeyType" TEXT,
ALTER COLUMN "themeColor" SET DEFAULT '#697cafff';
