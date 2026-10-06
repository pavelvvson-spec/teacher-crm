import { prisma } from "@/lib/prisma";
import { paymentMethodLabel, allocatePayments } from "@/lib/payments-utils";

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

  // Скільки кожного неоплаченого уроку вже закрито оплатами (найстаріші уроки закриваються першими)
  const allStudents = await prisma.student.findMany({
    include: { lessons: true, payments: true },
  });
  const coveredByLesson = new Map<string, number>();
  for (const s of allStudents) {
    const alloc = allocatePayments(s.lessons, s.payments);
    for (const [lessonId, parts] of Object.entries(alloc.lessonParts)) {
      coveredByLesson.set(
        lessonId,
        parts.reduce((sum, p) => sum + p.amount, 0)
      );
    }
  }

  // Скільки за урок ще не оплачено
  function owedFor(lesson: { id: string; price: number; paymentStatus: string }): number {
    if (lesson.paymentStatus === "UNPAID" || lesson.paymentStatus === "DEBT") {
      const covered = coveredByLesson.get(lesson.id) ?? 0;
      return Math.max(0, Math.round((lesson.price - covered) * 100) / 100);
    }
    return lesson.price;
  }

  const lessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: from, lte: to },
      status: "COMPLETED",
    },
    include: { student: true },
  });

  const totalAmount = lessons.reduce((sum: number, l: typeof lessons[number]) => sum + l.price, 0);

  // Уроки, позначені оплаченими, і окремі оплати за період
  const paidFlagLessons = await prisma.lesson.findMany({
    where: { startAt: { gte: from, lte: to }, paymentStatus: "PAID" },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });
  const paidFlagTotal = paidFlagLessons.reduce(
    (sum: number, l: typeof paidFlagLessons[number]) => sum + l.price,
    0
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

  const paidAmount = paidFlagTotal + paymentsTotal;

  // Уроки передоплатників не вважаємо "неоплаченими" — гроші за них уже внесені наперед,
  // просто не прив'язані до конкретного уроку.
  const unpaidAmount = lessons
    .filter(
      (l: typeof lessons[number]) =>
        l.paymentStatus !== "PAID" && l.student.paymentFrequency !== "MONTHLY_PREPAID"
    )
    .reduce((sum: number, l: typeof lessons[number]) => sum + owedFor(l), 0);

  const debtorsMap = new Map<string, { name: string; amount: number }>();
  for (const lesson of lessons) {
    if (lesson.student.paymentFrequency === "MONTHLY_PREPAID") continue;
    if (lesson.paymentStatus === "UNPAID" || lesson.paymentStatus === "DEBT") {
      const owed = owedFor(lesson);
      if (owed <= 0) continue;
      const key = lesson.studentId;
      const existing = debtorsMap.get(key);
      const name = `${lesson.student.firstName} ${lesson.student.lastName ?? ""}`.trim();
      if (existing) {
        existing.amount += owed;
      } else {
        debtorsMap.set(key, { name, amount: owed });
      }
    }
  }
  const debtors = Array.from(debtorsMap.values());

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const unpaidCandidates = await prisma.lesson.findMany({
    where: {
      status: "COMPLETED",
      paymentStatus: { in: ["UNPAID", "DEBT", "PARTIALLY_PAID"] },
      student: { paymentFrequency: { not: "MONTHLY_PREPAID" } },
    },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });
  // Показуємо тільки те, що ще не покрито оплатами
  const allUnpaidLessons = unpaidCandidates.filter(
    (l: typeof unpaidCandidates[number]) => owedFor(l) > 0
  );

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
                Окремі оплати ({sortedPayments.length} шт, {paymentsTotal} грн)
              </p>
              <p className="text-xs text-gray-500 mb-2">
                Дата це день, коли гроші надійшли.
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

            <div>
              <p className="text-sm font-semibold text-gray-800 mb-1">
                Уроки, позначені оплаченими ({paidFlagLessons.length} шт, {paidFlagTotal} грн)
              </p>
              <p className="text-xs text-gray-500 mb-2">
                Для них дата оплати не зберігається, тому показана дата уроку.
              </p>
              {paidFlagLessons.length === 0 ? (
                <p className="text-sm text-gray-500">За цей період таких уроків немає.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {paidFlagLessons.map((l: typeof paidFlagLessons[number]) => (
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
          Уроки, які ще не закриті оплатами, для звірки, незалежно від обраного періоду вище. Оплати
          закривають найстаріші уроки першими.
        </p>
        {allUnpaidLessons.length === 0 ? (
          <p className="text-gray-500">Неоплачених уроків немає — усе оплачено.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {allUnpaidLessons.map((lesson: typeof allUnpaidLessons[number]) => {
              const owed = owedFor(lesson);
              return (
                <div key={lesson.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-800">
                      {lesson.student.firstName} {lesson.student.lastName ?? ""}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatLessonDateTimeKyiv(lesson.startAt)} ·{" "}
                      {PAYMENT_STATUS_LABELS[lesson.paymentStatus] ?? lesson.paymentStatus}
                      {owed < lesson.price && ` · частково покрито оплатою (урок ${lesson.price} грн)`}
                    </p>
                  </div>
                  <p className="font-semibold text-red-600">{owed} грн</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}