import { prisma } from "@/lib/prisma";
import { calculateStudentBalance, allocatePayments } from "@/lib/payments-utils";
import { kyivWallTimeToUtc } from "@/lib/kyiv-time";
import ResetPaymentsButton from "@/components/ResetPaymentsButton";
import MoneyCheckButton from "@/components/MoneyCheckButton";
import PaymentsMoreMenu from "@/components/PaymentsMoreMenu";
import PaymentsList, { type PaymentKind, type PaymentRow } from "@/components/PaymentsList";
import FinanceTabs from "@/components/FinanceTabs";
import InfoTip from "@/components/InfoTip";

export const dynamic = "force-dynamic";

const WEEK_FREQUENCIES = ["WEEKLY", "END_OF_WEEK"];
const MONTH_FREQUENCIES = ["MONTHLY", "END_OF_MONTH"];

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

// Сьогоднішня дата за Києвом (рік, місяць 0-11, день, день тижня 0=нд)
function kyivToday(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: Number(map.year), m: Number(map.month) - 1, d: Number(map.day), wd: WD[map.weekday] ?? 1 };
}

const uah = (n: number) => `${Math.round(n).toLocaleString("uk-UA")} грн`;

export default async function PaymentsPage() {
  const now = new Date();
  const t = kyivToday(now);
  const monthStart = kyivWallTimeToUtc(t.y, t.m, 1, 0, 0);
  const monthEnd = kyivWallTimeToUtc(t.y, t.m + 1, 1, 0, 0);
  const weekStart = kyivWallTimeToUtc(t.y, t.m, t.d - ((t.wd + 6) % 7), 0, 0); // понеділок

  const students = await prisma.student.findMany({
    where: { isActive: true },
    include: { lessons: true, payments: true },
    orderBy: { firstName: "asc" },
  });

  const rows: PaymentRow[] = students.map((student) => {
    const freq = student.paymentFrequency || "PER_LESSON";
    const isPerLesson = freq === "PER_LESSON";
    const kind: PaymentKind = isPerLesson
      ? "perLesson"
      : freq === "MONTHLY_PREPAID"
        ? "prepaid"
        : WEEK_FREQUENCIES.includes(freq) || MONTH_FREQUENCIES.includes(freq)
          ? "periodic"
          : "other";

    const balance = calculateStudentBalance(student.lessons, student.payments, student.paymentFrequency);

    // Що ще не закрито оплатами по кожному проведеному уроку (найстаріші закриваються першими)
    const alloc = allocatePayments(student.lessons, student.payments);
    const owed = student.lessons
      .filter((l) => l.status === "COMPLETED" && (l.paymentStatus === "UNPAID" || l.paymentStatus === "DEBT"))
      .map((l) => {
        const covered = (alloc.lessonParts[l.id] ?? []).reduce((s, p) => s + p.amount, 0);
        return { id: l.id, startAt: l.startAt, amount: Math.max(0, Math.round((l.price - covered) * 100) / 100) };
      })
      .filter((x) => x.amount > 0)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

    // Борг (термін минув) і «до сплати за графіком» (для тих, хто платить у кінці тижня/місяця)
    let overdue = 0;
    let upcoming = 0;
    if (balance > 0) {
      const periodStart = WEEK_FREQUENCIES.includes(freq)
        ? weekStart
        : MONTH_FREQUENCIES.includes(freq)
          ? monthStart
          : null;
      const overdueRaw = periodStart
        ? owed.filter((x) => x.startAt < periodStart).reduce((s, x) => s + x.amount, 0)
        : balance;
      overdue = Math.min(overdueRaw, balance);
      upcoming = Math.round((balance - overdue) * 100) / 100;
    }

    return {
      id: student.id,
      fullName: `${student.firstName} ${student.lastName ?? ""}`.trim(),
      balance,
      overdue,
      upcoming,
      kind,
      lessonsLeft:
        kind === "prepaid" && balance < 0 && student.defaultLessonPrice > 0
          ? Math.floor(Math.abs(balance) / student.defaultLessonPrice)
          : null,
      unpaidLessons: isPerLesson
        ? owed.map((x) => ({ id: x.id, date: kyivDate(x.startAt), time: kyivTime(x.startAt), amount: x.amount }))
        : [],
      lessonPrice: isPerLesson ? student.defaultLessonPrice : 0,
    };
  });

  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0);
  const totalUpcoming = rows.reduce((s, r) => s + r.upcoming, 0);
  const totalPrepaid = rows.reduce((s, r) => s + (r.balance < 0 ? -r.balance : 0), 0);
  const overdueCount = rows.filter((r) => r.overdue > 0).length;

  // Отримано цього місяця — так само, як у «Підсумках»: оплати за датою оплати + старі позначки «оплачено»
  const monthFlagLessons = await prisma.lesson.findMany({
    where: { startAt: { gte: monthStart, lt: monthEnd }, paymentStatus: "PAID" },
    select: { price: true },
  });
  const monthPayments = await prisma.payment.findMany({
    where: {
      status: "PAID",
      OR: [
        { paidAt: { gte: monthStart, lt: monthEnd } },
        { paidAt: null, createdAt: { gte: monthStart, lt: monthEnd } },
      ],
    },
    select: { amount: true },
  });
  const monthIncome =
    monthFlagLessons.reduce((s, l) => s + l.price, 0) + monthPayments.reduce((s, p) => s + p.amount, 0);

  const monthName = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", month: "long" }).format(now);

  return (
    <div className="space-y-5">
      <FinanceTabs
        active="students"
        actions={
          <div className="flex items-center gap-1">
            <MoneyCheckButton />
            <PaymentsMoreMenu>
              <ResetPaymentsButton />
            </PaymentsMoreMenu>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 mb-1 leading-tight flex items-center gap-1">
            <span>
              Отримано<span className="hidden sm:inline"> за {monthName}</span>
            </span>
            <InfoTip
              title="Отримано"
              text={`Усі гроші, які учні реально заплатили з 1 числа цього місяця до сьогодні (за датою оплати). Сюди входять і оплати наперед, і доплати за минулі уроки. Простими словами — скільки грошей уже прийшло в кишеню цього місяця.`}
            />
          </p>
          <p className="text-base sm:text-2xl font-bold text-green-600">{uah(monthIncome)}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 mb-1 leading-tight flex items-center gap-1">
            <span>Винні<span className="hidden sm:inline"> зараз</span></span>
            <InfoTip
              title="Винні зараз"
              text="Гроші за вже проведені уроки, за які мали заплатити, але ще не заплатили. Учні, які платять у кінці тижня чи місяця, сюди не входять, поки термін не минув — їхня сума показана нижче як «до сплати»."
            />
          </p>
          <p className={`text-base sm:text-2xl font-bold ${totalOverdue > 0 ? "text-red-600" : "text-gray-800"}`}>
            {uah(totalOverdue)}
          </p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1 leading-tight">
            {totalUpcoming > 0
              ? `+ ${uah(totalUpcoming)} до сплати`
              : overdueCount === 0
                ? "ніхто не винен"
                : `учнів: ${overdueCount}`}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 mb-1 leading-tight flex items-center gap-1">
            <span>Передоплати</span>
            <InfoTip
              align="right"
              title="Передоплати"
              text="Гроші, які учні заплатили наперед, а уроків за них ще не було. Вони вже у вас, але ці уроки ще треба провести."
            />
          </p>
          <p className="text-base sm:text-2xl font-bold text-violet-700">{uah(totalPrepaid)}</p>
        </div>
      </div>

      <PaymentsList rows={rows} />
    </div>
  );
}
