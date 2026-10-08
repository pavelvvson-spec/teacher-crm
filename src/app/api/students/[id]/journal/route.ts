import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const entries = await prisma.studentJournalEntry.findMany({
    where: { studentId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(entries);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json({ error: "Запис порожній" }, { status: 400 });
  }
  if (content.length > 20000) {
    return NextResponse.json({ error: "Запис задовгий (максимум 20 000 символів)" }, { status: 400 });
  }

  const student = await prisma.student.findUnique({ where: { id }, select: { id: true } });
  if (!student) {
    return NextResponse.json({ error: "Учня не знайдено" }, { status: 404 });
  }

  const entry = await prisma.studentJournalEntry.create({
    data: { studentId: id, content, source: "TEXT" },
  });
  return NextResponse.json(entry);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.entryId) {
    return NextResponse.json({ error: "Не вказано запис" }, { status: 400 });
  }

  // видаляємо лише запис цього учня
  await prisma.studentJournalEntry.deleteMany({
    where: { id: body.entryId, studentId: id },
  });
  return NextResponse.json({ success: true });
}
