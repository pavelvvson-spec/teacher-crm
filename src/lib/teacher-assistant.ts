// ШІ-помічник вчительки в Telegram.
// Працює ЛИШЕ в чаті вчительки (Settings.teacherTelegramChatId).
// Вміє: записати інформацію в журнал учня, порадити щодо учня, підготувати наступний урок,
// відповісти на загальне методичне питання.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { callClaude, journalToText } from "@/lib/anthropic";
import { generateLessonPrep } from "@/lib/lesson-prep";
import {
  sendTelegramMessage,
  sendTelegramTyping,
  sendLongTelegramMessage,
  escapeTelegramHtml,
} from "@/lib/telegram";

const HISTORY_WINDOW_MS = 3 * 60 * 60 * 1000; // пам'ять розмови — 3 години
const HISTORY_LIMIT = 10;

function kyiv(d: Date, withTime = true) {
  return d.toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function parseJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

type Route = {
  action: "journal" | "advice" | "prep" | "chat" | "clarify";
  student: number | null;
  journal_text: string;
  candidates: number[];
};

const ROUTER_PROMPT = `Ти — диспетчер ШІ-помічника вчительки англійської. Тобі дають список її учнів, останню розмову і нове повідомлення вчительки. Визнач, що треба зробити.

Дії (action):
- "journal" — вчителька ділиться інформацією про учня (спостереження після уроку, що вийшло/ні, інтереси, повідомлення від батьків, результати) і НЕ питає поради.
- "advice" — вчителька питає поради, думки або аналізу щодо конкретного учня (можливо, разом з новою інформацією).
- "prep" — вчителька просить підготувати/спланувати урок для конкретного учня.
- "chat" — загальне питання без конкретного учня (методика, ідеї, тощо) або просто розмова.
- "clarify" — повідомлення стосується учня, але неможливо зрозуміти якого (кілька учнів з таким ім'ям, або ім'я не знайдено в списку).

student — номер учня (№) зі списку або null. Якщо в новому повідомленні учня не названо, але з розмови зрозуміло, що йдеться про того самого учня, — використай його.
journal_text — якщо в повідомленні є НОВА інформація про учня, яку варто зберегти в його журнал (для дій journal і advice), перепиши її стисло і без втрати фактів, від третьої особи («Сьогодні...»). Інакше — порожній рядок. Не зберігай самі питання.
candidates — для clarify: номери можливих учнів (може бути порожнім).

Відповідай СТРОГО одним JSON без тексту навколо:
{"action": "...", "student": 5, "journal_text": "...", "candidates": []}`;

const ADVICE_PROMPT = `Ти — досвідчений методист з англійської мови і уважний колега вчительки. Вона питає тебе про конкретного учня в Telegram.
Пиши українською, тепло і по-діловому, як колега в месенджері. Коротко: зазвичай 5–12 рядків, без вступів і без повторення питання. Англійські приклади — англійською.
Спирайся на дані про учня (портрет, журнал, нотатки до уроків). Нічого не вигадуй про учня: якщо даних не вистачає — скажи, чого саме, і запропонуй, що варто помітити на наступному уроці.
Давай конкретику: що саме зробити на уроці, які вправи, фрази, ігри. Не використовуй markdown-заголовки (#) і таблиці; можна прості списки з «—» або цифр.
Якщо в розмові з'явилася нова інформація про учня, коротко враховуй її.`;

const CHAT_PROMPT = `Ти — досвідчений методист з англійської мови і уважний колега вчительки, яка веде індивідуальні онлайн-уроки (діти й дорослі, рівні A1–C1). Вона пише тобі в Telegram.
Пиши українською, коротко і по суті, як колега в месенджері: зазвичай 3–10 рядків. Англійські приклади — англійською. Без markdown-заголовків і таблиць.
Якщо питання стосується конкретного учня, але неясно якого, — попроси назвати учня.`;

async function loadHistory() {
  const since = new Date(Date.now() - HISTORY_WINDOW_MS);
  const rows = await prisma.assistantMessage.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  return rows.reverse();
}

function historyToText(rows: { role: string; content: string }[]) {
  if (rows.length === 0) return "розмови ще не було";
  return rows
    .map((r) => `${r.role === "user" ? "Вчителька" : "Помічник"}: ${r.content.slice(0, 1500)}`)
    .join("\n");
}

async function saveAssistantReply(
  content: string,
  studentId: string | null,
  data?: Prisma.InputJsonValue
) {
  return prisma.assistantMessage.create({
    data: {
      role: "assistant",
      content: content.slice(0, 8000),
      studentId,
      ...(data ? { data } : {}),
    },
  });
}

export async function handleTeacherMessage(
  chatId: string,
  text: string,
  updateId: string,
  source: "TEXT" | "VOICE" = "TEXT"
) {
  // Захист від повторної доставки того самого повідомлення Telegram'ом
  const already = await prisma.assistantMessage.findUnique({ where: { telegramUpdateId: updateId } });
  if (already) return;

  const userMsg = await prisma.assistantMessage.create({
    data: { role: "user", content: text.slice(0, 8000), telegramUpdateId: updateId },
  });

  await sendTelegramTyping(chatId);

  const students = await prisma.student.findMany({
    where: { isActive: true },
    orderBy: { studentNumber: "asc" },
    select: { id: true, studentNumber: true, firstName: true, lastName: true, englishLevel: true },
  });
  const history = await loadHistory();
  const historyWithoutCurrent = history.filter((h) => h.id !== userMsg.id);
  const lastStudentId = [...historyWithoutCurrent].reverse().find((h) => h.studentId)?.studentId ?? null;
  const lastStudent = students.find((s) => s.id === lastStudentId);

  const studentList = students
    .map((s) => `№${s.studentNumber} ${s.firstName} ${s.lastName ?? ""} (${s.englishLevel})`.trim())
    .join("\n");

  const routerInput = `СПИСОК УЧНІВ
${studentList || "учнів немає"}

ОСТАННІЙ УЧЕНЬ У РОЗМОВІ: ${lastStudent ? `№${lastStudent.studentNumber} ${lastStudent.firstName}` : "немає"}

ОСТАННЯ РОЗМОВА
${historyToText(historyWithoutCurrent)}

НОВЕ ПОВІДОМЛЕННЯ ВЧИТЕЛЬКИ
${text}`;

  const routed = await callClaude(ROUTER_PROMPT, routerInput, 1000);
  if (!routed.ok) {
    await sendTelegramMessage(chatId, `⚠️ ${escapeTelegramHtml(routed.error)}`);
    return;
  }
  const route = parseJson<Route>(routed.text) ?? {
    action: "chat",
    student: null,
    journal_text: "",
    candidates: [],
  };

  const student =
    route.student != null ? students.find((s) => s.studentNumber === Number(route.student)) : undefined;

  // Учень потрібен, але не визначений
  if (
    route.action === "clarify" ||
    ((route.action === "journal" || route.action === "advice" || route.action === "prep") && !student)
  ) {
    const cands = (route.candidates ?? [])
      .map((n) => students.find((s) => s.studentNumber === Number(n)))
      .filter(Boolean)
      .map((s) => `№${s!.studentNumber} ${s!.firstName} ${s!.lastName ?? ""}`.trim());
    const reply = cands.length
      ? `Про кого саме йдеться? ${cands.join(", ")}. Напишіть ім'я з прізвищем або номер учня.`
      : `Не зрозуміла, про якого учня йдеться. Напишіть ім'я з прізвищем або номер учня (його видно в CRM).`;
    await saveAssistantReply(reply, null);
    await sendTelegramMessage(chatId, escapeTelegramHtml(reply));
    return;
  }

  if (student) {
    await prisma.assistantMessage.update({ where: { id: userMsg.id }, data: { studentId: student.id } });
  }

  // 1) Нова інформація → журнал учня
  let savedEntryId: string | null = null;
  const journalText = (route.journal_text ?? "").trim();
  if (student && journalText && (route.action === "journal" || route.action === "advice")) {
    const entry = await prisma.studentJournalEntry.create({
      data: { studentId: student.id, content: journalText, source },
    });
    savedEntryId = entry.id;
  }

  const studentLabel = student ? `${student.firstName} ${student.lastName ?? ""}`.trim() : "";

  if (route.action === "journal") {
    const reply = savedEntryId
      ? `✓ Записала в журнал: ${studentLabel}\n\n«${journalText}»`
      : `Не знайшла в повідомленні нової інформації для журналу ${studentLabel}.`;
    await saveAssistantReply(reply, student?.id ?? null);
    await sendLongTelegramMessage(
      chatId,
      reply,
      savedEntryId ? [[{ text: "↩️ Скасувати запис", callback_data: `jdel:${savedEntryId}` }]] : undefined
    );
    return;
  }

  if (route.action === "advice" && student) {
    await sendTelegramTyping(chatId);
    const full = await prisma.student.findUnique({
      where: { id: student.id },
      include: { journalEntries: true },
    });
    const lessons = await prisma.lesson.findMany({
      where: { studentId: student.id, startAt: { lte: new Date() } },
      orderBy: { startAt: "desc" },
      take: 8,
    });
    const nextLesson = await prisma.lesson.findFirst({
      where: { studentId: student.id, startAt: { gte: new Date() }, status: "SCHEDULED" },
      orderBy: { startAt: "asc" },
    });
    const lessonsText =
      lessons.length === 0
        ? "немає"
        : lessons
            .reverse()
            .map((l) => {
              const parts = [`- ${kyiv(l.startAt)}`];
              if (l.teacherNotes) parts.push(`нотатка: ${l.teacherNotes}`);
              if (l.homework) parts.push(`ДЗ: ${l.homework}`);
              return parts.join("; ");
            })
            .join("\n");

    const input = `УЧЕНЬ: ${full!.firstName} ${full!.lastName ?? ""}, рівень ${full!.englishLevel}, урок ${full!.defaultLessonDuration} хв
Загальні нотатки: ${full!.notes || "немає"}
Наступний урок: ${nextLesson ? kyiv(nextLesson.startAt) : "не заплановано"}

ПОРТРЕТ УЧНЯ
${full!.aiPortrait || "ще не складено"}

ЖУРНАЛ (від старіших до новіших)
${journalToText(full!.journalEntries, 12000)}

ОСТАННІ УРОКИ
${lessonsText}

ОСТАННЯ РОЗМОВА
${historyToText(historyWithoutCurrent)}

ПОВІДОМЛЕННЯ ВЧИТЕЛЬКИ
${text}`;

    const answer = await callClaude(ADVICE_PROMPT, input, 1500);
    if (!answer.ok) {
      await sendTelegramMessage(chatId, `⚠️ ${escapeTelegramHtml(answer.error)}`);
      return;
    }
    const reply =
      answer.text.trim() + (savedEntryId ? `\n\n✓ Нову інформацію записала в журнал: ${studentLabel}` : "");
    await saveAssistantReply(reply, student.id);
    await sendLongTelegramMessage(
      chatId,
      reply,
      savedEntryId ? [[{ text: "↩️ Скасувати запис у журнал", callback_data: `jdel:${savedEntryId}` }]] : undefined
    );
    return;
  }

  if (route.action === "prep" && student) {
    const nextLesson = await prisma.lesson.findFirst({
      where: { studentId: student.id, startAt: { gte: new Date() }, status: "SCHEDULED" },
      orderBy: { startAt: "asc" },
    });
    if (!nextLesson) {
      const reply = `У ${studentLabel} немає запланованих уроків у CRM. Спершу додайте урок у календар.`;
      await saveAssistantReply(reply, student.id);
      await sendTelegramMessage(chatId, escapeTelegramHtml(reply));
      return;
    }
    await sendTelegramMessage(
      chatId,
      escapeTelegramHtml(`⏳ Готую урок з ${studentLabel} на ${kyiv(nextLesson.startAt)}...`)
    );
    await sendTelegramTyping(chatId);
    const prep = await generateLessonPrep(nextLesson.id, text);
    if (!prep.ok) {
      await sendTelegramMessage(chatId, `⚠️ ${escapeTelegramHtml(prep.error)}`);
      return;
    }
    const reply = `📝 План уроку · ${studentLabel} · ${kyiv(nextLesson.startAt)}\n\n${prep.plan}${
      prep.homework ? `\n\n📚 ДЗ\n${prep.homework}` : ""
    }`;
    const saved = await saveAssistantReply(reply, student.id, {
      kind: "prep",
      lessonId: nextLesson.id,
      plan: prep.plan,
      homework: prep.homework,
    });
    await sendLongTelegramMessage(chatId, reply, [
      [{ text: "💾 Зберегти в урок (нотатка + ДЗ)", callback_data: `prepsave:${saved.id}` }],
    ]);
    return;
  }

  // Загальна розмова
  const input = `ОСТАННЯ РОЗМОВА
${historyToText(historyWithoutCurrent)}

ПОВІДОМЛЕННЯ ВЧИТЕЛЬКИ
${text}`;
  const answer = await callClaude(CHAT_PROMPT, input, 1200);
  if (!answer.ok) {
    await sendTelegramMessage(chatId, `⚠️ ${escapeTelegramHtml(answer.error)}`);
    return;
  }
  const reply = answer.text.trim();
  await saveAssistantReply(reply, null);
  await sendLongTelegramMessage(chatId, reply);
}

// Кнопки під відповідями помічника. Повертає текст для спливаючого повідомлення.
export async function handleAssistantCallback(data: string): Promise<{ toast: string }> {
  if (data.startsWith("jdel:")) {
    const entryId = data.slice(5);
    const res = await prisma.studentJournalEntry.deleteMany({ where: { id: entryId } });
    return res.count > 0 ? { toast: "Запис у журнал скасовано" } : { toast: "Запис уже видалено" };
  }

  if (data.startsWith("prepsave:")) {
    const msgId = data.slice(9);
    const msg = await prisma.assistantMessage.findUnique({ where: { id: msgId } });
    const payload = msg?.data as {
      kind?: string;
      lessonId?: string;
      plan?: string;
      homework?: string;
      saved?: boolean;
    } | null;
    if (!payload || payload.kind !== "prep" || !payload.lessonId) {
      return { toast: "Не знайшла цей план" };
    }
    if (payload.saved) {
      return { toast: "Вже збережено" };
    }
    const lesson = await prisma.lesson.findUnique({ where: { id: payload.lessonId } });
    if (!lesson) return { toast: "Урок не знайдено" };

    const merge = (current: string | null, incoming?: string) => {
      if (!incoming) return current;
      if (!current) return incoming;
      return `${current}\n\n${incoming}`;
    };
    await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        teacherNotes: merge(lesson.teacherNotes, payload.plan),
        homework: merge(lesson.homework, payload.homework),
      },
    });
    await prisma.assistantMessage.update({
      where: { id: msgId },
      data: { data: { ...payload, saved: true } as Prisma.InputJsonValue },
    });
    return { toast: "Збережено в урок ✓" };
  }

  return { toast: "" };
}
