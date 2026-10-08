import { prisma } from "@/lib/prisma";
import { calculateStudentBalance, allocatePayments } from "@/lib/payments-utils";
import { kyivWallTimeToUtc } from "@/lib/kyiv-time";
import ResetPaymentsButton from "@/components/ResetPaymentsButton";
import MoneyCheckButton from "@/components/MoneyCheckButton";
import PaymentsMoreMenu from "@/components/PaymentsMoreMenu";
import PaymentsList, { type PaymentKind, type PaymentRow } from "@/components/PaymentsList";

export const dynamic = "force-dynamic";

const PERIODIC_FREQUENCIES = ["WEEKLY", "MONTHLY", "END_OF_WEEK", "END_OF_MONTH"];

function kyivDate(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function kyivTime(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Межі поточного місяця за київським часом (сервер Vercel працює за UTC)
function getKyivMonthRange(now: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const year = Number(map.year);
  const month = Number(map.month) - 1;

  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }

  return {
    start: kyivWallTimeToUtc(year, month, 1, 0, 0),
    end: kyivWallTimeToUtc(nextYear, nextMonth, 1, 0, 0),
  };
}

export default async function PaymentsPage() {
  const students = await prisma.student.findMany({
    where: { isActive: true },
    include: { lessons: true, payments: true },
    orderBy: { firstName: "asc" },
  });

  const allStudentsWithBalance = students.map((student) => {
    const isPerLesson = !student.paymentFrequency || student.paymentFrequency === "PER_LESSON";

    // Для поурочних: проведені уроки, за які ще не вистачає оплат (найстаріші закриваються першими)
    let unpaidLessons: { id: string; date: string; time: string; amount: number }[] = [];
    if (isPerLesson) {
      const alloc = allocatePayments(student.lessons, student.payments);
      unpaidLessons = student.lessons
        .filter(
          (l) =>
            l.status === "COMPLETED" && (l.paymentStatus === "UNPAID" || l.paymentStatus === "DEBT")
        )
        .map((l) => {
          const parts = alloc.lessonParts[l.id] ?? [];
          const covered = parts.reduce((s, p) => s + p.amount, 0);
          return {
            startAt: l.startAt,
            id: l.id,
            amount: Math.max(0, Math.round((l.price - covered) * 100) / 100),
          };
        })
        .filter((x) => x.amount > 0)
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map((x) => ({
          id: x.id,
          date: kyivDate(x.startAt),
          time: kyivTime(x.startAt),
          amount: x.amount,
        }));
    }

    return {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      paymentFrequency: student.paymentFrequency,
      defaultLessonPrice: student.defaultLessonPrice,
      balance: calculateStudentBalance(student.lessons, student.payments, student.paymentFrequency),
      unpaidLessons,
      isPerLesson,
    };
  });

  // Один спільний список учнів для сторінки (тип оплати — для вкладок-фільтрів)
  const rows: PaymentRow[] = allStudentsWithBalance.map((s) => {
    const kind: PaymentKind = s.isPerLesson
      ? "perLesson"
      : s.paymentFrequency === "MONTHLY_PREPAID"
        ? "prepaid"
        : s.paymentFrequency && PERIODIC_FREQUENCIES.includes(s.paymentFrequency)
          ? "periodic"
          : "other";
    return {
      id: s.id,
      fullName: `${s.firstName} ${s.lastName ?? ""}`.trim(),
      balance: s.balance,
      kind,
      lessonsLeft:
        kind === "prepaid" && s.balance < 0 && s.defaultLessonPrice > 0
          ? Math.floor(Math.abs(s.balance) / s.defaultLessonPrice)
          : null,
      unpaidLessons: s.unpaidLessons,
      lessonPrice: s.isPerLesson ? s.defaultLessonPrice : 0,
    };
  });

  const debtorsList = allStudentsWithBalance
    .filter((s) => s.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const totalDebt = debtorsList.reduce((sum, s) => sum + s.balance, 0);

  const { start: monthStart, end: monthEnd } = getKyivMonthRange(new Date());

  const monthLessons = await prisma.lesson.findMany({
    where: { startAt: { gte: monthStart, lt: monthEnd }, paymentStatus: "PAID" },
  });
  const monthPayments = await prisma.payment.findMany({
    where: { paidAt: { gte: monthStart, lt: monthEnd }, status: "PAID" },
  });
  const monthIncome =
    monthLessons.reduce((sum, l) => sum + l.price, 0) +
    monthPayments.reduce((sum, p) => sum + p.amount, 0);

  // Прогноз місяця (так само, як на головній): усі заплановані, проведені й перенесені уроки місяця
  const forecastLessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: monthStart, lt: monthEnd },
      status: { in: ["SCHEDULED", "COMPLETED", "RESCHEDULED"] },
    },
    select: { price: true },
  });
  const monthForecast = forecastLessons.reduce((sum, l) => sum + l.price, 0);
  const potentialLeft = Math.max(0, monthForecast - monthIncome);
  const receivedPercent =
    monthForecast > 0 ? Math.min(100, Math.round((monthIncome / monthForecast) * 100)) : 0;

  const monthName = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", month: "long" }).format(new Date());
  const uah = (n: number) => `${n.toLocaleString("uk-UA")} грн`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Оплати</h1>
          <p className="text-sm text-gray-400 capitalize">{monthName}</p>
        </div>
        <div className="flex items-center gap-1">
          <MoneyCheckButton />
          <PaymentsMoreMenu>
            <ResetPaymentsButton />
          </PaymentsMoreMenu>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 mb-1 leading-tight">
            <span className="sm:hidden">Борги</span>
            <span className="hidden sm:inline">Загальний борг</span>
          </p>
          <p className={`text-base sm:text-2xl font-bold ${totalDebt > 0 ? "text-red-600" : "text-gray-800"}`}>
            {uah(totalDebt)}
          </p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1 leading-tight">
            {debtorsList.length === 0 ? "ніхто не винен" : `учнів з боргом: ${debtorsList.length}`}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 mb-1 leading-tight">
            <span className="sm:hidden">Отримано</span>
            <span className="hidden sm:inline">Отримано цього місяця</span>
          </p>
          <p className="text-base sm:text-2xl font-bold text-green-600">{uah(monthIncome)}</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1 leading-tight">
            {receivedPercent}% від прогнозу
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 mb-1 leading-tight">
            <span className="sm:hidden">Ще зайде</span>
            <span className="hidden sm:inline">Ще може зайти</span>
          </p>
          <p className="text-base sm:text-2xl font-bold text-gray-800">{uah(potentialLeft)}</p>
          <div className="mt-2 h-1.5 sm:h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${receivedPercent}%` }} />
          </div>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1 leading-tight">
            прогноз {uah(monthForecast)}
          </p>
        </div>
      </div>

      <PaymentsList rows={rows} />
    </div>
  );
}
