import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Response } from "playwright";
import { hasSavedSession, openBrowser, TIMESHEETS_URL } from "../browser/session.js";

interface CapturedResponse {
  url: string;
  status: number;
  body: unknown;
}

/**
 * Vuelca lo que devuelve realmente tu cuenta de Jibble (respuestas JSON de red
 * + texto visible de la página) a .auth/inspect-*. No modifica nada en Jibble.
 * Sirve para calibrar la lectura/creación de fichajes contra el DOM/API real,
 * que no es inspeccionable desde fuera de una sesión autenticada.
 */
async function main() {
  if (!hasSavedSession()) {
    throw new Error("No hay sesión guardada. Ejecuta 'npm run login' primero.");
  }

  const headless = process.env.HEADLESS === "true";
  const { browser, page } = await openBrowser(headless);

  const captured: CapturedResponse[] = [];
  page.on("response", async (response: Response) => {
    const contentType = response.headers()["content-type"] || "";
    if (!contentType.includes("json")) return;
    try {
      const body = await response.json();
      captured.push({ url: response.url(), status: response.status(), body });
    } catch {
      // Respuesta no parseable como JSON; se ignora para este volcado.
    }
  });

  console.log(`Navegando a ${TIMESHEETS_URL} ...`);
  await page.goto(TIMESHEETS_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  mkdirSync(".auth", { recursive: true });
  writeFileSync(".auth/inspect-network.json", JSON.stringify(captured, null, 2));
  writeFileSync(".auth/inspect-text.txt", await page.innerText("body"));
  writeFileSync(".auth/inspect-page.html", await page.content());

  console.log(`\nCapturadas ${captured.length} respuestas JSON durante la navegación.`);
  console.log("Guardado en:");
  console.log("  .auth/inspect-network.json  (respuestas JSON completas)");
  console.log("  .auth/inspect-text.txt      (texto visible de la página)");
  console.log("  .auth/inspect-page.html     (HTML completo)");
  console.log("\nURLs JSON capturadas:");
  for (const c of captured) console.log(`  [${c.status}] ${c.url}`);

  console.log(
    "\nSiguiente paso: comparte el contenido de .auth/inspect-network.json (o resume qué campos ves) " +
      "para terminar de calibrar la lectura y creación de fichajes contra tu Jibble real.",
  );

  await browser.close();
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
