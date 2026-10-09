// Генерація плану уроку з ШІ — спільна логіка для кнопки в CRM і Telegram-помічника.
import { prisma } from "@/lib/prisma";
import { callClaude, journalToText, type ClaudeContentBlock } from "@/lib/anthropic";
import { methodContext, ageInfo } from "@/lib/pedagogy";
import { textbookForPrep } from "@/lib/textbook";

const STATUS_UA: Record<string, string> = {
  SCHEDULED: "заплановано",
  COMPLETED: "проведено",
  CANCELLED_BY_STUDENT: "скасував учень",
  CANCELLED_BY_TEACHER: "скасувала вчителька",
  RESCHEDULED: "перенесено",
  NO_SHOW: "учень не прийшов",
};

function kyivDate(d: Date) {
  return d.toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SYSTEM_PROMPT = `Ти — досвідчений методист з англійської мови, який допомагає вчительці готуватися до індивідуальних онлайн-уроків.
Пиши українською. Англійські слова, речення і вправи — англійською.
Спирайся ЛИШЕ на дані про учня, що тобі дали: портрет учня, журнал вчительки, нотатки до уроків. Журнал і портрет — найцінніше джерело: враховуй інтереси, слабкі місця і те, що працює з цим учнем. Якщо даних мало (немає нотаток про попередні уроки) — скажи про це одним реченням і склади універсальний план під рівень учня, нічого не вигадуючи про його минулі помилки чи теми.
Враховуй тривалість уроку: таймінг блоків має сходитися з нею.
Будь конкретним: готові питання, речення, слова, а не загальні поради.
Якщо дано сторінки підручника — будуй урок навколо них: які вправи робити (номер вправи і сторінка), що пропустити, що додати від себе під цього учня; ДЗ — бажано з цих сторінок або робочого зошита до них. Не вигадуй вправ, яких немає на сторінках, — пиши «додатково» для власних.

Відповідай СТРОГО одним JSON-об'єктом без markdown і без тексту навколо:
{
  "plan": "план уроку для вчительки: мета уроку; що повторити з минулого; блоки з таймінгом; конкретні вправи з прикладами; на що звернути увагу з цим учнем",
  "homework": "домашнє завдання для учня, коротко і зрозуміло, так щоб його можна було одразу надіслати учню в Telegram"
}
Використовуй \\n для нових рядків усередині значень.`;

export type LessonPrepResult =
  | {
      ok: true;
      plan: string;
      homework: string;
      lessonId: string;
      lessonStartAt: Date;
      studentId: string;
    }
  | { ok: false; error: string };

export async function generateLessonPrep(id: string, wish: string): Promise<LessonPrepResult> {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { student: { include: { journalEntries: true } }, materials: true },
  });
  if (!lesson) {
    return { ok: false, error: "Урок не знайдено" };
  }

  const previous = await prisma.lesson.findMany({
    where: {
      studentId: lesson.studentId,
      id: { not: id },
      startAt: { lt: lesson.startAt },
    },
    orderBy: { startAt: "desc" },
    take: 8,
    include: { materials: { select: { title: true } } },
  });

  const s = lesson.student;
  const historyText =
    previous.length === 0
      ? "Попередніх уроків у системі немає."
      : previous
          .reverse()
          .map((l) => {
            const parts = [`- ${kyivDate(l.startAt)} (${STATUS_UA[l.status] ?? l.status})`];
            if (l.teacherNotes) parts.push(`  Нотатка вчительки: ${l.teacherNotes}`);
            if (l.homework) parts.push(`  ДЗ: ${l.homework}`);
            if (l.materials.length) parts.push(`  Матеріали: ${l.materials.map((m) => m.title).join("; ")}`);
            return parts.join("\n");
          })
          .join("\n");

  const userPrompt = `Підготуй урок.

УЧЕНЬ
Ім'я: ${s.firstName}
Вік: ${ageInfo(s)}
Рівень англійської: ${s.englishLevel}
Формат: ${lesson.format === "ONLINE" ? "онлайн" : "офлайн"}
Тривалість цього уроку: ${lesson.duration} хв
Загальні нотатки про учня: ${s.notes || "немає"}

ПОРТРЕТ УЧНЯ (підсумок ШІ з журналу${s.aiPortraitAt ? ", " + s.aiPortraitAt.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" }) : ""})
${s.aiPortrait || "ще не складено"}

ЖУРНАЛ ВЧИТЕЛЬКИ ПРО УЧНЯ (від старіших до новіших)
${journalToText(s.journalEntries, 12000)}

ЦЕЙ УРОК (${kyivDate(lesson.startAt)})
Нотатка, яку вже написала вчителька: ${lesson.teacherNotes || "немає"}
ДЗ, вже вписане до цього уроку: ${lesson.homework || "немає"}
Прикріплені матеріали: ${lesson.materials.map((m) => m.title).join("; ") || "немає"}

ОСТАННІ УРОКИ (від старіших до новіших)
${historyText}

ПОБАЖАННЯ ВЧИТЕЛЬКИ ДО ЦЬОГО УРОКУ
${wish || "немає"}`;

  const tb = await textbookForPrep(lesson.studentId, { from: lesson.textbookFrom, to: lesson.textbookTo });
  // Якщо сторінки були лише запропоновані — запам'ятовуємо їх за уроком (щоб після уроку учень «перейшов» далі)
  if (tb.range && !lesson.textbookFrom) {
    await prisma.lesson.update({ where: { id }, data: { textbookFrom: tb.range.from, textbookTo: tb.range.to } });
  }
  const content: ClaudeContentBlock[] | string = tb.text
    ? [{ type: "text", text: `${userPrompt}\n\n${tb.text}` }, ...tb.blocks]
    : userPrompt;

  const result = await callClaude(SYSTEM_PROMPT + (await methodContext()), content, 3000);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  const text = result.text;

  let plan = text;
  let homework = "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      plan = String(parsed.plan ?? "");
      homework = String(parsed.homework ?? "");
    } catch {
      // якщо JSON зламаний — показуємо весь текст як план
    }
  }

  return { ok: true, plan, homework, lessonId: lesson.id, lessonStartAt: lesson.startAt, studentId: lesson.studentId };
}

