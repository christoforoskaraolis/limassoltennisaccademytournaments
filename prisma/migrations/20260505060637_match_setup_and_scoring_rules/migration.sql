-- CreateEnum
CREATE TYPE "MatchSetupType" AS ENUM ('NORMAL_SET', 'SHORT_SET_TO_4');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "matchSetupType" "MatchSetupType" NOT NULL DEFAULT 'NORMAL_SET',
ADD COLUMN     "standingsUseGamePoints" BOOLEAN NOT NULL DEFAULT false;
