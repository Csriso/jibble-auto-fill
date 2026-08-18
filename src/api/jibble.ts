import { getAccessToken } from "./auth.js";

const MAX_RETRIES = 5;
const REQUEST_TIMEOUT_MS = 15_000;

export class JibbleApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "JibbleApiError";
  }
}

export interface JibbleClient {
  request<T>(method: string, url: string, body?: unknown): Promise<T>;
}

export function log(level: "info" | "warn" | "error", message: string): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
  return Math.min(2 ** attempt * 250, 10_000);
}

function parseRetryAfterMs(response: Response): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) return seconds * 1000;
  }
  const reset = response.headers.get("x-rate-limit-reset");
  if (reset) {
    const resetMs = new Date(reset).getTime() - Date.now();
    if (resetMs > 0) return resetMs;
  }
  return 2000;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Cliente HTTP fino sobre fetch: reintentos con backoff exponencial, gestión
 * explícita de 429/401/403/400/5xx y timeout. No registra nunca el token de acceso.
 */
export function createJibbleClient(): JibbleClient {
  return {
    async request<T>(method: string, url: string, body?: unknown): Promise<T> {
      let attempt = 0;

      while (true) {
        attempt++;
        const token = await getAccessToken();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(url, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
              ...(body ? { "Content-Type": "application/json" } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });
        } catch (err) {
          clearTimeout(timeout);
          if (attempt >= MAX_RETRIES) {
            const reason = err instanceof Error ? err.message : String(err);
            throw new Error(`Fallo de red tras ${attempt} intentos en ${method} ${url}: ${reason}`);
          }
          log("warn", `Fallo de red (intento ${attempt}) en ${method} ${url}, reintentando...`);
          await sleep(backoffDelay(attempt));
          continue;
        }
        clearTimeout(timeout);

        if (response.status === 429) {
          const waitMs = parseRetryAfterMs(response);
          if (attempt >= MAX_RETRIES) {
            throw new JibbleApiError(429, await safeJson(response), "Límite de peticiones (429) excedido tras reintentos.");
          }
          log("warn", `429 Too Many Requests en ${method} ${url}. Esperando ${waitMs}ms (Retry-After).`);
          await sleep(waitMs);
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          throw new JibbleApiError(
            response.status,
            await safeJson(response),
            `Error de autenticación/permisos (HTTP ${response.status}) en ${method} ${url}. La sesión puede haber caducado: ejecuta 'npm run login' de nuevo.`,
          );
        }

        if (response.status >= 500) {
          if (attempt >= MAX_RETRIES) {
            throw new JibbleApiError(
              response.status,
              await safeJson(response),
              `Error de servidor (HTTP ${response.status}) tras ${attempt} intentos en ${method} ${url}.`,
            );
          }
          log("warn", `HTTP ${response.status} (intento ${attempt}) en ${method} ${url}, reintentando...`);
          await sleep(backoffDelay(attempt));
          continue;
        }

        if (response.status === 400) {
          throw new JibbleApiError(
            400,
            await safeJson(response),
            `Solicitud inválida (HTTP 400) en ${method} ${url}.`,
          );
        }

        if (!response.ok) {
          throw new JibbleApiError(
            response.status,
            await safeJson(response),
            `Respuesta inesperada (HTTP ${response.status}) en ${method} ${url}.`,
          );
        }

        if (response.status === 204) return undefined as T;

        const text = await response.text();
        if (!text) return undefined as T;

        try {
          return JSON.parse(text) as T;
        } catch {
          throw new JibbleApiError(
            response.status,
            text,
            `Respuesta ambigua (no-JSON) de ${method} ${url}; deteniendo el proceso para no crear registros incorrectos.`,
          );
        }
      }
    },
  };
}
