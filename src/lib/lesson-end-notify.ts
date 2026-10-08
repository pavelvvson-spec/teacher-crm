// Повідомлення вчительці в Telegram одразу після уроку:
// - якщо далі сьогодні є урок і перерва >= breakMinMinutes — «перерва N хв, встигнеш випити чаю»;
// - якщо це останній урок дня — «на сьогодні все».
// Викликається «будильником» (зовнішній cron) кожні 5 хвилин: /api/cron/tick/<TICK_SECRET>

import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, sendTelegramMessageWithButtons, escapeTelegramHtml } from "@/lib/telegram";

const KYIV_TZ = "Europe/Kyiv";

// Скільки хвилин після кінця уроку ще можна надіслати (якщо «будильник» пропустив запуск)
const LATE_GRACE_MIN = 15;

const SHORT_BREAK = [
  "Урок закінчився — маєш {gap} перерви ☕ Якраз на чашечку чаю.",
  "Перерва {gap}! Чай, ковток свіжого повітря — і далі 🌸",
  "Видихай: до наступного уроку {gap} ☕",
  "Є {gap} — саме час для чаю і хвилинки тиші 🍵",
];
const MID_BREAK = [
  "Перерва {gap} 🌿 Встигнеш поїсти й трохи відпочити.",
  "Маєш {gap} — час смачно перекусити і розім'ятися 🍎",
  "Попереду {gap} перерви 💛 Поїж, видихни, трохи пройдися.",
];
const LONG_BREAK = [
  "Попереду довга перерва — {gap} ✨ Відпочинь по-справжньому.",
  "{gap} вільного часу 💛 Можна прогулятися або просто полежати.",
  "Довга перерва — {gap} 🌸 Час для себе.",
];
const LAST_LESSON = [
  "Останній урок на сьогодні завершено 💖 Ти молодчинка — тепер час для себе!",
  "Все, робочий день закрито ✨ Відпочивай, Сашуню!",
  "Уроки на сьогодні позаду 🌙 Чай, плед і заслужений відпочинок.",
  "Ти зробила це! Усі уроки на сьогодні проведено 🎉 Відпочивай.",
];

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

