import { prisma } from "@/lib/prisma";
import { allocatePayments } from "@/lib/payments-utils";
import FinanceTabs from "@/components/FinanceTabs";
import InfoTip from "@/components/InfoTip";
import Link from "next/link";
import { kyivWallTimeToUtc } from "@/lib/kyiv-time";

export const dynamic = "force-dynamic";

type Ymd = { y: number; m: number; d: number }; // m: 0..11

// Сьогоднішня дата за Києвом
function kyivToday(): Ymd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return { y: Number(map.year), m: Number(map.month) - 1, d: Number(map.day) };
}

// "2026-10-01" -> { y: 2026, m: 9, d: 1 }
function parseYmd(value: string | undefined): Ymd | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

// Нормалізує дату (наприклад, 32 жовтня -> 1 листопада)
function normalizeYmd(y: number, m: number, d: number): Ymd {
  const dt = new Date(Date.UTC(y, m, d));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

function ymdToString(v: Ymd): string {
  return `${v.y}-${String(v.m + 1).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;
}


export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;

  // Період за київським часом: за замовчуванням поточний місяць
  const today = kyivToday();
  const thisMonthFrom: Ymd = { y: today.y, m: today.m, d: 1 };
  const thisMonthTo: Ymd = normalizeYmd(today.y, today.m + 1, 0);
  const lastMonthFrom: Ymd = normalizeYmd(today.y, today.m - 1, 1);
  const lastMonthTo: Ymd = normalizeYmd(today.y, today.m, 0);
  const yearFrom: Ymd = { y: today.y, m: 0, d: 1 };
  const yearTo: Ymd = { y: today.y, m: 11, d: 31 };

  const fromYmd = parseYmd(params.from) ?? thisMonthFrom;
  const toYmd = parseYmd(params.to) ?? thisMonthTo;
  const dayAfterTo = normalizeYmd(toYmd.y, toYmd.m, toYmd.d + 1);

  // from: початок першого дня; to: початок дня ПІСЛЯ останнього (не включно)
  const from = kyivWallTimeToUtc(fromYmd.y, fromYmd.m, fromYmd.d, 0, 0);
  const to = kyivWallTimeToUtc(dayAfterTo.y, dayAfterTo.m, dayAfterTo.d, 0, 0);

  const fromStr = ymdToString(fromYmd);
  const toStr = ymdToString(toYmd);
  const presets = [
    { label: "Цей місяць", from: ymdToString(thisMonthFrom), to: ymdToString(thisMonthTo) },
    { label: "Минулий місяць", from: ymdToString(lastMonthFrom), to: ymdToString(lastMonthTo) },
    { label: "Цей рік", from: ymdToString(yearFrom), to: ymdToString(yearTo) },
  ];
  const activePreset = presets.find((p) => p.from === fromStr && p.to === toStr);

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

  // ЗАРОБЛЕНО: проведені уроки за період (ціна), незалежно від оплати
  const lessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: from, lt: to },
      status: "COMPLETED",
    },
    include: { student: true },
  });
  const earned = lessons.reduce((sum: number, l: typeof lessons[number]) => sum + l.price, 0);
  const minutes = lessons.reduce((sum: number, l: typeof lessons[number]) => sum + l.duration, 0);

  // ПЛАН: усі проведені й заплановані уроки періоду (як «Прогноз» на головній)
  const planLessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: from, lt: to },
      status: { in: ["SCHEDULED", "COMPLETED", "RESCHEDULED"] },
    },
    select: { price: true },
  });
  const plan = planLessons.reduce((sum: number, l: typeof planLessons[number]) => sum + l.price, 0);
  const planPercent = plan > 0 ? Math.min(100, Math.round((earned / plan) * 100)) : 0;

  // ОТРИМАНО: уроки, позначені оплаченими (старі записи), і окремі оплати за датою оплати
  const paidFlagLessons = await prisma.lesson.findMany({
    where: { startAt: { gte: from, lt: to }, paymentStatus: "PAID" },
    include: { student: true },
  });
  const paidFlagTotal = paidFlagLessons.reduce(
    (sum: number, l: typeof paidFlagLessons[number]) => sum + l.price,
    0
  );
  const periodPayments = await prisma.payment.findMany({
    where: {
      status: "PAID",
      OR: [
        { paidAt: { gte: from, lt: to } },
        { paidAt: null, createdAt: { gte: from, lt: to } },
      ],
    },
    include: { student: true },
  });
  const paymentsTotal = periodPayments.reduce(
    (sum: number, p: typeof periodPayments[number]) => sum + p.amount,
    0
  );
  const received = paidFlagTotal + paymentsTotal;

  // Розбивка отриманого: за уроки цього періоду і все інше (наперед або за попередні уроки)
  const unpaidForPeriod = lessons
    .filter(
      (l: typeof lessons[number]) =>
        l.paymentStatus !== "PAID" && l.student.paymentFrequency !== "MONTHLY_PREPAID"
    )
    .reduce((sum: number, l: typeof lessons[number]) => sum + owedFor(l), 0);
  const receivedForPeriodLessons = Math.min(received, Math.max(0, earned - unpaidForPeriod));
  const receivedOther = Math.max(0, received - receivedForPeriodLessons);

  // Хто скільки приніс за період
  const perStudentMap = new Map<string, { id: string; name: string; total: number }>();
  for (const p of periodPayments) {
    const name = `${p.student.firstName} ${p.student.lastName ?? ""}`.trim();
    const entry = perStudentMap.get(p.studentId) ?? { id: p.studentId, name, total: 0 };
    entry.total += p.amount;
    perStudentMap.set(p.studentId, entry);
  }
  for (const l of paidFlagLessons) {
    const name = `${l.student.firstName} ${l.student.lastName ?? ""}`.trim();
    const entry = perStudentMap.get(l.studentId) ?? { id: l.studentId, name, total: 0 };
    entry.total += l.price;
    perStudentMap.set(l.studentId, entry);
  }
  const perStudent = Array.from(perStudentMap.values()).sort((a, b) => b.total - a.total);
  const maxPerStudent = perStudent[0]?.total ?? 0;

  const uah = (n: number) => `${Math.round(n).toLocaleString("uk-UA")} грн`;
  const hours = Math.round((minutes / 60) * 10) / 10;

  return (
    <div className="space-y-5">
      <FinanceTabs active="summary" />

      {/* Період */}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Link
            key={p.label}
            href={`/reports?from=${p.from}&to=${p.to}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              activePreset?.label === p.label
                ? "bg-pink-600 text-white"
                : "bg-white text-gray-700 shadow-sm hover:bg-gray-50"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <details open={!activePreset}>
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-gray-700 shadow-sm hover:bg-gray-50">
            Свої дати
          </summary>
          <form className="mt-2 bg-white rounded-2xl shadow-sm p-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-gray-500">
              Від
              <input
                type="date"
                name="from"
                defaultValue={fromStr}
                className="block mt-0.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800"
              />
            </label>
            <label className="text-xs text-gray-500">
              До
              <input
                type="date"
                name="to"
                defaultValue={toStr}
                className="block mt-0.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800"
              />
            </label>
            <button
              type="submit"
              className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700"
            >
              Показати
            </button>
          </form>
        </details>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500 mb-1 flex items-center gap-1">
            Отримано
            <InfoTip
              title="Отримано"
              text="Усі гроші, які учні реально заплатили за цей період (за датою оплати). Сюди входять і оплати наперед, і доплати за минулі уроки. Простими словами — скільки грошей прийшло в кишеню."
            />
          </p>
          <p className="text-xl sm:text-2xl font-bold text-green-600">{uah(received)}</p>
          {received > 0 && receivedOther > 0 && (
            <p className="text-[11px] sm:text-xs text-gray-400 mt-1 leading-snug">
              {uah(receivedForPeriodLessons)} — за уроки періоду, {uah(receivedOther)} — наперед або за попередні
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500 mb-1 flex items-center gap-1">
            Зароблено
            <InfoTip
              align="right"
              title="Зароблено"
              text="Скільки коштують усі проведені уроки за цей період. Не важливо, заплатили за них уже чи ні — це «скільки роботи зроблено». Урок «не прийшов, але оплачується» теж сюди входить."
            />
          </p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{uah(earned)}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500 mb-1 flex items-center gap-1">
            План
            <InfoTip
              title="План"
              text="Скільки коштують усі уроки цього періоду в календарі — і вже проведені, і ще заплановані. Скасовані не рахуються. Смужка показує, яку частину плану вже відпрацьовано (зароблено з плану)."
            />
          </p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{uah(plan)}</p>
          <div className="mt-2 h-1.5 sm:h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-pink-500" style={{ width: `${planPercent}%` }} />
          </div>
          <p className="text-[11px] sm:text-xs text-gray-400 mt-1">відпрацьовано {planPercent}%</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
          <p className="text-xs sm:text-sm text-gray-500 mb-1 flex items-center gap-1">
            Проведено уроків
            <InfoTip
              align="right"
              title="Проведено уроків"
              text="Скільки уроків за цей період позначено як «Проведено». Скасовані уроки і «не прийшов, не оплачується» не рахуються."
            />
          </p>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{lessons.length}</p>
          <p className="text-[11px] sm:text-xs text-gray-400 mt-1">≈ {hours.toLocaleString("uk-UA")} год роботи</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1 flex items-center gap-1.5">
          Хто скільки заплатив
          <InfoTip
            title="Хто скільки заплатив"
            text="Скільки грошей заплатив кожен учень за цей період. Разом це дорівнює сумі «Отримано»."
          />
        </h2>
        {perStudent.length === 0 ? (
          <p className="text-gray-500 text-sm">За цей період оплат ще не було.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {perStudent.map((s) => (
              <li key={s.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-800 truncate">{s.name}</span>
                  <span className="font-semibold text-gray-800 whitespace-nowrap">{uah(s.total)}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-green-400"
                    style={{ width: `${maxPerStudent > 0 ? Math.round((s.total / maxPerStudent) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
