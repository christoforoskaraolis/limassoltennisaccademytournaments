import { EventType } from "@prisma/client";

export type EntryNamePlayer = {
  fullName: string;
  partnerName?: string | null;
};

export function formatEntryName(player: EntryNamePlayer, eventType: EventType): string {
  if (eventType === EventType.DOUBLES && player.partnerName) {
    return `${player.fullName} / ${player.partnerName}`;
  }

  return player.fullName;
}

export function formatEntryVersus(
  home: EntryNamePlayer,
  away: EntryNamePlayer,
  eventType: EventType,
): string {
  return `${formatEntryName(home, eventType)} vs ${formatEntryName(away, eventType)}`;
}

export function eventTypeLabel(eventType: EventType): string {
  return eventType === EventType.DOUBLES ? "Doubles" : "Singles";
}

export function entriesLabel(eventType: EventType, capitalize = true): string {
  const label = eventType === EventType.DOUBLES ? "pairs" : "players";
  return capitalize ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

export function parseEventType(raw: string): EventType {
  return raw === EventType.DOUBLES ? EventType.DOUBLES : EventType.SINGLES;
}