function formatGap(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} хв`;
  if (m === 0) return `${h} год`;
  return `${h} год ${m} хв`;
}

function kyivTime(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: KYIV_TZ, hour: "2-digit", minute: "2-digit" }).format(date);
}

function kyivDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KYIV_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

type BreakLesson = {
  id: string;
  startAt: Date;
  endAt: Date;
};

type NextLesson = {
  startAt: Date;
  teacherNotes: string | null;
  homework: string | null;
  student: { firstName: string; lastName: string | null };
  _count: { materials: number };
};

// Текст повідомлення (окремо — щоб показати приклад у налаштуваннях і в тестовому повідомленні)
export function buildLessonEndMessage(
  lesson: BreakLesson,
  next: NextLesson | null,
  minBreak: number
): { text: string; needsPrepButton: boolean } | null {
  const seed = Math.floor(lesson.endAt.getTime() / 60000);
  if (!next) {
    return { text: pick(LAST_LESSON, seed), needsPrepButton: false };
  }
  const gap = Math.round((next.startAt.getTime() - lesson.endAt.getTime()) / 60000);
  if (gap < minBreak) return null; // уроки майже підряд — не відволікаємо

  const list = gap < 60 ? SHORT_BREAK : gap < 120 ? MID_BREAK : LONG_BREAK;
  const name = escapeTelegramHtml(`${next.student.firstName} ${next.student.lastName ?? ""}`.trim());
  const prepared = Boolean(next.teacherNotes?.trim() || next.homework?.trim() || next._count.materials > 0);

  let text = `${pick(list, seed).replace("{gap}", `<b>${formatGap(gap)}</b>`)}\n\nДалі: <b>${name}</b> о ${kyivTime(next.startAt)}.`;
  if (!prepared) text += "\n📝 Цей урок ще не підготовлено — у перерві можна глянути.";
  return { text, needsPrepButton: !prepared };
}

export async function sendLessonEndNotifications(): Promise<{ sent: number; skipped: number }> {
  const settings = await prisma.settings.findFirst();
  const chatId = settings?.teacherTelegramChatId;
  if (!settings || !chatId || !settings.breakNotificationsEnabled) return { sent: 0, skipped: 0 };
  const minBreak = settings.breakMinMinutes ?? 20;

  const now = new Date();
  // Уроки, які щойно закінчились (і про які ще не писали)
  const ended = await prisma.lesson.findMany({
    where: {
      endAt: { lte: now, gte: new Date(now.getTime() - LATE_GRACE_MIN * 60000) },
      status: { in: ["SCHEDULED", "COMPLETED"] },
      endNotifiedAt: null,
    },
    orderBy: { endAt: "asc" },
    select: { id: true, startAt: true, endAt: true },
  });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  let sent = 0;
  let skipped = 0;

  for (const lesson of ended) {
    // «Бронюємо» урок, щоб повідомлення не пішло двічі, якщо два запуски збіглися
    const claim = await prisma.lesson.updateMany({
      where: { id: lesson.id, endNotifiedAt: null },
      data: { endNotifiedAt: now },
    });
    if (claim.count === 0) continue;

    // Наступний урок того ж дня (за Києвом)
    const candidates = await prisma.lesson.findMany({
      where: {
        id: { not: lesson.id },
        startAt: { gte: lesson.endAt, lt: new Date(lesson.endAt.getTime() + 24 * 3600 * 1000) },
        status: { in: ["SCHEDULED", "RESCHEDULED"] },
      },
      orderBy: { startAt: "asc" },
      take: 1,
      select: {
        startAt: true,
        teacherNotes: true,
        homework: true,
        student: { select: { firstName: true, lastName: true } },
        _count: { select: { materials: true } },
      },
    });
    const next =
      candidates[0] && kyivDayKey(candidates[0].startAt) === kyivDayKey(lesson.endAt) ? candidates[0] : null;

    // Якщо інший урок іде паралельно або ще не закінчився — «останнім» цей урок не вважаємо
    if (!next) {
      const stillRunning = await prisma.lesson.count({
        where: {
          id: { not: lesson.id },
          startAt: { lt: lesson.endAt },
          endAt: { gt: lesson.endAt },
          status: { in: ["SCHEDULED", "COMPLETED"] },
        },
      });
      if (stillRunning > 0) {
        skipped++;
        continue;
      }
    }

    const msg = buildLessonEndMessage(lesson, next, minBreak);
    if (!msg) {
      skipped++;
      continue;
    }

    if (msg.needsPrepButton && appUrl) {
      await sendTelegramMessageWithButtons(chatId, msg.text, [[{ text: "📝 Підготувати", url: `${appUrl}/lessons` }]]);
    } else {
      await sendTelegramMessage(chatId, msg.text);
    }
    sent++;
  }

  return { sent, skipped };
}

// Тестове повідомлення з налаштувань — щоб побачити, як це виглядає
export async function sendTestBreakMessage(): Promise<{ ok: boolean; error?: string }> {
  const settings = await prisma.settings.findFirst();
  if (!settings?.teacherTelegramChatId) return { ok: false, error: "Telegram вчительки не підключено" };
  const end = new Date();
  const msg = buildLessonEndMessage(
    { id: "test", startAt: end, endAt: end },
    {
      startAt: new Date(end.getTime() + 40 * 60000),
      teacherNotes: null,
      homework: null,
      student: { firstName: "Вероніка", lastName: null },
      _count: { materials: 0 },
    },
    0
  );
  if (!msg) return { ok: false, error: "Не вдалося скласти повідомлення" };
  const r = await sendTelegramMessage(settings.teacherTelegramChatId, `🧪 <i>Приклад:</i>\n\n${msg.text}`);
  return r.success ? { ok: true } : { ok: false, error: r.error };
}
