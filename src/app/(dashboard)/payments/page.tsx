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

  const studentsWithBalance = students
    .map((student) => ({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      paymentFrequency: student.paymentFrequency,
      balance: calculateStudentBalance(student.lessons, student.payments, student.paymentFrequency),
    }))
    .filter((s) => s.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  const perLessonDebtors = studentsWithBalance.filter(
    (s) => !s.paymentFrequency || s.paymentFrequency === "PER_LESSON"
  );
  const periodicDebtors = studentsWithBalance.filter(
    (s) => s.paymentFrequency && PERIODIC_FREQUENCIES.includes(s.paymentFrequency)
  );

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

  const totalDebt = studentsWithBalance
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

  function renderStudentRow(s: (typeof studentsWithBalance)[number]) {
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
          <p className={`font-semibold ${s.balance > 0 ? "text-red-600" : "text-pink-600"}`}>
            {s.balance > 0 ? `Борг: ${s.balance} грн` : `Передоплата: ${Math.abs(s.balance)} грн`}
          </p>
          {s.balance > 0 && <PayStudentButton studentId={s.id} />}
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
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Поурочна оплата</h2>
          {perLessonDebtors.length === 0 ? (
            <p className="text-gray-500">Боргів немає — усе оплачено.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {perLessonDebtors.map(renderStudentRow)}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Помісячна / потижнева оплата</h2>
          {periodicDebtors.length === 0 ? (
            <p className="text-gray-500">Боргів немає — усе оплачено.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {periodicDebtors.map(renderStudentRow)}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Передоплата на місяць</h2>
          {prepaidStudents.length === 0 ? (
            <p className="text-gray-500">Немає учнів з оплатою наперед.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {prepaidStudents.map(renderPrepaidRow)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}