import { prisma } from "@/lib/prisma";
import { kyivWallTimeToUtc, getKyivTimeParts } from "@/lib/kyiv-time";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
} from "@/lib/telegram";

function getTodayKyivRangeUtc(): { start: Date; end: Date; dateLabel: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const year = Number(map.year);
  const month = Number(map.month) - 1;
  const day = Number(map.day);

  const start = kyivWallTimeToUtc(year, month, day, 0, 0);
  const end = kyivWallTimeToUtc(year, month, day, 23, 59);
  const dateLabel = `${String(day).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}.${year}`;

  return { start, end, dateLabel };
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export async function sendDailyCheckup(): Promise<{ sent: boolean; reason?: string }> {
  const settings = await prisma.settings.findFirst();

  if (!settings?.teacherTelegramChatId) {
    return { sent: false, reason: "Телеграм дружини не підключено" };
  }

  const now = new Date();
  if (settings.lastCheckupSentAt && isSameUtcDay(settings.lastCheckupSentAt, now)) {
    return { sent: false, reason: "Чекап на сьогодні вже надсилався" };
  }

  const { start, end } = getTodayKyivRangeUtc();

  const unmarkedLessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: start, lte: end },
      status: "SCHEDULED",
    },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });

  await prisma.settings.update({
    where: { id: settings.id },
    data: { lastCheckupSentAt: now },
  });

  if (unmarkedLessons.length === 0) {
    await sendDailySummary();
    return { sent: true };
  }

  for (const lesson of unmarkedLessons) {
    const { hours, minutes } = getKyivTimeParts(lesson.startAt);
    const timeLabel = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

    const text =
      `📋 Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""} о ${timeLabel}\n\n` +
      `Цей урок ще не відмічено. Він відбувся?`;

    await sendTelegramMessageWithButtons(settings.teacherTelegramChatId, text, [
      [
        { text: "✅ Проведено", callback_data: `c:${lesson.id}:1` },
        { text: "❌ Не відбувся", callback_data: `c:${lesson.id}:0` },
      ],
    ]);
  }

  return { sent: true };
}

export async function sendDailySummary(): Promise<{ sent: boolean; reason?: string }> {
  const settings = await prisma.settings.findFirst();

  if (!settings?.teacherTelegramChatId) {
    return { sent: false, reason: "Телеграм дружини не підключено" };
  }

  const now = new Date();
  if (settings.lastSummarySentAt && isSameUtcDay(settings.lastSummarySentAt, now)) {
    return { sent: false, reason: "Підсумок на сьогодні вже надсилався" };
  }

  const { start, end, dateLabel } = getTodayKyivRangeUtc();

  const completedLessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: start, lte: end },
      status: "COMPLETED",
    },
  });

  const totalEarned = completedLessons.reduce((sum, l) => sum + l.price, 0);

  const text =
    `📊 Підсумок дня (${dateLabel})\n\n` +
    `Проведено уроків: ${completedLessons.length}\n` +
    `Зароблено: ${totalEarned} грн`;

  await sendTelegramMessage(settings.teacherTelegramChatId, text);

  await prisma.settings.update({
    where: { id: settings.id },
    data: { lastSummarySentAt: now },
  });

  return { sent: true };
}

export async function checkAndMaybeSendSummary(): Promise<void> {
  const { start, end } = getTodayKyivRangeUtc();

  const remaining = await prisma.lesson.count({
    where: {
      startAt: { gte: start, lte: end },
      status: "SCHEDULED",
    },
  });

  if (remaining === 0) {
    await sendDailySummary();
  }
}