import { buildContext } from "../config.js";
import { listTimeEntries } from "../api/timeEntries.js";
import { buildDayAnalyses, printSummary } from "../services/attendanceAnalyzer.js";
import { fillDay } from "../services/attendanceFiller.js";

async function main() {
  const ctx = await buildContext();
  const entries = await listTimeEntries(ctx.client, ctx.personId, ctx.startDate, ctx.endDate);
  const analyses = buildDayAnalyses(ctx.businessDays, entries);

  printSummary(analyses, ctx.startDate, ctx.endDate);

  const pending = analyses.filter((a) => a.missing.length > 0);
  if (!pending.length) {
    console.log("\nNo hay registros pendientes. Nada que hacer.");
    return;
  }

  console.log("\nCreando registros pendientes (día por día, se detiene ante cualquier verificación fallida)...");
  let totalCreated = 0;

  for (const day of pending) {
    const result = await fillDay(ctx.client, ctx.personId, day, false);
    totalCreated += result.createdCount;
    const futureNote = result.skippedFuture
      ? ` ${result.skippedFuture} pendiente(s) de hora futura (reejecuta más tarde).`
      : "";
    console.log(`  ${day.date}: ${result.createdCount} registro(s) creado(s).${futureNote}`);
  }

  console.log(`\nTotal de registros creados: ${totalCreated}`);
  console.log("Ejecuta 'npm run verify' para confirmar los resultados en Jibble.");
}

main().catch((err) => {
  console.error(
    "Error (proceso detenido, no se crearon más registros a partir de este punto):",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
