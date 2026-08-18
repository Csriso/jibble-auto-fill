import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export const BASE_URL = "https://web.jibble.io";
export const TIMESHEETS_URL = `${BASE_URL}/timesheets`;

const AUTH_DIR = path.resolve(".auth");
const STATE_PATH = path.join(AUTH_DIR, "state.json");

export function hasSavedSession(): boolean {
  return existsSync(STATE_PATH);
}

export interface OpenedBrowser {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/**
 * Abre Chromium reutilizando la sesión guardada por `npm run login` si existe.
 * Sin sesión guardada, arranca en blanco (solo login.ts debería hacer esto).
 */
export async function openBrowser(headless: boolean): Promise<OpenedBrowser> {
  const browser = await chromium.launch({ headless });
  const context = hasSavedSession()
    ? await browser.newContext({ storageState: STATE_PATH })
    : await browser.newContext();
  const page = await context.newPage();
  return { browser, context, page };
}

export async function saveSession(context: BrowserContext): Promise<void> {
  mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: STATE_PATH });
}
