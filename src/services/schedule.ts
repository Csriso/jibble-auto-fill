import "dotenv/config";

export interface ScheduleSlot {
  type: "In" | "Out";
  hour: number;
  minute: number;
}

function parseHHMM(value: string, varName: string): { hour: number; minute: number } {
  const match = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(value.trim());
  if (!match) {
    throw new Error(`${varName} debe tener formato HH:MM (ej. 08:00); valor recibido: "${value}"`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function toMinutes(slot: { hour: number; minute: number }): number {
  return slot.hour * 60 + slot.minute;
}

/**
 * WORK_START_TIME/WORK_END_TIME siempre delimitan la jornada. BREAK_START_TIME
 * y BREAK_END_TIME son opcionales juntos: si ambos están vacíos, la jornada es
 * de un único tramo (2 marcaciones); si ambos están rellenos, es de turno
 * partido con descanso (4 marcaciones, el valor por defecto de este proyecto).
 * Para 3+ tramos (p. ej. mañana/tarde/noche), edita PUNCH_SCHEDULE a mano más
 * abajo — no tiene límite de slots, solo deben alternar In/Out en orden.
 */
function buildSchedule(): ScheduleSlot[] {
  const start = parseHHMM(process.env.WORK_START_TIME || "08:00", "WORK_START_TIME");
  const end = parseHHMM(process.env.WORK_END_TIME || "18:00", "WORK_END_TIME");

  const breakStartRaw = (process.env.BREAK_START_TIME ?? "12:00").trim();
  const breakEndRaw = (process.env.BREAK_END_TIME ?? "14:00").trim();
  const noBreak = breakStartRaw === "" && breakEndRaw === "";

  if (noBreak) {
    if (toMinutes(start) >= toMinutes(end)) {
      throw new Error(`WORK_START_TIME (${process.env.WORK_START_TIME}) debe ser anterior a WORK_END_TIME (${process.env.WORK_END_TIME}).`);
    }
    return [
      { type: "In", ...start },
      { type: "Out", ...end },
    ];
  }

  if (breakStartRaw === "" || breakEndRaw === "") {
    throw new Error(
      "BREAK_START_TIME y BREAK_END_TIME deben estar ambos vacíos (turno único) o ambos rellenos (turno partido).",
    );
  }

  const breakStart = parseHHMM(breakStartRaw, "BREAK_START_TIME");
  const breakEnd = parseHHMM(breakEndRaw, "BREAK_END_TIME");

  if (!(toMinutes(start) < toMinutes(breakStart) && toMinutes(breakStart) < toMinutes(breakEnd) && toMinutes(breakEnd) < toMinutes(end))) {
    throw new Error(
      "El horario debe cumplir WORK_START_TIME < BREAK_START_TIME < BREAK_END_TIME < WORK_END_TIME.",
    );
  }

  return [
    { type: "In", ...start },
    { type: "Out", ...breakStart },
    { type: "In", ...breakEnd },
    { type: "Out", ...end },
  ];
}

/**
 * Jornada por defecto: entrada 08:00, inicio comida 12:00, fin comida 14:00,
 * salida 18:00 (8h trabajadas, 10h de presencia). Configurable con
 * WORK_START_TIME/WORK_END_TIME/BREAK_START_TIME/BREAK_END_TIME en .env
 * (ver README > Horario configurable).
 */
export const PUNCH_SCHEDULE: readonly ScheduleSlot[] = buildSchedule();

/** Cuánto puede desviarse un registro existente de su hora estándar y seguir considerándose ese slot. */
export const SLOT_TOLERANCE_MINUTES = 90;
