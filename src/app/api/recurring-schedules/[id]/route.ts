import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findConflictingLesson } from "@/lib/lesson-conflict";
import { syncStudentLessons } from "@/lib/recurring-schedule-sync";
import { kyivWallTimeToUtc } from "@/lib/kyiv-time";
import { syncCalendarSafely } from "@/lib/google-calendar";

// Після змін синхронізуємо Google-календар (може зайняти кілька секунд)
export const maxDuration = 60;

const WEEKS_AHEAD = 8;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body?.dayOfWeek === undefined || !body?.startTime) {
    return NextResponse.json({ error: "Вкажіть день тижня і час уроку" }, { status: 400 });
  }

  const existing = await prisma.recurringSchedule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Графік не знайдено" }, { status: 404 });
  }

  const duration = existing.duration;
  const price = existing.price;
  const format = existing.format;

  const [hours, minutes] = body.startTime.split(":").map(Number);
  const cursor = new Date(existing.activeFrom);
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

      if (startAt >= new Date()) {
        const endAt = new Date(startAt.getTime() + duration * 60000);
        const conflict = await findConflictingLesson(startAt, endAt, undefined, existing.studentId);
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

  const updated = await prisma.recurringSchedule.update({
    where: { id },
    data: {
      dayOfWeek: Number(body.dayOfWeek),
      startTime: body.startTime,
      duration,
      price,
      format,
    },
  });

  const { lessonsCreated, lessonsCancelled } = await syncStudentLessons(existing.studentId, new Date());

  await syncCalendarSafely();
  return NextResponse.json({ schedule: updated, lessonsCreated, lessonsCancelled });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = await prisma.recurringSchedule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Графік не знайдено" }, { status: 404 });
  }

  await prisma.recurringSchedule.delete({ where: { id } });

  const { lessonsCancelled } = await syncStudentLessons(existing.studentId, new Date());

  await syncCalendarSafely();
  return NextResponse.json({ success: true, lessonsCancelled });
}