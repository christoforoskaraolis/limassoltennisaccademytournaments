import { EventType } from "@prisma/client";

import { formatEntryName } from "@/lib/entry-name";

export type StandingRow = {
  playerId: string;
  playerName: string;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gamePoints: number;
};

type TournamentForStandings = {
  eventType: EventType;
  standingsUseGamePoints: boolean;
  players: Array<{
    id: string;
    fullName: string;
    partnerName: string | null;
    groupNumber: number | null;
  }>;
  matches: Array<{
    homePlayerId: string;
    awayPlayerId: string;
    homeGames: number | null;
    awayGames: number | null;
    round: string;
  }>;
};

type TournamentForQualification = TournamentForStandings & {
  qualifiedPerGroup: number | null;
  qualifyBestSecond: boolean;
  qualifyBestThird: boolean;
};

export function compareStandingRows(
  a: StandingRow,
  b: StandingRow,
  useGamePoints: boolean,
): number {
  if (useGamePoints && b.gamePoints !== a.gamePoints) {
    return b.gamePoints - a.gamePoints;
  }
  if (b.wins !== a.wins) {
    return b.wins - a.wins;
  }
  const diffA = a.gamesWon - a.gamesLost;
  const diffB = b.gamesWon - b.gamesLost;
  if (diffB !== diffA) {
    return diffB - diffA;
  }
  if (b.gamesWon !== a.gamesWon) {
    return b.gamesWon - a.gamesWon;
  }
  return a.playerName.localeCompare(b.playerName);
}

export function sortStandingRows(rows: StandingRow[], useGamePoints: boolean) {
  return [...rows].sort((a, b) => compareStandingRows(a, b, useGamePoints));
}

export function sortByBestDiff(a: StandingRow, b: StandingRow) {
  const diffA = a.gamesWon - a.gamesLost;
  const diffB = b.gamesWon - b.gamesLost;
  if (diffB !== diffA) return diffB - diffA;
  if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return a.playerName.localeCompare(b.playerName);
}

export function buildStandingsByGroup(tournament: TournamentForStandings) {
  const playersByGroup = new Map<number, typeof tournament.players>();

  for (const player of tournament.players) {
    if (!player.groupNumber) {
      continue;
    }

    const list = playersByGroup.get(player.groupNumber) ?? [];
    list.push(player);
    playersByGroup.set(player.groupNumber, list);
  }

  const standingsByGroup = new Map<number, StandingRow[]>();

  for (const [groupNumber, groupPlayers] of playersByGroup.entries()) {
    const rows = new Map<string, StandingRow>();

    groupPlayers.forEach((player) => {
      rows.set(player.id, {
        playerId: player.id,
        playerName: formatEntryName(player, tournament.eventType),
        played: 0,
        wins: 0,
        losses: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamePoints: 0,
      });
    });

    for (const match of tournament.matches) {
      if (!match.round.startsWith("Group ")) {
        continue;
      }

      const home = rows.get(match.homePlayerId);
      const away = rows.get(match.awayPlayerId);
      if (!home || !away) {
        continue;
      }
      if (match.homeGames === null || match.awayGames === null) {
        continue;
      }

      home.played += 1;
      away.played += 1;
      home.gamesWon += match.homeGames;
      home.gamesLost += match.awayGames;
      away.gamesWon += match.awayGames;
      away.gamesLost += match.homeGames;

      if (tournament.standingsUseGamePoints) {
        home.gamePoints += match.homeGames;
        away.gamePoints += match.awayGames;
      }

      if (match.homeGames > match.awayGames) {
        home.wins += 1;
        away.losses += 1;
      } else if (match.awayGames > match.homeGames) {
        away.wins += 1;
        home.losses += 1;
      }
    }

    standingsByGroup.set(
      groupNumber,
      sortStandingRows([...rows.values()], tournament.standingsUseGamePoints),
    );
  }

  return standingsByGroup;
}

export function computeQualifiedPlayerIds(
  tournament: TournamentForQualification,
  standingsByGroup: Map<number, StandingRow[]>,
) {
  const qualifiedIds = new Set<string>();
  const perGroup = tournament.qualifiedPerGroup ?? 1;

  for (const rows of standingsByGroup.values()) {
    rows.slice(0, perGroup).forEach((row) => qualifiedIds.add(row.playerId));
  }

  const secondPlaceRows = [...standingsByGroup.values()]
    .map((rows) => rows[1])
    .filter((row): row is StandingRow => Boolean(row));
  const thirdPlaceRows = [...standingsByGroup.values()]
    .map((rows) => rows[2])
    .filter((row): row is StandingRow => Boolean(row));

  if (tournament.qualifyBestSecond && secondPlaceRows.length > 0) {
    secondPlaceRows.sort(sortByBestDiff);
    qualifiedIds.add(secondPlaceRows[0].playerId);
  }

  if (tournament.qualifyBestThird && thirdPlaceRows.length > 0) {
    thirdPlaceRows.sort(sortByBestDiff);
    qualifiedIds.add(thirdPlaceRows[0].playerId);
  }

  return qualifiedIds;
}

export function getQualifiedStandingRows(
  tournament: TournamentForStandings,
  qualifiedPlayerIds: Set<string>,
) {
  const standingsByGroup = buildStandingsByGroup(tournament);
  const qualifiedRows: StandingRow[] = [];

  for (const playerId of qualifiedPlayerIds) {
    let row: StandingRow | undefined;

    for (const rows of standingsByGroup.values()) {
      row = rows.find((standingRow) => standingRow.playerId === playerId);
      if (row) {
        break;
      }
    }

    if (row) {
      qualifiedRows.push(row);
    }
  }

  return sortStandingRows(qualifiedRows, tournament.standingsUseGamePoints);
}

export type KnockoutBracketMatch = {
  round: string;
  homePlayerId: string;
  awayPlayerId: string;
};

export function buildKnockoutBracketMatches(
  qualifiedRows: StandingRow[],
): { matches: KnockoutBracketMatch[] } | { error: string } {
  const count = qualifiedRows.length;

  if (count < 2) {
    return {
      error: "Need at least 2 qualified entries. Complete group matches and run qualification first.",
    };
  }

  if (count === 2) {
    return {
      matches: [
        {
          round: "Knockout Final",
          homePlayerId: qualifiedRows[0].playerId,
          awayPlayerId: qualifiedRows[1].playerId,
        },
      ],
    };
  }

  if (count === 4) {
    return {
      matches: [
        {
          round: "Knockout SF1",
          homePlayerId: qualifiedRows[0].playerId,
          awayPlayerId: qualifiedRows[3].playerId,
        },
        {
          round: "Knockout SF2",
          homePlayerId: qualifiedRows[1].playerId,
          awayPlayerId: qualifiedRows[2].playerId,
        },
      ],
    };
  }

  if (count === 8) {
    const pairings = [
      [0, 7],
      [3, 4],
      [2, 5],
      [1, 6],
    ] as const;

    return {
      matches: pairings.map(([homeIndex, awayIndex], index) => ({
        round: `Knockout QF${index + 1}`,
        homePlayerId: qualifiedRows[homeIndex].playerId,
        awayPlayerId: qualifiedRows[awayIndex].playerId,
      })),
    };
  }

  return {
    error: `This tournament has ${count} qualified entries. Knockout generation currently supports 2, 4, or 8 qualifiers.`,
  };
}
