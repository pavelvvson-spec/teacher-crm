// Демо-режим: у браузері з кукою crm_demo=1 CRM працює з окремою, повністю вигаданою базою.
// Справжня база Саші при цьому не читається і не змінюється. Без куки (cron, вебхуки, інші пристрої) — завжди справжня база.
import { cookies } from "next/headers";

export const DEMO_COOKIE = "crm_demo";

export async function isDemoRequest(): Promise<boolean> {
  try {
    const c = await cookies();
    return c.get(DEMO_COOKIE)?.value === "1";
  } catch {
    // поза запитом (збірка, фонові задачі) — завжди справжня база
    return false;
  }
}

export function demoDbConfigured(): boolean {
  const demo = process.env.DATABASE_URL_DEMO;
  return Boolean(demo && demo !== process.env.DATABASE_URL);
}
