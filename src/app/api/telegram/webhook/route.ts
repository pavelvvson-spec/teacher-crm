import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.message) {
    return NextResponse.json({ ok: true });
  }

  const message = body.message;
  const chatId = String(message.chat.id);
  const text: string | undefined = message.text;
  const username: string | undefined = message.from?.username;

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