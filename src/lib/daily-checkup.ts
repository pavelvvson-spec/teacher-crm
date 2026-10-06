import { prisma } from "@/lib/prisma";
import { kyivWallTimeToUtc } from "@/lib/kyiv-time";
import { calculateStudentBalance } from "@/lib/payments-utils";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
} from "@/lib/telegram";

const PERIODIC_FREQUENCIES = ["WEEKLY", "MONTHLY", "END_OF_WEEK", "END_OF_MONTH"];

const PAYMENT_FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "потижнева оплата",
  MONTHLY: "помісячна оплата",
  END_OF_WEEK: "оплата в кінці тижня",
  END_OF_MONTH: "оплата в кінці місяця",
};

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

function getKyivDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  return { year: Number(map.year), month: Number(map.month) - 1, day: Number(map.day) };
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

function getWeekRangeUtc(year: number, month: number, day: number): { start: Date; end: Date } {
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay(); // 0=Нд..6=Сб
  const daysSinceMonday = (weekday + 6) % 7;

  const monday = new Date(Date.UTC(year, month, day));
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);

  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  const start = kyivWallTimeToUtc(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 0, 0);
  const end = kyivWallTimeToUtc(
    nextMonday.getUTCFullYear(),
    nextMonday.getUTCMonth(),
    nextMonday.getUTCDate(),
    0,
    0
  );
  return { start, end };
}

function getPeriodRangeForLesson(
  lesson: { startAt: Date },
  paymentFrequency: string | null
): { start: Date; end: Date } {
  const { year, month, day } = getKyivDateParts(lesson.startAt);
  if (paymentFrequency === "WEEKLY" || paymentFrequency === "END_OF_WEEK") {
    return getWeekRangeUtc(year, month, day);
  }
  return getMonthRangeUtc(year, month);
}

type UnpaidLesson = {
  id: string;
  price: number;
  startAt: Date;
};

// Неоплачені уроки, які ще справді потрібно оплатити.
// Береться борг учня (баланс з урахуванням усіх окремих оплат). Найстаріші уроки
// вважаються покритими оплатами, лишаються найновіші.
async function getOutstandingUnpaidLessons(studentId: string): Promise<UnpaidLesson[]> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { lessons: true, payments: true },
  });
  if (!student) return [];

  const balance = calculateStudentBalance(student.lessons, student.payments, student.paymentFrequency);
  if (balance <= 0) return [];

  const unpaid = student.lessons
    .filter(
      (l) =>
        l.status === "COMPLETED" &&
        (l.paymentStatus === "UNPAID" ||
          l.paymentStatus === "DEBT" ||
          l.paymentStatus === "PARTIALLY_PAID")
    )
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime());

  const result: UnpaidLesson[] = [];
  let covered = 0;
  for (const lesson of unpaid) {
    if (covered >= balance) break;
    result.push({ id: lesson.id, price: lesson.price, startAt: lesson.startAt });
    covered += lesson.price;
  }

  return result.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

async function getReadyPeriodicUnpaidLessons(
  studentId: string,
  paymentFrequency: string | null
): Promise<UnpaidLesson[]> {
  const outstanding = await getOutstandingUnpaidLessons(studentId);

  const ready: UnpaidLesson[] = [];

  for (const lesson of outstanding) {
    const { start: periodStart, end: periodEnd } = getPeriodRangeForLesson(lesson, paymentFrequency);
    const remainingScheduled = await prisma.lesson.count({
      where: {
        studentId,
        startAt: { gte: periodStart, lt: periodEnd },
        status: "SCHEDULED",
      },
    });

    if (remainingScheduled === 0) {
      ready.push(lesson);
    }
  }

  return ready;
}

// «Оплачено все»: створюється одна окрема оплата на суму неоплачених уроків.
// Позначки на уроках не ставляться. Повторне натискання нічого не додасть,
// бо після оплати борг уже 0.
export async function settleStudentPeriodicPayments(
  studentId: string
): Promise<{ count: number; total: number; studentName: string } | null> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return null;

  const readyLessons = await getReadyPeriodicUnpaidLessons(studentId, student.paymentFrequency);
  const total = readyLessons.reduce((sum, l) => sum + l.price, 0);

  if (readyLessons.length > 0 && total > 0) {
    await prisma.payment.create({
      data: {
        studentId,
        amount: total,
        status: "PAID",
        paidAt: new Date(),
        comment: `Оплата за період: ${readyLessons.length} ур. (Telegram)`,
      },
    });
  }

  return {
    count: readyLessons.length,
    total,
    studentName: `${student.firstName} ${student.lastName ?? ""}`.trim(),
  };
}

