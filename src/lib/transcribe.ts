// Розпізнавання голосових повідомлень з Telegram через Groq (модель Whisper).
// Ключ — лише у змінних Vercel: GROQ_API_KEY.

const TELEGRAM_API = "https://api.telegram.org";

export type TranscribeResult = { ok: true; text: string } | { ok: false; error: string };

export async function transcribeTelegramFile(fileId: string): Promise<TranscribeResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groqKey = process.env.GROQ_API_KEY;
  if (!botToken) return { ok: false, error: "Не налаштовано TELEGRAM_BOT_TOKEN" };
  if (!groqKey) return { ok: false, error: "Не налаштовано ключ розпізнавання голосу (GROQ_API_KEY у Vercel)" };

  // 1) Отримуємо шлях до файлу в Telegram
  let filePath: string | undefined;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const data = await res.json();
    filePath = data?.result?.file_path;
  } catch {
    // нижче повернемо помилку
  }
  if (!filePath) return { ok: false, error: "Не вдалося отримати голосове з Telegram" };

  // 2) Завантажуємо аудіо
  let audio: ArrayBuffer;
  try {
    const res = await fetch(`${TELEGRAM_API}/file/bot${botToken}/${filePath}`);
    if (!res.ok) return { ok: false, error: "Не вдалося завантажити голосове з Telegram" };
    audio = await res.arrayBuffer();
  } catch {
    return { ok: false, error: "Не вдалося завантажити голосове з Telegram" };
  }

  // 3) Розпізнаємо
  const fileName = filePath.split("/").pop() || "voice.ogg";
  const form = new FormData();
  form.append("file", new Blob([audio]), fileName.endsWith(".oga") ? fileName.replace(/\.oga$/, ".ogg") : fileName);
  form.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3");
  form.append("language", "uk");
  form.append(
    "prompt",
    "Вчителька англійської мови розповідає про своїх учнів і уроки. Можуть траплятися англійські слова і терміни: Present Simple, Past Simple, has, have, homework, vocabulary, speaking."
  );
  form.append("response_format", "json");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Groq STT error", res.status, errText);
      return {
        ok: false,
        error: res.status === 401 ? "Неправильний ключ розпізнавання голосу" : `Помилка розпізнавання (код ${res.status})`,
      };
    }
    const data = await res.json();
    const text = String(data?.text ?? "").trim();
    if (!text) return { ok: false, error: "Не вдалося розібрати слова в голосовому" };
    return { ok: true, text };
  } catch {
    return { ok: false, error: "Не вдалося зв'язатися із сервісом розпізнавання" };
  }
}
