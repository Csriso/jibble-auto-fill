import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BASE_URL, hasSavedSession, openBrowser } from "./session.js";

const TOKEN_CACHE_PATH = path.resolve(".auth", "token.json");
const REFRESH_MARGIN_MS = 60_000;

interface TokenResponseBody {
  access_token: string;
  expires_in: number;
  personId: string;
  organizationId: string;
}

export interface SessionToken {
  accessToken: string;
  personId: string;
  organizationId: string;
  expiresAt: number;
}

function readCache(): SessionToken | null {
  if (!existsSync(TOKEN_CACHE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_CACHE_PATH, "utf8")) as SessionToken;
  } catch {
    return null;
  }
}

function writeCache(token: SessionToken): void {
  mkdirSync(path.dirname(TOKEN_CACHE_PATH), { recursive: true });
  writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(token, null, 2));
}

/**
 * La SPA de Jibble renueva su token de forma silenciosa (vía la cookie de
 * sesión de identity.prod.jibble.io) cada vez que carga. Abrimos un Chromium
 * headless con la sesión guardada por 'npm run login', dejamos que la propia
 * app pida su token como haría un usuario normal, y lo capturamos: es un
 * token de usuario (no client_credentials), así que no requiere admin.
 */
async function fetchFreshToken(): Promise<SessionToken> {
  if (!hasSavedSession()) {
    throw new Error("No hay sesión guardada. Ejecuta 'npm run login' primero.");
  }

  const { browser, page } = await openBrowser(true);
  // Objeto en vez de variable suelta: TS no puede asumir estáticamente que una
  // propiedad de objeto queda "siempre null" solo porque la reasignación ocurre
  // dentro de un callback async (con un `let` suelto, tsc infiere el bloque
  // posterior al guard como código muerto).
  const state: { captured: TokenResponseBody | null } = { captured: null };

  page.on("response", async (response) => {
    if (state.captured) return;
    if (!response.url().includes("identity.prod.jibble.io/connect/token")) return;
    try {
      const body = (await response.json()) as TokenResponseBody;
      if (body.access_token) state.captured = body;
    } catch {
      // respuesta no-JSON o ya consumida; se ignora
    }
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await browser.close();

  const captured = state.captured;
  if (!captured) {
    throw new Error(
      "No se pudo capturar un token de sesión al cargar Jibble. La sesión guardada puede haber caducado: ejecuta 'npm run login' de nuevo.",
    );
  }

  const token: SessionToken = {
    accessToken: captured.access_token,
    personId: captured.personId,
    organizationId: captured.organizationId,
    expiresAt: Date.now() + captured.expires_in * 1000,
  };
  writeCache(token);
  return token;
}

export async function getSessionToken(): Promise<SessionToken> {
  const cached = readCache();
  if (cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
    return cached;
  }
  return fetchFreshToken();
}
