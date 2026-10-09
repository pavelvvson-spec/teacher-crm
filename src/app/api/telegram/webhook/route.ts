import { NextRequest, NextResponse } from "next/server";
import { noShowPaidNote } from "@/lib/gender";
import { prisma } from "@/lib/prisma";
import { advanceTextbookAfterLesson } from "@/lib/textbook";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  sendTelegramMessageWithKeyboard,
  answerTelegramCallbackQuery,
  editTelegramMessageText,
} from "@/lib/telegram";
import { checkAndMaybeSendSummary, settleStudentPeriodicPayments } from "@/lib/daily-checkup";
import { calculateStudentBalance } from "@/lib/payments-utils";
import { handleTeacherMessage, handleAssistantCallback } from "@/lib/teacher-assistant";
import { transcribeTelegramFile } from "@/lib/transcribe";
import { downloadTelegramFile } from "@/lib/telegram";
import { addInbox } from "@/lib/methodology";
import { put } from "@vercel/blob";
import { escapeTelegramHtml } from "@/lib/telegram";

// Відповідь ШІ-помічника може тривати до ~30 секунд
export const maxDuration = 60;

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

type RecordResult = "created" | "already";

// Фіксує оплату за урок як окремий запис оплати (з датою).
// Нічого не створює, якщо гроші за цей урок уже враховані:
// - урок має стару позначку «оплачено»;
// - є оплата, прив'язана до цього уроку;
// - баланс учня вже покриває цей урок (наприклад, оплату внесли вручну на сторінці «Оплати»).
async function recordLessonPayment(lesson: {
  id: string;
  studentId: string;
  price: number;
  paymentStatus: string;
}): Promise<RecordResult> {
  if (lesson.paymentStatus === "PAID") return "already";

  const existing = await prisma.payment.findFirst({
    where: { lessonId: lesson.id, status: "PAID" },
  });
  if (existing) return "already";

  if (!lesson.price || lesson.price <= 0) {
    // Ціни немає — запасний варіант: стара позначка на уроці
    await prisma.lesson.update({
      where: { id: lesson.id },
      data: { paymentStatus: "PAID" },
    });
    return "created";
  }

  // Перевіряємо загальний баланс учня (урок уже позначено проведеним, тож він врахований)
  const student = await prisma.student.findUnique({
    where: { id: lesson.studentId },
    include: { lessons: true, payments: true },
  });
  if (!student) return "already";

  const balance = calculateStudentBalance(student.lessons, student.payments, student.paymentFrequency);
  if (balance <= 0) {
    // Борга немає: урок уже покритий раніше внесеними оплатами
    return "already";
  }

  // Якщо частину вже покрито (залишок передоплати), записуємо лише різницю
  const amount = Math.min(lesson.price, balance);

  await prisma.payment.create({
    data: {
      studentId: lesson.studentId,
      lessonId: lesson.id,
      amount,
      status: "PAID",
      paidAt: new Date(),
      comment: "Через Telegram",
    },
  });
  return "created";
}

