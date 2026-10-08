import { NextRequest, NextResponse } from "next/server";
import { reconcileCalendar, isCalendarConfigured } from "@/lib/google-calendar";

export const maxDuration = 60;

// Ручна синхронізація з налаштувань CRM (шлях не публічний — лише після входу)
export async function POST(request: NextRequest) {
  const back = new URL("/settings/telegram", request.url);
  if (!isCalendarConfigured()) {
    back.searchParams.set("calError", "Google-календар ще не налаштовано (змінні у Vercel)");
    return NextResponse.redirect(back, 303);
  }
  try {
    const r = await reconcileCalendar();
    back.searchParams.set(
      "calOk",
      `додано ${r.created}, оновлено ${r.updated}, видалено ${r.deleted}` +
        (r.skippedNoLink ? `, без посилання Zoom: ${r.skippedNoLink}` : "")
    );
  } catch (e) {
    back.searchParams.set("calError", e instanceof Error ? e.message : "Невідома помилка");
  }
  return NextResponse.redirect(back, 303);
}
