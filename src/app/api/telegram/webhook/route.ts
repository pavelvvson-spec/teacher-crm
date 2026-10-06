import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  sendTelegramMessageWithKeyboard,
  answerTelegramCallbackQuery,
  editTelegramMessageText,
} from "@/lib/telegram";
import { checkAndMaybeSendSummary, settleStudentPeriodicPayments } from "@/lib/daily-checkup";

const HOMEWORK_BUTTON_TEXT = "📚 Отримати домашнє завдання";

function formatLessonDateTimeKyiv(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

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
      await sendTelegramMessageWithKeyboard(
        chatId,
        `Привіт, ${student.firstName}! Тепер ви будете отримувати нагадування про уроки в цьому чаті.`,
        [HOMEWORK_BUTTON_TEXT]
      );
    } else {
      await sendTelegramMessage(
        chatId,
        `Привіт! Не вдалося знайти вас у списку учнів за username. Попросіть викладача перевірити, чи правильно вказано ваш Telegram username у системі.`
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (text === HOMEWORK_BUTTON_TEXT || text === "/homework") {
    await handleHomeworkRequest(chatId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

async function handleHomeworkRequest(chatId: string) {
  const student = await prisma.student.findFirst({
    where: { telegramChatId: chatId },
  });

  if (!student) {
    await sendTelegramMessage(
      chatId,
      `Не вдалося знайти вас у системі. Попросіть викладача перевірити підключення.`
    );
    return;
  }

  const nextLesson = await prisma.lesson.findFirst({
    where: {
      studentId: student.id,
      startAt: { gte: new Date() },
      status: "SCHEDULED",
    },
    orderBy: { startAt: "asc" },
  });

  if (!nextLesson) {
    await sendTelegramMessage(chatId, `У вас поки немає запланованих уроків.`);
    return;
  }

  if (!nextLesson.homework) {
    await sendTelegramMessage(
      chatId,
      `На жаль, домашнє завдання до наступного уроку ще не задано. Зверніться до викладача.`
    );

    const settings = await prisma.settings.findFirst();
    if (settings?.teacherTelegramChatId) {
      const dateLabel = formatLessonDateTimeKyiv(nextLesson.startAt);
      await sendTelegramMessage(
        settings.teacherTelegramChatId,
        `⚠️ ${student.firstName} ${student.lastName ?? ""} просив(ла) домашнє завдання до уроку ${dateLabel}, але воно ще не внесене в CRM.`
      );
    }
    return;
  }

  await sendTelegramMessage(
    chatId,
    `📚 Домашнє завдання\n\n${nextLesson.homework}\n\nУспіхів! 😊`
  );
}

async function handleCallbackQuery(callbackQuery: {
  id: string;
  data?: string;
  message?: { chat?: { id: number }; message_id?: number };
}) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message?.chat?.id ? String(callbackQuery.message.chat.id) : undefined;
  const messageId = callbackQuery.message?.message_id;

  if (!data) {
    await answerTelegramCallbackQuery(callbackQuery.id);
    return;
  }

  if (data.startsWith("chk:")) {
    const parts = data.split(":");
    const lessonId = parts[1];
    const code = parts[2]; // "1" = проведено+оплачено, "2" = проведено, не оплачено, "3" = проведено (передоплата), "0" = не відбувся

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { student: true },
    });

    if (!lesson) {
      await answerTelegramCallbackQuery(callbackQuery.id, "Урок не знайдено");
      return;
    }

    // «Не відбувся»: спочатку уточнюємо, чи оплачується цей урок
    if (code === "0") {
      await answerTelegramCallbackQuery(callbackQuery.id, "Уточнюю");

      if (messageId && chatId) {
        await editTelegramMessageText(
          chatId,
          messageId,
          `📋 Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""}\n\n❌ Не відбувся (уточнюю оплату нижче)`
        );
      }

      if (chatId) {
        await sendTelegramMessageWithButtons(
          chatId,
          `❓ Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""} (${formatLessonDateTimeKyiv(lesson.startAt)}, ${lesson.price} грн) не відбувся.\n\nЦей урок оплачується?`,
          [
            [{ text: "💰 Так, оплачується", callback_data: `nsw:${lessonId}:1` }],
            [{ text: "🚫 Ні, не оплачується", callback_data: `nsw:${lessonId}:0` }],
          ]
        );
      }

      return;
    }

    let resultLabel: string;
    const updateData: { status: "COMPLETED" | "NO_SHOW"; paymentStatus?: "PAID" } = {
      status: "COMPLETED",
    };

    if (code === "1") {
      updateData.paymentStatus = "PAID";
      resultLabel = "✅ Проведено, оплачено";
    } else if (code === "2") {
      resultLabel = "🟡 Проведено, не оплачено";
    } else if (code === "3") {
      resultLabel = "✅ Проведено (покрито передоплатою)";
    } else {
      updateData.status = "NO_SHOW";
      resultLabel = "❌ Не відбувся";
    }

    await prisma.lesson.update({
      where: { id: lessonId },
      data: updateData,
    });

    await answerTelegramCallbackQuery(callbackQuery.id, "Збережено");

    if (messageId && chatId) {
      await editTelegramMessageText(
        chatId,
        messageId,
        `📋 Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""}\n\n${resultLabel}`
      );
    }

    await checkAndMaybeSendSummary();
    return;
  }

  if (data.startsWith("nsw:")) {
    const parts = data.split(":");
    const lessonId = parts[1];
    const code = parts[2]; // "1" = не з'явився, але оплачується, "0" = не оплачується

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { student: true },
    });

    if (!lesson) {
      await answerTelegramCallbackQuery(callbackQuery.id, "Урок не знайдено");
      return;
    }

    if (lesson.status !== "SCHEDULED") {
      await answerTelegramCallbackQuery(callbackQuery.id, "Цей урок вже відмічено");
      return;
    }

    const studentName = `${lesson.student.firstName} ${lesson.student.lastName ?? ""}`;
    let resultLabel: string;

    if (code === "1") {
      const noteLine = "Не з'явився, урок оплачується";
      const teacherNotes = lesson.teacherNotes ? `${lesson.teacherNotes}\n${noteLine}` : noteLine;
      await prisma.lesson.update({
        where: { id: lessonId },
        data: { status: "COMPLETED", teacherNotes },
      });
      resultLabel = "💰 Не відбувся, але урок оплачується (рахується як проведений)";
    } else {
      await prisma.lesson.update({
        where: { id: lessonId },
        data: { status: "NO_SHOW" },
      });
      resultLabel = "🚫 Не відбувся, не оплачується";
    }

    await answerTelegramCallbackQuery(callbackQuery.id, "Збережено");

    if (messageId && chatId) {
      await editTelegramMessageText(chatId, messageId, `📋 Урок з ${studentName}\n\n${resultLabel}`);
    }

    await checkAndMaybeSendSummary();
    return;
  }

  if (data.startsWith("pay:")) {
    const parts = data.split(":");
    const lessonId = parts[1];
    const code = parts[2]; // "1" = оплачено, "0" = ще ні

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { student: true },
    });

    if (!lesson) {
      await answerTelegramCallbackQuery(callbackQuery.id, "Урок не знайдено");
      return;
    }

    if (code === "1") {
      await prisma.lesson.update({
        where: { id: lessonId },
        data: { paymentStatus: "PAID" },
      });

      await answerTelegramCallbackQuery(callbackQuery.id, "Збережено");

      if (messageId && chatId) {
        await editTelegramMessageText(
          chatId,
          messageId,
          `💰 Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""}\n\n✅ Оплачено`
        );
      }
    } else {
      await answerTelegramCallbackQuery(callbackQuery.id, "Добре, запитаю завтра знову");

      if (messageId && chatId) {
        await editTelegramMessageText(
          chatId,
          messageId,
          `💰 Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""}\n\n⏳ Ще не оплачено (запитаю завтра знову)`
        );
      }
    }

    return;
  }

  if (data.startsWith("paybulkno:")) {
    const studentId = data.split(":")[1];
    const student = await prisma.student.findUnique({ where: { id: studentId } });

    await answerTelegramCallbackQuery(callbackQuery.id, "Добре, запитаю завтра знову");

    if (messageId && chatId) {
      await editTelegramMessageText(
        chatId,
        messageId,
        `💰 ${student ? `${student.firstName} ${student.lastName ?? ""}` : "Учень"}\n\n⏳ Ще не оплачено (запитаю завтра знову)`
      );
    }

    return;
  }

  if (data.startsWith("paybulk:")) {
    const studentId = data.split(":")[1];
    const result = await settleStudentPeriodicPayments(studentId);

    if (!result) {
      await answerTelegramCallbackQuery(callbackQuery.id, "Учня не знайдено");
      return;
    }

    await answerTelegramCallbackQuery(callbackQuery.id, "Збережено");

    if (messageId && chatId) {
      await editTelegramMessageText(
        chatId,
        messageId,
        `💰 ${result.studentName}\n\n✅ Оплачено все (${result.count} ур., ${result.total} грн)`
      );
    }

    return;
  }

  await answerTelegramCallbackQuery(callbackQuery.id);
}