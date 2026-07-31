import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findConflictingLesson } from "@/lib/lesson-conflict";

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
  if (body.cancellationReason !== undefined) data.cancellationReason = body.cancellationReason || null;
  if (body.meetingLink !== undefined) data.meetingLink = body.meetingLink || null;
  if (body.price !== undefined) data.price = Number(body.price);

  if (body.startAt !== undefined) {
    const startAt = new Date(body.startAt);
    const duration = Number(body.duration) || 60;
    const endAt = new Date(startAt.getTime() + duration * 60000);

    const conflict = await findConflictingLesson(startAt, endAt, id);
    if (conflict) {
      return NextResponse.json(
        {
          error: `На цей час уже є урок з учнем ${conflict.student.firstName} (${conflict.startAt.toLocaleString("uk-UA")})`,
        },
        { status: 409 }
      );
    }

    data.startAt = startAt;
    data.duration = duration;
    data.endAt = endAt;
    data.status = "RESCHEDULED";
  }

  const lesson = await prisma.lesson.update({
    where: { id },
    data,
  });

  return NextResponse.json(lesson);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.lesson.update({
    where: { id },
    data: { status: "CANCELLED_BY_TEACHER" },
  });

  return NextResponse.json({ success: true });
}