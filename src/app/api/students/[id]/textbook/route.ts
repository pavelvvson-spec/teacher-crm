import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Підручник учня і поточна сторінка (друкований номер)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const textbookId = typeof body?.textbookId === "string" && body.textbookId ? body.textbookId : null;
  if (textbookId && !(await prisma.textbook.findUnique({ where: { id: textbookId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Підручник не знайдено" }, { status: 404 });
  }
  const page = Math.max(0, Math.floor(Number(body?.textbookPage) || 0)) || null;
  await prisma.student.update({
    where: { id },
    data: { textbookId, textbookPage: textbookId ? page : null },
  });
  return NextResponse.json({ ok: true });
}
