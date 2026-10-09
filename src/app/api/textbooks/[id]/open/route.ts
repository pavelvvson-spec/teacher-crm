import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pageLink } from "@/lib/textbook";

// Відкриває підручник на потрібній (друкованій) сторінці
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tb = await prisma.textbook.findUnique({ where: { id } });
  if (!tb) return NextResponse.json({ error: "Підручник не знайдено" }, { status: 404 });
  const page = Math.max(1, Math.floor(Number(request.nextUrl.searchParams.get("page")) || 1));
  const link = pageLink(tb, page);
  if (!link) return NextResponse.json({ error: "Сторінку не знайдено" }, { status: 404 });
  return NextResponse.redirect(link);
}
