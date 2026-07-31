const TELEGRAM_API = "https://api.telegram.org/bot";

export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return { success: false, error: "Не налаштовано TELEGRAM_BOT_TOKEN" };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
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

export function buildReminderMessage(params: {
  studentFirstName: string;
  lessonDate: string;
  lessonTime: string;
  meetingLink: string | null;
}): string {
  const { studentFirstName, lessonDate, lessonTime, meetingLink } = params;
  let text = `Привіт, ${studentFirstName}! Нагадуємо, що ${lessonDate} о ${lessonTime} у вас урок англійської мови.`;
  if (meetingLink) {
    text += `\n\nПосилання на урок: ${meetingLink}`;
  }
  text += `\n\nЯкщо потрібно перенести заняття, напишіть викладачу.`;
  return text;
}