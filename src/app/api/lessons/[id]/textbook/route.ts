import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePagesBody, textbookPagesState } from "@/lib/textbook";

// Сторінки підручника на конкретний урок
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: { studentId: true, textbookFrom: true, textbookTo: true },
  });
  if (!lesson) return NextResponse.json({ error: "Урок не знайдено" }, { status: 404 });
  return NextResponse.json(await textbookPagesState(lesson.studentId, { from: lesson.textbookFrom, to: lesson.textbookTo }));
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { from, to } = parsePagesBody(await request.json().catch(() => null));
  const lesson = await prisma.lesson.update({
    where: { id },
    data: { textbookFrom: from, textbookTo: to },
    select: { studentId: true, textbookFrom: true, textbookTo: true },
  });
  return NextResponse.json(await textbookPagesState(lesson.studentId, { from: lesson.textbookFrom, to: lesson.textbookTo }));
}
