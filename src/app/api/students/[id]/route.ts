import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  } else {
    // Оновлюємо ціну в майбутніх запланованих уроках і в розкладах учня (проведені не чіпаємо)
    await prisma.lesson.updateMany({
      where: {
        studentId: id,
        startAt: { gte: new Date() },
        status: { in: ["SCHEDULED", "RESCHEDULED"] },
      },
      data: { price: student.defaultLessonPrice },
    });
    await prisma.recurringSchedule.updateMany({
      where: { studentId: id },
      data: { price: student.defaultLessonPrice },
    });
  }

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
    return NextResponse.json({ success: true });
  }

  await prisma.student.update({
    where: { id },
    data: { isActive: false },
  });

  await freeUpFutureLessons(id);

  return NextResponse.json({ success: true });
}