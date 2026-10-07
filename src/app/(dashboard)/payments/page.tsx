import { prisma } from "@/lib/prisma";
import { calculateStudentBalance, allocatePayments } from "@/lib/payments-utils";
import { kyivWallTimeToUtc } from "@/lib/kyiv-time";
import ResetPaymentsButton from "@/components/ResetPaymentsButton";
import AddPaymentButton from "@/components/AddPaymentButton";
import PaymentsHistoryButton from "@/components/PaymentsHistoryButton";
import MoneyCheckButton from "@/components/MoneyCheckButton";
import StudentLedgerButton from "@/components/StudentLedgerButton";

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

  type Row = (typeof allStudentsWithBalance)[number];

  // Колонка 1: поурочні, лише ті, у кого є борг або передоплата
  const perLessonDebtors = allStudentsWithBalance
    .filter((s) => s.isPerLesson && s.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  // Колонка 2: усі помісячні / потижневі, завжди
  const periodicStudents = allStudentsWithBalance
    .filter((s) => s.paymentFrequency && PERIODIC_FREQUENCIES.includes(s.paymentFrequency))
    .sort((a, b) => b.balance - a.balance);

  // Колонка 3: усі, хто платить наперед, завжди
  const prepaidStudents = allStudentsWithBalance
    .filter((s) => s.paymentFrequency === "MONTHLY_PREPAID")
    .map((s) => ({
      ...s,
      lessonsLeft:
        s.defaultLessonPrice > 0 ? Math.floor(Math.abs(s.balance) / s.defaultLessonPrice) : 0,
    }))
    .sort((a, b) => a.balance - b.balance);

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

  function balanceLabel(balance: number) {
    if (balance > 0) return `Борг: ${balance} грн`;
    if (balance < 0) return `Передоплата: ${Math.abs(balance)} грн`;
    return "Усе оплачено";
  }

  function balanceColor(balance: number) {
    if (balance > 0) return "text-red-600";
    if (balance < 0) return "text-pink-600";
    return "text-green-600";
  }

  // Рядок учня у два поверхи:
  // зверху ім'я і сума, знизу всі кнопки (Історія, Журнал, Внести оплату)
  function renderRowLayout(s: Row, amountNode: React.ReactNode) {
    const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
    return (
      <div key={s.id} className="py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium text-gray-800">{fullName}</p>
          <div className="text-right shrink-0">{amountNode}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PaymentsHistoryButton studentId={s.id} studentName={fullName} />
          <StudentLedgerButton studentId={s.id} studentName={fullName} />
          <AddPaymentButton
            studentId={s.id}
            studentName={fullName}
            lessons={s.unpaidLessons}
            lessonPrice={s.isPerLesson ? s.defaultLessonPrice : 0}
          />
        </div>
      </div>
    );
  }

  function renderStudentRow(s: Row) {
    return renderRowLayout(
      s,
      <p className={`font-semibold text-sm sm:text-base ${balanceColor(s.balance)}`}>
        {balanceLabel(s.balance)}
      </p>
    );
  }

  function renderPrepaidRow(s: (typeof prepaidStudents)[number]) {
    return renderRowLayout(
      s,
      s.balance > 0 ? (
        <p className="font-semibold text-sm sm:text-base text-red-600">Борг: {s.balance} грн</p>
      ) : (
        <>
          <p className="font-semibold text-sm sm:text-base text-purple-700">
            Залишилось: {Math.abs(s.balance)} грн
          </p>
          <p className="text-xs text-purple-500">~{s.lessonsLeft} ур.</p>
        </>
      )
    );
  }

  function renderAllRow(s: Row) {
    const text = s.balance === 0 ? "Баланс 0" : balanceLabel(s.balance);
    const color = s.balance === 0 ? "text-gray-500" : balanceColor(s.balance);
    return renderRowLayout(s, <p className={`font-semibold text-sm ${color}`}>{text}</p>);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-800">Оплати</h1>
        <div className="flex items-center gap-2">
          <MoneyCheckButton />
          <ResetPaymentsButton />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 mb-1 leading-tight">
            <span className="sm:hidden">Борг</span>
            <span className="hidden sm:inline">Загальний борг</span>
          </p>
          <details>
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex flex-wrap items-baseline gap-x-2">
              <span className="text-base sm:text-2xl font-bold text-red-600">{totalDebt} грн</span>
              {debtorsList.length > 0 && (
                <span className="text-xs sm:text-sm italic text-pink-600 underline decoration-dotted">Хто?</span>
              )}
            </summary>
            {debtorsList.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs sm:text-sm text-gray-800">
                {debtorsList.map((s) => (
                  <li key={s.id}>{`${s.firstName} ${s.lastName ?? ""}`.trim()}</li>
                ))}
              </ul>
            )}
          </details>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 mb-1 leading-tight">
            <span className="sm:hidden">Оплачено</span>
            <span className="hidden sm:inline">Оплачено за поточний місяць</span>
          </p>
          <p className="text-base sm:text-2xl font-bold text-green-600">{monthIncome} грн</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 mb-1 leading-tight">
            <span className="sm:hidden">Ще зайде</span>
            <span className="hidden sm:inline">Ще може зайти за місяць</span>
          </p>
          <p className="text-base sm:text-2xl font-bold text-pink-600">{potentialLeft} грн</p>
          <div className="mt-2 h-1.5 sm:h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${receivedPercent}%` }} />
          </div>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-1 leading-tight">
            <span className="sm:hidden">{receivedPercent}% з {monthForecast}</span>
            <span className="hidden sm:inline">
              надійшло {monthIncome} з {monthForecast} грн прогнозу ({receivedPercent}%)
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Поурочна оплата</h2>
          <p className="text-xs text-gray-400 mb-3">Показані ті, у кого є борг або передоплата</p>
          {perLessonDebtors.length === 0 ? (
            <p className="text-gray-500">Боргів немає — усе оплачено.</p>
          ) : (
            <div className="divide-y divide-gray-100">{perLessonDebtors.map(renderStudentRow)}</div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Помісячна / потижнева оплата</h2>
          <p className="text-xs text-gray-400 mb-3">Усі учні з такою оплатою</p>
          {periodicStudents.length === 0 ? (
            <p className="text-gray-500">Немає учнів з такою оплатою.</p>
          ) : (
            <div className="divide-y divide-gray-100">{periodicStudents.map(renderStudentRow)}</div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Передоплата на місяць</h2>
          <p className="text-xs text-gray-400 mb-3">Усі учні, які платять наперед</p>
          {prepaidStudents.length === 0 ? (
            <p className="text-gray-500">Немає учнів з оплатою наперед.</p>
          ) : (
            <div className="divide-y divide-gray-100">{prepaidStudents.map(renderPrepaidRow)}</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Усі учні</h2>
        <p className="text-sm text-gray-500 mb-3">
          Тут є всі активні учні, навіть з нульовим балансом. «Внести оплату» працює для будь-кого, «Журнал» показує всі
          уроки й оплати.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 divide-y md:divide-y-0 divide-gray-100">
          {allStudentsWithBalance.map(renderAllRow)}
        </div>
      </div>
    </div>
  );
}