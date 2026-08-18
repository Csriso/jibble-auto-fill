import { buildContext } from "../config.js";
import { listTimeEntries } from "../api/timeEntries.js";
import { buildDayAnalyses } from "../services/attendanceAnalyzer.js";

async function main() {
  const ctx = await buildContext();
  const entries = await listTimeEntries(ctx.client, ctx.personId, ctx.startDate, ctx.endDate);
  const analyses = buildDayAnalyses(ctx.businessDays, entries);

  const incomplete = analyses.filter((a) => a.classification !== "complete");

  console.log("Verificación Jibble Auto Fill");
  console.log("────────────────────────────");
  console.log(`Periodo verificado: ${ctx.startDate} → ${ctx.endDate}`);
  console.log(`Días completos: ${analyses.length - incomplete.length}/${analyses.length}`);

  if (!incomplete.length) {
    console.log("\nTodos los días laborables tienen las 4 marcaciones esperadas (08:00/12:00/14:00/18:00).");
    return;
  }

  console.log("\nDías con discrepancias:");
  for (const day of incomplete) {
    console.log(`  - ${day.date} [${day.classification}]${day.note ? `: ${day.note}` : ""}`);
  }
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
