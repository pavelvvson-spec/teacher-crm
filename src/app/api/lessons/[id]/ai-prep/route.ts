import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Генерація відповіді ШІ може тривати 20-40 секунд
export const maxDuration = 60;

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
Спирайся ЛИШЕ на дані про учня, що тобі дали. Якщо даних мало (немає нотаток про попередні уроки) — скажи про це одним реченням і склади універсальний план під рівень учня, нічого не вигадуючи про його минулі помилки чи теми.
Враховуй тривалість уроку: таймінг блоків має сходитися з нею.
Будь конкретним: готові питання, речення, слова, а не загальні поради.

Відповідай СТРОГО одним JSON-об'єктом без markdown і без тексту навколо:
{
  "plan": "план уроку для вчительки: мета уроку; що повторити з минулого; блоки з таймінгом; конкретні вправи з прикладами; на що звернути увагу з цим учнем",
  "homework": "домашнє завдання для учня, коротко і зрозуміло, так щоб його можна було одразу надіслати учню в Telegram"
}
Використовуй \\n для нових рядків усередині значень.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const wish: string = typeof body?.wish === "string" ? body.wish.slice(0, 1000) : "";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Не налаштовано ключ ШІ (ANTHROPIC_API_KEY у змінних Vercel)" },
      { status: 500 }
    );
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { student: true, materials: true },
  });
  if (!lesson) {
    return NextResponse.json({ error: "Урок не знайдено" }, { status: 404 });
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
Рівень англійської: ${s.englishLevel}
Формат: ${lesson.format === "ONLINE" ? "онлайн" : "офлайн"}
Тривалість цього уроку: ${lesson.duration} хв
Загальні нотатки про учня: ${s.notes || "немає"}

ЦЕЙ УРОК (${kyivDate(lesson.startAt)})
Нотатка, яку вже написала вчителька: ${lesson.teacherNotes || "немає"}
ДЗ, вже вписане до цього уроку: ${lesson.homework || "немає"}
Прикріплені матеріали: ${lesson.materials.map((m) => m.title).join("; ") || "немає"}

ОСТАННІ УРОКИ (від старіших до новіших)
${historyText}

ПОБАЖАННЯ ВЧИТЕЛЬКИ ДО ЦЬОГО УРОКУ
${wish || "немає"}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch {
    return NextResponse.json({ error: "Не вдалося зв'язатися з ШІ" }, { status: 502 });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Anthropic API error", res.status, errText);
    const hint =
      res.status === 401
        ? "неправильний ключ"
        : res.status === 400 && errText.includes("credit")
          ? "закінчився баланс у консолі Anthropic"
          : `код ${res.status}`;
    return NextResponse.json({ error: `ШІ повернув помилку: ${hint}` }, { status: 502 });
  }

  const data = await res.json();
  const text: string = (data?.content ?? [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("");

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

  return NextResponse.json({ plan, homework });
}
