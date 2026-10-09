import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findConflictingLesson } from "@/lib/lesson-conflict";
import { syncCalendarSafely } from "@/lib/google-calendar";
import { advanceTextbookAfterLesson } from "@/lib/textbook";

// Після змін синхронізуємо Google-календар (може зайняти кілька секунд)
export const maxDuration = 60;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Немає даних для оновлення" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (body.status !== undefined) data.status = body.status;
  if (body.paymentStatus !== undefined) data.paymentStatus = body.paymentStatus;
  if (body.teacherNotes !== undefined) data.teacherNotes = body.teacherNotes || null;
  if (body.homework !== undefined) data.homework = body.homework || null;
  if (body.cancellationReason !== undefined) data.cancellationReason = body.cancellationReason || null;
  if (body.meetingLink !== undefined) data.meetingLink = body.meetingLink || null;
  if (body.price !== undefined) data.price = Number(body.price);
  if (body.textbookFrom !== undefined) {
    const from = Number(body.textbookFrom) || null;
    const to = Number(body.textbookTo) || from;
    data.textbookFrom = from;
    data.textbookTo = from && to ? Math.max(from, to) : null;
  }

  if (body.startAt !== undefined) {
    const existing = await prisma.lesson.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Урок не знайдено" }, { status: 404 });
    }

    const startAt = new Date(body.startAt);
    const duration = Number(body.duration) || 60;
    const endAt = new Date(startAt.getTime() + duration * 60000);

    const conflict = await findConflictingLesson(startAt, endAt, id);
    if (conflict) {
      // Час конфлікту показуємо за Києвом (сервер Vercel працює за UTC)
      const conflictTime = conflict.startAt.toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" });
      return NextResponse.json(
        {
          error: `На цей час уже є урок з учнем №${conflict.student.studentNumber} ${conflict.student.firstName} (${conflictTime})`,
        },
        { status: 409 }
      );
    }

    data.startAt = startAt;
    data.duration = duration;
    data.endAt = endAt;
    // Перенесений урок лишається «Заплановано», щоб потрапляти у вечірній чекап
    data.status = "SCHEDULED";
    data.isManual = true;
    data.originalStartAt = existing.originalStartAt ?? existing.startAt;
  }

  const lesson = await prisma.lesson.update({
    where: { id },
    data,
  });

  if (body.status === "COMPLETED" && !body.noShow) await advanceTextbookAfterLesson(id);

  await syncCalendarSafely();
  return NextResponse.json(lesson);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body?.hard) {
    await prisma.reminder.deleteMany({ where: { lessonId: id } });
    await prisma.payment.updateMany({ where: { lessonId: id }, data: { lessonId: null } });
    await prisma.lesson.delete({ where: { id } });
    await syncCalendarSafely();
    return NextResponse.json({ success: true });
  }

  await prisma.lesson.update({
    where: { id },
    data: { status: "CANCELLED_BY_TEACHER" },
  });

  await syncCalendarSafely();
  return NextResponse.json({ success: true });
}