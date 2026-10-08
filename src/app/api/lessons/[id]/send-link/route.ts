import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, escapeTelegramHtml } from "@/lib/telegram";
import { lessonMeetingLink, buildLinkMessage, normalizeViberPhone } from "@/lib/lesson-link";

// Надсилає учню посилання на урок.
// Telegram + підключений бот → надсилаємо автоматично.
// Інакше повертаємо готовий текст і дані, щоб браузер відкрив Viber / Telegram у вчительки.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({ where: { id }, include: { student: true } });
  if (!lesson) {
    return NextResponse.json({ error: "Урок не знайдено" }, { status: 404 });
  }

  const link = lessonMeetingLink(lesson.meetingLink);
  if (!link) {
    return NextResponse.json(
      { error: "Немає посилання на Zoom: впишіть його в урок або DEFAULT_MEETING_LINK у Vercel" },
      { status: 400 }
    );
  }

  const s = lesson.student;
  const text = buildLinkMessage(s.firstName, lesson.startAt, link);

  if (s.contactChannel !== "VIBER" && s.telegramChatId) {
    const result = await sendTelegramMessage(s.telegramChatId, escapeTelegramHtml(text));
    if (result.success) {
      return NextResponse.json({ mode: "sent", channel: "TELEGRAM", text });
    }
    // не вдалося — падаємо на ручний варіант нижче
  }

  if (s.contactChannel === "VIBER") {
    return NextResponse.json({
      mode: "manual",
      channel: "VIBER",
      text,
      viberPhone: normalizeViberPhone(s.viberPhone || s.phone),
    });
  }

  return NextResponse.json({
    mode: "manual",
    channel: "TELEGRAM",
    text,
    telegramUsername: s.telegramUsername ? s.telegramUsername.replace(/^@/, "").trim() : null,
  });
}
