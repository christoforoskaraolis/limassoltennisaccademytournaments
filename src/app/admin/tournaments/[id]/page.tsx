import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

import DeletePlayerButton from "@/app/components/DeletePlayerButton";
import { MatchSetupType, TournamentFormat } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; scheduleTab?: string }>;
};

type StandingRow = {
  playerId: string;
  playerName: string;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gamePoints: number;
};

function sortStandingRows(rows: StandingRow[], useGamePoints: boolean) {
  return [...rows].sort((a, b) => {
    if (useGamePoints && b.gamePoints !== a.gamePoints) {
      return b.gamePoints - a.gamePoints;
    }
    if (b.wins !== a.wins) return b.wins - a.wins;
    const aDiff = a.gamesWon - a.gamesLost;
    const bDiff = b.gamesWon - b.gamesLost;
    if (bDiff !== aDiff) return bDiff - aDiff;
    if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
    return a.playerName.localeCompare(b.playerName);
  });
}

function sortByBestDiff(a: StandingRow, b: StandingRow) {
  const diffA = a.gamesWon - a.gamesLost;
  const diffB = b.gamesWon - b.gamesLost;
  if (diffB !== diffA) return diffB - diffA;
  if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return a.playerName.localeCompare(b.playerName);
}

async function qualifyPlayersForKnockout(formData: FormData) {
  "use server";

  const tournamentId = String(formData.get("tournamentId") ?? "");
  if (!tournamentId) return;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: true,
      matches: true,
    },
  });

  if (!tournament || tournament.format !== TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT) {
    return;
  }

  const playersByGroup = new Map<number, typeof tournament.players>();
  for (const player of tournament.players) {
    if (!player.groupNumber) continue;
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
        playerName: player.fullName,
        played: 0,
        wins: 0,
        losses: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamePoints: 0,
      });
    });

    for (const match of tournament.matches) {
      const home = rows.get(match.homePlayerId);
      const away = rows.get(match.awayPlayerId);
      if (!home || !away) continue;
      if (match.homeGames === null || match.awayGames === null) continue;

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

    standingsByGroup.set(groupNumber, sortStandingRows([...rows.values()], tournament.standingsUseGamePoints));
  }

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

  await prisma.$transaction([
    prisma.player.updateMany({
      where: { tournamentId },
      data: { knockoutQualified: false },
    }),
    prisma.player.updateMany({
      where: { id: { in: [...qualifiedIds] } },
      data: { knockoutQualified: true },
    }),
  ]);

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  redirect(`/admin/tournaments/${tournamentId}?tab=schedule-results&scheduleTab=knockout`);
}

async function generateKnockoutMatches(formData: FormData) {
  "use server";

  const tournamentId = String(formData.get("tournamentId") ?? "");
  if (!tournamentId) return;

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      players: true,
      matches: true,
    },
  });

  if (!tournament || tournament.format !== TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT) {
    return;
  }

  const playersByGroup = new Map<number, typeof tournament.players>();
  for (const player of tournament.players) {
    if (!player.groupNumber) continue;
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
        playerName: player.fullName,
        played: 0,
        wins: 0,
        losses: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamePoints: 0,
      });
    });

    for (const match of tournament.matches) {
      const home = rows.get(match.homePlayerId);
      const away = rows.get(match.awayPlayerId);
      if (!home || !away) continue;
      if (match.homeGames === null || match.awayGames === null) continue;

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

    standingsByGroup.set(groupNumber, sortStandingRows([...rows.values()], tournament.standingsUseGamePoints));
  }

  const firstPlaceRows = [...standingsByGroup.values()]
    .map((rows) => rows[0])
    .filter((row): row is StandingRow => Boolean(row));
  const secondPlaceRows = [...standingsByGroup.values()]
    .map((rows) => rows[1])
    .filter((row): row is StandingRow => Boolean(row));

  if (firstPlaceRows.length < 3 || secondPlaceRows.length === 0) {
    return;
  }

  firstPlaceRows.sort(sortByBestDiff);
  secondPlaceRows.sort(sortByBestDiff);

  const bestFirst = firstPlaceRows[0];
  const otherFirstA = firstPlaceRows[1];
  const otherFirstB = firstPlaceRows[2];
  const bestSecond = secondPlaceRows[0];

  await prisma.match.deleteMany({
    where: {
      tournamentId,
      round: {
        in: ["Knockout SF1", "Knockout SF2"],
      },
    },
  });

  await prisma.match.createMany({
    data: [
      {
        tournamentId,
        round: "Knockout SF1",
        homePlayerId: bestFirst.playerId,
        awayPlayerId: bestSecond.playerId,
      },
      {
        tournamentId,
        round: "Knockout SF2",
        homePlayerId: otherFirstA.playerId,
        awayPlayerId: otherFirstB.playerId,
      },
    ],
  });

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  redirect(`/admin/tournaments/${tournamentId}?tab=schedule-results&scheduleTab=knockout`);
}

