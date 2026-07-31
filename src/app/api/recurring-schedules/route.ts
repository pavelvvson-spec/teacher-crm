import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findConflictingLesson, findExactDuplicateLesson } from "@/lib/lesson-conflict";

const WEEKS_AHEAD = 8;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.studentId || body?.dayOfWeek === undefined || !body?.startTime) {
    return NextResponse.json(
      { error: "Вкажіть учня, день тижня і час уроку" },
      { status: 400 }
    );
  }

  const student = await prisma.student.findUnique({ where: { id: body.studentId } });
  if (!student) {
    return NextResponse.json({ error: "Учня не знайдено" }, { status: 404 });
  }

  const duration = Number(body.duration) || student.defaultLessonDuration;
  const price = Number(body.price) || student.defaultLessonPrice;
  const format = body.format || student.lessonFormat;
  const activeFrom = body.activeFrom ? new Date(body.activeFrom) : new Date();

  const [hours, minutes] = body.startTime.split(":").map(Number);
  const candidateLessons: {
    studentId: string;
    startAt: Date;
    endAt: Date;
    duration: number;
    format: "ONLINE" | "OFFLINE";
    price: number;
  }[] = [];

  const cursor = new Date(activeFrom);
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < WEEKS_AHEAD * 7; i++) {
    if (cursor.getDay() === Number(body.dayOfWeek)) {
      const startAt = new Date(cursor);
      startAt.setHours(hours, minutes, 0, 0);

      if (startAt >= activeFrom) {
        const endAt = new Date(startAt.getTime() + duration * 60000);
        candidateLessons.push({
          studentId: body.studentId,
          startAt,
          endAt,
          duration,
          format,
          price,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Перевіряємо конфлікти тільки з іншими учнями, дублікати з тим самим учнем пропускаємо
  const lessonsToCreate: typeof candidateLessons = [];
  for (const candidate of candidateLessons) {
    const duplicate = await findExactDuplicateLesson(candidate.studentId, candidate.startAt);
    if (duplicate) {
      continue;
    }

    const conflict = await findConflictingLesson(
      candidate.startAt,
      candidate.endAt,
      undefined,
      candidate.studentId
    );
    if (conflict) {
      return NextResponse.json(
        {
          error: `Конфлікт часу: ${candidate.startAt.toLocaleDateString("uk-UA")} о ${candidate.startAt.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })} вже є урок з учнем ${conflict.student.firstName}`,
        },
        { status: 409 }
      );
    }

    lessonsToCreate.push(candidate);
  }

  const schedule = await prisma.recurringSchedule.create({
    data: {
      studentId: body.studentId,
      dayOfWeek: Number(body.dayOfWeek),
      startTime: body.startTime,
      duration,
      format,
      price,
      activeFrom,
      activeUntil: body.activeUntil ? new Date(body.activeUntil) : null,
    },
  });

  if (lessonsToCreate.length > 0) {
    await prisma.lesson.createMany({ data: lessonsToCreate });
  }

  return NextResponse.json({ schedule, lessonsCreated: lessonsToCreate.length }, { status: 201 });
}