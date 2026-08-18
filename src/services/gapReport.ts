import { DateTime } from "luxon";
import type { JibbleClient } from "../api/jibble.js";
import { listPersonHolidayDates } from "../api/holidays.js";
import { listTimeEntries } from "../api/timeEntries.js";
import { buildDayAnalyses, type DayAnalysis } from "./attendanceAnalyzer.js";
import { businessDaysBetween, todayISO, ZONE } from "./timezone.js";

const EARLIEST_LOOKBACK_YEARS = 5;

export interface GapReport {
  firstFilledDate: string;
  endDate: string;
  businessDayCount: number;
  gaps: DayAnalysis[];
}

/**
 * Busca la fecha del fichaje más antiguo registrado (hasta
 * EARLIEST_LOOKBACK_YEARS años atrás) y audita cada día laborable no festivo
 * desde ahí hasta hoy, devolviendo cualquiera que no esté completo.
 * ponytail: tope de 5 años fijo; subirlo si algún día hace falta más histórico.
 */
export async function buildGapReport(client: JibbleClient, personId: string): Promise<GapReport> {
  const endDate = todayISO();
  const wideStart = DateTime.now().setZone(ZONE).minus({ years: EARLIEST_LOOKBACK_YEARS }).toISODate()!;

  const entries = await listTimeEntries(client, personId, wideStart, endDate);
  if (!entries.length) {
    throw new Error(
      `No se encontró ningún fichaje en los últimos ${EARLIEST_LOOKBACK_YEARS} años; no hay una "primera fecha rellenada" desde la que auditar.`,
    );
  }

  const firstFilledDate = entries.reduce(
    (min, entry) => (entry.belongsToDate < min ? entry.belongsToDate : min),
    entries[0]!.belongsToDate,
  );

  const holidays = await listPersonHolidayDates(client, personId);
  const businessDays = businessDaysBetween(firstFilledDate, endDate).filter((d) => !holidays.has(d));

  const analyses = buildDayAnalyses(businessDays, entries);
  const gaps = analyses.filter((a) => a.classification !== "complete");

  return { firstFilledDate, endDate, businessDayCount: businessDays.length, gaps };
}
