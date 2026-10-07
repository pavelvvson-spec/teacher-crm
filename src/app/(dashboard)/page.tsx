import { prisma } from "@/lib/prisma";
import CheerBanner from "@/components/CheerBanner";

export const dynamic = "force-dynamic";

const KYIV_TZ = "Europe/Kyiv";

function formatHours(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} хв`;
  if (minutes === 0) return `${hours} год`;
  return `${hours} год ${minutes} хв`;
}

// Частини дати (рік, місяць, день, години...) за київським часом
function kyivParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KYIV_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month") - 1,
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

// Різниця між київським часом і UTC у мілісекундах
function kyivOffsetMs(date: Date): number {
  const p = kyivParts(date);
  const asUtc = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// Створює момент часу за київським годинником
function kyivDate(year: number, month: number, day: number, h = 0, m = 0, s = 0): Date {
  const guess = new Date(Date.UTC(year, month, day, h, m, s));
  return new Date(guess.getTime() - kyivOffsetMs(guess));
}

function formatKyivTime(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: KYIV_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function HomePage() {
  const now = new Date();
  const { year, month, day } = kyivParts(now);

  const startOfToday = kyivDate(year, month, day);
  const endOfToday = kyivDate(year, month, day, 23, 59, 59);
  const startOfMonth = kyivDate(year, month, 1);
  const endOfMonth = kyivDate(year, month + 1, 0, 23, 59, 59);

  const todayLessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: startOfToday, lte: endOfToday },
      status: { in: ["SCHEDULED", "COMPLETED", "RESCHEDULED"] },
    },
    include: { student: true },
    orderBy: { startAt: "asc" },
  });

  const todayIncome = todayLessons.reduce(
    (sum: number, l: typeof todayLessons[number]) => sum + l.price,
    0
  );

  const monthLessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: startOfMonth, lte: endOfMonth },
      status: { in: ["SCHEDULED", "COMPLETED", "RESCHEDULED"] },
    },
    select: { price: true, duration: true },
  });

  const monthForecast = monthLessons.reduce(
    (sum: number, l: typeof monthLessons[number]) => sum + l.price,
    0
  );

  const monthMinutes = monthLessons.reduce(
    (sum: number, l: typeof monthLessons[number]) => sum + l.duration,
    0
  );

  return (
    <div className="space-y-6">
      <CheerBanner />

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 leading-tight">
            <span className="sm:hidden">Сьогодні</span>
            <span className="hidden sm:inline">Уроків сьогодні</span>
          </p>
          <p className="text-base sm:text-2xl font-semibold text-gray-800 mt-1 sm:mt-0">
            {todayLessons.length}
            <span className="sm:hidden text-xs font-medium text-gray-500"> ур.</span>
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 leading-tight">
            <span className="sm:hidden">Заробиш</span>
            <span className="hidden sm:inline">Заробиш сьогодні</span>
          </p>
          <p className="text-base sm:text-2xl font-semibold text-green-600 mt-1 sm:mt-0">{todayIncome} грн</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5">
          <p className="text-[11px] sm:text-sm text-gray-500 leading-tight">
            <span className="sm:hidden">Прогноз</span>
            <span className="hidden sm:inline">Прогноз на місяць</span>
          </p>
          <p className="text-base sm:text-2xl font-semibold text-pink-600 mt-1 sm:mt-0">{monthForecast} грн</p>
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1 leading-tight">
            <span className="sm:hidden">{monthLessons.length} ур.</span>
            <span className="hidden sm:inline">{monthLessons.length} уроків за календарем</span>
          </p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 leading-tight">
            ≈ {formatHours(monthMinutes)}
            <span className="hidden sm:inline"> роботи</span>
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Заплановано на сьогодні</h2>
        {todayLessons.length === 0 ? (
          <p className="text-gray-500">На сьогодні уроків немає.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {todayLessons.map((lesson: typeof todayLessons[number]) => (
              <div key={lesson.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-800">
                    {lesson.student.firstName} {lesson.student.lastName ?? ""}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatKyivTime(new Date(lesson.startAt))} · {lesson.duration} хв
                  </p>
                </div>
                <p className="font-semibold text-pink-600">{lesson.price} грн</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}