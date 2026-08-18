import "dotenv/config";
import type { Page } from "playwright";
import { BASE_URL, openBrowser, saveSession } from "../browser/session.js";

const LOGIN_TIMEOUT_MS = 5 * 60_000;

/**
 * Selectores confirmados contra el formulario real (Quasar/Vue, ver
 * html/login.html): email y contraseña están en el mismo paso, con
 * data-testid estables. El botón queda disabled=true hasta que el formulario
 * es válido; Playwright espera automáticamente a que se habilite antes de
 * pulsarlo, así que basta con rellenar y clicar.
 */
async function tryAutoFill(page: Page, email: string, password: string): Promise<void> {
  const emailInput = page.locator('input[data-testid="emailOrPhone"]').first();
  await emailInput.waitFor({ timeout: 8000 });
  await emailInput.fill(email);

  const passwordInput = page.locator('[data-testid="password"] input[name="password"]').first();
  await passwordInput.waitFor({ timeout: 8000 });
  await passwordInput.fill(password);
  await passwordInput.blur(); // el botón queda disabled hasta que Vue valida el formulario (suele depender de blur)

  const submitBtn = page.locator('button[data-testid="login-button"]').first();
  await submitBtn.click();
}

async function main() {
  const email = process.env.JIBBLE_EMAIL;
  const password = process.env.JIBBLE_PASSWORD;

  console.log("Abriendo navegador para iniciar sesión en Jibble...");
  const { browser, context, page } = await openBrowser(false);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  if (email && password) {
    try {
      await tryAutoFill(page, email, password);
      console.log("Autocompletado intentado. Si no ha funcionado, termina el login a mano en la ventana abierta.");
    } catch {
      console.log("No se pudo autocompletar el formulario. Inicia sesión manualmente en la ventana abierta.");
    }
  } else {
    console.log("JIBBLE_EMAIL / JIBBLE_PASSWORD no configurados: inicia sesión manualmente en la ventana abierta.");
  }

  console.log(`Esperando hasta ${Math.round(LOGIN_TIMEOUT_MS / 60000)} minutos a que termines el login...`);
  // El callback se serializa y corre dentro del navegador: no puede referenciar nada del scope de Node.
  await page.waitForFunction(
    () => {
      const path = location.pathname.toLowerCase();
      return !path.includes("login") && !path.includes("signin") && !path.includes("sign-in");
    },
    undefined,
    { timeout: LOGIN_TIMEOUT_MS, polling: 500 },
  );

  await page.waitForTimeout(2000);
  await saveSession(context);
  console.log("Sesión guardada en .auth/state.json. Ya puedes cerrar el navegador si sigue abierto.");
  await browser.close();
}

main().catch((err) => {
  console.error("Error durante el login:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
