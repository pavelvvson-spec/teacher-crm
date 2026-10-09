import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { nextScheduledLesson, lastLessonWithNotes, moveDraftToLesson, draftHasContent } from "@/lib/lesson-draft";

// Чернетка наступного уроку учня (коли дати ще немає)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      defaultLessonDuration: true,
      draftNotes: true,
      draftHomework: true,
      draftUpdatedAt: true,
      _count: { select: { draftMaterials: true } },
    },
  });
  if (!student) return NextResponse.json({ error: "Учня не знайдено" }, { status: 404 });

  let next = await nextScheduledLesson(id);
  // Урок у календарі вже з'явився, а чернетка лишилась — переносимо її зараз
  if (next && draftHasContent(student, student._count.draftMaterials)) {
    await moveDraftToLesson(id, next.id);
    next = await nextScheduledLesson(id);
    student.draftNotes = null;
    student.draftHomework = null;
    student._count.draftMaterials = 0;
  }
  const previous = await lastLessonWithNotes(id);
  return NextResponse.json({
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      defaultLessonDuration: student.defaultLessonDuration,
    },
    draft: {
      teacherNotes: student.draftNotes,
      homework: student.draftHomework,
      updatedAt: student.draftUpdatedAt,
      materialsCount: student._count.draftMaterials,
    },
    previous,
    nextLesson: next
      ? {
          id: next.id,
          studentId: next.studentId,
          startAt: next.startAt.toISOString(),
          duration: next.duration,
          teacherNotes: next.teacherNotes,
          homework: next.homework,
          student: next.student,
        }
      : null,
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Немає даних" }, { status: 400 });
  const data: { draftNotes?: string | null; draftHomework?: string | null; draftUpdatedAt: Date } = {
    draftUpdatedAt: new Date(),
  };
  if (body.teacherNotes !== undefined) data.draftNotes = String(body.teacherNotes || "").trim() || null;
  if (body.homework !== undefined) data.draftHomework = String(body.homework || "").trim() || null;
  await prisma.student.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// Видалити чернетку разом із її матеріалами
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mats = await prisma.lessonMaterial.findMany({ where: { draftStudentId: id } });
  for (const m of mats) {
    if (m.type === "PDF" || m.type === "IMAGE") {
      const otherUses = await prisma.lessonMaterial.count({ where: { url: m.url, id: { not: m.id } } });
      if (otherUses === 0) await del(m.url, { token: process.env.BLOB2_READ_WRITE_TOKEN }).catch(() => null);
    }
  }
  await prisma.lessonMaterial.deleteMany({ where: { draftStudentId: id } });
  await prisma.student.update({
    where: { id },
    data: { draftNotes: null, draftHomework: null, draftUpdatedAt: null, draftTextbookFrom: null, draftTextbookTo: null },
  });
  return NextResponse.json({ ok: true });
}
