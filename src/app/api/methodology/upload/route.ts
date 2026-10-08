import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { addInbox, getMethodologyState } from "@/lib/methodology";

// Скріншот у скриньку ідей методики
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  const caption = String(form?.get("caption") ?? "").trim();
  if (!file) return NextResponse.json({ error: "Файл не знайдено" }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Можна додати лише зображення (скріншот, фото)" }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "Зображення завелике (до 4 МБ)" }, { status: 400 });
  }
  const blob = await put(`methodology/${Date.now()}-${file.name}`, file, {
    access: "public",
    token: process.env.BLOB2_READ_WRITE_TOKEN,
  });
  await addInbox("IMAGE", caption || "Скріншот", blob.url);
  return NextResponse.json(await getMethodologyState());
}
