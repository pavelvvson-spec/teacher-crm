// Fireflies → журнал учня.
// Після уроку Fireflies надсилає вебхук (або ми самі перевіряємо нові записи раз на день),
// CRM забирає текст уроку, визначає урок/учня, Claude робить стислий запис у журнал,
// а вчительці приходить повідомлення в Telegram.
//
// Змінні Vercel: FIREFLIES_API_KEY, FIREFLIES_WEBHOOK_SECRET.
// Ліміт Fireflies API на безкоштовному тарифі — 50 запитів на добу, тому запитів робимо мінімум.

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/anthropic";
import { sendLongTelegramMessage } from "@/lib/telegram";

const API = "https://api.fireflies.ai/graphql";
const TEACHER_NAME_HINTS = ["олександра", "oleksandra", "aleksandra", "саша", "sasha", "tokarchuk", "васютинськ"];

export function isFirefliesConfigured() {
  return Boolean(process.env.FIREFLIES_API_KEY);
}

export function verifyFirefliesSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = header.replace(/^sha256=/, "").trim();
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(got, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const key = process.env.FIREFLIES_API_KEY;
  if (!key) throw new Error("Не налаштовано FIREFLIES_API_KEY");
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) {
    const msg = data?.errors?.[0]?.message || `код ${res.status}`;
    throw new Error(`Fireflies: ${msg}`);
  }
  return data.data as T;
}

type Transcript = {
  id: string;
  title: string | null;
  date: number | null;
  duration: number | null;
  calendar_id: string | null;
  cal_id: string | null;
  sentences: { speaker_name: string | null; text: string | null; start_time: number | null }[] | null;
};

async function fetchTranscript(id: string): Promise<Transcript | null> {
  const data = await gql<{ transcript: Transcript | null }>(
    `query T($id: String!) {
      transcript(id: $id) {
        id title date duration calendar_id cal_id
        sentences { speaker_name text start_time }
      }
    }`,
    { id }
  );
  return data.transcript;
}

// Наші події в календарі мають id "crm" + hex(id уроку)
function lessonIdFromEventId(eventId: string | null | undefined): string | null {
  if (!eventId) return null;
  const base = eventId.split("_")[0];
  if (!base.startsWith("crm")) return null;
  try {
    const decoded = Buffer.from(base.slice(3), "hex").toString("utf8");
    return decoded && /^[a-z0-9]+$/i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

async function findLesson(t: Transcript) {
  for (const evId of [t.calendar_id, t.cal_id]) {
    const lessonId = lessonIdFromEventId(evId);
    if (lessonId) {
      const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { student: true } });
      if (lesson) return lesson;
    }
  }
  // Запасний варіант — урок, найближчий за часом початку (± 40 хв)
  if (!t.date) return null;
  const start = new Date(Number(t.date));
  const window = 40 * 60 * 1000;
  const candidates = await prisma.lesson.findMany({
    where: { startAt: { gte: new Date(start.getTime() - window), lte: new Date(start.getTime() + window) } },
    include: { student: true },
  });
  candidates.sort(
    (a, b) => Math.abs(a.startAt.getTime() - start.getTime()) - Math.abs(b.startAt.getTime() - start.getTime())
  );
  return candidates[0] ?? null;
}

function isTeacher(name: string | null) {
  const n = (name ?? "").toLowerCase();
  return TEACHER_NAME_HINTS.some((h) => n.includes(h));
}

function transcriptToText(t: Transcript, maxChars = 45000): string {
  const lines: string[] = [];
  let total = 0;
  for (const s of t.sentences ?? []) {
    if (!s.text) continue;
    const who = isTeacher(s.speaker_name) ? "Вчителька" : `Учень (${s.speaker_name ?? "?"})`;
    const line = `${who}: ${s.text}`;
    if (total + line.length > maxChars) {
      lines.push("…(далі текст обрізано)");
      break;
    }
    lines.push(line);
    total += line.length;
  }
  return lines.join("\n");
}

const SUMMARY_PROMPT = `Ти — асистент вчительки англійської. Тобі дають автоматичний транскрипт індивідуального онлайн-уроку (розпізнавання мови неточне, особливо дитячих коротких відповідей і суміші української з англійською).
Зроби короткий запис у журнал учня українською — для вчительки і для ШІ, який потім готуватиме наступні уроки.

Важливо:
- Пісні, відео й аудіо, які вмикала вчителька, транскрипт часто приписує учню. Довгі рівні англійські фрагменти на кшталт пісень НЕ вважай мовленням учня.
- Не вигадуй. Якщо щось не зрозуміло з транскрипту — не пиши про це.
- Англійські слова й фрази — англійською.

Формат (звичайний текст, без markdown-заголовків):
Теми і що робили: ...
Що вийшло добре: ...
Труднощі / помилки: ...
ДЗ і що повторити: ...
На що звернути увагу наступного разу: 1-2 пункти
Разом до ~12 рядків.`;