async function generateKnockoutFinal(formData: FormData) {
  "use server";

  const tournamentId = String(formData.get("tournamentId") ?? "");
  if (!tournamentId) return;

  const sfMatches = await prisma.match.findMany({
    where: {
      tournamentId,
      round: { in: ["Knockout SF1", "Knockout SF2"] },
    },
    select: { round: true, winnerId: true },
  });

  const sf1 = sfMatches.find((m) => m.round === "Knockout SF1");
  const sf2 = sfMatches.find((m) => m.round === "Knockout SF2");
  if (!sf1?.winnerId || !sf2?.winnerId || sf1.winnerId === sf2.winnerId) {
    return;
  }

  const finalMatch = await prisma.match.findFirst({
    where: {
      tournamentId,
      round: "Knockout Final",
    },
    select: { id: true, homePlayerId: true, awayPlayerId: true },
  });

  if (finalMatch) {
    const finalistsChanged =
      finalMatch.homePlayerId !== sf1.winnerId || finalMatch.awayPlayerId !== sf2.winnerId;
    if (finalistsChanged) {
      await prisma.match.update({
        where: { id: finalMatch.id },
        data: {
          homePlayerId: sf1.winnerId,
          awayPlayerId: sf2.winnerId,
          winnerId: null,
          homeGames: null,
          awayGames: null,
          scheduledAt: null,
        },
      });
    }
  } else {
    await prisma.match.create({
      data: {
        tournamentId,
        round: "Knockout Final",
        homePlayerId: sf1.winnerId,
        awayPlayerId: sf2.winnerId,
      },
    });
  }

  revalidatePath(`/admin/tournaments/${tournamentId}`);
  redirect(`/admin/tournaments/${tournamentId}?tab=schedule-results&scheduleTab=knockout`);
}

async function ensureRoundRobinGroupMatches(tournamentId: string) {
  const players = await prisma.player.findMany({
    where: { tournamentId },
    orderBy: [{ groupNumber: "asc" }, { fullName: "asc" }],
    select: { id: true, groupNumber: true },
  });

  const playersByGroup = new Map<number, string[]>();
  for (const player of players) {
    if (!player.groupNumber) continue;
    const list = playersByGroup.get(player.groupNumber) ?? [];
    list.push(player.id);
    playersByGroup.set(player.groupNumber, list);
  }

  const existingGroupMatches = await prisma.match.findMany({
    where: {
      tournamentId,
      round: {
        startsWith: "Group ",
      },
    },
    select: { homePlayerId: true, awayPlayerId: true },
  });

  const existingPairs = new Set(
    existingGroupMatches.map((match) =>
      [match.homePlayerId, match.awayPlayerId].sort().join("__"),
    ),
  );

  const matchesToCreate: Array<{
    tournamentId: string;
    round: string;
    homePlayerId: string;
    awayPlayerId: string;
  }> = [];

  for (const [groupNumber, playerIds] of playersByGroup.entries()) {
    for (let i = 0; i < playerIds.length; i += 1) {
      for (let j = i + 1; j < playerIds.length; j += 1) {
        const homePlayerId = playerIds[i];
        const awayPlayerId = playerIds[j];
        const pairKey = [homePlayerId, awayPlayerId].sort().join("__");
        if (existingPairs.has(pairKey)) continue;
        matchesToCreate.push({
          tournamentId,
          round: `Group ${groupNumber}`,
          homePlayerId,
          awayPlayerId,
        });
        existingPairs.add(pairKey);
      }
    }
  }

  if (matchesToCreate.length > 0) {
    await prisma.match.createMany({
      data: matchesToCreate,
    });
  }
}

async function generateGroupMatches(formData: FormData) {
  "use server";

  const tournamentId = String(formData.get("tournamentId") ?? "");
  if (!tournamentId) {
    return;
  }

  await ensureRoundRobinGroupMatches(tournamentId);
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  redirect(`/admin/tournaments/${tournamentId}?tab=schedule-results&scheduleTab=group`);
}

