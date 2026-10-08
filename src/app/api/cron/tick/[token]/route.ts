import { NextRequest, NextResponse } from "next/server";
import { sendLessonEndNotifications } from "@/lib/lesson-end-notify";

// «Будильник»: зовнішній сервіс (cron-job.org) відкриває це посилання кожні 5 хвилин.
// Секрет — у шляху: /api/cron/tick/<TICK_SECRET> (значення — лише у змінних Vercel).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = process.env.TICK_SECRET;
  if (!secret || token !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await sendLessonEndNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("tick error", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
