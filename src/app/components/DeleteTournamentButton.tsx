"use client";

type DeleteTournamentButtonProps = {
  tournamentId: string;
  tournamentName: string;
  deleteTournament: (formData: FormData) => Promise<void>;
};

export default function DeleteTournamentButton({
  tournamentId,
  tournamentName,
  deleteTournament,
}: DeleteTournamentButtonProps) {
  return (
    <form
      action={deleteTournament}
      onSubmit={(event) => {
        if (
          !confirm(
            `Delete upcoming tournament "${tournamentName}"? This removes all players and matches.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
      >
        Delete
      </button>
    </form>
  );
}
