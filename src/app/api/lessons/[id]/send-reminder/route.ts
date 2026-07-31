import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, buildReminderMessage } from "@/lib/telegram";

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

  if (!lesson.student.telegramChatId) {
    return NextResponse.json(
      { error: "Учень ще не підключив Telegram (chat ID відсутній)" },
      { status: 400 }
    );
  }

  const date = new Date(lesson.startAt);
  const lessonDate = date.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
  const lessonTime = date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

  const text = buildReminderMessage({
    studentFirstName: lesson.student.firstName,
    lessonDate,
    lessonTime,
    meetingLink: lesson.meetingLink,
  });

  const result = await sendTelegramMessage(lesson.student.telegramChatId, text);

  await prisma.reminder.create({
    data: {
      lessonId: lesson.id,
      studentId: lesson.student.id,
      reminderType: "H2",
      scheduledAt: new Date(),
      sentAt: result.success ? new Date() : null,
      status: result.success ? "SENT" : "FAILED",
      errorMessage: result.error || null,
      telegramMessageId: result.messageId ? String(result.messageId) : null,
    },
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}