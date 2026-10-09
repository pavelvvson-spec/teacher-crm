// Під час збірки: оновлює структуру демо-бази (якщо вона налаштована). Помилка тут не зупиняє деплой.
import { spawnSync } from "node:child_process";

const demo = process.env.DATABASE_URL_DEMO;
if (!demo || demo === process.env.DATABASE_URL) {
  console.log("[demo] DATABASE_URL_DEMO не задано — пропускаю міграцію демо-бази");
  process.exit(0);
}
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: demo, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" },
  shell: process.platform === "win32",
});
if (r.status !== 0) console.warn("[demo] Не вдалося оновити демо-базу — справжній CRM це не зачіпає");
process.exit(0);
