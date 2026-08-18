import type { JibbleClient } from "../api/jibble.js";
import { log } from "../api/jibble.js";
import { createPunch, listTimeEntries } from "../api/timeEntries.js";
import { analyzeDay, type DayAnalysis } from "./attendanceAnalyzer.js";
import { localDateTime, nowInZone, ZONE } from "./timezone.js";

export interface FillResult {
  date: string;
  createdCount: number;
  skippedFuture: number;
}

function formatHm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** CREATE_DELAY_MS (ver .env.example): pausa entre cada creación para evitar 429. */
function getCreateDelayMs(): number {
  const raw = process.env.CREATE_DELAY_MS;
  if (!raw) return 0;
  const ms = Number(raw);
  return Number.isFinite(ms) && ms >= 0 ? ms : 0;
}

/**
 * Rellena un único día y verifica el resultado releyendo el día en Jibble.
 * Si tras crear los registros siguen faltando más de los esperados,
 * asumimos que el campo de hora histórica no fue respetado por la API y
 * abortamos todo el proceso en vez de seguir creando registros potencialmente
 * incorrectos.
 */
export async function fillDay(
  client: JibbleClient,
  personId: string,
  day: DayAnalysis,
  dryRun: boolean,
): Promise<FillResult> {
  const now = nowInZone();
  const duePunches = day.missing.filter((p) => localDateTime(p.date, p.hour, p.minute) <= now);
  const skippedFuture = day.missing.length - duePunches.length;

  if (duePunches.length === 0) {
    return { date: day.date, createdCount: 0, skippedFuture };
  }

  if (dryRun) {
    return { date: day.date, createdCount: duePunches.length, skippedFuture };
  }

  const ordered = [...duePunches].sort((a, b) => a.slotIndex - b.slotIndex);
  const delayMs = getCreateDelayMs();
  for (const punch of ordered) {
    const local = localDateTime(punch.date, punch.hour, punch.minute);
    await createPunch(client, {
      personId,
      type: punch.type,
      time: local.toUTC().toISO()!,
      belongsToDate: punch.date,
    });
    log("info", `Creado ${punch.type} ${punch.date} ${formatHm(punch.hour, punch.minute)} (${ZONE}).`);
    if (delayMs > 0) await sleep(delayMs);
  }

  const freshEntries = await listTimeEntries(client, personId, day.date, day.date);
  const reanalyzed = analyzeDay(day.date, freshEntries);
  const expectedRemainingMissing = day.missing.length - duePunches.length;

  if (reanalyzed.classification === "irregular" || reanalyzed.missing.length > expectedRemainingMissing) {
    throw new Error(
      `Verificación fallida para ${day.date}: tras crear los registros, Jibble no refleja las horas esperadas. ` +
        `Es posible que el campo histórico 'time'/'belongsToDate' no se haya respetado. ` +
        `Proceso detenido — revisa manualmente ${day.date} en Jibble antes de reintentar.`,
    );
  }

  return { date: day.date, createdCount: duePunches.length, skippedFuture };
}
