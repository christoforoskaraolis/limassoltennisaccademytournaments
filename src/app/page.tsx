import Link from "next/link";

import AutoRefresh from "@/app/components/AutoRefresh";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: [{ startsAt: "asc" }],
    select: {
      id: true,
      name: true,
      location: true,
      category: true,
      startsAt: true,
      endsAt: true,
    },
  });

  const now = new Date();
  const liveTournaments = tournaments.filter(
    (tournament) => tournament.startsAt <= now && tournament.endsAt >= now,
  );
  const upcomingTournaments = tournaments.filter((tournament) => tournament.startsAt > now);
  const completedTournaments = tournaments.filter((tournament) => tournament.endsAt < now);

  const renderTournamentList = (
    items: typeof tournaments,
    emptyMessage: string,
    badgeLabel: string,
  ) => {
    if (items.length === 0) {
      return <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{emptyMessage}</p>;
    }

    return (
      <div className="mt-4 grid gap-3">
        {items.map((tournament) => (
          <article
            key={tournament.id}
            className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold sm:text-base">{tournament.name}</h3>
              <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                {badgeLabel}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {tournament.category ?? "Open category"}
              {" • "}
              {tournament.location ?? "Location to be announced"}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {tournament.startsAt.toLocaleString()} - {tournament.endsAt.toLocaleString()}
            </p>
            <Link
              href={`/tournaments/${tournament.id}`}
              className="mt-3 block rounded-md border border-black/10 px-3 py-2 text-center text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10 sm:inline-block"
            >
              View details and results
            </Link>
          </article>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-3 py-6 text-zinc-900 dark:bg-black dark:text-zinc-100 sm:px-6 sm:py-12">
      <AutoRefresh enabled={liveTournaments.length > 0} />
      <main className="mx-auto w-full max-w-5xl">
        <header className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome to Tennis Academy Limassol Tournaments
          </h1>
        </header>

        <section className="mt-6 sm:mt-8">
          <h2 className="text-xl font-semibold">Live Tournaments</h2>
          {renderTournamentList(liveTournaments, "No Tournament is live right now.", "Live")}
        </section>

        <section className="mt-8 sm:mt-10">
          <h2 className="text-xl font-semibold">Upcoming Tournaments</h2>
          {renderTournamentList(upcomingTournaments, "No upcoming Tournaments yet.", "Upcoming")}
        </section>

        <section className="mt-8 pb-6 sm:mt-10 sm:pb-8">
          <h2 className="text-xl font-semibold">Completed Tournaments</h2>
          {renderTournamentList(completedTournaments, "No completed Tournaments yet.", "Completed")}
        </section>
      </main>
    </div>
  );
}