export type ProcessResult =
  | { status: "saved"; studentName: string; entryId: string }
  | { status: "skipped"; reason: string };

export async function processFirefliesMeeting(meetingId: string, notify = true): Promise<ProcessResult> {
  const exists = await prisma.studentJournalEntry.findUnique({ where: { externalId: meetingId } });
  if (exists) return { status: "skipped", reason: "вже в журналі" };

  const t = await fetchTranscript(meetingId);
  if (!t) return { status: "skipped", reason: "запис не знайдено у Fireflies" };
  if (!t.sentences || t.sentences.length < 5) return { status: "skipped", reason: "транскрипт порожній або ще не готовий" };

  const lesson = await findLesson(t);
  if (!lesson) {
    if (notify) await notifyTeacher(`🎧 Fireflies записав «${t.title ?? "зустріч"}», але я не знайшла відповідний урок у CRM — у журнал не додано.`);
    return { status: "skipped", reason: "не знайдено урок у CRM" };
  }

  const name = `${lesson.student.firstName} ${lesson.student.lastName ?? ""}`.trim();
  const dateLabel = lesson.startAt.toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const input = `УЧЕНЬ: ${name}, рівень ${lesson.student.englishLevel}
Нотатки про учня: ${lesson.student.notes || "немає"}
УРОК: ${dateLabel}, ${Math.round(Number(t.duration ?? 0))} хв
План/нотатка вчительки до уроку: ${lesson.teacherNotes ? lesson.teacherNotes.slice(0, 2000) : "немає"}

ТРАНСКРИПТ
${transcriptToText(t)}`;

  const ai = await callClaude(SUMMARY_PROMPT, input, 1200);
  if (!ai.ok) {
    if (notify) await notifyTeacher(`⚠️ Не вдалося обробити запис уроку з ${name}: ${ai.error}`);
    return { status: "skipped", reason: ai.error };
  }

  const content = `Урок ${dateLabel} (запис Fireflies)\n${ai.text.trim()}`;
  let entryId: string;
  try {
    const entry = await prisma.studentJournalEntry.create({
      data: { studentId: lesson.studentId, lessonId: lesson.id, content, source: "FIREFLIES", externalId: meetingId },
    });
    entryId = entry.id;
  } catch {
    // паралельна обробка того самого запису — вже збережено
    return { status: "skipped", reason: "вже в журналі" };
  }

  if (notify) {
    await sendTeacherWithUndo(`🎧 Урок з ${name} (${dateLabel}) — записала в журнал:\n\n${ai.text.trim()}`, entryId);
  }
  return { status: "saved", studentName: name, entryId };
}

// Перевірка нових записів за останні N годин (раз на добу + вручну з налаштувань)
export async function pollRecentMeetings(hours = 30) {
  const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const data = await gql<{ transcripts: { id: string }[] }>(
    `query L($fromDate: DateTime, $limit: Int) { transcripts(fromDate: $fromDate, limit: $limit, mine: true) { id } }`,
    { fromDate: from, limit: 20 }
  );
  const ids = (data.transcripts ?? []).map((x) => x.id);
  const known = await prisma.studentJournalEntry.findMany({
    where: { externalId: { in: ids } },
    select: { externalId: true },
  });
  const knownSet = new Set(known.map((k) => k.externalId));
  const results: ProcessResult[] = [];
  for (const id of ids) {
    if (knownSet.has(id)) continue;
    results.push(await processFirefliesMeeting(id, true));
  }
  return { checked: ids.length, saved: results.filter((r) => r.status === "saved").length, results };
}

async function teacherChatId() {
  const s = await prisma.settings.findFirst();
  return s?.teacherTelegramChatId ?? null;
}

async function notifyTeacher(text: string) {
  const chatId = await teacherChatId();
  if (chatId) await sendLongTelegramMessage(chatId, text);
}

async function sendTeacherWithUndo(text: string, entryId: string) {
  const chatId = await teacherChatId();
  if (chatId) {
    await sendLongTelegramMessage(chatId, text, [
      [{ text: "↩️ Прибрати з журналу", callback_data: `jdel:${entryId}` }],
    ]);
  }
}
