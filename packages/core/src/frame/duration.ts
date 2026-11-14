// The time counter (M14): how long the trip took in reality, counting up as the vehicle
// drives. From the router's estimate, or from a text typed in the editor ("2 h 35 min").

/**
 * Seconds from a typed duration: "2 h 35 min", "2h35", "1:20 h", "45 min", "3 Std.". Undefined
 * when nothing in it reads as hours or minutes.
 */
export function parseDurationText(text: string): number | undefined {
  const clock = /(\d+)\s*:\s*(\d{1,2})/.exec(text);
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60;
  const hours = /(\d+(?:[.,]\d+)?)\s*(?:h|std|stunde)/i.exec(text);
  const minutes = /(\d+)\s*(?:min|m\b)/i.exec(text);
  // "2h35": minutes right after the hours, without a unit.
  const trailing = /\d\s*h\s*(\d{1,2})\s*$/i.exec(text);
  if (!hours && !minutes) return undefined;
  const h = hours ? Number(hours[1]!.replace(',', '.')) : 0;
  const m = minutes ? Number(minutes[1]) : trailing ? Number(trailing[1]) : 0;
  return Math.round(h * 3600 + m * 60);
}

/** "2:35 h" from an hour on, "35 min" below. */
export function formatTravelTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} h`;
}
