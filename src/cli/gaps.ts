import "dotenv/config";
import { getCurrentPersonId } from "../api/auth.js";
import { createJibbleClient } from "../api/jibble.js";
import { buildGapReport } from "../services/gapReport.js";

async function main() {
  const client = createJibbleClient();
  const personId = await getCurrentPersonId();
  const report = await buildGapReport(client, personId);

  console.log("Auditoría de huecos — Jibble Auto Fill");
  console.log("────────────────────────────");
  console.log(`Primera fecha con fichajes: ${report.firstFilledDate}`);
  console.log(`Hasta hoy: ${report.endDate}`);
  console.log(`Días laborables analizados (sin fines de semana ni festivos): ${report.businessDayCount}`);
  console.log(`Huecos encontrados: ${report.gaps.length}`);

  if (!report.gaps.length) {
    console.log("\nNo hay huecos: todos los días laborables desde la primera fecha con fichajes están completos.");
    return;
  }

  console.log("\nDías a revisar:");
  for (const day of report.gaps) {
    console.log(`  - ${day.date} [${day.classification}]${day.note ? `: ${day.note}` : ""}`);
  }
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