async function sendPrepaidBalanceWarnings(teacherChatId: string): Promise<void> {
  const prepaidStudents = await prisma.student.findMany({
    where: { isActive: true, paymentFrequency: "MONTHLY_PREPAID" },
    include: { lessons: true, payments: true },
  });

  for (const student of prepaidStudents) {
    const balance = calculateStudentBalance(student.lessons, student.payments, student.paymentFrequency);
    const threshold = student.defaultLessonPrice;

    if (threshold <= 0) continue;

    if (balance >= -threshold) {
      let text: string;
      if (balance > 0) {
        text =
          `⚠️ ${student.firstName} ${student.lastName ?? ""}: передоплата вичерпана, борг ${balance} грн.\n\n` +
          `Потрібно внести наступну оплату.`;
      } else {
        const lessonsLeft = Math.floor(Math.abs(balance) / threshold);
        text =
          `⚠️ ${student.firstName} ${student.lastName ?? ""}: залишилось передоплати на ~${lessonsLeft} урок(и) (${Math.abs(balance)} грн).\n\n` +
          `Скоро знадобиться нова оплата.`;
      }
      await sendTelegramMessage(teacherChatId, text);
    }
  }
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

  const { end } = getTodayKyivRangeUtc();

  const unmarkedLessons = await prisma.lesson.findMany({
    where: {
      startAt: { lte: end },
      status: "SCHEDULED",
    },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });

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

  const perLessonUnpaid = unpaidLessons.filter(
    (l) => !l.student.paymentFrequency || l.student.paymentFrequency === "PER_LESSON"
  );
  const periodicUnpaid = unpaidLessons.filter(
    (l) => l.student.paymentFrequency && PERIODIC_FREQUENCIES.includes(l.student.paymentFrequency)
  );

  // Поурочні: питаємо лише про уроки, які ще справді не покриті оплатами
  const perLessonStudentIds = Array.from(new Set(perLessonUnpaid.map((l) => l.studentId)));

  for (const studentId of perLessonStudentIds) {
    const outstanding = await getOutstandingUnpaidLessons(studentId);

    for (const outLesson of outstanding) {
      const lesson = perLessonUnpaid.find((l) => l.id === outLesson.id);
      if (!lesson) continue;

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
  }

  const periodicStudentIds = Array.from(new Set(periodicUnpaid.map((l) => l.studentId)));

  for (const studentId of periodicStudentIds) {
    const sampleLesson = periodicUnpaid.find((l) => l.studentId === studentId)!;
    const student = sampleLesson.student;

    const readyLessons = await getReadyPeriodicUnpaidLessons(studentId, student.paymentFrequency);
    if (readyLessons.length === 0) continue;

    const total = readyLessons.reduce((sum, l) => sum + l.price, 0);
    const freqLabel = PAYMENT_FREQUENCY_LABELS[student.paymentFrequency ?? ""] ?? "періодична оплата";

    const text =
      `💰 ${student.firstName} ${student.lastName ?? ""} (${freqLabel})\n\n` +
      `Період завершено. Неоплачених уроків: ${readyLessons.length}, сума: ${total} грн.\n\n` +
      `Оплатили все?`;

    await sendTelegramMessageWithButtons(settings.teacherTelegramChatId, text, [
      [
        { text: "💰 Так, оплачено все", callback_data: `paybulk:${studentId}` },
        { text: "⏳ Ще ні", callback_data: `paybulkno:${studentId}` },
      ],
    ]);
  }

  await sendPrepaidBalanceWarnings(settings.teacherTelegramChatId);

  if (unmarkedLessons.length === 0) {
    await sendDailySummary();
    return { sent: true };
  }

  for (const lesson of unmarkedLessons) {
    const dateTimeLabel = formatLessonDateTimeKyiv(lesson.startAt);
    const isPrepaid = lesson.student.paymentFrequency === "MONTHLY_PREPAID";

    const text =
      `📋 Урок з ${lesson.student.firstName} ${lesson.student.lastName ?? ""} (${dateTimeLabel}, ${lesson.price} грн)\n\n` +
      `Цей урок ще не відмічено. Він відбувся?`;

    if (isPrepaid) {
      await sendTelegramMessageWithButtons(settings.teacherTelegramChatId, text, [
        [{ text: "✅ Проведено", callback_data: `chk:${lesson.id}:3` }],
        [{ text: "❌ Не відбувся", callback_data: `chk:${lesson.id}:0` }],
      ]);
    } else {
      await sendTelegramMessageWithButtons(settings.teacherTelegramChatId, text, [
        [{ text: "✅ Проведено, оплачено", callback_data: `chk:${lesson.id}:1` }],
        [{ text: "🟡 Проведено, не оплачено", callback_data: `chk:${lesson.id}:2` }],
        [{ text: "❌ Не відбувся", callback_data: `chk:${lesson.id}:0` }],
      ]);
    }
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

  const lessonsEarned = completed
    .filter((l) => l.paymentStatus === "PAID")
    .reduce((sum, l) => sum + l.price, 0);

  const payments = await prisma.payment.findMany({
    where: { paidAt: { gte: start, lt: end }, status: "PAID" },
  });
  const paymentsEarned = payments.reduce((sum, p) => sum + p.amount, 0);

  const totalEarned = lessonsEarned + paymentsEarned;

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