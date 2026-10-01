import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendTelegramMessage,
  answerTelegramCallbackQuery,
  editTelegramMessageText,
} from "@/lib/telegram";
import { checkAndMaybeSendSummary } from "@/lib/daily-checkup";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ ok: true });
  }

  if (body.callback_query) {
    await handleCallbackQuery(body.callback_query);
    return NextResponse.json({ ok: true });
  }

  if (!body.message) {
    return NextResponse.json({ ok: true });
  }

  const message = body.message;
  const chatId = String(message.chat.id);
  const text: string | undefined = message.text;
  const username: string | undefined = message.from?.username;

  if (text === "/start_teacher") {
    const existingSettings = await prisma.settings.findFirst();

    if (existingSettings) {
      await prisma.settings.update({
        where: { id: existingSettings.id },
        data: { teacherTelegramChatId: chatId },
      });
    } else {
      await prisma.settings.create({
        data: {
          teacherName: "Вчитель",
          teacherTelegramChatId: chatId,
        },
      });
    }

    await sendTelegramMessage(
      chatId,
      `Готово! Тепер вечірні чекапи та звіти по уроках будуть приходити в цей чат.`
    );

    return NextResponse.json({ ok: true });
  }

  if (text?.startsWith("/start")) {
    let student = null;

    if (username) {
      student = await prisma.student.findFirst({
        where: {
          telegramUsername: {
            in: [username, `@${username}`],
          },
        },
      });
    }

    if (student) {
      await prisma.student.update({
        where: { id: student.id },
        data: { telegramChatId: chatId },
      });
      await sendTelegramMessage(
        chatId,
        `Привіт, ${student.firstName}! Тепер ви будете отримувати нагадування про уроки в цьому чаті.`
      );
    } else {
      await sendTelegramMessage(
        chatId,
        `Привіт! Не вдалося знайти вас у списку учнів за username. Попросіть викладача перевірити, чи правильно вказано ваш Telegram username у системі.`
      );
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleCallbackQuery(callbackQuery: {
  id: string;
  data?: string;
  message?: { chat?: { id: number }; message_id?: number };
}) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message?.chat?.id ? String(callbackQuery.message.chat.id) : undefined;
  const messageId = callbackQuery.message?.message_id;

  if (!data || !data.startsWith("c:")) {
    await answerTelegramCallbackQuery(callbackQuery.id);
    return;
  }

  const parts = data.split(":");
  const lessonId = parts[1];
  const outcome = parts[2]; // "1" = проведено, "0" = не відбувся

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { student: true },
  });

  if (!lesson) {
    await answerTelegramCallbackQuery(callbackQuery.id, "Урок не знайдено");
    return;
  }

  const newStatus = outcome === "1" ? "COMPLETED" : "NO_SHOW";

  await prisma.lesson.update({
    where: { id: lessonId },
    data: { status: newStatus },
  });

  await answerTelegramCallbackQuery(callbackQuery.id, "Збережено");

  if (messageId && chatId) {
    const resultLabel = outcome === "1" ? "✅ Проведено" : "❌ Не відбувся";
    await editTelegramMessageText(
      chatId,
      messageId,
      `📋 Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""}\n\n${resultLabel}`
    );
  }

  await checkAndMaybeSendSummary();
}