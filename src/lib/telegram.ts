import { isDemoRequest } from "@/lib/demo-mode";
const TELEGRAM_API = "https://api.telegram.org/bot";

export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  if (await isDemoRequest()) return { success: false, error: "Демо-режим: повідомлення не надсилаються" };
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

export type TelegramInlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export async function sendTelegramMessageWithButtons(
  chatId: string,
  text: string,
  buttonRows: TelegramInlineButton[][]
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  if (await isDemoRequest()) return { success: false, error: "Демо-режим: повідомлення не надсилаються" };
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
        reply_markup: {
          inline_keyboard: buttonRows,
        },
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

export async function sendTelegramMessageWithKeyboard(
  chatId: string,
  text: string,
  buttonLabels: string[]
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  if (await isDemoRequest()) return { success: false, error: "Демо-режим: повідомлення не надсилаються" };
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
        reply_markup: {
          keyboard: [buttonLabels.map((label) => ({ text: label }))],
          resize_keyboard: true,
          is_persistent: true,
        },
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

export async function editTelegramMessageText(
  chatId: string,
  messageId: number,
  text: string
): Promise<{ success: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return { success: false, error: "Не налаштовано TELEGRAM_BOT_TOKEN" };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      return { success: false, error: data.description || "Помилка редагування" };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Не вдалося з'єднатися з Telegram" };
  }
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
  } catch {
    // ігноруємо помилку відповіді на callback — не критично
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

// Екранує текст для parse_mode HTML (відповіді ШІ можуть містити < > &)
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Показує «друкує...» у чаті, поки ШІ готує відповідь
export async function sendTelegramTyping(chatId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });
  } catch {
    // не критично
  }
}

// Надсилає довгий текст частинами (ліміт Telegram — 4096 символів).
// Кнопки (якщо є) додаються до останньої частини. Текст — звичайний (НЕ HTML), екранується тут.
export async function sendLongTelegramMessage(
  chatId: string,
  text: string,
  buttonRows?: TelegramInlineButton[][]
): Promise<void> {
  const LIMIT = 3800;
  const parts: string[] = [];
  let rest = text;
  while (rest.length > LIMIT) {
    let cut = rest.lastIndexOf("\n", LIMIT);
    if (cut < LIMIT / 2) cut = LIMIT;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  parts.push(rest);

  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    if (isLast && buttonRows && buttonRows.length > 0) {
      await sendTelegramMessageWithButtons(chatId, escapeTelegramHtml(parts[i]), buttonRows);
    } else {
      await sendTelegramMessage(chatId, escapeTelegramHtml(parts[i]));
    }
  }
}

// Надсилає вже готовий HTML (з <b>, <i>, <s>) частинами по абзацах, щоб не розірвати теги.
// Увесь змінний текст усередині має бути екранований через escapeTelegramHtml.
export async function sendTelegramHtmlMessage(
  chatId: string,
  html: string,
  buttonRows?: TelegramInlineButton[][]
): Promise<void> {
  const LIMIT = 3800;
  const blocks = html.split("\n\n");
  const parts: string[] = [];
  let cur = "";
  for (const b of blocks) {
    const next = cur ? `${cur}\n\n${b}` : b;
    if (next.length > LIMIT && cur) {
      parts.push(cur);
      cur = b;
    } else {
      cur = next;
    }
  }
  if (cur) parts.push(cur);

  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    if (isLast && buttonRows && buttonRows.length > 0) {
      await sendTelegramMessageWithButtons(chatId, parts[i], buttonRows);
    } else {
      await sendTelegramMessage(chatId, parts[i]);
    }
  }
}

// Завантажує файл, надісланий у Telegram (фото, документ)
export async function downloadTelegramFile(
  fileId: string
): Promise<{ data: ArrayBuffer; path: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const meta = await fetch(`${TELEGRAM_API}${token}/getFile?file_id=${encodeURIComponent(fileId)}`).then((r) =>
      r.json()
    );
    const path: string | undefined = meta?.result?.file_path;
    if (!path) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
    if (!res.ok) return null;
    return { data: await res.arrayBuffer(), path };
  } catch {
    return null;
  }
}
