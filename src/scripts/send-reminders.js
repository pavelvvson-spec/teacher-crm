require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TELEGRAM_API = "https://api.telegram.org/bot";

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.description || "Помилка відправки" };
    }
    return { success: true, messageId: data.result.message_id };
  } catch {
    return { success: false, error: "Не вдалося з'єднатися з Telegram" };
  }
}

function buildMessage(student, lesson, reminderType) {
  const date = new Date(lesson.startAt);
  const dateStr = date.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
  const timeStr = date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  const when = reminderType === "H24" ? `завтра` : `сьогодні`;

  let text = `Привіт, ${student.firstName}! Нагадуємо, що ${when} (${dateStr}) о ${timeStr} у вас урок англійської мови.`;
  if (lesson.meetingLink) {
    text += `\n\nПосилання на урок: ${lesson.meetingLink}`;
  }
  text += `\n\nЯкщо потрібно перенести заняття, напишіть викладачу.`;
  return text;
}

async function processReminders(reminderType, hoursAhead) {
  const now = new Date();
  const targetTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  const windowStart = new Date(targetTime.getTime() - 5 * 60 * 1000);
  const windowEnd = new Date(targetTime.getTime() + 5 * 60 * 1000);

  const lessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: windowStart, lte: windowEnd },
      status: "SCHEDULED",
    },
    include: { student: true },
  });

  for (const lesson of lessons) {
    const student = lesson.student;

    if (!student.telegramChatId) continue;

    const alreadySent = await prisma.reminder.findFirst({
      where: { lessonId: lesson.id, reminderType },
    });
    if (alreadySent) continue;

    const text = buildMessage(student, lesson, reminderType);
    const result = await sendTelegramMessage(student.telegramChatId, text);

    await prisma.reminder.create({
      data: {
        lessonId: lesson.id,
        studentId: student.id,
        reminderType,
        scheduledAt: targetTime,
        sentAt: result.success ? new Date() : null,
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.error || null,
        telegramMessageId: result.messageId ? String(result.messageId) : null,
      },
    });

    console.log(
      `${reminderType} для ${student.firstName} (урок ${lesson.id}): ${
        result.success ? "надіслано" : "помилка: " + result.error
      }`
    );
  }
}

async function main() {
  await processReminders("H24", 24);
  await processReminders("H2", 2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());