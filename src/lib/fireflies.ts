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
import { methodContext, ageInfo } from "@/lib/pedagogy";
import { addObservations } from "@/lib/methodology";
import { sendLongTelegramMessage, sendTelegramHtmlMessage, escapeTelegramHtml } from "@/lib/telegram";

const API = "https://api.fireflies.ai/graphql";
const TEACHER_NAME_HINTS = ["олександра", "oleksandra", "aleksandra", "саша", "sasha", "tokarchuk", "васютинськ"];

export function isFirefliesConfigured() {
  return Boolean(process.env.FIREFLIES_API_KEY);
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Перевірка, що запит справді від Fireflies.
// Приймаємо підпис HMAC-SHA256 (hex або base64, з префіксом "sha256=" чи без)
// у будь-якому з відомих заголовків, або секрет у параметрі адреси ?token=...
export function verifyFirefliesRequest(
  rawBody: string,
  headers: Headers,
  urlToken: string | null
): { ok: boolean; debug: string } {
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET?.trim();
  if (!secret) return { ok: false, debug: "FIREFLIES_WEBHOOK_SECRET не задано у Vercel" };

  if (urlToken && safeEqual(urlToken.trim(), secret)) return { ok: true, debug: "token" };

  const names = ["x-hub-signature", "x-hub-signature-256", "x-fireflies-signature", "x-signature", "signature"];
  const hmac = createHmac("sha256", secret).update(rawBody);
  const digest = hmac.digest();
  const variants = [digest.toString("hex"), digest.toString("base64")];

  const seen: string[] = [];
  for (const n of names) {
    const v = headers.get(n);
    if (!v) continue;
    seen.push(`${n}(${v.length})`);
    const got = v.replace(/^sha256=/i, "").trim();
    if (variants.some((exp) => safeEqual(got.toLowerCase(), exp.toLowerCase()) || safeEqual(got, exp))) {
      return { ok: true, debug: n };
    }
  }
  const all = Array.from(headers.keys()).join(",");
  return {
    ok: false,
    debug: seen.length ? `підпис не збігся: ${seen.join(", ")}` : `немає заголовка підпису; заголовки: ${all}`,
  };
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
  sentences:
    | { speaker_name: string | null; text: string | null; start_time: number | null; end_time: number | null }[]
    | null;
};

async function fetchTranscript(id: string): Promise<Transcript | null> {
  const data = await gql<{ transcript: Transcript | null }>(
    `query T($id: String!) {
      transcript(id: $id) {
        id title date duration calendar_id cal_id
        sentences { speaker_name text start_time end_time }
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

// Частка мовлення вчительки / учня (за тривалістю фраз; якщо часу немає — за кількістю слів)
function talkShares(t: Transcript): { teacherPct: number; studentPct: number } | null {
  let teacher = 0;
  let student = 0;
  for (const s of t.sentences ?? []) {
    if (!s.text) continue;
    const dur =
      s.start_time != null && s.end_time != null && s.end_time > s.start_time
        ? Number(s.end_time) - Number(s.start_time)
        : s.text.split(/\s+/).length * 0.4;
    if (isTeacher(s.speaker_name)) teacher += dur;
    else student += dur;
  }
  const total = teacher + student;
  if (total <= 0) return null;
  const studentPct = Math.round((student / total) * 100);
  return { studentPct, teacherPct: 100 - studentPct };
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

const SUMMARY_PROMPT = `Ти — асистент вчительки англійської і досвідчений методист. Тобі дають автоматичний транскрипт індивідуального онлайн-уроку (розпізнавання мови неточне, особливо дитячих коротких відповідей і суміші української з англійською).

Важливо:
- Пісні, відео й аудіо, які вмикала вчителька, транскрипт часто приписує учню. Довгі рівні англійські фрагменти на кшталт пісень НЕ вважай мовленням учня.
- Не вигадуй. Чого не видно з транскрипту — не пиши.
- Англійські слова й фрази — англійською, решта — українською.

Тобі також дають ПРИБЛИЗНУ частку мовлення учня, пораховану автоматично з транскрипту. Якщо в ній явно є пісні/відео, приписані учню, оціни скориговану частку; якщо ні — поверни ту саму.

Відповідай СТРОГО одним JSON без тексту навколо:
{
  "topics": ["що робили на уроці — 2-4 коротких пункти"],
  "went_well": ["що вийшло добре — 1-3 пункти"],
  "difficulties": ["труднощі учня — 1-3 пункти, або порожній масив"],
  "homework": ["ДЗ і що повторити — 1-3 пункти, або порожній масив"],
  "next_focus": ["на що звернути увагу наступного разу — 1-2 пункти"],
  "student_pct": 30,
  "errors": [{"wrong": "фраза учня з помилкою", "right": "правильний варіант"}],
  "errors_note": "",
  "method_observations": ["0-2 прийоми чи рішення ВЧИТЕЛЬКИ на цьому уроці, яких НЕМАЄ в її методиці нижче (наприклад: «на уроці з Ліною пояснювала кольори через малювання»). Лише явні, помітні прийоми; якщо нічого нового — порожній масив"],
  "advice": "1-2 короткі конкретні поради ВЧИТЕЛЬЦІ (на «ти», тепло, як колега) щодо того, як вести уроки з цим учнем — темп, хто більше говорить, типи запитань, що спрацювало"
}
errors — лише реальні помилки в англійських фразах учня (максимум 5, найтиповіші). Не записуй сюди неточності розпізнавання. Якщо учень майже не говорив англійською або розпізнавання надто погане (часто з малими дітьми) — errors: [] і в errors_note одне речення чому.
Кожен пункт — одне коротке речення (до ~15 слів), без нумерації і без маркерів на початку. Пиши просто й по-людськи.`;

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

  const shares = talkShares(t);
  const input = `ПРИБЛИЗНА ЧАСТКА МОВЛЕННЯ УЧНЯ (автоматично): ${shares ? `${shares.studentPct}%` : "невідомо"}

УЧЕНЬ: ${name}, вік ${ageInfo(lesson.student)}, рівень ${lesson.student.englishLevel}
Нотатки про учня: ${lesson.student.notes || "немає"}
УРОК: ${dateLabel}, ${Math.round(Number(t.duration ?? 0))} хв
План/нотатка вчительки до уроку: ${lesson.teacherNotes ? lesson.teacherNotes.slice(0, 2000) : "немає"}

ТРАНСКРИПТ
${transcriptToText(t)}`;

  const ai = await callClaude(SUMMARY_PROMPT + (await methodContext()), input, 2200);
  if (!ai.ok) {
    if (notify) await notifyTeacher(`⚠️ Не вдалося обробити запис уроку з ${name}: ${ai.error}`);
    return { status: "skipped", reason: ai.error };
  }

  type Analysis = {
    topics?: string[];
    went_well?: string[];
    difficulties?: string[];
    homework?: string[];
    next_focus?: string[];
    student_pct?: number;
    errors?: { wrong?: string; right?: string }[];
    errors_note?: string;
    advice?: string;
    method_observations?: string[];
  };
  let parsed: Analysis | null = null;
  const st = ai.text.indexOf("{");
  const en = ai.text.lastIndexOf("}");
  if (st !== -1 && en > st) {
    try {
      parsed = JSON.parse(ai.text.slice(st, en + 1));
    } catch {
      parsed = null;
    }
  }
  const list = (v: unknown): string[] =>
    (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
      .map((x) => String(x).replace(/^\s*(?:[•\-–*]|\d+[.)])\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
  const sections: { emoji: string; title: string; items: string[] }[] = [
    { emoji: "📚", title: "Що робили", items: list(parsed?.topics) },
    { emoji: "✅", title: "Що вийшло", items: list(parsed?.went_well) },
    { emoji: "⚠️", title: "Труднощі", items: list(parsed?.difficulties) },
    { emoji: "📝", title: "ДЗ і повторення", items: list(parsed?.homework) },
    { emoji: "🎯", title: "Наступного разу", items: list(parsed?.next_focus) },
  ].filter((x) => x.items.length > 0);
  // Звичайний текст — для журналу (і запасний варіант, якщо ШІ повернув не JSON)
  const summary = sections.length
    ? sections.map((x) => `${x.title}: ${x.items.join("; ")}`).join("\n")
    : ai.text.trim();
  const studentPctRaw = Number(parsed?.student_pct);
  const studentPct =
    Number.isFinite(studentPctRaw) && studentPctRaw >= 0 && studentPctRaw <= 100
      ? Math.round(studentPctRaw)
      : (shares?.studentPct ?? null);
  const errors = (parsed?.errors ?? [])
    .filter((e) => e.wrong && e.right)
    .slice(0, 5)
    .map((e) => ({ wrong: String(e.wrong).trim(), right: String(e.right).trim() }));
  const errorsNote = (parsed?.errors_note ?? "").trim();
  const advice = (parsed?.advice ?? "").trim();

  // Нові прийоми вчительки → скринька методики (з них згодом з'являться питання)
  try {
    const obs = (parsed?.method_observations ?? []).map(String).filter(Boolean).slice(0, 2);
    if (obs.length) await addObservations(obs.map((o) => `${o} (урок з ${name}, ${dateLabel})`));
  } catch (e) {
    console.error("Methodology observations error", e);
  }

  // Попередній урок цього учня — для порівняння частки мовлення
  const prev = await prisma.studentJournalEntry.findFirst({
    where: { studentId: lesson.studentId, source: "FIREFLIES", studentTalkPct: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { studentTalkPct: true },
  });

  // У журнал зберігаємо і конспект, і розбір — щоб портрет бачив повторювані помилки
  const journalReview = [
    errors.length ? `Помилки учня: ${errors.map((e) => `${e.wrong} → ${e.right}`).join("; ")}` : "",
    studentPct != null ? `Учень говорив ~${studentPct}% часу уроку` : "",
    advice ? `Порада вчительці: ${advice}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const content = `Урок ${dateLabel} (запис Fireflies)\n${summary}${journalReview ? `\n\nРозбір:\n${journalReview}` : ""}`;

  let entryId: string;
  try {
    const entry = await prisma.studentJournalEntry.create({
      data: {
        studentId: lesson.studentId,
        lessonId: lesson.id,
        content,
        source: "FIREFLIES",
        externalId: meetingId,
        studentTalkPct: studentPct,
      },
    });
    entryId = entry.id;
  } catch {
    // паралельна обробка того самого запису — вже збережено
    return { status: "skipped", reason: "вже в журналі" };
  }

  if (notify) {
    const h = escapeTelegramHtml;
    const blocks: string[] = [`🎧 <b>Урок з ${h(name)}</b> · ${h(dateLabel)}\n<i>Конспект збережено в журнал учня</i>`];
    if (sections.length) {
      for (const sec of sections) {
        blocks.push(`${sec.emoji} <b>${sec.title}</b>\n${sec.items.map((i) => `• ${h(i)}`).join("\n")}`);
      }
    } else {
      blocks.push(h(summary));
    }

    const review: string[] = [];
    if (studentPct != null) {
      review.push(
        `🗣 <b>Хто говорив</b>\nТи ~${100 - studentPct}% · учень ~${studentPct}%` +
          (prev?.studentTalkPct != null ? `\n<i>минулого разу учень ~${prev.studentTalkPct}%</i>` : "")
      );
    }
    if (errors.length) {
      review.push(
        `❌ <b>Помилки учня</b>\n${errors.map((e) => `• <s>${h(e.wrong)}</s> → <b>${h(e.right)}</b>`).join("\n")}`
      );
    } else if (errorsNote) {
      review.push(`❌ <b>Помилки учня</b>\n<i>${h(errorsNote)}</i>`);
    }
    if (advice) review.push(`💡 <b>Порада</b>\n${h(advice)}`);
    if (review.length) {
      blocks.push(`━━━━━━━━━━━━\n📊 <b>ДЛЯ ТЕБЕ</b>`);
      blocks.push(...review);
    }

    const chatId = await teacherChatId();
    if (chatId) {
      await sendTelegramHtmlMessage(chatId, blocks.join("\n\n"), [
        [{ text: "↩️ Прибрати з журналу", callback_data: `jdel:${entryId}` }],
      ]);
    }
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
