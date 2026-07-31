import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findConflictingLesson, findExactDuplicateLesson } from "@/lib/lesson-conflict";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const lessons = await prisma.lesson.findMany({
    where: {
      ...(from && to
        ? { startAt: { gte: new Date(from), lte: new Date(to) } }
        : {}),
    },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });

  return NextResponse.json(lessons);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.studentId || !body?.startAt) {
    return NextResponse.json({ error: "Вкажіть учня і дату уроку" }, { status: 400 });
  }

  const startAt = new Date(body.startAt);
  const duration = Number(body.duration) || 60;
  const endAt = new Date(startAt.getTime() + duration * 60000);

  const duplicate = await findExactDuplicateLesson(body.studentId, startAt);
  if (duplicate) {
    return NextResponse.json(duplicate, { status: 200 });
  }

  const conflict = await findConflictingLesson(startAt, endAt, undefined, body.studentId);
  if (conflict) {
    return NextResponse.json(
      {
        error: `На цей час уже є урок з учнем ${conflict.student.firstName} (${conflict.startAt.toLocaleString("uk-UA")})`,
      },
      { status: 409 }
    );
  }

  const lesson = await prisma.lesson.create({
    data: {
      studentId: body.studentId,
      startAt,
      endAt,
      duration,
      format: body.format,
      meetingLink: body.meetingLink || null,
      price: Number(body.price) || 0,
    },
  });

  return NextResponse.json(lesson, { status: 201 });
}