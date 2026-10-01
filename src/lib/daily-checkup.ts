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

function formatLessonDateTimeKyiv(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function isSameUtcMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
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

  // Сьогоднішні уроки, які ще не відмічені як проведені/непроведені
  const unmarkedLessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: start, lte: end },
      status: "SCHEDULED",
    },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });

  // Уроки (будь-якого дня), які вже проведені, але досі не оплачені
  const unpaidLessons = await prisma.lesson.findMany({
    where: {
      status: "COMPLETED",
      paymentStatus: { in: ["UNPAID", "DEBT", "PARTIALLY_PAID"] },
    },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });

  await prisma.settings.update({
    where: { id: settings.id },
    data: { lastCheckupSentAt: now },
  });

  for (const lesson of unpaidLessons) {
    const dateLabel = formatLessonDateTimeKyiv(lesson.startAt);
    const text =
      `💰 Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""} (${dateLabel}, ${lesson.price} грн) ще не оплачено.\n\n` +
      `Оплатили?`;

    await sendTelegramMessageWithButtons(settings.teacherTelegramChatId, text, [
      [
        { text: "💰 Так, оплачено", callback_data: `pay:${lesson.id}:1` },
        { text: "⏳ Ще ні", callback_data: `pay:${lesson.id}:0` },
      ],
    ]);
  }

  if (unmarkedLessons.length === 0) {
    await sendDailySummary();
    return { sent: true };
  }

  for (const lesson of unmarkedLessons) {
    const { hours, minutes } = getKyivTimeParts(lesson.startAt);
    const timeLabel = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

    const text =
      `📋 Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""} о ${timeLabel} (${lesson.price} грн)\n\n` +
      `Цей урок ще не відмічено. Він відбувся?`;

    await sendTelegramMessageWithButtons(settings.teacherTelegramChatId, text, [
      [{ text: "✅ Проведено, оплачено", callback_data: `chk:${lesson.id}:1` }],
      [{ text: "🟡 Проведено, не оплачено", callback_data: `chk:${lesson.id}:2` }],
      [{ text: "❌ Не відбувся", callback_data: `chk:${lesson.id}:0` }],
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
    `Зароблено (за фактом проведення): ${totalEarned} грн`;

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

function getMonthRangeUtc(year: number, monthIndex0: number): { start: Date; end: Date } {
  let nextMonth = monthIndex0 + 1;
  let nextYear = year;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }
  const start = kyivWallTimeToUtc(year, monthIndex0, 1, 0, 0);
  const end = kyivWallTimeToUtc(nextYear, nextMonth, 1, 0, 0);
  return { start, end };
}

function isLastDayOfMonthKyiv(): boolean {
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

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return day === daysInMonth;
}

async function computeMonthStats(start: Date, end: Date) {
  const lessons = await prisma.lesson.findMany({
    where: { startAt: { gte: start, lt: end } },
  });

  const completed = lessons.filter((l) => l.status === "COMPLETED");
  const cancelled = lessons.filter(
    (l) =>
      l.status === "CANCELLED_BY_STUDENT" ||
      l.status === "CANCELLED_BY_TEACHER" ||
      l.status === "NO_SHOW"
  );

  const totalEarned = completed
    .filter((l) => l.paymentStatus === "PAID")
    .reduce((sum, l) => sum + l.price, 0);

  const totalMinutes = completed.reduce((sum, l) => sum + l.duration, 0);
  const activeStudents = new Set(completed.map((l) => l.studentId)).size;

  return {
    totalEarned,
    completedCount: completed.length,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    cancelledCount: cancelled.length,
    activeStudents,
    hasData: lessons.length > 0,
  };
}

export async function sendMonthlyReportIfLastDay(): Promise<{ sent: boolean; reason?: string }> {
  if (!isLastDayOfMonthKyiv()) {
    return { sent: false, reason: "Не останній день місяця" };
  }

  const settings = await prisma.settings.findFirst();

  if (!settings?.teacherTelegramChatId) {
    return { sent: false, reason: "Телеграм дружини не підключено" };
  }

  const now = new Date();
  if (settings.lastMonthlyReportSentAt && isSameUtcMonth(settings.lastMonthlyReportSentAt, now)) {
    return { sent: false, reason: "Звіт за цей місяць вже надсилався" };
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const year = Number(map.year);
  const month = Number(map.month) - 1;

  const { start: curStart, end: curEnd } = getMonthRangeUtc(year, month);
  const curStats = await computeMonthStats(curStart, curEnd);

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear -= 1;
  }
  const { start: prevStart, end: prevEnd } = getMonthRangeUtc(prevYear, prevMonth);
  const prevStats = await computeMonthStats(prevStart, prevEnd);

  const monthLabel = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    month: "long",
    year: "numeric",
  }).format(curStart);

  let text =
    `📊 Підсумок місяця (${monthLabel})\n\n` +
    `Фактично зароблено: ${curStats.totalEarned} грн\n` +
    `Проведено уроків: ${curStats.completedCount} (≈${curStats.totalHours} год)\n` +
    `Скасовано/не відбулося уроків: ${curStats.cancelledCount}\n` +
    `Активних учнів: ${curStats.activeStudents}`;

  if (prevStats.hasData) {
    const earnedDiff = curStats.totalEarned - prevStats.totalEarned;
    const studentsDiff = curStats.activeStudents - prevStats.activeStudents;
    const sign = (n: number) => (n > 0 ? "+" : "");

    text +=
      `\n\n📈 Порівняно з минулим місяцем:\n` +
      `Гроші: ${sign(earnedDiff)}${earnedDiff} грн\n` +
      `Учні: ${sign(studentsDiff)}${studentsDiff}`;
  } else {
    text += `\n\n(Це перший місяць роботи системи — порівнювати поки нема з чим)`;
  }

  await sendTelegramMessage(settings.teacherTelegramChatId, text);

  await prisma.settings.update({
    where: { id: settings.id },
    data: { lastMonthlyReportSentAt: now },
  });

  return { sent: true };
}