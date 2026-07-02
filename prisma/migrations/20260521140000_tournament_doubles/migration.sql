-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('SINGLES', 'DOUBLES');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "eventType" "EventType" NOT NULL DEFAULT 'SINGLES';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "partnerName" TEXT;
