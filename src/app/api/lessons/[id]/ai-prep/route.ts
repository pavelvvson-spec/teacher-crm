import { NextRequest, NextResponse } from "next/server";
import { generateLessonPrep } from "@/lib/lesson-prep";

// Генерація відповіді ШІ може тривати 20-40 секунд
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const wish: string = typeof body?.wish === "string" ? body.wish.slice(0, 1000) : "";

  const result = await generateLessonPrep(id, wish);
  if (!result.ok) {
    const status = result.error === "Урок не знайдено" ? 404 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ plan: result.plan, homework: result.homework });
}
