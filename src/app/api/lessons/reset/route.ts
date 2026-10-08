import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCalendarSafely } from "@/lib/google-calendar";

// Після змін синхронізуємо Google-календар (може зайняти кілька секунд)
export const maxDuration = 60;

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const scope = body?.scope;

  let where = {};

  if (scope === "current") {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    where = { startAt: { gte: start, lte: end } };
  } else if (scope === "month") {
    const year = Number(body.year);
    const month = Number(body.month);
    if (!year || !month) {
      return NextResponse.json({ error: "Вкажіть рік і місяць" }, { status: 400 });
    }
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    where = { startAt: { gte: start, lte: end } };
  } else if (scope === "all") {
    where = {};
  } else {
    return NextResponse.json({ error: "Невідомий тип скидання" }, { status: 400 });
  }

  const lessons = await prisma.lesson.findMany({ where, select: { id: true } });
  const ids = lessons.map((l: { id: string }) => l.id);

  if (ids.length > 0) {
    await prisma.reminder.deleteMany({ where: { lessonId: { in: ids } } });
    await prisma.payment.updateMany({ where: { lessonId: { in: ids } }, data: { lessonId: null } });
    await prisma.lesson.deleteMany({ where: { id: { in: ids } } });
  }

  await syncCalendarSafely();
  return NextResponse.json({ success: true, deleted: ids.length });
}