-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "qualifyBestSecond" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qualifyBestThird" BOOLEAN NOT NULL DEFAULT false;
