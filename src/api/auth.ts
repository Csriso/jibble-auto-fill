import { getSessionToken } from "../browser/tokenCapture.js";

/**
 * Token de la sesión de usuario capturado vía navegador (ver
 * src/browser/tokenCapture.ts). No es un token client_credentials de admin;
 * es el mismo que usa la webapp cuando tú navegas por Jibble.
 */
export async function getAccessToken(): Promise<string> {
  const token = await getSessionToken();
  return token.accessToken;
}

export async function getCurrentPersonId(): Promise<string> {
  const token = await getSessionToken();
  return token.personId;
}
