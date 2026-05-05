import Link from "next/link";
import { revalidatePath } from "next/cache";

import { TournamentFormat } from "@prisma/client";
import { prisma } from "@/lib/prisma";

async function createTournament(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const organizer = String(formData.get("organizer") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const maxPlayersRaw = String(formData.get("maxPlayers") ?? "").trim();
  const formatRaw = String(formData.get("format") ?? TournamentFormat.KNOCKOUT);
  const location = String(formData.get("location") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const endsAtRaw = String(formData.get("endsAt") ?? "");

  if (!name || !startsAtRaw || !endsAtRaw) {
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

  await prisma.tournament.create({
    data: {
      name,
      organizer: organizer || null,
      category: category || null,
      maxPlayers,
      format,
      location: location || null,
      startsAt,
      endsAt,
    },
  });

  revalidatePath("/admin");
}

export default async function AdminPage() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: { startsAt: "desc" },
  });
  const now = new Date();
  const runningTournaments = tournaments.filter(
    (tournament) => tournament.startsAt <= now && tournament.endsAt >= now,
  );
  const upcomingTournaments = tournaments.filter((tournament) => tournament.startsAt > now);
  const completedTournaments = tournaments.filter((tournament) => tournament.endsAt < now);

  const renderTournamentTable = (
    items: typeof tournaments,
    emptyMessage: string,
  ) => {
    if (items.length === 0) {
      return <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{emptyMessage}</p>;
    }

    return (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/10">
            <tr>
              <th className="px-2 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">Type</th>
              <th className="px-2 py-2 font-medium">Category</th>
              <th className="px-2 py-2 font-medium">Players</th>
              <th className="px-2 py-2 font-medium">Group Setup</th>
              <th className="px-2 py-2 font-medium">Qualify/Group</th>
              <th className="px-2 py-2 font-medium">Location</th>
              <th className="px-2 py-2 font-medium">Start</th>
              <th className="px-2 py-2 font-medium">End</th>
              <th className="px-2 py-2 font-medium">Control</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tournament) => (
              <tr
                key={tournament.id}
                className="border-b border-black/5 dark:border-white/10"
              >
                <td className="px-2 py-2">{tournament.name}</td>
                <td className="px-2 py-2">
                  {tournament.format === TournamentFormat.KNOCKOUT
                    ? "Knockout"
                    : "Round Robin + Knockout"}
                </td>
                <td className="px-2 py-2">{tournament.category ?? "-"}</td>
                <td className="px-2 py-2">{tournament.maxPlayers ?? "-"}</td>
                <td className="px-2 py-2">
                  {tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT
                    ? `${tournament.groupCount ?? "-"} x ${tournament.playersPerGroup ?? "-"}`
                    : "-"}
                </td>
                <td className="px-2 py-2">
                  {tournament.format === TournamentFormat.ROUND_ROBIN_AND_KNOCKOUT
                    ? tournament.qualifiedPerGroup ?? "-"
                    : "-"}
                </td>
                <td className="px-2 py-2">{tournament.location ?? "-"}</td>
                <td className="px-2 py-2">{tournament.startsAt.toLocaleString()}</td>
                <td className="px-2 py-2">{tournament.endsAt.toLocaleString()}</td>
                <td className="px-2 py-2">
                  <Link
                    href={`/admin/tournaments/${tournament.id}`}
                    className="rounded-md border border-black/10 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <main className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Tournament Admin</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Create and manage tennis tournaments.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-md border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Back to Home
          </Link>
        </div>

        <section className="rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Create tournament</h2>
          <form action={createTournament} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Tournament name</span>
              <input
                name="name"
                required
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                placeholder="Cyprus Open"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Location</span>
              <input
                name="location"
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                placeholder="Nicosia"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Organizer</span>
              <input
                name="organizer"
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                placeholder="Cyprus Tennis Federation"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Category</span>
              <input
                name="category"
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                placeholder="Men Singles"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Number of players</span>
              <input
                name="maxPlayers"
                type="number"
                min={2}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
                placeholder="16"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Tournament type</span>
              <select
                name="format"
                defaultValue={TournamentFormat.KNOCKOUT}
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
                required
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Ends at</span>
              <input
                type="datetime-local"
                name="endsAt"
                required
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Create Tournament
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Running tournaments</h2>
          {renderTournamentTable(runningTournaments, "No tournaments are currently running.")}
        </section>

        <section className="mt-8 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Upcoming tournaments</h2>
          {renderTournamentTable(upcomingTournaments, "No upcoming tournaments yet.")}
        </section>

        <section className="mt-8 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Completed tournaments</h2>
          {renderTournamentTable(completedTournaments, "No tournaments have completed yet.")}
        </section>
      </main>
    </div>
  );
}
