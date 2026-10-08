import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Попередній урок цього ж учня, де є нотатка або ДЗ (для блоку «Минулий урок»)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({ where: { id }, select: { studentId: true, startAt: true } });
  if (!lesson) return NextResponse.json({ error: "Урок не знайдено" }, { status: 404 });

  const prev = await prisma.lesson.findFirst({
    where: {
      studentId: lesson.studentId,
      id: { not: id },
      startAt: { lt: lesson.startAt },
      OR: [{ teacherNotes: { not: null } }, { homework: { not: null } }],
    },
    orderBy: { startAt: "desc" },
    select: { startAt: true, teacherNotes: true, homework: true },
  });

  return NextResponse.json(
    prev ? { startAt: prev.startAt.toISOString(), teacherNotes: prev.teacherNotes, homework: prev.homework } : null
  );
}
