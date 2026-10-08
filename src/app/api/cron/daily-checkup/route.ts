import { NextRequest, NextResponse } from "next/server";
import { sendDailyCheckup } from "@/lib/daily-checkup";
import { syncCalendarSafely } from "@/lib/google-calendar";
import { pollRecentMeetings, isFirefliesConfigured } from "@/lib/fireflies";

// Після змін синхронізуємо Google-календар (може зайняти кілька секунд)
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await syncCalendarSafely();
  // Підстраховка: записи Fireflies, які могли не прийти вебхуком
  if (isFirefliesConfigured()) {
    try {
      await pollRecentMeetings(30);
    } catch (e) {
      console.error("Fireflies poll error", e);
    }
  }
  const result = await sendDailyCheckup();
  return NextResponse.json(result);
}