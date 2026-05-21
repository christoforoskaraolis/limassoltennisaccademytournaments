"use client";

import { formatMatchTime } from "@/lib/match-schedule";

type MatchResultFormProps = {
  matchId: string;
  tournamentId: string;
  homePlayerId: string;
  awayPlayerId: string;
  initialScheduledAt: Date | null;
  initialCourt: number | null;
  initialHomeGames: number | null;
  initialAwayGames: number | null;
  updateMatchResult: (formData: FormData) => Promise<void>;
  compact?: boolean;
};

export default function MatchResultForm({
  matchId,
  tournamentId,
  homePlayerId,
  awayPlayerId,
  initialScheduledAt,
  initialCourt,
  initialHomeGames,
  initialAwayGames,
  updateMatchResult,
  compact = false,
}: MatchResultFormProps) {
  return (
    <form
      action={updateMatchResult}
      className={`flex flex-wrap items-center gap-2 ${compact ? "" : ""}`}
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="homePlayerId" value={homePlayerId} />
      <input type="hidden" name="awayPlayerId" value={awayPlayerId} />
      <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
        <span className="sr-only">Time</span>
        <input
          name="scheduledTime"
          type="time"
          defaultValue={formatMatchTime(initialScheduledAt)}
          className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
        <span className="sr-only">Court</span>
        <select
          name="court"
          defaultValue={initialCourt ? String(initialCourt) : ""}
          className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
        >
          <option value="">Court</option>
          <option value="1">Court 1</option>
          <option value="2">Court 2</option>
          <option value="3">Court 3</option>
        </select>
      </label>
      <input
        name="homeGames"
        type="number"
        min={0}
        placeholder="H"
        defaultValue={initialHomeGames ?? ""}
        className={`rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20 ${compact ? "w-14" : "w-16"}`}
      />
      <span className="text-xs">-</span>
      <input
        name="awayGames"
        type="number"
        min={0}
        placeholder="A"
        defaultValue={initialAwayGames ?? ""}
        className={`rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20 ${compact ? "w-14" : "w-16"}`}
      />
      <button
        type="submit"
        className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        Save
      </button>
    </form>
  );
}
