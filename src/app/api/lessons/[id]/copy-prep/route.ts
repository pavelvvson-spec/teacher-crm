import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const target = await prisma.lesson.findUnique({
    where: { id },
    select: { studentId: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Урок не знайдено" }, { status: 404 });
  }

  const sources = await prisma.lesson.findMany({
    where: {
      studentId: target.studentId,
      id: { not: id },
      OR: [
        { teacherNotes: { not: null } },
        { homework: { not: null } },
        { materials: { some: {} } },
      ],
    },
    orderBy: { startAt: "desc" },
    take: 30,
    select: {
      id: true,
      startAt: true,
      status: true,
      teacherNotes: true,
      homework: true,
      _count: { select: { materials: true } },
    },
  });

  return NextResponse.json(
    sources.map((s) => ({
      id: s.id,
      startAt: s.startAt,
      status: s.status,
      teacherNotes: s.teacherNotes,
      homework: s.homework,
      materialsCount: s._count.materials,
    }))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body?.sourceLessonId || body.sourceLessonId === id) {
    return NextResponse.json({ error: "Оберіть інший урок" }, { status: 400 });
  }

  const [target, source] = await Promise.all([
    prisma.lesson.findUnique({ where: { id }, include: { materials: true } }),
    prisma.lesson.findUnique({ where: { id: body.sourceLessonId }, include: { materials: true } }),
  ]);

  if (!target || !source) {
    return NextResponse.json({ error: "Урок не знайдено" }, { status: 404 });
  }
  if (target.studentId !== source.studentId) {
    return NextResponse.json(
      { error: "Копіювати можна лише між уроками одного учня" },
      { status: 400 }
    );
  }

  const mergeText = (current: string | null, incoming: string | null) => {
    if (!incoming) return current;
    if (!current) return incoming;
    if (current.includes(incoming)) return current;
    return `${current}\n${incoming}`;
  };

  const teacherNotes = mergeText(target.teacherNotes, source.teacherNotes);
  const homework = mergeText(target.homework, source.homework);

  const existingUrls = new Set(target.materials.map((m) => m.url));
  const toCreate = source.materials.filter((m) => !existingUrls.has(m.url));

  if (toCreate.length > 0) {
    await prisma.lessonMaterial.createMany({
      data: toCreate.map((m) => ({
        lessonId: id,
        type: m.type,
        title: m.title,
        url: m.url,
      })),
    });
  }

  const updated = await prisma.lesson.update({
    where: { id },
    data: { teacherNotes, homework },
    select: { teacherNotes: true, homework: true },
  });

  return NextResponse.json({ ...updated, materialsAdded: toCreate.length });
}