import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const LIST_SELECT = {
  id: true,
  title: true,
  level: true,
  summary: true,
  contents: true,
  pageCount: true,
  pageOffset: true,
  fileName: true,
  fileSize: true,
  analyzedAt: true,
  createdAt: true,
  _count: { select: { students: true } },
} as const;

export async function GET() {
  const list = await prisma.textbook.findMany({ orderBy: { createdAt: "desc" }, select: LIST_SELECT });
  return NextResponse.json(list);
}

// Створює запис після того, як браузер завантажив усі частини PDF
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const chunkUrls: unknown = body?.chunkUrls;
  const pageCount = Math.floor(Number(body?.pageCount) || 0);
  const chunkSize = Math.floor(Number(body?.chunkSize) || 0);
  if (
    !Array.isArray(chunkUrls) ||
    chunkUrls.length === 0 ||
    !chunkUrls.every((u) => typeof u === "string" && /^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(u)) ||
    pageCount < 1 ||
    chunkSize < 1 ||
    chunkUrls.length !== Math.ceil(pageCount / chunkSize)
  ) {
    return NextResponse.json({ error: "Неповні дані про файл" }, { status: 400 });
  }
  const fileName = String(body?.fileName ?? "").slice(0, 200) || null;
  const title = (fileName ?? "Підручник").replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim() || "Підручник";
  const tb = await prisma.textbook.create({
    data: {
      title,
      fileName,
      fileSize: Math.floor(Number(body?.fileSize) || 0),
      pageCount,
      chunkSize,
      chunkUrls: chunkUrls as string[],
    },
    select: LIST_SELECT,
  });
  return NextResponse.json(tb);
}
