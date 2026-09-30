import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { student: true },
  });

  if (!lesson) {
    return NextResponse.json({ error: "Урок не знайдено" }, { status: 404 });
  }

  if (!lesson.homework || !lesson.homework.trim()) {
    return NextResponse.json({ error: "Спочатку напишіть домашнє завдання" }, { status: 400 });
  }

  if (!lesson.student.telegramChatId) {
    return NextResponse.json(
      { error: "Учень ще не підключив Telegram (chat ID відсутній)" },
      { status: 400 }
    );
  }

  const text = `📚 Домашнє завдання\n\nПривіт! Ось твоє домашнє завдання до наступного уроку:\n\n${lesson.homework}\n\nУспіхів! 😊`;

  const result = await sendTelegramMessage(lesson.student.telegramChatId, text);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}