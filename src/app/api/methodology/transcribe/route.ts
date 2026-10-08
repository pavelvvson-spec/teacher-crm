import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/transcribe";

export const maxDuration = 60;

// Голосова відповідь з браузера → текст
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Немає запису" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Запис задовгий" }, { status: 400 });
  const name = file.type.includes("mp4") ? "answer.m4a" : file.type.includes("ogg") ? "answer.ogg" : "answer.webm";
  const r = await transcribeAudio(await file.arrayBuffer(), name);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ text: r.text });
}
