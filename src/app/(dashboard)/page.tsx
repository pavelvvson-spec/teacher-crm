import { prisma } from "@/lib/prisma";
import { formatTime } from "@/lib/calendar-utils";

export const dynamic = "force-dynamic";

function formatHours(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} хв`;
  if (minutes === 0) return `${hours} год`;
  return `${hours} год ${minutes} хв`;
}

export default async function HomePage() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

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
      <div className="bg-pink-600 text-white rounded-2xl shadow-sm p-4 sm:p-6 text-center">
        <p className="text-lg sm:text-xl font-semibold">Сашуню, у тебе все вийде! 💪💖</p>
      </div>

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
                    {formatTime(new Date(lesson.startAt))} · {lesson.duration} хв
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