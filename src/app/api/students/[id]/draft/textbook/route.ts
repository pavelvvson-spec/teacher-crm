import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePagesBody, textbookPagesState } from "@/lib/textbook";

// Сторінки підручника для чернетки наступного уроку
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await prisma.student.findUnique({
    where: { id },
    select: { draftTextbookFrom: true, draftTextbookTo: true },
  });
  if (!s) return NextResponse.json({ error: "Учня не знайдено" }, { status: 404 });
  return NextResponse.json(await textbookPagesState(id, { from: s.draftTextbookFrom, to: s.draftTextbookTo }));
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { from, to } = parsePagesBody(await request.json().catch(() => null));
  await prisma.student.update({ where: { id }, data: { draftTextbookFrom: from, draftTextbookTo: to } });
  return NextResponse.json(await textbookPagesState(id, { from, to }));
}
