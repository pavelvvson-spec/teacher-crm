import { prisma } from "@/lib/prisma";
import { calculateStudentBalance } from "@/lib/payments-utils";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const students = await prisma.student.findMany({
    where: { isActive: true },
    include: { lessons: true },
    orderBy: { firstName: "asc" },
  });

  const studentsWithBalance = students
    .map((student: typeof students[number]) => ({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      balance: calculateStudentBalance(student.lessons),
    }))
    .filter((s: { balance: number }) => s.balance !== 0)
    .sort((a: { balance: number }, b: { balance: number }) => b.balance - a.balance);

  const totalDebt = studentsWithBalance
    .filter((s: { balance: number }) => s.balance > 0)
    .reduce((sum: number, s: { balance: number }) => sum + s.balance, 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const monthLessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: monthStart, lte: monthEnd },
      paymentStatus: "PAID",
    },
  });

  const monthIncome = monthLessons.reduce((sum: number, l: typeof monthLessons[number]) => sum + l.price, 0);

  

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Оплати</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm text-gray-500">Загальний борг учнів</p>
          <p className="text-2xl font-semibold text-red-600">{totalDebt} грн</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <p className="text-sm text-gray-500">Зароблено за поточний місяць</p>
          <p className="text-2xl font-semibold text-green-600">{monthIncome} грн</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Хто має неоплачені уроки</h2>
        {studentsWithBalance.length === 0 ? (
          <p className="text-gray-500">Боргів немає — усе оплачено.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {studentsWithBalance.map((s: typeof studentsWithBalance[number]) => (
              <div key={s.id} className="flex items-center justify-between py-3">
                <p className="font-medium text-gray-800">
                  {s.firstName} {s.lastName ?? ""}
                </p>
                <p className={`font-semibold ${s.balance > 0 ? "text-red-600" : "text-pink-600"}`}>
                  {s.balance > 0 ? `Борг: ${s.balance} грн` : `Передоплата: ${Math.abs(s.balance)} грн`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}