async function updateTournament(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const organizer = String(formData.get("organizer") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const maxPlayersRaw = String(formData.get("maxPlayers") ?? "").trim();
  const formatRaw = String(formData.get("format") ?? TournamentFormat.KNOCKOUT);
  const location = String(formData.get("location") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const endsAtRaw = String(formData.get("endsAt") ?? "");

  if (!id || !name || !startsAtRaw || !endsAtRaw) {
    return;
  }

  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  const parsedMaxPlayers = maxPlayersRaw ? Number.parseInt(maxPlayersRaw, 10) : null;
  const maxPlayers = Number.isNaN(parsedMaxPlayers) ? null : parsedMaxPlayers;
  const format =
    formatRaw === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT
      ? TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT
      : TournamentFormat.KNOCKOUT;

  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt < startsAt ||
    (maxPlayers !== null && maxPlayers < 2)
  ) {
    return;
  }

  await prisma.tournament.update({
    where: { id },
    data: {
      name,
      organizer: organizer || null,
      category: category || null,
      maxPlayers,
      format,
      groupCount: format === TournamentFormat.KNOCKOUT ? null : undefined,
      playersPerGroup: format === TournamentFormat.KNOCKOUT ? null : undefined,
      qualifiedPerGroup: format === TournamentFormat.KNOCKOUT ? null : undefined,
      qualifyBestSecond: format === TournamentFormat.KNOCKOUT ? false : undefined,
      qualifyBestThird: format === TournamentFormat.KNOCKOUT ? false : undefined,
      location: location || null,
      startsAt,
      endsAt,
    },
  });

  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath("/admin");
}

async function updateRoundRobinRules(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const groupCountRaw = String(formData.get("groupCount") ?? "").trim();
  const playersPerGroupRaw = String(formData.get("playersPerGroup") ?? "").trim();
  const qualifiedPerGroupRaw = String(formData.get("qualifiedPerGroup") ?? "").trim();
  const qualifyBestSecond = formData.get("qualifyBestSecond") === "on";
  const qualifyBestThird = formData.get("qualifyBestThird") === "on";
  const matchSetupTypeRaw = String(formData.get("matchSetupType") ?? MatchSetupType.NORMAL_SET);
  const numberOfSetsRaw = String(formData.get("numberOfSets") ?? "").trim();
  const standingsUseGamePoints = formData.get("standingsUseGamePoints") === "on";

  if (!id) {
    return;
  }

  const parsedGroupCount = groupCountRaw ? Number.parseInt(groupCountRaw, 10) : null;
  const groupCount = Number.isNaN(parsedGroupCount) ? null : parsedGroupCount;
  const parsedPlayersPerGroup = playersPerGroupRaw ? Number.parseInt(playersPerGroupRaw, 10) : null;
  const playersPerGroup = Number.isNaN(parsedPlayersPerGroup) ? null : parsedPlayersPerGroup;
  const parsedQualifiedPerGroup = qualifiedPerGroupRaw
    ? Number.parseInt(qualifiedPerGroupRaw, 10)
    : null;
  const qualifiedPerGroup = Number.isNaN(parsedQualifiedPerGroup) ? null : parsedQualifiedPerGroup;
  const matchSetupType =
    matchSetupTypeRaw === MatchSetupType.SHORT_SET_TO_4
      ? MatchSetupType.SHORT_SET_TO_4
      : MatchSetupType.NORMAL_SET;
  const parsedNumberOfSets = numberOfSetsRaw ? Number.parseInt(numberOfSetsRaw, 10) : null;
  const numberOfSets = Number.isNaN(parsedNumberOfSets) ? null : parsedNumberOfSets;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { format: true },
  });

  if (!tournament || tournament.format !== TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT) {
    return;
  }

  if (
    !groupCount ||
    !playersPerGroup ||
    !qualifiedPerGroup ||
    !numberOfSets ||
    groupCount < 2 ||
    playersPerGroup < 2 ||
    qualifiedPerGroup < 1 ||
    qualifiedPerGroup > playersPerGroup ||
    numberOfSets < 1 ||
    numberOfSets > 5
  ) {
    return;
  }

  await prisma.tournament.update({
    where: { id },
    data: {
      groupCount,
      playersPerGroup,
      qualifiedPerGroup,
      qualifyBestSecond,
      qualifyBestThird,
      matchSetupType,
      numberOfSets,
      standingsUseGamePoints,
    },
  });

  revalidatePath(`/admin/tournaments/${id}`);
  revalidatePath("/admin");
}

async function addPlayer(formData: FormData) {
  "use server";

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!tournamentId || !fullName) {
    return;
  }

  await prisma.player.create({
    data: {
      tournamentId,
      fullName,
    },
  });

  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

async function updatePlayer(formData: FormData) {
  "use server";

  const playerId = String(formData.get("playerId") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const groupNumberRaw = String(formData.get("groupNumber") ?? "").trim();

  if (!playerId || !tournamentId || !fullName) {
    return;
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { format: true, groupCount: true },
  });

  if (!tournament) {
    return;
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { tournamentId: true },
  });

  if (!player || player.tournamentId !== tournamentId) {
    return;
  }

  let groupNumber: number | null = null;
  if (tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT) {
    const parsedGroup = groupNumberRaw ? Number.parseInt(groupNumberRaw, 10) : null;
    groupNumber = Number.isNaN(parsedGroup) ? null : parsedGroup;
    if (
      groupNumber !== null &&
      tournament.groupCount &&
      (groupNumber < 1 || groupNumber > tournament.groupCount)
    ) {
      groupNumber = null;
    }
  }

  await prisma.player.update({
    where: { id: playerId },
    data: {
      fullName,
      ...(tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT
        ? { groupNumber }
        : {}),
    },
  });

  if (tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT) {
    await ensureRoundRobinGroupMatches(tournamentId);
  }

  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

async function deletePlayer(formData: FormData) {
  "use server";

  const playerId = String(formData.get("playerId") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");

  if (!playerId || !tournamentId) {
    return;
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { tournamentId: true },
  });

  if (!player || player.tournamentId !== tournamentId) {
    return;
  }

  await prisma.$transaction([
    prisma.match.deleteMany({
      where: {
        OR: [{ homePlayerId: playerId }, { awayPlayerId: playerId }],
      },
    }),
    prisma.player.delete({
      where: { id: playerId },
    }),
  ]);

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { format: true },
  });

  if (tournament?.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT) {
    await ensureRoundRobinGroupMatches(tournamentId);
  }

  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

async function autoAssignGroups(formData: FormData) {
  "use server";

  const tournamentId = String(formData.get("tournamentId") ?? "");
  if (!tournamentId) {
    return;
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { format: true, groupCount: true, playersPerGroup: true },
  });

  if (
    !tournament ||
    tournament.format !== TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT ||
    !tournament.groupCount ||
    !tournament.playersPerGroup
  ) {
    return;
  }

  const players = await prisma.player.findMany({
    where: { tournamentId },
    orderBy: { fullName: "asc" },
    select: { id: true },
  });

  await prisma.$transaction(
    players.map((player, index) => {
      const groupNumber = (index % tournament.groupCount!) + 1;
      return prisma.player.update({
        where: { id: player.id },
        data: { groupNumber },
      });
    }),
  );

  await ensureRoundRobinGroupMatches(tournamentId);

  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

