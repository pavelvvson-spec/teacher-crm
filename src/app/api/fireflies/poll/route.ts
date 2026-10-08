import { NextRequest, NextResponse } from "next/server";
import { pollRecentMeetings, isFirefliesConfigured } from "@/lib/fireflies";

export const maxDuration = 60;

// Ручна перевірка нових записів Fireflies з налаштувань CRM (лише після входу)
export async function POST(request: NextRequest) {
  const back = new URL("/settings/telegram", request.url);
  if (!isFirefliesConfigured()) {
    back.searchParams.set("ffError", "Fireflies ще не налаштовано (FIREFLIES_API_KEY у Vercel)");
    return NextResponse.redirect(back, 303);
  }
  try {
    const r = await pollRecentMeetings(48);
    const skipped = r.results
      .filter((x) => x.status === "skipped")
      .map((x) => (x.status === "skipped" ? x.reason : ""))
      .join("; ");
    back.searchParams.set(
      "ffOk",
      `знайдено записів за 2 доби: ${r.checked}, додано в журнал: ${r.saved}` + (skipped ? ` (пропущено: ${skipped})` : "")
    );
  } catch (e) {
    back.searchParams.set("ffError", e instanceof Error ? e.message : "Невідома помилка");
  }
  return NextResponse.redirect(back, 303);
}
