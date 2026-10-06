import { prisma } from "@/lib/prisma";
import { calculateStudentBalance } from "@/lib/payments-utils";
import ResetPaymentsButton from "@/components/ResetPaymentsButton";
import PayStudentButton from "@/components/PayStudentButton";
import AddPrepaymentButton from "@/components/AddPrepaymentButton";
import PaymentsHistoryButton from "@/components/PaymentsHistoryButton";
import MoneyCheckButton from "@/components/MoneyCheckButton";
import StudentLedgerButton from "@/components/StudentLedgerButton";

export const dynamic = "force-dynamic";

const PERIODIC_FREQUENCIES = ["WEEKLY", "MONTHLY", "END_OF_WEEK", "END_OF_MONTH"];

export default async function PaymentsPage() {
  const students = await prisma.student.findMany({
    where: { isActive: true },
    include: { lessons: true, payments: true },
    orderBy: { firstName: "asc" },
  });

  const allStudentsWithBalance = students.map((student) => ({
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    paymentFrequency: student.paymentFrequency,
    balance: calculateStudentBalance(student.lessons, student.payments, student.paymentFrequency),
  }));

  // Колонка 1: поурочні, лише ті, у кого є борг або передоплата
  const perLessonDebtors = allStudentsWithBalance
    .filter(
      (s) =>
        (!s.paymentFrequency || s.paymentFrequency === "PER_LESSON") && s.balance !== 0
    )
    .sort((a, b) => b.balance - a.balance);

  // Колонка 2: усі помісячні / потижневі, завжди
  const periodicStudents = allStudentsWithBalance
    .filter((s) => s.paymentFrequency && PERIODIC_FREQUENCIES.includes(s.paymentFrequency))
    .sort((a, b) => b.balance - a.balance);

  // Колонка 3: усі, хто платить наперед, завжди
  const prepaidStudents = students
    .filter((s) => s.paymentFrequency === "MONTHLY_PREPAID")
    .map((student) => {
      const balance = calculateStudentBalance(student.lessons, student.payments, student.paymentFrequency);
      const lessonsLeft =
        student.defaultLessonPrice > 0 ? Math.floor(Math.abs(balance) / student.defaultLessonPrice) : 0;
      return {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        balance,
        lessonsLeft,
      };
    })
    .sort((a, b) => a.balance - b.balance);

  const totalDebt = allStudentsWithBalance
    .filter((s) => s.balance > 0)
    .reduce((sum, s) => sum + s.balance, 0);

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

  function renderStudentRow(
    s: (typeof allStudentsWithBalance)[number],
    alwaysShowPayButton: boolean
  ) {
    const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
    return (
      <div key={s.id} className="flex items-center justify-between py-3 gap-2">
        <div className="space-y-1">
          <p className="font-medium text-gray-800">{fullName}</p>
          <div className="flex gap-2 flex-wrap">
            <PaymentsHistoryButton studentId={s.id} studentName={fullName} />
            <StudentLedgerButton studentId={s.id} studentName={fullName} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className={`font-semibold ${balanceColor(s.balance)}`}>{balanceLabel(s.balance)}</p>
          {(alwaysShowPayButton || s.balance > 0) && <PayStudentButton studentId={s.id} />}
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
          <div className="flex gap-2 flex-wrap">
            <PaymentsHistoryButton studentId={s.id} studentName={fullName} />
            <StudentLedgerButton studentId={s.id} studentName={fullName} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {s.balance > 0 ? (
            <p className="font-semibold text-red-600">Борг: {s.balance} грн</p>
          ) : (
            <p className="font-semibold text-purple-700">
              Залишилось: {Math.abs(s.balance)} грн (~{s.lessonsLeft} ур.)
            </p>
          )}
          <AddPrepaymentButton studentId={s.id} />
        </div>
      </div>
    );
  }

  function renderAllRow(s: (typeof allStudentsWithBalance)[number]) {
    const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
    const text = s.balance === 0 ? "Баланс 0" : balanceLabel(s.balance);
    const color = s.balance === 0 ? "text-gray-500" : balanceColor(s.balance);
    return (
      <div key={s.id} className="flex items-center justify-between py-3 gap-2">
        <div className="space-y-1">
          <p className="font-medium text-gray-800">{fullName}</p>
          <div className="flex gap-2 flex-wrap">
            <PaymentsHistoryButton studentId={s.id} studentName={fullName} />
            <StudentLedgerButton studentId={s.id} studentName={fullName} />
          </div>
        </div>
        <p className={`font-semibold text-sm ${color}`}>{text}</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Загальний борг</p>
          <p className="text-2xl font-bold text-red-600">{totalDebt} грн</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Оплачено за поточний місяць</p>
          <p className="text-2xl font-bold text-green-600">{monthIncome} грн</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Поурочна оплата</h2>
          <p className="text-xs text-gray-400 mb-3">Показані ті, у кого є борг або передоплата</p>
          {perLessonDebtors.length === 0 ? (
            <p className="text-gray-500">Боргів немає — усе оплачено.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {perLessonDebtors.map((s) => renderStudentRow(s, false))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Помісячна / потижнева оплата</h2>
          <p className="text-xs text-gray-400 mb-3">Усі учні з такою оплатою</p>
          {periodicStudents.length === 0 ? (
            <p className="text-gray-500">Немає учнів з такою оплатою.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {periodicStudents.map((s) => renderStudentRow(s, true))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Передоплата на місяць</h2>
          <p className="text-xs text-gray-400 mb-3">Усі учні, які платять наперед</p>
          {prepaidStudents.length === 0 ? (
            <p className="text-gray-500">Немає учнів з оплатою наперед.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {prepaidStudents.map(renderPrepaidRow)}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Усі учні</h2>
        <p className="text-sm text-gray-500 mb-3">
          Тут є всі активні учні, навіть з нульовим балансом. Натисни «Журнал», щоб побачити всі уроки й оплати.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 divide-y md:divide-y-0 divide-gray-100">
          {allStudentsWithBalance.map(renderAllRow)}
        </div>
      </div>
    </div>
  );
}