export async function POST(request: NextRequest) {
  // Якщо задано TELEGRAM_WEBHOOK_SECRET, приймаємо лише запити від Telegram з цим секретом
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

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

    // Чат вчительки вже підключено — інший чат не може його перехопити
    if (existingSettings?.teacherTelegramChatId && existingSettings.teacherTelegramChatId !== chatId) {
      await sendTelegramMessage(
        chatId,
        `Чат вчительки вже підключено. Якщо потрібно підключити інший чат, спершу відключіть поточний у CRM: Telegram → «Відключити чат вчительки».`
      );
      return NextResponse.json({ ok: true });
    }

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

  // ШІ-помічник: лише для чату вчительки
  const settings = await prisma.settings.findFirst();
  if (settings?.teacherTelegramChatId && settings.teacherTelegramChatId === chatId) {
    if (text && !text.startsWith("/")) {
      try {
        await handleTeacherMessage(chatId, text, String(body.update_id ?? message.message_id));
      } catch (e) {
        console.error("Teacher assistant error", e);
        await sendTelegramMessage(chatId, "⚠️ Сталася помилка. Спробуйте ще раз трохи пізніше.");
      }
    } else if (Array.isArray(message.photo) && message.photo.length > 0) {
      // Фото / скріншот від вчительки → скринька методики
      try {
        const largest = message.photo[message.photo.length - 1];
        const file = await downloadTelegramFile(largest.file_id);
        if (!file) {
          await sendTelegramMessage(chatId, "⚠️ Не вдалося отримати фото з Telegram.");
        } else {
          const ext = file.path.split(".").pop() || "jpg";
          const blob = await put(`methodology/tg-${Date.now()}.${ext}`, new Blob([file.data], { type: "image/jpeg" }), {
            access: "public",
            token: process.env.BLOB2_READ_WRITE_TOKEN,
          });
          const caption = typeof message.caption === "string" ? message.caption.trim() : "";
          await addInbox("IMAGE", caption || "Скріншот з Telegram", blob.url);
          await sendTelegramMessage(
            chatId,
            "🖼 Додала фото в скриньку методики. Вбудувати: Налаштування → Моя методика → «Оновити методику»."
          );
        }
      } catch (e) {
        console.error("Photo to methodology error", e);
        await sendTelegramMessage(chatId, "⚠️ Не вдалося зберегти фото. Спробуйте ще раз.");
      }
    } else if (message.voice || message.audio) {
      const media = message.voice ?? message.audio;
      if (Number(media.duration) > 300) {
        await sendTelegramMessage(
          chatId,
          "🎙️ Голосове задовге — до 5 хвилин, будь ласка. Розбийте на кілька коротших."
        );
      } else {
        try {
          const result = await transcribeTelegramFile(media.file_id);
          if (!result.ok) {
            await sendTelegramMessage(chatId, `⚠️ ${escapeTelegramHtml(result.error)}`);
          } else {
            await sendTelegramMessage(chatId, `🎙️ Почула: «${escapeTelegramHtml(result.text)}»`);
            await handleTeacherMessage(
              chatId,
              result.text,
              String(body.update_id ?? message.message_id),
              "VOICE"
            );
          }
        } catch (e) {
          console.error("Voice handling error", e);
          await sendTelegramMessage(chatId, "⚠️ Не вдалося обробити голосове. Спробуйте ще раз.");
        }
      }
    }
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
        `⚠️ ${student.firstName} ${student.lastName ?? ""} ${student.gender === "F" ? "просила" : student.gender === "M" ? "просив" : "просив(ла)"} домашнє завдання до уроку ${dateLabel}, але воно ще не внесене в CRM.`
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

  // Кнопки ШІ-помічника — лише з чату вчительки
  if (data.startsWith("jdel:") || data.startsWith("prepsave:")) {
    const settings = await prisma.settings.findFirst();
    if (!chatId || settings?.teacherTelegramChatId !== chatId) {
      await answerTelegramCallbackQuery(callbackQuery.id);
      return;
    }
    const result = await handleAssistantCallback(data);
    await answerTelegramCallbackQuery(callbackQuery.id, result.toast || undefined);
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
    const updateData: { status: "COMPLETED" | "NO_SHOW" } = {
      status: "COMPLETED",
    };

    if (code === "1") {
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
    if (updateData.status === "COMPLETED") await advanceTextbookAfterLesson(lessonId);

    // «Оплачено» створює окрему оплату з датою, лише якщо урок ще не покритий
    if (code === "1") {
      const result = await recordLessonPayment(lesson);
      if (result === "already") {
        resultLabel = "✅ Проведено, оплачено (оплату вже було внесено раніше, нову не створено)";
      }
    }

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
      const noteLine = noShowPaidNote(lesson.student.gender);
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
      // Окрема оплата з датою, лише якщо урок ще не покритий
      const result = await recordLessonPayment(lesson);

      await answerTelegramCallbackQuery(callbackQuery.id, "Збережено");

      if (messageId && chatId) {
        const label =
          result === "already"
            ? "✅ Оплачено (оплату вже було внесено раніше, нову не створено)"
            : "✅ Оплачено";
        await editTelegramMessageText(
          chatId,
          messageId,
          `💰 Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""}\n\n${label}`
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