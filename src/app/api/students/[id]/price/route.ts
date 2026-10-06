import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kyivWallTimeToUtc } from "@/lib/kyiv-time";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const price = Number(body?.price);
  const fromDate: string | undefined = body?.fromDate;
  const includePaid = Boolean(body?.includePaid);

  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Вкажіть коректну ціну" }, { status: 400 });
  }
  if (!fromDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    return NextResponse.json({ error: "Вкажіть дату" }, { status: 400 });
  }

  const todayKyiv = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
  if (fromDate > todayKyiv) {
    return NextResponse.json(
      { error: "Дата не може бути в майбутньому. Змініть ціну в потрібний день." },
      { status: 400 }
    );
  }

  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) {
    return NextResponse.json({ error: "Учня не знайдено" }, { status: 404 });
  }

  const [year, month, day] = fromDate.split("-").map(Number);
  const from = kyivWallTimeToUtc(year, month - 1, day, 0, 0);

  await prisma.student.update({
    where: { id },
    data: { defaultLessonPrice: price },
  });

  await prisma.recurringSchedule.updateMany({
    where: { studentId: id },
    data: { price },
  });

  const result = await prisma.lesson.updateMany({
    where: {
      studentId: id,
      startAt: { gte: from },
      ...(includePaid ? {} : { paymentStatus: { not: "PAID" } }),
    },
    data: { price },
  });

  return NextResponse.json({ updatedLessons: result.count, price });
}