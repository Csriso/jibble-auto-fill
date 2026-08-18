# Jibble Auto Fill

Automatically fills in missing work shifts in Jibble, without needing admin access to the official API.

_[Versión en español](README.es.md)_

## How it works

Your account doesn't have admin permissions, so there's no `client_id`/`client_secret` for the OAuth2 `client_credentials` flow. The workaround: log in once with Playwright and capture the **user token** that Jibble's own webapp uses internally — the same one you'd see in the browser's dev tools. With that token, the rest of the program talks directly to Jibble's documented public API (`time-tracking.prod.jibble.io/v1/TimeEntries`, the same one listed at `docs.api.jibble.io`), without depending on clicks or the page's visual structure.

This was confirmed by auditing your real account (`npm run inspect`):

- The webapp calls exactly the documented public `GET/POST /v1/TimeEntries` endpoint, authenticated with a normal user token (`Member` role, not admin).
- Your account already had a time entry with `isManual: true` whose `belongsToDate` was well before its `createdAt` — direct proof that Jibble allows creating backdated entries without being an admin.

That's why `fill`, after creating each punch, re-reads that day in Jibble to confirm it landed with the expected date/time. If it doesn't, it **stops the whole process** immediately instead of continuing to create potentially incorrect records.

## Requirements

- Node.js 18.17 or higher.
- Your normal Jibble email and password (login without 2FA).

## 1. Install dependencies

```bash
npm install
```

This also downloads Chromium for Playwright (`postinstall`), used only for login and to capture the session token (always in the background, no window, except for `npm run login`/`npm run inspect`).

## 2. Configure `.env`

```bash
cp .env.example .env
```

```env
JIBBLE_EMAIL=your-email@company.com
JIBBLE_PASSWORD=your-password
TIMEZONE=Europe/Madrid
```

You don't need to provide your `personId`: it's obtained automatically from your session token.

## 3. Log in (once)

```bash
npm run login
```

Opens a Chromium window and tries to auto-fill the login form. If it doesn't match your screen, just finish logging in yourself in that same window — the script waits up to 5 minutes and saves the session (`.auth/state.json`) as soon as it detects you're no longer on the login screen.

From here on, `dry-run`/`fill`/`verify`/`gaps` never open a window again: they reuse that saved session to capture a fresh token (headless, a couple of seconds) whenever the previous one expires (lasts ~16h, cached in `.auth/token.json`).

If any command ever fails with an authentication error, run `npm run login` again (the saved session can expire after several weeks of inactivity).

## 4. Configurable schedule

By default the schedule is a split shift: clock in 08:00, lunch break 12:00–14:00, clock out 18:00 (8h worked, 10h of presence). Configure it in `.env`:

```env
WORK_START_TIME=08:00
WORK_END_TIME=18:00
BREAK_START_TIME=12:00
BREAK_END_TIME=14:00
```

- **Split shift** (with a break, 4 punches In/Out/In/Out): fill in all 4 variables.
- **Single shift** (no break, 2 punches In/Out): leave `BREAK_START_TIME` and `BREAK_END_TIME` **both empty**. Leaving only one of them empty isn't supported — either both filled in or both empty.
- Format is always `HH:MM`, 24-hour. The program validates that `WORK_START_TIME < BREAK_START_TIME < BREAK_END_TIME < WORK_END_TIME` (or `WORK_START_TIME < WORK_END_TIME` for a single shift) and fails with a clear message if that isn't the case.

**Need 3+ segments** (e.g. morning/afternoon/evening, or two breaks)? That doesn't fit in 4 environment variables, so it's a code-level change: edit the `PUNCH_SCHEDULE` array in [src/services/schedule.ts](src/services/schedule.ts). It's a list of `{ type: "In"|"Out", hour, minute }` with no length limit — the rest of the program (gap detection, tolerance, creation) works the same for any number of segments, as long as they alternate In/Out in chronological order.

This affects `dry-run`, `fill`, `verify` and `gaps` alike — they all use the same configured schedule.

## 5. Holidays

