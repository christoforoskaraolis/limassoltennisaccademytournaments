-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "awayGames" INTEGER,
ADD COLUMN     "homeGames" INTEGER;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "groupNumber" INTEGER;
