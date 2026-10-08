import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTestBreakMessage } from "@/lib/lesson-end-notify";

// Налаштування повідомлень про перерви (вмикач і мінімальна перерва)
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Немає даних" }, { status: 400 });

  const data: { breakNotificationsEnabled?: boolean; breakMinMinutes?: number } = {};
  if (typeof body.enabled === "boolean") data.breakNotificationsEnabled = body.enabled;
  if (body.minMinutes !== undefined) {
    const n = Math.round(Number(body.minMinutes));
    if (!Number.isFinite(n) || n < 5 || n > 240) {
      return NextResponse.json({ error: "Мінімальна перерва — від 5 до 240 хвилин" }, { status: 400 });
    }
    data.breakMinMinutes = n;
  }

  const settings = await prisma.settings.findFirst();
  if (!settings) return NextResponse.json({ error: "Спочатку підключіть Telegram вчительки" }, { status: 400 });
  const updated = await prisma.settings.update({ where: { id: settings.id }, data });
  return NextResponse.json({
    enabled: updated.breakNotificationsEnabled,
    minMinutes: updated.breakMinMinutes,
  });
}

// Надіслати тестове повідомлення
export async function POST() {
  const r = await sendTestBreakMessage();
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
