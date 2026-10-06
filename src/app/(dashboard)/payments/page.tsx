import { prisma } from "@/lib/prisma";
import { calculateStudentBalance, allocatePayments } from "@/lib/payments-utils";
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

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const monthLessons = await prisma.lesson.findMany({
    where: { startAt: { gte: monthStart, lte: monthEnd }, paymentStatus: "PAID" },
  });
  const monthPayments = await prisma.payment.findMany({
    where: { paidAt: { gte: monthStart, lte: monthEnd }, status: "PAID" },
  });
  const monthIncome =
    monthLessons.reduce((sum, l) => sum + l.price, 0) +
    monthPayments.reduce((sum, p) => sum + p.amount, 0);

  // Прогноз місяця (так само, як на головній): усі заплановані, проведені й перенесені уроки місяця
  const forecastLessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: monthStart, lte: monthEnd },
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

  function renderButtons(s: Row) {
    const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
    return (
      <div className="flex gap-2 flex-wrap">
        <PaymentsHistoryButton studentId={s.id} studentName={fullName} />
        <StudentLedgerButton studentId={s.id} studentName={fullName} />
      </div>
    );
  }

  function renderPayButton(s: Row) {
    const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
    return (
      <AddPaymentButton
        studentId={s.id}
        studentName={fullName}
        lessons={s.unpaidLessons}
        lessonPrice={s.isPerLesson ? s.defaultLessonPrice : 0}
      />
    );
  }

  function renderStudentRow(s: Row) {
    const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
    return (
      <div key={s.id} className="flex items-center justify-between py-3 gap-2">
        <div className="space-y-1">
          <p className="font-medium text-gray-800">{fullName}</p>
          {renderButtons(s)}
        </div>
        <div className="flex items-center gap-3">
          <p className={`font-semibold ${balanceColor(s.balance)}`}>{balanceLabel(s.balance)}</p>
          {renderPayButton(s)}
        </div>
      </div>
    );
  }

  function renderPrepaidRow(s: (typeof prepaidStudents)[number]) {
    const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
    return (
      <div key={s.id} className="flex items-center justify-between py-3 gap-2">
        <div className="space-y-1">
          <p className="font-medium text-gray-800">{fullName}</p>
          {renderButtons(s)}
        </div>
        <div className="flex items-center gap-3">
          {s.balance > 0 ? (
            <p className="font-semibold text-red-600">Борг: {s.balance} грн</p>
          ) : (
            <p className="font-semibold text-purple-700">
              Залишилось: {Math.abs(s.balance)} грн (~{s.lessonsLeft} ур.)
            </p>
          )}
          {renderPayButton(s)}
        </div>
      </div>
    );
  }

  function renderAllRow(s: Row) {
    const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
    const text = s.balance === 0 ? "Баланс 0" : balanceLabel(s.balance);
    const color = s.balance === 0 ? "text-gray-500" : balanceColor(s.balance);
    return (
      <div key={s.id} className="flex items-center justify-between py-3 gap-2">
        <div className="space-y-1">
          <p className="font-medium text-gray-800">{fullName}</p>
          {renderButtons(s)}
        </div>
        <div className="flex items-center gap-3">
          <p className={`font-semibold text-sm ${color}`}>{text}</p>
          {renderPayButton(s)}
        </div>
      </div>
    );
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Загальний борг</p>
          <details>
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-baseline gap-2">
              <span className="text-2xl font-bold text-red-600">{totalDebt} грн</span>
              {debtorsList.length > 0 && (
                <span className="text-sm italic text-pink-600 underline decoration-dotted">Хто?</span>
              )}
            </summary>
            {debtorsList.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-gray-800">
                {debtorsList.map((s) => (
                  <li key={s.id}>{`${s.firstName} ${s.lastName ?? ""}`.trim()}</li>
                ))}
              </ul>
            )}
          </details>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Оплачено за поточний місяць</p>
          <p className="text-2xl font-bold text-green-600">{monthIncome} грн</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Ще може зайти за місяць</p>
          <p className="text-2xl font-bold text-pink-600">{potentialLeft} грн</p>
          <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${receivedPercent}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            надійшло {monthIncome} з {monthForecast} грн прогнозу ({receivedPercent}%)
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