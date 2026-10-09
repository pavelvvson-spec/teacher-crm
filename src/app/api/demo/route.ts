import { NextRequest, NextResponse } from "next/server";
import { DEMO_COOKIE, demoDbConfigured } from "@/lib/demo-mode";
import { getDemoPrisma } from "@/lib/prisma";
import { seedDemo } from "@/lib/demo-seed";

export const maxDuration = 60;

// Увімкнути / вимкнути демо-режим у цьому браузері (лише для того, хто увійшов у CRM)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const on = Boolean(body?.on);
  const res = NextResponse.json({ ok: true, on });

  if (!on) {
    res.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  if (!demoDbConfigured()) {
    return NextResponse.json({ error: "Демо-базу ще не налаштовано (DATABASE_URL_DEMO у Vercel)" }, { status: 400 });
  }
  const db = getDemoPrisma()!;
  // Перший запуск — заповнюємо демо-базу вигаданими даними
  const count = await db.student.count().catch(() => -1);
  if (count === -1) {
    return NextResponse.json({ error: "Демо-база недоступна: перевірте DATABASE_URL_DEMO і зробіть Redeploy" }, { status: 500 });
  }
  if (count === 0) await seedDemo(db);

  res.cookies.set(DEMO_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 12, sameSite: "lax" });
  return res;
}
