-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('KNOCKOUT', 'ROUND_ROBIN_AND_KNOCKOUT');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "category" TEXT,
ADD COLUMN     "format" "TournamentFormat" NOT NULL DEFAULT 'KNOCKOUT',
ADD COLUMN     "maxPlayers" INTEGER,
ADD COLUMN     "organizer" TEXT;
