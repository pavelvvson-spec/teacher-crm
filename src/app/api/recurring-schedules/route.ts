import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findConflictingLesson } from "@/lib/lesson-conflict";
import { syncStudentLessons } from "@/lib/recurring-schedule-sync";
import { kyivWallTimeToUtc } from "@/lib/kyiv-time";

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
  const cursor = new Date(activeFrom);
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < WEEKS_AHEAD * 7; i++) {
    if (cursor.getDay() === Number(body.dayOfWeek)) {
      const startAt = kyivWallTimeToUtc(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        hours,
        minutes
      );

      if (startAt >= activeFrom) {
        const endAt = new Date(startAt.getTime() + duration * 60000);
        const conflict = await findConflictingLesson(startAt, endAt, undefined, body.studentId);
        if (conflict) {
          return NextResponse.json(
            {
              error: `Конфлікт часу: ${startAt.toLocaleDateString("uk-UA")} о ${startAt.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" })} вже є урок з учнем ${conflict.student.firstName}`,
            },
            { status: 409 }
          );
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
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

  const { lessonsCreated, lessonsCancelled } = await syncStudentLessons(body.studentId, activeFrom);

  return NextResponse.json({ schedule, lessonsCreated, lessonsCancelled }, { status: 201 });
}