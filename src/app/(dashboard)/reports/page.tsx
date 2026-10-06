import { prisma } from "@/lib/prisma";
import { paymentMethodLabel } from "@/lib/payments-utils";

export const dynamic = "force-dynamic";

function formatLessonDateTimeKyiv(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateKyiv(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Не оплачено",
  DEBT: "Борг",
  PARTIALLY_PAID: "Частково оплачено",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const from = params.from ? new Date(params.from) : defaultFrom;
  const to = params.to ? new Date(params.to + "T23:59:59") : defaultTo;

  const lessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: from, lte: to },
      status: "COMPLETED",
    },
    include: { student: true },
  });

  const totalAmount = lessons.reduce((sum: number, l: typeof lessons[number]) => sum + l.price, 0);
  const paidAmount = lessons
    .filter((l: typeof lessons[number]) => l.paymentStatus === "PAID")
    .reduce((sum: number, l: typeof lessons[number]) => sum + l.price, 0);

  // Уроки передоплатників не вважаємо "неоплаченими" — гроші за них уже внесені наперед,
  // просто не прив'язані до конкретного уроку.
  const unpaidAmount = lessons
    .filter(
      (l: typeof lessons[number]) =>
        l.paymentStatus !== "PAID" && l.student.paymentFrequency !== "MONTHLY_PREPAID"
    )
    .reduce((sum: number, l: typeof lessons[number]) => sum + l.price, 0);

  const debtorsMap = new Map<string, { name: string; amount: number }>();
  for (const lesson of lessons) {
    if (lesson.student.paymentFrequency === "MONTHLY_PREPAID") continue;
    if (lesson.paymentStatus === "UNPAID" || lesson.paymentStatus === "DEBT") {
      const key = lesson.studentId;
      const existing = debtorsMap.get(key);
      const name = `${lesson.student.firstName} ${lesson.student.lastName ?? ""}`.trim();
      if (existing) {
        existing.amount += lesson.price;
      } else {
        debtorsMap.set(key, { name, amount: lesson.price });
      }
    }
  }
  const debtors = Array.from(debtorsMap.values());

  // Список оплачених за період: уроки, позначені оплаченими, і окремі оплати
  const paidLessons = lessons
    .filter((l: typeof lessons[number]) => l.paymentStatus === "PAID")
    .sort(
      (a: typeof lessons[number], b: typeof lessons[number]) =>
        a.startAt.getTime() - b.startAt.getTime()
    );

  const periodPayments = await prisma.payment.findMany({
    where: {
      status: "PAID",
      OR: [
        { paidAt: { gte: from, lte: to } },
        { paidAt: null, createdAt: { gte: from, lte: to } },
      ],
    },
    include: { student: true },
  });
  const sortedPayments = periodPayments.sort(
    (a: typeof periodPayments[number], b: typeof periodPayments[number]) =>
      (b.paidAt ?? b.createdAt).getTime() - (a.paidAt ?? a.createdAt).getTime()
  );
  const paymentsTotal = sortedPayments.reduce(
    (sum: number, p: typeof sortedPayments[number]) => sum + p.amount,
    0
  );

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const allUnpaidLessons = await prisma.lesson.findMany({
    where: {
      status: "COMPLETED",
      paymentStatus: { in: ["UNPAID", "DEBT", "PARTIALLY_PAID"] },
      student: { paymentFrequency: { not: "MONTHLY_PREPAID" } },
    },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Звіти</h1>

      <form className="bg-white rounded-2xl shadow-sm p-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Від</label>
          <input
            type="date"
            name="from"
            defaultValue={fromStr}
            className="px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">До</label>
          <input
            type="date"
            name="to"
            defaultValue={toStr}
            className="px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-3 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700"
        >
          Показати
        </button>
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Проведено уроків</p>
          <p className="text-xl font-semibold text-gray-800">{lessons.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Загальна сума</p>
          <p className="text-xl font-semibold text-gray-800">{totalAmount} грн</p>
        </div>

        <details className="bg-white rounded-2xl shadow-sm p-4 open:col-span-2 sm:open:col-span-4">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <p className="text-sm text-gray-500">
              Оплачено <span className="text-xs text-pink-600">(натисни, щоб побачити хто)</span>
            </p>
            <p className="text-xl font-semibold text-green-600">{paidAmount} грн</p>
          </summary>

          <div className="mt-4 space-y-5">
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-1">
                Уроки, позначені оплаченими ({paidLessons.length} шт, {paidAmount} грн)
              </p>
              <p className="text-xs text-gray-500 mb-2">
                Для них дата оплати не зберігається, тому показана дата уроку.
              </p>
              {paidLessons.length === 0 ? (
                <p className="text-sm text-gray-500">За цей період таких уроків немає.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {paidLessons.map((l: typeof paidLessons[number]) => (
                    <div key={l.id} className="flex items-center justify-between py-2 gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {l.student.firstName} {l.student.lastName ?? ""}
                        </p>
                        <p className="text-xs text-gray-500">
                          урок {formatLessonDateTimeKyiv(l.startAt)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-green-600">{l.price} грн</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-800 mb-1">
                Окремі оплати з «Історії оплат» ({sortedPayments.length} шт, {paymentsTotal} грн)
              </p>
              <p className="text-xs text-gray-500 mb-2">
                Це оплати, внесені окремо (за борг, передоплата). Вони не входять у суму картки
                «Оплачено» вище.
              </p>
              {sortedPayments.length === 0 ? (
                <p className="text-sm text-gray-500">За цей період окремих оплат немає.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sortedPayments.map((p: typeof sortedPayments[number]) => (
                    <div key={p.id} className="flex items-center justify-between py-2 gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {p.student.firstName} {p.student.lastName ?? ""}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDateKyiv(p.paidAt ?? p.createdAt)} · {paymentMethodLabel(p.paymentMethod)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-green-600">{p.amount} грн</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </details>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Не оплачено</p>
          <p className="text-xl font-semibold text-red-600">{unpaidAmount} грн</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Список боржників за період</h2>
        {debtors.length === 0 ? (
          <p className="text-gray-500">Боржників за цей період немає.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {debtors.map((d, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <p className="font-medium text-gray-800">{d.name}</p>
                <p className="font-semibold text-red-600">{d.amount} грн</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Неоплачені уроки (за весь час)</h2>
        <p className="text-sm text-gray-500 mb-3">
          Список кожного окремого неоплаченого уроку — для звірки, незалежно від обраного періоду вище.
        </p>
        {allUnpaidLessons.length === 0 ? (
          <p className="text-gray-500">Неоплачених уроків немає — усе оплачено.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {allUnpaidLessons.map((lesson: typeof allUnpaidLessons[number]) => (
              <div key={lesson.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-800">
                    {lesson.student.firstName} {lesson.student.lastName ?? ""}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatLessonDateTimeKyiv(lesson.startAt)} ·{" "}
                    {PAYMENT_STATUS_LABELS[lesson.paymentStatus] ?? lesson.paymentStatus}
                  </p>
                </div>
                <p className="font-semibold text-red-600">{lesson.price} грн</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}