export function formatMatchTime(date: Date | null): string {
  if (!date) {
    return "";
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatMatchScheduleDisplay(
  scheduledAt: Date | null,
  court: number | null,
): string {
  const parts: string[] = [];

  if (scheduledAt) {
    parts.push(formatMatchTime(scheduledAt));
  }

  if (court) {
    parts.push(`Court ${court}`);
  }

  return parts.length > 0 ? parts.join(" • ") : "-";
}

export function buildScheduledAt(tournamentStartDate: Date, timeRaw: string): Date | null {
  if (!timeRaw) {
    return null;
  }

  const [hours, minutes] = timeRaw.split(":").map((value) => Number.parseInt(value, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  const scheduledAt = new Date(tournamentStartDate);
  scheduledAt.setHours(hours, minutes, 0, 0);
  return scheduledAt;
}

export function parseCourt(courtRaw: string): number | null {
  if (!courtRaw) {
    return null;
  }

  const court = Number.parseInt(courtRaw, 10);
  if (Number.isNaN(court) || court < 1 || court > 3) {
    return null;
  }

  return court;
}
