import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCalendarSafely } from "@/lib/google-calendar";

// Після змін синхронізуємо Google-календар (може зайняти кілька секунд)
export const maxDuration = 60;

async function freeUpFutureLessons(studentId: string) {
  const now = new Date();
  await prisma.lesson.updateMany({
    where: {
      studentId,
      startAt: { gte: now },
      status: { in: ["SCHEDULED", "RESCHEDULED"] },
    },
    data: { status: "CANCELLED_BY_TEACHER" },
  });
  await prisma.recurringSchedule.updateMany({
    where: { studentId },
    data: { isActive: false },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body?.firstName) {
    return NextResponse.json({ error: "Вкажіть ім'я учня" }, { status: 400 });
  }

  const isActive = body.isActive ?? true;

  const student = await prisma.student.update({
    where: { id },
    data: {
      firstName: body.firstName,
      lastName: body.lastName || null,
      phone: body.phone || null,
      telegramUsername: body.telegramUsername || null,
      contactChannel: body.contactChannel === "VIBER" ? "VIBER" : "TELEGRAM",
      viberPhone: body.viberPhone || null,
      birthYear: Number(body.birthYear) >= 1920 && Number(body.birthYear) <= new Date().getFullYear() ? Number(body.birthYear) : null,
      isAdult: Boolean(body.isAdult),
      birthDay: Number(body.birthDay) >= 1 && Number(body.birthDay) <= 31 ? Number(body.birthDay) : null,
      birthMonth: Number(body.birthMonth) >= 1 && Number(body.birthMonth) <= 12 ? Number(body.birthMonth) : null,
      englishLevel: body.englishLevel,
      lessonFormat: body.lessonFormat,
      defaultLessonDuration: Number(body.defaultLessonDuration) || 60,
      defaultLessonPrice: Number(body.defaultLessonPrice) || 0,
      paymentFrequency: body.paymentFrequency || null,
      notes: body.notes || null,
      isActive,
    },
  });

  if (!isActive) {
    await freeUpFutureLessons(id);
  }

  await syncCalendarSafely();
  return NextResponse.json(student);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body?.hard) {
    await prisma.reminder.deleteMany({ where: { studentId: id } });
    await prisma.payment.deleteMany({ where: { studentId: id } });
    await prisma.recurringSchedule.deleteMany({ where: { studentId: id } });
    await prisma.lesson.deleteMany({ where: { studentId: id } });
    await prisma.student.delete({ where: { id } });
    await syncCalendarSafely();
    return NextResponse.json({ success: true });
  }

  await prisma.student.update({
    where: { id },
    data: { isActive: false },
  });

  await freeUpFutureLessons(id);

  await syncCalendarSafely();
  return NextResponse.json({ success: true });
}