// План для чернетки наступного уроку (дати ще немає) — ті самі дані про учня, але без конкретного уроку
export async function generateDraftPrep(
  studentId: string,
  wish: string
): Promise<{ ok: true; plan: string; homework: string } | { ok: false; error: string }> {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    include: { journalEntries: true, draftMaterials: { select: { title: true } } },
  });
  if (!s) return { ok: false, error: "Учня не знайдено" };

  const previous = await prisma.lesson.findMany({
    where: { studentId, startAt: { lt: new Date() } },
    orderBy: { startAt: "desc" },
    take: 8,
    include: { materials: { select: { title: true } } },
  });
  const historyText =
    previous.length === 0
      ? "Попередніх уроків у системі немає."
      : previous
          .reverse()
          .map((l) => {
            const parts = [`- ${kyivDate(l.startAt)} (${STATUS_UA[l.status] ?? l.status})`];
            if (l.teacherNotes) parts.push(`  Нотатка вчительки: ${l.teacherNotes}`);
            if (l.homework) parts.push(`  ДЗ: ${l.homework}`);
            if (l.materials.length) parts.push(`  Матеріали: ${l.materials.map((m) => m.title).join("; ")}`);
            return parts.join("\n");
          })
          .join("\n");

  const userPrompt = `Підготуй НАСТУПНИЙ урок (дата ще не відома — урок після останнього проведеного).

УЧЕНЬ
Ім'я: ${s.firstName}
Вік: ${ageInfo(s)}
Рівень англійської: ${s.englishLevel}
Формат: ${s.lessonFormat === "ONLINE" ? "онлайн" : "офлайн"}
Тривалість уроку: ${s.defaultLessonDuration} хв
Загальні нотатки про учня: ${s.notes || "немає"}

ПОРТРЕТ УЧНЯ (підсумок ШІ з журналу${s.aiPortraitAt ? ", " + s.aiPortraitAt.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" }) : ""})
${s.aiPortrait || "ще не складено"}

ЖУРНАЛ ВЧИТЕЛЬКИ ПРО УЧНЯ (від старіших до новіших; найсвіжіше — найважливіше)
${journalToText(s.journalEntries, 12000)}

ЧЕРНЕТКА НАСТУПНОГО УРОКУ
Нотатка, яку вже написала вчителька: ${s.draftNotes || "немає"}
ДЗ, вже вписане: ${s.draftHomework || "немає"}
Прикріплені матеріали: ${s.draftMaterials.map((m) => m.title).join("; ") || "немає"}

ОСТАННІ УРОКИ (від старіших до новіших)
${historyText}

ПОБАЖАННЯ ВЧИТЕЛЬКИ
${wish || "немає"}`;

  const tb = await textbookForPrep(studentId, { from: s.draftTextbookFrom, to: s.draftTextbookTo });
  if (tb.range && !s.draftTextbookFrom) {
    await prisma.student.update({
      where: { id: studentId },
      data: { draftTextbookFrom: tb.range.from, draftTextbookTo: tb.range.to },
    });
  }
  const content: ClaudeContentBlock[] | string = tb.text
    ? [{ type: "text", text: `${userPrompt}\n\n${tb.text}` }, ...tb.blocks]
    : userPrompt;

  const result = await callClaude(SYSTEM_PROMPT + (await methodContext()), content, 3000);
  if (!result.ok) return { ok: false, error: result.error };
  const text = result.text;
  let plan = text;
  let homework = "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      plan = String(parsed.plan ?? "");
      homework = String(parsed.homework ?? "");
    } catch {
      // якщо JSON зламаний — показуємо весь текст як план
    }
  }
  return { ok: true, plan, homework };
}
