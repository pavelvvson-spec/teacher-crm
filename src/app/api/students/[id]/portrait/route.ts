import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callClaude, journalToText } from "@/lib/anthropic";

// Генерація відповіді ШІ може тривати 20-40 секунд
export const maxDuration = 60;

const SYSTEM_PROMPT = `Ти — досвідчений методист з англійської мови. Вчителька веде журнал про учня: туди без жодної структури потрапляють її думки, спостереження, повідомлення від батьків, результати. Твоє завдання — перетворити це на короткий робочий «портрет учня» для вчительки.
Пиши українською, коротко, по пунктах. Спирайся ЛИШЕ на дані, що тобі дали. Чого немає в даних — не вигадуй; якщо про якийсь розділ інформації немає, напиши «немає даних».
Якщо записи суперечать один одному, довіряй новішим і коротко це зазнач.

Формат (звичайний текст, без markdown-заголовків з #):
РІВЕНЬ І ПРОГРЕС: ...
СИЛЬНІ СТОРОНИ: ...
СЛАБКІ МІСЦЯ І ТИПОВІ ПОМИЛКИ: ...
ІНТЕРЕСИ І ЩО МОТИВУЄ: ...
ЩО ПРАЦЮЄ НА УРОКАХ / ЩО НІ: ...
ЦІЛІ (учня чи батьків): ...
РЕКОМЕНДАЦІЇ НА НАЙБЛИЖЧІ УРОКИ: 3-5 конкретних пунктів
ДЗ: якого типу завдання давати цьому учню`;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const student = await prisma.student.findUnique({
    where: { id },
    include: { journalEntries: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Учня не знайдено" }, { status: 404 });
  }

  const lessons = await prisma.lesson.findMany({
    where: {
      studentId: id,
      OR: [{ teacherNotes: { not: null } }, { homework: { not: null } }],
    },
    orderBy: { startAt: "desc" },
    take: 15,
  });

  if (student.journalEntries.length === 0 && lessons.length === 0 && !student.notes) {
    return NextResponse.json(
      { error: "Про учня ще нічого не записано. Додайте кілька записів у журнал." },
      { status: 400 }
    );
  }

  const lessonsText =
    lessons.length === 0
      ? "немає"
      : lessons
          .reverse()
          .map((l) => {
            const d = l.startAt.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" });
            const parts = [`- ${d}`];
            if (l.teacherNotes) parts.push(`нотатка: ${l.teacherNotes}`);
            if (l.homework) parts.push(`ДЗ: ${l.homework}`);
            return parts.join("; ");
          })
          .join("\n");

  const userPrompt = `УЧЕНЬ: ${student.firstName}
Рівень у CRM: ${student.englishLevel}
Тривалість уроку: ${student.defaultLessonDuration} хв
Загальні нотатки в картці: ${student.notes || "немає"}

ЖУРНАЛ (від старіших до новіших)
${journalToText(student.journalEntries)}

НОТАТКИ ДО УРОКІВ І ДЗ (останні)
${lessonsText}`;

  const result = await callClaude(SYSTEM_PROMPT, userPrompt, 2000);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const updated = await prisma.student.update({
    where: { id },
    data: { aiPortrait: result.text.trim(), aiPortraitAt: new Date() },
    select: { aiPortrait: true, aiPortraitAt: true },
  });
  return NextResponse.json(updated);
}
