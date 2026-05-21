"use client";

type DeletePlayerButtonProps = {
  playerId: string;
  tournamentId: string;
  deletePlayer: (formData: FormData) => Promise<void>;
};

export default function DeletePlayerButton({
  playerId,
  tournamentId,
  deletePlayer,
}: DeletePlayerButtonProps) {
  return (
    <form
      action={deletePlayer}
      onSubmit={(event) => {
        if (!confirm("Delete this player and their matches?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="playerId" value={playerId} />
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
