import { buildContext } from "../config.js";
import { listTimeEntries } from "../api/timeEntries.js";
import { buildDayAnalyses, printSummary } from "../services/attendanceAnalyzer.js";

async function main() {
  const ctx = await buildContext();
  const entries = await listTimeEntries(ctx.client, ctx.personId, ctx.startDate, ctx.endDate);
  const analyses = buildDayAnalyses(ctx.businessDays, entries);

  printSummary(analyses, ctx.startDate, ctx.endDate);

  const pending = analyses.filter((a) => a.missing.length > 0);
  if (pending.length) {
    console.log("");
    console.log("Detalle de registros que se crearían:");
    for (const day of pending) {
      console.log(`  ${day.date} [${day.classification}]`);
      for (const p of day.missing) {
        console.log(`    - ${p.type} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`);
      }
    }
  }

  console.log("");
  console.log("Modo DRY RUN: no se ha realizado ningún POST. Ejecuta 'npm run fill' para aplicar los cambios.");
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
