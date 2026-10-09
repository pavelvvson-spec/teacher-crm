import { NextRequest, NextResponse } from "next/server";
import { analyzeTextbook } from "@/lib/textbook";

export const maxDuration = 120;

// ШІ читає обкладинку, зміст і пару сторінок — визначає назву, рівень, зміст і нумерацію
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await analyzeTextbook(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
