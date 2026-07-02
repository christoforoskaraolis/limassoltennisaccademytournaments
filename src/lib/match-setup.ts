import { MatchSetupType } from "@prisma/client";

export function parseMatchSetupType(raw: string): MatchSetupType {
  if (raw === MatchSetupType.SHORT_SET_TO_4) {
    return MatchSetupType.SHORT_SET_TO_4;
  }

  if (raw === MatchSetupType.BEST_OF_3_SUPER_TIEBREAK) {
    return MatchSetupType.BEST_OF_3_SUPER_TIEBREAK;
  }

  return MatchSetupType.NORMAL_SET;
}

export function isBestOfThreeSuperTiebreak(matchSetupType: MatchSetupType): boolean {
  return matchSetupType === MatchSetupType.BEST_OF_3_SUPER_TIEBREAK;
}

export function formatMatchSetupLabel(matchSetupType: MatchSetupType): string {
  switch (matchSetupType) {
    case MatchSetupType.SHORT_SET_TO_4:
      return "Short Set (to 4)";
    case MatchSetupType.BEST_OF_3_SUPER_TIEBREAK:
      return "Best of 3 (super tie-break)";
    default:
      return "Normal Set";
  }
}

export function resolveNumberOfSets(matchSetupType: MatchSetupType, numberOfSets: number): number {
  if (isBestOfThreeSuperTiebreak(matchSetupType)) {
    return 3;
  }

  return numberOfSets;
}

export function getMatchSetupRulesDescription(matchSetupType: MatchSetupType): string {
  switch (matchSetupType) {
    case MatchSetupType.SHORT_SET_TO_4:
      return "Short Set rule: 1 set up to 4 games. At 4-4, a tie-break is played to decide the winner.";
    case MatchSetupType.BEST_OF_3_SUPER_TIEBREAK:
      return "Best of 3 sets: the winner is the first to win 2 sets (match can finish 2-0 or 0-2). If sets are tied 1-1, a deciding super tie-break is played to 10 points, winning by 2 (for example 10-8 or 10-7). At 9-9, play continues until one side leads by 2 (for example 11-9). When saving results, enter sets won only (valid scores: 2-0, 2-1, 1-2, 0-2).";
    default:
      return "Normal Set: standard set scoring for each set played.";
  }
}

export function getScoreInputLabel(matchSetupType: MatchSetupType): string {
  return isBestOfThreeSuperTiebreak(matchSetupType) ? "Sets won" : "Games";
}

export function isValidBestOfThreeSetsScore(homeSets: number, awaySets: number): boolean {
  return (
    (homeSets === 2 && awaySets === 0) ||
    (homeSets === 0 && awaySets === 2) ||
    (homeSets === 2 && awaySets === 1) ||
    (homeSets === 1 && awaySets === 2)
  );
}

export function validateMatchScoreForSave(
  homeScore: number,
  awayScore: number,
  matchSetupType: MatchSetupType,
): boolean {
  if (homeScore < 0 || awayScore < 0) {
    return false;
  }

  if (isBestOfThreeSuperTiebreak(matchSetupType)) {
    return isValidBestOfThreeSetsScore(homeScore, awayScore);
  }

  return true;
}

export function formatMatchScoreDisplay(
  homeGames: number | null,
  awayGames: number | null,
  matchSetupType: MatchSetupType,
): string {
  if (homeGames === null || awayGames === null) {
    return "-";
  }

  const score = `${homeGames} - ${awayGames}`;

  if (isBestOfThreeSuperTiebreak(matchSetupType)) {
    return `${score} (sets)`;
  }

  return score;
}
