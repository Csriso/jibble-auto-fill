import "dotenv/config";
import { DateTime } from "luxon";
import { getCurrentPersonId } from "./api/auth.js";
import { listPersonHolidayDates } from "./api/holidays.js";
import { createJibbleClient, log, type JibbleClient } from "./api/jibble.js";
import { listTimeEntries } from "./api/timeEntries.js";
import { analyzeDay } from "./services/attendanceAnalyzer.js";
import { businessDaysBetween, todayISO, ZONE } from "./services/timezone.js";

const START_DATE_LOOKBACK_DAYS = 180;

export interface RunContext {
  client: JibbleClient;
  personId: string;
  startDate: string;
  endDate: string;
  businessDays: string[];
}

/**
 * Busca hacia atrás desde endDate el último día laborable completo; el día
 * siguiente es el inicio del rango a rellenar. Tope de 180 días para no
 * escanear todo el histórico. ponytail: si algún día hace falta más, hacerlo configurable.
 */
async function detectFirstMissingDate(
  client: JibbleClient,
  personId: string,
  endDate: string,
  holidays: Set<string>,
): Promise<string> {
  const earliest = DateTime.fromISO(endDate, { zone: ZONE }).minus({ days: START_DATE_LOOKBACK_DAYS }).toISODate()!;
  const entries = await listTimeEntries(client, personId, earliest, endDate);

  const byDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byDate.get(entry.belongsToDate) ?? [];
    list.push(entry);
    byDate.set(entry.belongsToDate, list);
  }

  const days = businessDaysBetween(earliest, endDate).filter((d) => !holidays.has(d));
  for (let i = days.length - 1; i >= 0; i--) {
    const date = days[i]!;
    const analysis = analyzeDay(date, byDate.get(date) ?? []);
    if (analysis.classification === "complete") {
      return days[i + 1] ?? endDate;
    }
  }

  log("warn", `No se encontró ningún día laborable completo en los últimos ${START_DATE_LOOKBACK_DAYS} días; usando ${earliest} como inicio.`);
  return earliest;
}

export async function buildContext(): Promise<RunContext> {
  const client = createJibbleClient();
  const personId = await getCurrentPersonId();
  const holidays = await listPersonHolidayDates(client, personId);

  const endDate = process.env.END_DATE || todayISO();
  if (endDate > todayISO()) {
    throw new Error("END_DATE no puede ser una fecha futura.");
  }

  const startDate = process.env.START_DATE || (await detectFirstMissingDate(client, personId, endDate, holidays));
  if (startDate > endDate) {
    throw new Error(`START_DATE (${startDate}) es posterior a END_DATE (${endDate}).`);
  }

  const allBusinessDays = businessDaysBetween(startDate, endDate);
  const businessDays = allBusinessDays.filter((d) => !holidays.has(d));
  const skippedHolidays = allBusinessDays.length - businessDays.length;
  if (skippedHolidays > 0) {
    log("info", `${skippedHolidays} festivo(s) excluido(s) del rango ${startDate} → ${endDate} (calendario de Jibble).`);
  }

  return { client, personId, startDate, endDate, businessDays };
}
