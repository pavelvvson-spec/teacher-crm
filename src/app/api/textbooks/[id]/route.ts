import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

// Вчителька виправляє назву, рівень, зсув сторінок або зміст
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const data: { title?: string; level?: string | null; pageOffset?: number; contents?: string | null } = {};
  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 200);
  if (body?.level !== undefined) data.level = LEVELS.includes(body.level) ? body.level : null;
  if (body?.pageOffset !== undefined && Number.isFinite(Number(body.pageOffset))) {
    data.pageOffset = Math.max(-500, Math.min(500, Math.round(Number(body.pageOffset))));
  }
  if (body?.contents !== undefined) data.contents = String(body.contents || "").trim().slice(0, 20000) || null;
  const tb = await prisma.textbook.update({ where: { id }, data });
  return NextResponse.json({ ok: true, id: tb.id });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tb = await prisma.textbook.findUnique({ where: { id } });
  if (!tb) return NextResponse.json({ ok: true });
  await prisma.textbook.delete({ where: { id } });
  // Файли видаляємо після запису; якщо Blob не відповів — запис уже прибрано, це не страшно
  await del(tb.chunkUrls, { token: process.env.BLOB2_READ_WRITE_TOKEN }).catch((e) =>
    console.error("textbook blob delete", e)
  );
  return NextResponse.json({ ok: true });
}