async function importPlayersFromExcel(formData: FormData) {
  "use server";

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const file = formData.get("playersFile");

  if (!tournamentId || !(file instanceof File) || file.size === 0) {
    return;
  }

  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return;
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    blankrows: false,
  });

  const names = rows
    .map((row, rowIndex) => {
      const raw = row[0];
      if (raw === undefined || raw === null) {
        return "";
      }

      const value = String(raw).trim();
      if (!value) {
        return "";
      }

      // Skip common header cells when they appear on first row.
      if (rowIndex === 0 && ["name", "full name", "player", "player name"].includes(value.toLowerCase())) {
        return "";
      }

      return value;
    })
    .filter((name) => name.length > 0);

  if (names.length === 0) {
    return;
  }

  const uniqueNames = [...new Set(names)];
  await prisma.player.createMany({
    data: uniqueNames.map((fullName) => ({
      tournamentId,
      fullName,
    })),
  });

  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

async function updateMatchResult(formData: FormData) {
  "use server";

  const matchId = String(formData.get("matchId") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const homePlayerId = String(formData.get("homePlayerId") ?? "");
  const awayPlayerId = String(formData.get("awayPlayerId") ?? "");
  const homeGamesRaw = String(formData.get("homeGames") ?? "").trim();
  const awayGamesRaw = String(formData.get("awayGames") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "").trim();

  if (!matchId || !tournamentId || !homePlayerId || !awayPlayerId) {
    return;
  }

  const parsedHome = homeGamesRaw ? Number.parseInt(homeGamesRaw, 10) : null;
  const parsedAway = awayGamesRaw ? Number.parseInt(awayGamesRaw, 10) : null;
  const homeGames = Number.isNaN(parsedHome) ? null : parsedHome;
  const awayGames = Number.isNaN(parsedAway) ? null : parsedAway;

  if (homeGames === null || awayGames === null || homeGames < 0 || awayGames < 0) {
    return;
  }

  const parsedScheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  const scheduledAt =
    parsedScheduledAt && !Number.isNaN(parsedScheduledAt.getTime()) ? parsedScheduledAt : null;

  let winnerId: string | null = null;
  if (homeGames !== awayGames) {
    winnerId = homeGames > awayGames ? homePlayerId : awayPlayerId;
  }

  await prisma.match.update({
    where: { id: matchId },
    data: {
      homeGames,
      awayGames,
      winnerId,
      scheduledAt,
    },
  });

  const updatedMatch = await prisma.match.findUnique({
    where: { id: matchId },
    select: { round: true },
  });

  if (updatedMatch?.round === "Knockout SF1" || updatedMatch?.round === "Knockout SF2") {
    const sfMatches = await prisma.match.findMany({
      where: {
        tournamentId,
        round: {
          in: ["Knockout SF1", "Knockout SF2"],
        },
      },
      select: {
        round: true,
        winnerId: true,
      },
    });

    const sf1 = sfMatches.find((m) => m.round === "Knockout SF1");
    const sf2 = sfMatches.find((m) => m.round === "Knockout SF2");

    const finalMatch = await prisma.match.findFirst({
      where: {
        tournamentId,
        round: "Knockout Final",
      },
      select: { id: true, homePlayerId: true, awayPlayerId: true },
    });

    if (sf1?.winnerId && sf2?.winnerId && sf1.winnerId !== sf2.winnerId) {
      if (finalMatch) {
        const finalistsChanged =
          finalMatch.homePlayerId !== sf1.winnerId || finalMatch.awayPlayerId !== sf2.winnerId;
        if (finalistsChanged) {
          await prisma.match.update({
            where: { id: finalMatch.id },
            data: {
              homePlayerId: sf1.winnerId,
              awayPlayerId: sf2.winnerId,
              winnerId: null,
              homeGames: null,
              awayGames: null,
              scheduledAt: null,
            },
          });
        }
      } else {
        await prisma.match.create({
          data: {
            tournamentId,
            round: "Knockout Final",
            homePlayerId: sf1.winnerId,
            awayPlayerId: sf2.winnerId,
          },
        });
      }
    } else if (finalMatch) {
      await prisma.match.delete({
        where: { id: finalMatch.id },
      });
    }
  }

  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

export default async function TournamentControlPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawTab = resolvedSearchParams?.tab;
  const rawScheduleTab = resolvedSearchParams?.scheduleTab;
  const activeTab =
    rawTab === "players" || rawTab === "schedule-results" || rawTab === "rules"
      ? rawTab
      : "tournament-details";
  const activeScheduleTab = rawScheduleTab === "knockout" ? "knockout" : "group";

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: {
        orderBy: [{ groupNumber: "asc" }, { fullName: "asc" }],
      },
      matches: {
        orderBy: [{ scheduledAt: "asc" }, { round: "asc" }],
        include: {
          homePlayer: true,
          awayPlayer: true,
        },
      },
    },
  });

  if (!tournament) {
    notFound();
  }

  const playersByGroup = new Map<number, typeof tournament.players>();
  for (const player of tournament.players) {
    if (!player.groupNumber) continue;
    const list = playersByGroup.get(player.groupNumber) ?? [];
    list.push(player);
    playersByGroup.set(player.groupNumber, list);
  }

  const standingsByGroup = new Map<number, StandingRow[]>();
  const groupMatchesByGroup = new Map<number, typeof tournament.matches>();
  for (const [groupNumber, groupPlayers] of playersByGroup.entries()) {
    const rows = new Map<string, StandingRow>();
    groupPlayers.forEach((player) => {
      rows.set(player.id, {
        playerId: player.id,
        playerName: player.fullName,
        played: 0,
        wins: 0,
        losses: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamePoints: 0,
      });
    });

    for (const match of tournament.matches) {
      const home = rows.get(match.homePlayerId);
      const away = rows.get(match.awayPlayerId);
      if (!home || !away) continue;
      if (match.homeGames === null || match.homeGames === undefined) continue;
      if (match.awayGames === null || match.awayGames === undefined) continue;

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

    const sortedRows = sortStandingRows([...rows.values()], tournament.standingsUseGamePoints);

    standingsByGroup.set(groupNumber, sortedRows);

    const groupPlayerIds = new Set(groupPlayers.map((player) => player.id));
    const groupMatches = tournament.matches.filter(
      (match) =>
        groupPlayerIds.has(match.homePlayerId) &&
        groupPlayerIds.has(match.awayPlayerId) &&
        match.round === `Group ${groupNumber}`,
    );
    groupMatchesByGroup.set(groupNumber, groupMatches);
  }

  const datetimeValue = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-3 py-6 text-zinc-900 dark:bg-black dark:text-zinc-100 sm:px-6 sm:py-12">
      <main className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tournament.name}</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Tournament control panel
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {tournament.format === TournamentFormat.KNOCKOUT
                ? "Knockout"
                : "Round Robin + Knockout"}
              {" • "}
              {tournament.category ?? "No category"}
              {" • "}
              {tournament.maxPlayers ? `${tournament.maxPlayers} players` : "No player limit set"}
              {tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT && (
                <>
                  {" • "}
                  {tournament.groupCount ?? "-"} groups x {tournament.playersPerGroup ?? "-"} players
                  {" • "}
                  {tournament.qualifiedPerGroup ?? "-"} qualify per group
                  {(tournament.qualifyBestSecond || tournament.qualifyBestThird) && " • "}
                  {tournament.qualifyBestSecond && "Best second-place qualify"}
                  {tournament.qualifyBestSecond && tournament.qualifyBestThird && " + "}
                  {tournament.qualifyBestThird && "Best third-place qualify"}
                </>
              )}
              {" • "}
              {tournament.matchSetupType === MatchSetupType.SHORT_SET_TO_4
                ? "Short Set (to 4)"
                : "Normal Set"}
              {" • "}
              {tournament.numberOfSets} set{tournament.numberOfSets > 1 ? "s" : ""}
              {tournament.standingsUseGamePoints && " • Standings by game points"}
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-block rounded-md border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Back to Admin
          </Link>
        </div>

        <section className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <div className="grid grid-cols-2 gap-2 border-b border-black/10 pb-4 dark:border-white/10 sm:flex sm:flex-wrap">
            <Link
              href={`/admin/tournaments/${tournament.id}?tab=tournament-details`}
              className={`rounded-md px-3 py-2 text-center text-sm ${
                activeTab === "tournament-details"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              Tournament Details
            </Link>
            <Link
              href={`/admin/tournaments/${tournament.id}?tab=rules`}
              className={`rounded-md px-3 py-2 text-center text-sm ${
                activeTab === "rules"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              Tournament Rules
            </Link>
            <Link
              href={`/admin/tournaments/${tournament.id}?tab=players`}
              className={`rounded-md px-3 py-2 text-center text-sm ${
                activeTab === "players"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              Players
            </Link>
            <Link
              href={`/admin/tournaments/${tournament.id}?tab=schedule-results`}
              className={`rounded-md px-3 py-2 text-center text-sm ${
                activeTab === "schedule-results"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              Schedule and Results
            </Link>
          </div>

          {activeTab === "tournament-details" && (
            <>
              <h2 className="mt-6 text-lg font-medium">Tournament details</h2>
              <form action={updateTournament} className="mt-4 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={tournament.id} />
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Name</span>
                  <input
                    name="name"
                    defaultValue={tournament.name}
                    required
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Location</span>
                  <input
                    name="location"
                    defaultValue={tournament.location ?? ""}
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Organizer</span>
                  <input
                    name="organizer"
                    defaultValue={tournament.organizer ?? ""}
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Category</span>
                  <input
                    name="category"
                    defaultValue={tournament.category ?? ""}
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Number of players</span>
                  <input
                    name="maxPlayers"
                    type="number"
                    min={2}
                    defaultValue={tournament.maxPlayers ?? ""}
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Tournament type</span>
                  <select
                    name="format"
                    defaultValue={tournament.format}
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                  >
                    <option value={TournamentFormat.KNOCKOUT}>Knockout</option>
                    <option value={TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT}>
                      Round Robin + Knockout
                    </option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Starts at</span>
                  <input
                    type="datetime-local"
                    name="startsAt"
                    defaultValue={datetimeValue(tournament.startsAt)}
                    required
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Ends at</span>
                  <input
                    type="datetime-local"
                    name="endsAt"
                    defaultValue={datetimeValue(tournament.endsAt)}
                    required
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Save Tournament
                  </button>
                </div>
              </form>
            </>
          )}

          {activeTab === "players" && (
            <>
              <h2 className="mt-6 text-lg font-medium">Players</h2>
              {tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT && (
                <form action={autoAssignGroups} className="mt-4">
                  <input type="hidden" name="tournamentId" value={tournament.id} />
                  <button
                    type="submit"
                    className="w-full rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 sm:w-auto dark:border-white/20 dark:hover:bg-white/10"
                  >
                    Auto-Assign Players to Groups
                  </button>
                </form>
              )}
              <form action={addPlayer} className="mt-4 grid gap-4 sm:grid-cols-4">
                <input type="hidden" name="tournamentId" value={tournament.id} />
                <label className="flex flex-col gap-2 sm:col-span-3">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Full name</span>
                  <input
                    name="fullName"
                    required
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                    placeholder="Carlos Alcaraz"
                  />
                </label>
                <div className="sm:col-span-1" />
                <div className="sm:col-span-4">
                  <button
                    type="submit"
                    className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Add Player
                  </button>
                </div>
              </form>

              <form
                action={importPlayersFromExcel}
                className="mt-4 grid gap-4 rounded-md border border-black/10 p-4 sm:grid-cols-4 dark:border-white/10"
              >
                <input type="hidden" name="tournamentId" value={tournament.id} />
                <label className="flex flex-col gap-2 sm:col-span-3">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    Import players from Excel (.xlsx, .xls)
                  </span>
                  <input
                    type="file"
                    name="playersFile"
                    accept=".xlsx,.xls"
                    required
                    className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-white hover:file:bg-zinc-700 dark:border-white/20 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-zinc-300"
                  />
                </label>
                <div className="sm:col-span-1 sm:self-end">
                  <button
                    type="submit"
                    className="w-full rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  >
                    Import Excel
                  </button>
                </div>
              </form>

              {tournament.players.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">No players added yet.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-black/10 dark:border-white/10">
                      <tr>
                        <th className="px-2 py-2 font-medium">Name</th>
                        {tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT && (
                          <th className="px-2 py-2 font-medium">Group</th>
                        )}
                        <th className="px-2 py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tournament.players.map((player) => {
                        const playerFormId = `player-form-${player.id}`;

                        return (
                          <tr key={player.id} className="border-b border-black/5 dark:border-white/10">
                            <td className="px-2 py-2">
                              <input
                                form={playerFormId}
                                name="fullName"
                                defaultValue={player.fullName}
                                required
                                className="w-full min-w-[140px] rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                              />
                            </td>
                            {tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT && (
                              <td className="px-2 py-2">
                                <select
                                  form={playerFormId}
                                  name="groupNumber"
                                  defaultValue={player.groupNumber ? String(player.groupNumber) : ""}
                                  className="w-full rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                                >
                                  <option value="">Unassigned</option>
                                  {Array.from({ length: tournament.groupCount ?? 0 }, (_, index) => (
                                    <option key={index + 1} value={String(index + 1)}>
                                      Group {index + 1}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            )}
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="submit"
                                  form={playerFormId}
                                  className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                                >
                                  Save
                                </button>
                                <DeletePlayerButton
                                  playerId={player.id}
                                  tournamentId={tournament.id}
                                  deletePlayer={deletePlayer}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {tournament.players.map((player) => {
                    const playerFormId = `player-form-${player.id}`;

                    return (
                      <form
                        key={`${player.id}-form`}
                        id={playerFormId}
                        action={updatePlayer}
                        className="hidden"
                      >
                        <input type="hidden" name="playerId" value={player.id} />
                        <input type="hidden" name="tournamentId" value={tournament.id} />
                      </form>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === "schedule-results" && (
            <>
              <h2 className="mt-6 text-lg font-medium">Schedule and Results</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Link
                  href={`/admin/tournaments/${tournament.id}?tab=schedule-results&scheduleTab=group`}
                  className={`rounded-md px-3 py-2 text-center text-sm ${
                    activeScheduleTab === "group"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  }`}
                >
                  Group Matches
                </Link>
                <Link
                  href={`/admin/tournaments/${tournament.id}?tab=schedule-results&scheduleTab=knockout`}
                  className={`rounded-md px-3 py-2 text-center text-sm ${
                    activeScheduleTab === "knockout"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  }`}
                >
                  Knockout Phase
                </Link>
              </div>
              {tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT && (
                <form action={generateGroupMatches} className="mt-3">
                  <input type="hidden" name="tournamentId" value={tournament.id} />
                  <button
                    type="submit"
                    className="w-full rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 sm:w-auto dark:border-white/20 dark:hover:bg-white/10"
                  >
                    Generate Group Matches
                  </button>
                </form>
              )}
              {activeScheduleTab === "group" && tournament.players.length < 2 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  Add at least 2 players before creating matches.
                </p>
              ) : null}

              {activeScheduleTab === "knockout" &&
                (tournament.matches.filter((match) => !match.round.startsWith("Group ")).length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
                    No knockout matches created yet.
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b border-black/10 dark:border-white/10">
                        <tr>
                          <th className="px-2 py-2 font-medium">Round</th>
                          <th className="px-2 py-2 font-medium">Home</th>
                          <th className="px-2 py-2 font-medium">Away</th>
                          <th className="px-2 py-2 font-medium hidden sm:table-cell">Scheduled</th>
                          <th className="px-2 py-2 font-medium hidden sm:table-cell">Winner</th>
                          <th className="px-2 py-2 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tournament.matches
                          .filter((match) => !match.round.startsWith("Group "))
                          .map((match) => (
                          <tr key={match.id} className="border-b border-black/5 dark:border-white/10">
                            <td className="px-2 py-2">{match.round}</td>
                            <td className="px-2 py-2">{match.homePlayer.fullName}</td>
                            <td className="px-2 py-2">{match.awayPlayer.fullName}</td>
                            <td className="px-2 py-2 hidden sm:table-cell">
                              {match.scheduledAt ? match.scheduledAt.toLocaleString() : "-"}
                            </td>
                            <td className="px-2 py-2 hidden sm:table-cell">
                              {match.winnerId === match.homePlayerId
                                ? match.homePlayer.fullName
                                : match.winnerId === match.awayPlayerId
                                  ? match.awayPlayer.fullName
                                  : "-"}
                            </td>
                            <td className="px-2 py-2">
                              <form action={updateMatchResult} className="flex items-center gap-2">
                                <input type="hidden" name="matchId" value={match.id} />
                                <input type="hidden" name="tournamentId" value={tournament.id} />
                                <input type="hidden" name="homePlayerId" value={match.homePlayerId} />
                                <input type="hidden" name="awayPlayerId" value={match.awayPlayerId} />
                                <input
                                  name="scheduledAt"
                                  type="datetime-local"
                                  defaultValue={
                                    match.scheduledAt ? datetimeValue(match.scheduledAt) : ""
                                  }
                                  className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                                />
                                <input
                                  name="homeGames"
                                  type="number"
                                  min={0}
                                  defaultValue={match.homeGames ?? ""}
                                  className="w-16 rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                                />
                                <span>-</span>
                                <input
                                  name="awayGames"
                                  type="number"
                                  min={0}
                                  defaultValue={match.awayGames ?? ""}
                                  className="w-16 rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                                />
                                <button
                                  type="submit"
                                  className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                                >
                                  Save
                                </button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              {activeScheduleTab === "knockout" &&
                tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT && (
                  <div className="mt-6 rounded-md border border-black/10 p-4 dark:border-white/10">
                    <h3 className="text-sm font-medium">Qualification</h3>
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                      Applies your rules: top players per group plus optional best second/third
                      (ranked by best game difference).
                    </p>
                    <form action={qualifyPlayersForKnockout} className="mt-3">
                      <input type="hidden" name="tournamentId" value={tournament.id} />
                      <button
                        type="submit"
                        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                      >
                        Check and Qualify Players Now
                      </button>
                    </form>
                    <form action={generateKnockoutMatches} className="mt-3">
                      <input type="hidden" name="tournamentId" value={tournament.id} />
                      <button
                        type="submit"
                        className="w-full rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 sm:w-auto dark:border-white/20 dark:hover:bg-white/10"
                      >
                        Generate Knockout Matches
                      </button>
                    </form>
                    <form action={generateKnockoutFinal} className="mt-3">
                      <input type="hidden" name="tournamentId" value={tournament.id} />
                      <button
                        type="submit"
                        className="w-full rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 sm:w-auto dark:border-white/20 dark:hover:bg-white/10"
                      >
                        Generate Final from SF Winners
                      </button>
                    </form>
                    <div className="mt-3">
                      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                        Qualified Players
                      </p>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                        {tournament.players
                          .filter((player) => player.knockoutQualified)
                          .map((player) => player.fullName)
                          .join(", ") || "No players qualified yet."}
                      </p>
                    </div>
                  </div>
                )}

              {activeScheduleTab === "group" &&
                tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT && (
                <div className="mt-8">
                  <h3 className="text-base font-medium">Group Standings</h3>
                  {standingsByGroup.size === 0 ? (
                    <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                      No group assignments yet. Assign players to groups first.
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-4">
                      {[...standingsByGroup.entries()]
                        .sort(([a], [b]) => a - b)
                        .map(([groupNumber, rows]) => (
                          <div
                            key={groupNumber}
                            className="rounded-md border border-black/10 p-3 dark:border-white/10"
                          >
                            <p className="text-sm font-medium">Group {groupNumber}</p>
                            <div className="mt-2 overflow-x-auto">
                              <table className="w-full min-w-[560px] text-left text-xs">
                                <thead className="border-b border-black/10 dark:border-white/10">
                                  <tr>
                                    <th className="px-2 py-2">#</th>
                                    <th className="px-2 py-2">Player</th>
                                    <th className="px-2 py-2">P</th>
                                    <th className="px-2 py-2">W</th>
                                    <th className="px-2 py-2">L</th>
                                    <th className="px-2 py-2 hidden sm:table-cell">GW</th>
                                    <th className="px-2 py-2 hidden sm:table-cell">GL</th>
                                    <th className="px-2 py-2 hidden sm:table-cell">Diff</th>
                                    <th className="px-2 py-2 hidden sm:table-cell">Game Points</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row, index) => (
                                    <tr
                                      key={row.playerId}
                                      className="border-b border-black/5 dark:border-white/10"
                                    >
                                      <td className="px-2 py-2">{index + 1}</td>
                                      <td className="px-2 py-2">{row.playerName}</td>
                                      <td className="px-2 py-2">{row.played}</td>
                                      <td className="px-2 py-2">{row.wins}</td>
                                      <td className="px-2 py-2">{row.losses}</td>
                                      <td className="px-2 py-2 hidden sm:table-cell">{row.gamesWon}</td>
                                      <td className="px-2 py-2 hidden sm:table-cell">{row.gamesLost}</td>
                                      <td className="px-2 py-2 hidden sm:table-cell">{row.gamesWon - row.gamesLost}</td>
                                      <td className="px-2 py-2 hidden sm:table-cell">{row.gamePoints}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="mt-4">
                              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                                Group {groupNumber} Matches
                              </p>
                              {(groupMatchesByGroup.get(groupNumber) ?? []).length === 0 ? (
                                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                  No matches yet for this group.
                                </p>
                              ) : (
                                <div className="mt-2 overflow-x-auto">
                                  <table className="w-full min-w-[560px] text-left text-xs">
                                    <thead className="border-b border-black/10 dark:border-white/10">
                                      <tr>
                                        <th className="px-2 py-2 font-medium">Home</th>
                                        <th className="px-2 py-2 font-medium">Away</th>
                                        <th className="px-2 py-2 font-medium hidden sm:table-cell">Schedule</th>
                                        <th className="px-2 py-2 font-medium">Score</th>
                                        <th className="px-2 py-2 font-medium hidden sm:table-cell">Winner</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(groupMatchesByGroup.get(groupNumber) ?? []).map((match) => (
                                        <tr
                                          key={match.id}
                                          className="border-b border-black/5 dark:border-white/10"
                                        >
                                          <td className="px-2 py-2">{match.homePlayer.fullName}</td>
                                          <td className="px-2 py-2">{match.awayPlayer.fullName}</td>
                                          <td className="px-2 py-2 hidden sm:table-cell">
                                            <form
                                              action={updateMatchResult}
                                              className="flex items-center gap-2"
                                            >
                                              <input type="hidden" name="matchId" value={match.id} />
                                              <input
                                                type="hidden"
                                                name="tournamentId"
                                                value={tournament.id}
                                              />
                                              <input
                                                type="hidden"
                                                name="homePlayerId"
                                                value={match.homePlayerId}
                                              />
                                              <input
                                                type="hidden"
                                                name="awayPlayerId"
                                                value={match.awayPlayerId}
                                              />
                                              <input
                                                name="scheduledAt"
                                                type="datetime-local"
                                                defaultValue={
                                                  match.scheduledAt ? datetimeValue(match.scheduledAt) : ""
                                                }
                                                className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                                              />
                                              <input
                                                name="homeGames"
                                                type="number"
                                                min={0}
                                                defaultValue={match.homeGames ?? ""}
                                                className="w-14 rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                                              />
                                              <span>-</span>
                                              <input
                                                name="awayGames"
                                                type="number"
                                                min={0}
                                                defaultValue={match.awayGames ?? ""}
                                                className="w-14 rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                                              />
                                              <button
                                                type="submit"
                                                className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                                              >
                                                Save
                                              </button>
                                            </form>
                                          </td>
                                          <td className="px-2 py-2">
                                            {match.homeGames ?? "-"} - {match.awayGames ?? "-"}
                                          </td>
                                          <td className="px-2 py-2 hidden sm:table-cell">
                                            {match.winnerId === match.homePlayerId
                                              ? match.homePlayer.fullName
                                              : match.winnerId === match.awayPlayerId
                                                ? match.awayPlayer.fullName
                                                : "-"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === "rules" && (
            <>
              <h2 className="mt-6 text-lg font-medium">Tournament Rules</h2>
              {tournament.format !== TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  Round Robin rules apply only when tournament type is set to Round Robin + Knockout.
                </p>
              ) : (
                <form action={updateRoundRobinRules} className="mt-4 grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="id" value={tournament.id} />
                  <div className="sm:col-span-2">
                    <h3 className="text-base font-medium">Round Robin Qualification Rules</h3>
                  </div>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">Number of groups</span>
                    <input
                      name="groupCount"
                      type="number"
                      min={2}
                      defaultValue={tournament.groupCount ?? ""}
                      className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">Players per group</span>
                    <input
                      name="playersPerGroup"
                      type="number"
                      min={2}
                      defaultValue={tournament.playersPerGroup ?? ""}
                      className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      Qualified players per group
                    </span>
                    <input
                      name="qualifiedPerGroup"
                      type="number"
                      min={1}
                      defaultValue={tournament.qualifiedPerGroup ?? ""}
                      className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/20">
                    <input
                      type="checkbox"
                      name="qualifyBestSecond"
                      defaultChecked={tournament.qualifyBestSecond}
                    />
                    <span>Qualify best second-place players across all groups</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/20">
                    <input
                      type="checkbox"
                      name="qualifyBestThird"
                      defaultChecked={tournament.qualifyBestThird}
                    />
                    <span>Qualify best third-place players across all groups</span>
                  </label>
                  <div className="sm:col-span-2 mt-2">
                    <h3 className="text-base font-medium">Match Setup and Scoring</h3>
                  </div>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">Set option</span>
                    <select
                      name="matchSetupType"
                      defaultValue={tournament.matchSetupType}
                      className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                    >
                      <option value={MatchSetupType.NORMAL_SET}>Normal Set</option>
                      <option value={MatchSetupType.SHORT_SET_TO_4}>Short Set (1 set to 4)</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">Number of sets</span>
                    <input
                      name="numberOfSets"
                      type="number"
                      min={1}
                      max={5}
                      defaultValue={tournament.numberOfSets}
                      className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/20">
                    <input
                      type="checkbox"
                      name="standingsUseGamePoints"
                      defaultChecked={tournament.standingsUseGamePoints}
                    />
                    <span>Use game points for standings (player gets points equal to games won)</span>
                  </label>
                  <div className="sm:col-span-2 rounded-md border border-black/10 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-300">
                    Short Set rule: 1 set up to 4 games. At 4-4, a tie-break is played to decide
                    the winner.
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    >
                      Save Round Robin Rules
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
