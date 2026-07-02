"use client";

import { MatchSetupType } from "@prisma/client";
import { useEffect, useState } from "react";

import { getMatchSetupRulesDescription } from "@/lib/match-setup";

type MatchSetupFieldsProps = {
  initialMatchSetupType: MatchSetupType;
  initialNumberOfSets: number;
};

export default function MatchSetupFields({
  initialMatchSetupType,
  initialNumberOfSets,
}: MatchSetupFieldsProps) {
  const [matchSetupType, setMatchSetupType] = useState(initialMatchSetupType);
  const [numberOfSets, setNumberOfSets] = useState(initialNumberOfSets);
  const isBestOfThree = matchSetupType === MatchSetupType.BEST_OF_3_SUPER_TIEBREAK;

  useEffect(() => {
    if (isBestOfThree) {
      setNumberOfSets(3);
    }
  }, [isBestOfThree]);

  return (
    <>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Set option</span>
        <select
          name="matchSetupType"
          value={matchSetupType}
          onChange={(event) => setMatchSetupType(event.target.value as MatchSetupType)}
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 dark:border-white/20"
        >
          <option value={MatchSetupType.NORMAL_SET}>Normal Set</option>
          <option value={MatchSetupType.SHORT_SET_TO_4}>Short Set (1 set to 4)</option>
          <option value={MatchSetupType.BEST_OF_3_SUPER_TIEBREAK}>
            Best of 3 sets (super tie-break at 1-1)
          </option>
        </select>
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Number of sets</span>
        <input
          name="numberOfSets"
          type="number"
          min={1}
          max={5}
          value={numberOfSets}
          readOnly={isBestOfThree}
          onChange={(event) => setNumberOfSets(Number.parseInt(event.target.value, 10) || 1)}
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/20"
        />
      </label>
      <div className="sm:col-span-2 rounded-md border border-black/10 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-300">
        {getMatchSetupRulesDescription(matchSetupType)}
      </div>
    </>
  );
}
