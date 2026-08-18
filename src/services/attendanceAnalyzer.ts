import { DateTime } from "luxon";
import type { RawTimeEntry } from "../api/timeEntries.js";
import { PUNCH_SCHEDULE, SLOT_TOLERANCE_MINUTES } from "./schedule.js";
import { ZONE } from "./timezone.js";

export type { RawTimeEntry };

export type DayClassification = "complete" | "incomplete" | "missing" | "irregular";

export interface MissingPunch {
  date: string;
  slotIndex: number;
  type: "In" | "Out";
  hour: number;
  minute: number;
}

export interface DayAnalysis {
  date: string;
  classification: DayClassification;
  existing: RawTimeEntry[];
  missing: MissingPunch[];
  note?: string;
}

function minutesSinceMidnightLocal(entry: RawTimeEntry): number {
  const dt = DateTime.fromISO(entry.localTime, { setZone: true }).setZone(ZONE);
  return dt.hour * 60 + dt.minute;
}

/**
 * Empareja cada registro existente con el slot estándar más cercano del mismo
 * tipo (In/Out) dentro de una tolerancia. Si algún registro no encaja en
 * ningún slot, el día se marca "irregular" y no se toca (revisión manual):
 * evita interpretar una marcación atípica como si fuera la comida o la salida.
 */
export function analyzeDay(date: string, entries: RawTimeEntry[]): DayAnalysis {
  const claimed = new Array(PUNCH_SCHEDULE.length).fill(false);
  const unassigned: RawTimeEntry[] = [];

  for (const entry of entries) {
    const entryMinutes = minutesSinceMidnightLocal(entry);
    let bestSlot = -1;
    let bestDiff = Infinity;

    for (let i = 0; i < PUNCH_SCHEDULE.length; i++) {
      const slot = PUNCH_SCHEDULE[i]!;
      if (claimed[i] || slot.type !== entry.type) continue;
      const slotMinutes = slot.hour * 60 + slot.minute;
      const diff = Math.abs(entryMinutes - slotMinutes);
      if (diff <= SLOT_TOLERANCE_MINUTES && diff < bestDiff) {
        bestDiff = diff;
        bestSlot = i;
      }
    }

    if (bestSlot >= 0) {
      claimed[bestSlot] = true;
    } else {
      unassigned.push(entry);
    }
  }

  if (unassigned.length > 0) {
    return {
      date,
      classification: "irregular",
      existing: entries,
      missing: [],
      note: `${unassigned.length} registro(s) no coinciden con el horario estándar (tolerancia ${SLOT_TOLERANCE_MINUTES} min); requiere revisión manual.`,
    };
  }

  const missing: MissingPunch[] = [];
  for (let i = 0; i < PUNCH_SCHEDULE.length; i++) {
    if (!claimed[i]) {
      const slot = PUNCH_SCHEDULE[i]!;
      missing.push({ date, slotIndex: i, type: slot.type, hour: slot.hour, minute: slot.minute });
    }
  }

  if (missing.length === 0) {
    return { date, classification: "complete", existing: entries, missing: [] };
  }
  if (missing.length === PUNCH_SCHEDULE.length) {
    return { date, classification: "missing", existing: entries, missing };
  }
  return { date, classification: "incomplete", existing: entries, missing };
}

export function buildDayAnalyses(businessDays: string[], entries: RawTimeEntry[]): DayAnalysis[] {
  const byDate = new Map<string, RawTimeEntry[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.belongsToDate) ?? [];
    list.push(entry);
    byDate.set(entry.belongsToDate, list);
  }
  return businessDays.map((date) => analyzeDay(date, byDate.get(date) ?? []));
}

export function printSummary(analyses: DayAnalysis[], startDate: string, endDate: string): void {
  const complete = analyses.filter((a) => a.classification === "complete").length;
  const incomplete = analyses.filter((a) => a.classification === "incomplete").length;
  const missing = analyses.filter((a) => a.classification === "missing").length;
  const irregular = analyses.filter((a) => a.classification === "irregular");
  const toCreate = analyses.reduce((sum, a) => sum + a.missing.length, 0);

  console.log("Jibble Auto Fill");
  console.log("────────────────────────────");
  console.log(`Periodo analizado: ${startDate} → ${endDate}`);
  console.log(`Zona horaria: ${ZONE}`);
  console.log("");
  console.log(`Días laborables analizados: ${analyses.length}`);
  console.log(`Días completos: ${complete}`);
  console.log(`Días incompletos: ${incomplete}`);
  console.log(`Días sin registros: ${missing}`);
  console.log(`Días irregulares (no se tocan): ${irregular.length}`);
  console.log("");
  console.log(`Registros a crear: ${toCreate}`);

  if (irregular.length) {
    console.log("");
    console.log("Días irregulares (revisar manualmente en Jibble):");
    for (const day of irregular) console.log(`  - ${day.date}: ${day.note}`);
  }
}
