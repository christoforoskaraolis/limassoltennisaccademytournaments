"use client";

import { useEffect, useState } from "react";

import DeletePlayerButton from "@/app/components/DeletePlayerButton";

type PlayerEditRowProps = {
  playerId: string;
  tournamentId: string;
  initialFullName: string;
  initialGroupNumber: number | null;
  groupCount: number | null;
  showGroup: boolean;
  updatePlayer: (formData: FormData) => Promise<void>;
  deletePlayer: (formData: FormData) => Promise<void>;
};

export default function PlayerEditRow({
  playerId,
  tournamentId,
  initialFullName,
  initialGroupNumber,
  groupCount,
  showGroup,
  updatePlayer,
  deletePlayer,
}: PlayerEditRowProps) {
  const [fullName, setFullName] = useState(initialFullName);
  const [groupNumber, setGroupNumber] = useState(
    initialGroupNumber ? String(initialGroupNumber) : "",
  );

  useEffect(() => {
    setFullName(initialFullName);
    setGroupNumber(initialGroupNumber ? String(initialGroupNumber) : "");
  }, [initialFullName, initialGroupNumber]);

  return (
    <>
      <td className="px-2 py-2">
        <input
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
          className="w-full min-w-[140px] rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
        />
      </td>
      {showGroup && (
        <td className="px-2 py-2">
          <select
            value={groupNumber}
            onChange={(event) => setGroupNumber(event.target.value)}
            className="w-full rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
          >
            <option value="">Unassigned</option>
            {Array.from({ length: groupCount ?? 0 }, (_, index) => (
              <option key={index + 1} value={String(index + 1)}>
                Group {index + 1}
              </option>
            ))}
          </select>
        </td>
      )}
      <td className="px-2 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <form action={updatePlayer}>
            <input type="hidden" name="playerId" value={playerId} />
            <input type="hidden" name="tournamentId" value={tournamentId} />
            <input type="hidden" name="fullName" value={fullName} />
            {showGroup && <input type="hidden" name="groupNumber" value={groupNumber} />}
            <button
              type="submit"
              className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Save
            </button>
          </form>
          <DeletePlayerButton
            playerId={playerId}
            tournamentId={tournamentId}
            deletePlayer={deletePlayer}
          />
        </div>
      </td>
    </>
  );
}
