import type { JibbleClient } from "./jibble.js";

const PERSON_HOLIDAYS_URL = "https://workspace.prod.jibble.io/v1/PersonHolidays";

export interface PersonHoliday {
  date: string;
  name: string;
  isShortDay: boolean;
}

interface ODataCollection<T> {
  value: T[];
}

/**
 * Festivos ya configurados en Jibble para esta persona (calendario de la
 * organización), en vez de una lista fija de festivos de España: así se
 * respetan también los festivos locales/autonómicos o de empresa que Jibble
 * tenga cargados, y no hay que mantener una tabla de fechas a mano.
 */
export async function listPersonHolidayDates(client: JibbleClient, personId: string): Promise<Set<string>> {
  const url = `${PERSON_HOLIDAYS_URL}(personId=${personId})`;
  const page = await client.request<ODataCollection<PersonHoliday>>("GET", url);
  return new Set(page.value.map((holiday) => holiday.date));
}
