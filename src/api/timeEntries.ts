import type { JibbleClient } from "./jibble.js";

// Hosts oficiales confirmados: coinciden con la colección Postman pública de
// docs.api.jibble.io Y con las llamadas reales que hace la propia webapp
// (capturadas con npm run inspect) usando un token de usuario normal.
const TIME_ENTRIES_URL = "https://time-tracking.prod.jibble.io/v1/TimeEntries";

export interface RawTimeEntry {
  id: string;
  type: string;
  time: string;
  localTime: string;
  belongsToDate: string;
  personId: string;
  status?: string;
  note?: string;
  isManual?: boolean;
}

interface ODataList<T> {
  value: T[];
}

/**
 * Lista TimeEntries no archivados de una persona en un rango de fechas,
 * paginando con $skip/$top. Filtro OData confirmado tanto en la doc pública
 * como en las llamadas reales de la webapp.
 */
export async function listTimeEntries(
  client: JibbleClient,
  personId: string,
  fromDate: string,
  toDate: string,
): Promise<RawTimeEntry[]> {
  const results: RawTimeEntry[] = [];
  const top = 100;
  let skip = 0;

  const filter = `(personId eq ${personId} and belongsToDate ge ${fromDate} and belongsToDate le ${toDate} and status ne 'Archived')`;
  const select = "id,type,time,localTime,belongsToDate,personId,status,note,isManual";

  while (true) {
    const url =
      `${TIME_ENTRIES_URL}?$filter=${encodeURIComponent(filter)}` +
      `&$select=${select}&$orderby=time asc&$skip=${skip}&$top=${top}`;
    const page = await client.request<ODataList<RawTimeEntry>>("GET", url);
    results.push(...page.value);
    if (page.value.length < top) break;
    skip += top;
  }

  return results;
}

export interface CreatePunchInput {
  personId: string;
  type: "In" | "Out";
  /**
   * ISO 8601 UTC. Se confirmó en tu propia cuenta (ver .auth/inspect-network.json)
   * un TimeEntry con isManual=true y belongsToDate muy anterior a createdAt,
   * es decir, Jibble sí soporta fichajes históricos vía el flujo manual. Se
   * envía como mejor esfuerzo y el resultado se verifica justo después de crear.
   */
  time: string;
  belongsToDate: string;
}

export async function createPunch(client: JibbleClient, input: CreatePunchInput): Promise<RawTimeEntry> {
  const body = {
    personId: input.personId,
    type: input.type,
    time: input.time,
    belongsToDate: input.belongsToDate,
    clientType: "Web",
    platform: {
      clientVersion: "148.0.0.0",
      os: "Windows",
      deviceModel: null,
      deviceName: "Chrome",
    },
  };
  return client.request<RawTimeEntry>("POST", TIME_ENTRIES_URL, body);
}
