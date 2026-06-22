import Link from "next/link";
import { notFound } from "next/navigation";
import { TournamentFormat } from "@prisma/client";

import AutoRefresh from "@/app/components/AutoRefresh";
import { formatMatchScheduleDisplay } from "@/lib/match-schedule";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ phase?: string }>;
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

function formatKnockoutRound(round: string) {
  const withoutPrefix = round.replace(/^Knockout\s+/i, "").trim();
  if (/^final$/i.test(withoutPrefix)) return "FINAL";
  if (/^sf\d*$/i.test(withoutPrefix)) return withoutPrefix.toUpperCase();
  return withoutPrefix;
}

function formatTournamentDateRange(startsAt: Date, endsAt: Date) {
  const toDayMonthYear = (value: Date) => {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = value.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const startDate = toDayMonthYear(startsAt);
  const endDate = toDayMonthYear(endsAt);
  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
}

export default async function TournamentPublicPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activePhase = resolvedSearchParams?.phase === "knockout" ? "knockout" : "group";

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
    const groupPlayers = playersByGroup.get(player.groupNumber) ?? [];
    groupPlayers.push(player);
    playersByGroup.set(player.groupNumber, groupPlayers);
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

    const groupPlayerIds = new Set(groupPlayers.map((player) => player.id));
    const groupMatches = tournament.matches.filter(
      (match) =>
        groupPlayerIds.has(match.homePlayerId) &&
        groupPlayerIds.has(match.awayPlayerId) &&
        match.round === `Group ${groupNumber}`,
    );
    groupMatchesByGroup.set(groupNumber, groupMatches);
  }

  const now = new Date();
  const tournamentStatus =
    now < tournament.startsAt ? "Upcoming" : now > tournament.endsAt ? "Completed" : "Live";
  const knockoutMatches = tournament.matches
    .filter((match) => !match.round.startsWith("Group "))
    .sort((a, b) => {
      const aIsFinal = a.round.toLowerCase().includes("final");
      const bIsFinal = b.round.toLowerCase().includes("final");
      if (aIsFinal && !bIsFinal) return 1;
      if (!aIsFinal && bIsFinal) return -1;
      return 0;
    });

  return (
    <div className="min-h-screen bg-zinc-50 px-3 py-6 text-zinc-900 dark:bg-black dark:text-zinc-100 sm:px-6 sm:py-12">
      <AutoRefresh enabled={tournamentStatus === "Live"} />
      <main className="mx-auto w-full max-w-6xl">
        <header className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tournament.name}</h1>
              <p className="mt-2 text-sm font-bold text-zinc-800 dark:text-zinc-100 sm:text-base">
                {tournament.category ?? "Open category"}
                {" • "}
                {formatTournamentDateRange(tournament.startsAt, tournament.endsAt)}
              </p>
            </div>
            <div className="sm:text-right">
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                {tournamentStatus}
              </span>
              <p className="mt-3">
                <Link
                  href="/"
                  className="inline-block rounded-md border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Back to all tournaments
                </Link>
              </p>
            </div>
          </div>
        </header>

        <section className="mt-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950 sm:mt-8 sm:p-6">
          <div className="grid grid-cols-2 gap-2 border-b border-black/10 pb-4 dark:border-white/10 sm:flex sm:flex-wrap">
            <Link
              href={`/tournaments/${tournament.id}?phase=group`}
              className={`rounded-md px-3 py-2 text-center text-sm ${
                activePhase === "group"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              Group Phase
            </Link>
            <Link
              href={`/tournaments/${tournament.id}?phase=knockout`}
              className={`rounded-md px-3 py-2 text-center text-sm ${
                activePhase === "knockout"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              Knockout Phase
            </Link>
          </div>

          {activePhase === "group" && (
            <>
              <h2 className="mt-6 text-lg font-medium">Group standings</h2>
              {tournament.format !== TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  Group Phase is not used for this Tournament format.
                </p>
              ) : standingsByGroup.size === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  Standings will appear once players are assigned to groups.
                </p>
              ) : (
                <div className="mt-4 grid gap-4">
                  {[...standingsByGroup.entries()]
                    .sort(([a], [b]) => a - b)
                    .map(([groupNumber, rows]) => (
                      <div
                        key={groupNumber}
                        className="rounded-xl border border-black/10 bg-gradient-to-br from-white to-zinc-50 p-3 shadow-sm dark:border-white/10 dark:from-zinc-950 dark:to-zinc-900 sm:p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold sm:text-base">Group {groupNumber}</p>
                          <span className="rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                            Standings
                          </span>
                        </div>

                        <div className="mt-3 space-y-2 sm:hidden">
                          {rows.map((row, index) => (
                            <article
                              key={`${row.playerId}-mobile-standing`}
                              className="rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-950"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold">{row.playerName}</p>
                                <span className="rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                                  #{index + 1}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
                                <p><span className="text-zinc-500 dark:text-zinc-400">P</span> {row.played}</p>
                                <p><span className="text-zinc-500 dark:text-zinc-400">W</span> {row.wins}</p>
                                <p><span className="text-zinc-500 dark:text-zinc-400">L</span> {row.losses}</p>
                                <p><span className="text-zinc-500 dark:text-zinc-400">GW</span> {row.gamesWon}</p>
                                <p><span className="text-zinc-500 dark:text-zinc-400">GL</span> {row.gamesLost}</p>
                                <p>
                                  <span className="text-zinc-500 dark:text-zinc-400">Diff</span>{" "}
                                  {row.gamesWon - row.gamesLost}
                                </p>
                                {tournament.standingsUseGamePoints && (
                                  <p className="col-span-2">
                                    <span className="text-zinc-500 dark:text-zinc-400">Game Points</span>{" "}
                                    {row.gamePoints}
                                  </p>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>

                        <div className="mt-2 hidden overflow-x-auto sm:block">
                          <table className="w-full min-w-[700px] text-left text-xs">
                            <thead className="border-b border-black/10 dark:border-white/10">
                              <tr>
                                <th className="px-2 py-2">#</th>
                                <th className="px-2 py-2">Player</th>
                                <th className="px-2 py-2">P</th>
                                <th className="px-2 py-2">W</th>
                                <th className="px-2 py-2">L</th>
                                <th className="px-2 py-2">GW</th>
                                <th className="px-2 py-2">GL</th>
                                <th className="px-2 py-2">Diff</th>
                                {tournament.standingsUseGamePoints && (
                                  <th className="px-2 py-2">Game Points</th>
                                )}
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
                                  <td className="px-2 py-2">{row.gamesWon}</td>
                                  <td className="px-2 py-2">{row.gamesLost}</td>
                                  <td className="px-2 py-2">{row.gamesWon - row.gamesLost}</td>
                                  {tournament.standingsUseGamePoints && (
                                    <td className="px-2 py-2">{row.gamePoints}</td>
                                  )}
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
                            <>
                              <div className="mt-2 space-y-2 sm:hidden">
                                {(groupMatchesByGroup.get(groupNumber) ?? []).map((match) => (
                                  <article
                                    key={`${match.id}-mobile-match`}
                                    className="rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-950"
                                  >
                                    <p className="text-xs font-semibold">
                                      {match.homePlayer.fullName} vs {match.awayPlayer.fullName}
                                    </p>
                                    <p className="mt-2 text-sm font-semibold">
                                      Score: {match.homeGames ?? "-"} - {match.awayGames ?? "-"}
                                    </p>
                                    <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                                      Schedule:{" "}
                                      {formatMatchScheduleDisplay(match.scheduledAt, match.court)}
                                    </p>
                                    <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                                      Winner:{" "}
                                      {match.winnerId === match.homePlayerId
                                        ? match.homePlayer.fullName
                                        : match.winnerId === match.awayPlayerId
                                          ? match.awayPlayer.fullName
                                          : "-"}
                                    </p>
                                  </article>
                                ))}
                              </div>

                              <div className="mt-2 hidden overflow-x-auto sm:block">
                                <table className="w-full min-w-[700px] text-left text-xs">
                                <thead className="border-b border-black/10 dark:border-white/10">
                                  <tr>
                                    <th className="px-2 py-2 font-medium">Home</th>
                                    <th className="px-2 py-2 font-medium">Away</th>
                                    <th className="px-2 py-2 font-medium">Schedule</th>
                                    <th className="px-2 py-2 font-medium">Score</th>
                                    <th className="px-2 py-2 font-medium">Winner</th>
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
                                      <td className="px-2 py-2">
                                        {formatMatchScheduleDisplay(match.scheduledAt, match.court)}
                                      </td>
                                      <td className="px-2 py-2">
                                        {match.homeGames ?? "-"} - {match.awayGames ?? "-"}
                                      </td>
                                      <td className="px-2 py-2">
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
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}

          {activePhase === "knockout" && (
            <>
              <h2 className="mt-6 text-lg font-medium">Knockout matches</h2>
              {knockoutMatches.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  No Knockout matches available yet.
                </p>
              ) : (
                <>
                  <div className="mt-4 space-y-3 sm:hidden">
                    {knockoutMatches.map((match) => (
                      <article
                        key={`${match.id}-mobile-knockout`}
                        className="rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-950"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">{formatKnockoutRound(match.round)}</p>
                          <span className="rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                            Knockout
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold">
                          {match.homePlayer.fullName} vs {match.awayPlayer.fullName}
                        </p>
                        <p className="mt-2 text-sm font-semibold">
                          Score: {match.homeGames ?? "-"} - {match.awayGames ?? "-"}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                          Schedule: {formatMatchScheduleDisplay(match.scheduledAt, match.court)}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                          Winner:{" "}
                          {match.winnerId === match.homePlayerId
                            ? match.homePlayer.fullName
                            : match.winnerId === match.awayPlayerId
                              ? match.awayPlayer.fullName
                              : "-"}
                        </p>
                      </article>
                    ))}
                  </div>

                  <div className="mt-4 hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead className="border-b border-black/10 dark:border-white/10">
                        <tr>
                          <th className="px-2 py-2 font-medium">Round</th>
                          <th className="px-2 py-2 font-medium">Home</th>
                          <th className="px-2 py-2 font-medium">Away</th>
                          <th className="px-2 py-2 font-medium">Schedule</th>
                          <th className="px-2 py-2 font-medium">Score</th>
                          <th className="px-2 py-2 font-medium">Winner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {knockoutMatches.map((match) => (
                          <tr key={match.id} className="border-b border-black/5 dark:border-white/10">
                            <td className="px-2 py-2">{formatKnockoutRound(match.round)}</td>
                            <td className="px-2 py-2">{match.homePlayer.fullName}</td>
                            <td className="px-2 py-2">{match.awayPlayer.fullName}</td>
                            <td className="px-2 py-2">
                              {formatMatchScheduleDisplay(match.scheduledAt, match.court)}
                            </td>
                            <td className="px-2 py-2">
                              {match.homeGames ?? "-"} - {match.awayGames ?? "-"}
                            </td>
                            <td className="px-2 py-2">
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
                </>
              )}
            </>
          )}
        </section>

      </main>
    </div>
  );
}
