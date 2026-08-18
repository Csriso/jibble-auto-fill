import "dotenv/config";
import { DateTime } from "luxon";

export const ZONE = process.env.TIMEZONE || "Europe/Madrid";

export function nowInZone(): DateTime {
  return DateTime.now().setZone(ZONE);
}

export function todayISO(): string {
  return nowInZone().toISODate()!;
}

/** Luxon resuelve el offset correcto en cada fecha, así que los cambios de DST se manejan solos. */
export function localDateTime(dateISO: string, hour: number, minute = 0): DateTime {
  return DateTime.fromISO(dateISO, { zone: ZONE }).set({ hour, minute, second: 0, millisecond: 0 });
}

export function businessDaysBetween(startISO: string, endISO: string): string[] {
  const start = DateTime.fromISO(startISO, { zone: ZONE });
  const end = DateTime.fromISO(endISO, { zone: ZONE });
  const days: string[] = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    if (d.weekday <= 5) days.push(d.toISODate()!);
  }
  return days;
}