Before figuring out which days need filling, the program queries `GET /v1/PersonHolidays`: the holiday calendar your organization already has configured in Jibble (in your case, Spanish national holidays: New Year's Day, Epiphany, Good Friday, Assumption of Mary, National Day, Immaculate Conception, Christmas...). No configuration needed — they're excluded automatically just like weekends, both when auto-detecting `START_DATE` and when building the list of days to fill. If a holiday falls on a weekend, nothing changes (it was already excluded).

## 6. Dry-run

```bash
npm run dry-run
```

Makes no `POST` requests at all. It only analyzes and shows what would be created.

### Example output

```
Jibble Auto Fill
────────────────────────────
Periodo analizado: 2026-08-03 → 2026-08-18
Zona horaria: Europe/Madrid

Días laborables analizados: 12
Días completos: 8
Días incompletos: 1
Días sin registros: 3
Días irregulares (no se tocan): 0

Registros a crear: 13

Detalle de registros que se crearían:
  2026-08-11 [missing]
    - In 08:00
    - Out 12:00
    - In 14:00
    - Out 18:00
  2026-08-12 [incomplete]
    - Out 18:00

Modo DRY RUN: no se ha realizado ningún POST. Ejecuta 'npm run fill' para aplicar los cambios.
```

(The program's console output is in Spanish — this reflects what you'll actually see when you run it.)

## 7. Actually filling in

```bash
npm run fill
```

Creates only the punches that are missing, one day at a time. After each day, it re-reads that day in Jibble to confirm it landed as expected; if not, it stops with an explicit error. It's safe to re-run: already-complete days are detected and skipped (idempotent — you can run it repeatedly without duplicating anything).

Recommendation: the first time, scope `START_DATE`/`END_DATE` in `.env` to a single past day or week and check by hand in Jibble (Timesheets) that it landed correctly before running it over the whole period.

### Delay between creations (429 Too Many Requests)

```env
CREATE_DELAY_MS=200
```

If while filling many days you see plenty of `429 Too Many Requests` warnings in the logs (the client retries on its own respecting `Retry-After`, but each retry takes longer), raise `CREATE_DELAY_MS` — it's a fixed pause in milliseconds after each punch is created, before creating the next one. `0` = no pause (default). Typical values: `150`–`300`.

## 8. Verify

```bash
npm run verify
```

Re-queries Jibble and confirms that every business day within `START_DATE`/`END_DATE` has its punches complete. Exits with a non-zero code if any discrepancy remains.

## 9. Full gap audit

```bash
npm run gaps
```

Different from `verify`: instead of only looking at the `START_DATE`/`END_DATE` range from `.env`, it finds the date of your **oldest** time entry in Jibble (up to 5 years back) and audits **every** non-holiday business day from that date to today, listing any that aren't complete — entirely missing, partially filled, or with punches that don't fit the standard schedule (`irregular`, needs manual review). Useful for getting a full picture of what's left to review across your whole account, not just the range you're currently filling.

## 10. Reading the logs

Retry/error logs are printed as single-line JSON: `{"ts": "...", "level": "info|warn|error", "message": "..."}`. Neither your password nor the access token are ever written to logs.

Day classification in the reports (`dry-run`, `fill`, `verify`, `gaps`):

- `complete`: every punch in the configured schedule exists (within ±90 min of its standard time). Left untouched.
- `incomplete`: one or more punches are missing; only the missing ones are created.
- `missing`: no record at all that day; all punches are created.
- `irregular`: there are entries that don't fit the standard pattern (e.g. a punch at a very different time, or real punches from before you started using this tool with a different schedule). Nothing is created or modified that day — manual review needed.

## 11. Stopping the process on error

`npm run fill` processes days in chronological order and stops at the first error (network exhausted, 401/403 → expired session, failed verification, etc.), without continuing to the next days. To retry, just run `npm run fill` again: already-completed days aren't touched.

## 12. Optional diagnostic tool

```bash
npm run inspect
```

Navigates to Timesheets with your saved session and dumps every JSON network response, the visible text, and the full HTML to `.auth/`. Useful only if something breaks and you want to see what Jibble is actually returning. **Contains your access token and personal data** — don't share it outside this team, and don't commit it to any repository (it's already in `.gitignore`).

## 13. Known limitations

- The captured session token lasts as long as the login session does (~16h for the token, weeks for the cookie); if it fully expires, run `npm run login` again.
- A day with punches that don't follow the standard pattern is marked `irregular` and never touched automatically (this includes real days from before you started using this tool, if they don't match `WORK_START_TIME`/etc.).
- `START_DATE` auto-detection (when left empty) looks back at most 180 days for the last complete day; `npm run gaps` instead looks back up to 5 years to find the first date with any entries.
- This automation may conflict with Jibble's Terms of Service if it isn't explicitly allowed by your organization; it's your responsibility to confirm that your use of it (backfilling your own actually-worked hours) is acceptable.

## Project structure

```
jibble-auto-fill/
├── src/
│   ├── api/
│   │   ├── auth.ts           Session token (via browser) + personId
│   │   ├── jibble.ts         HTTP client: retries, backoff, 429/401/403/400/5xx
│   │   ├── timeEntries.ts    GET/POST TimeEntries (documented public API)
│   │   └── holidays.ts       GET PersonHolidays (organization's holiday calendar)
│   ├── browser/
│   │   ├── session.ts        Persistent login (storageState) with Playwright
│   │   └── tokenCapture.ts   Captures the user token from an already-logged-in session
│   ├── services/
│   │   ├── schedule.ts             Configurable schedule (WORK_*/BREAK_* + tolerance)
│   │   ├── timezone.ts             Europe/Madrid helpers with Luxon (DST-safe)
│   │   ├── attendanceAnalyzer.ts   Day classification and summary
│   │   ├── attendanceFiller.ts     Creation with post-write verification + CREATE_DELAY_MS
│   │   └── gapReport.ts            Full audit from the first-ever entry date
│   ├── cli/
│   │   ├── login.ts
│   │   ├── inspect.ts        (optional diagnostic)
│   │   ├── dryRun.ts
│   │   ├── fill.ts
│   │   ├── verify.ts
│   │   └── gaps.ts
│   └── config.ts             Shared context (token, personId, holidays, date range)
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```
