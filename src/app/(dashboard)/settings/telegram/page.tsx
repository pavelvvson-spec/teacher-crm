import { prisma } from "@/lib/prisma";
import { isCalendarConfigured, serviceAccountEmail } from "@/lib/google-calendar";
import CalendarSyncButton from "@/components/CalendarSyncButton";
import { isFirefliesConfigured } from "@/lib/fireflies";
import MethodologyPanel from "@/components/MethodologyPanel";
import BreakNotificationsPanel from "@/components/BreakNotificationsPanel";

export const dynamic = "force-dynamic";

export default async function TelegramSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calOk?: string; calError?: string; ffOk?: string; ffError?: string }>;
}) {
  const { calOk, calError, ffOk, ffError } = await searchParams;
  const firefliesReady = isFirefliesConfigured();
  const calendarReady = isCalendarConfigured();
  const saEmail = serviceAccountEmail();
  const students = await prisma.student.findMany({
    where: { isActive: true },
    orderBy: { firstName: "asc" },
  });

  const recentReminders = await prisma.reminder.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { student: true },
  });

  const settings = await prisma.settings.findFirst();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Налаштування</h1>

      <MethodologyPanel />

      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Вечірній чекап для вчителя</h2>
        <p className="text-gray-600 text-sm">
          Щодня о 21:00 бот надсилає в цей чат список непідтверджених уроків за день з кнопками
          "Проведено" / "Не відбувся", а потім — підсумок по зароблених грошах.
        </p>
        <p className="text-gray-600 text-sm">
          Щоб підключити, відкрий чат з ботом у Telegram і надішли команду:
        </p>
        <div className="bg-gray-50 rounded-xl px-4 py-2 font-mono text-sm text-gray-800">
          /start_teacher
        </div>
        <div className="pt-2">
          {settings?.teacherTelegramChatId ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg">
                Підключено
              </span>
              <form action="/api/telegram/unlink-teacher" method="post">
                <button type="submit" className="text-xs text-gray-500 hover:text-red-600 underline">
                  Відключити чат вчительки
                </button>
              </form>
            </div>
          ) : (
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">
              Не підключено
            </span>
          )}
        </div>
      </div>

      <BreakNotificationsPanel
        initialEnabled={settings?.breakNotificationsEnabled ?? true}
        initialMinMinutes={settings?.breakMinMinutes ?? 20}
        telegramConnected={Boolean(settings?.teacherTelegramChatId)}
        tickConfigured={Boolean(process.env.TICK_SECRET)}
      />

      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">📅 Google-календар (для Fireflies)</h2>
        <p className="text-gray-600 text-sm">
          CRM сама ставить майбутні уроки (на 5 тижнів уперед) у Google-календар Саші з посиланням Zoom.
          Перенесли або скасували урок у CRM — календар оновиться сам. Fireflies бачить ці події і
          заходить на уроки автоматично.
        </p>
        {calendarReady ? (
          <div className="space-y-2">
            <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg">Налаштовано</span>
            {saEmail && (
              <p className="text-xs text-gray-500">
                Службовий акаунт (йому має бути відкрито доступ до календаря): {saEmail}
              </p>
            )}
            <CalendarSyncButton />
          </div>
        ) : (
          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">Не налаштовано</span>
        )}
        {calOk && <p className="text-sm text-green-600">✓ Синхронізовано: {calOk}</p>}
        {calError && <p className="text-sm text-red-600">⚠️ {calError}</p>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">🎧 Fireflies → журнал учня</h2>
        <p className="text-gray-600 text-sm">
          Після кожного записаного уроку CRM сама забирає текст з Fireflies, ШІ робить стислий запис у журнал
          учня, а вчительці приходить повідомлення в Telegram (з кнопкою «Прибрати з журналу»). Раз на добу CRM
          додатково перевіряє, чи нічого не пропущено.
        </p>
        {firefliesReady ? (
          <div className="space-y-2">
            <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg">Налаштовано</span>
            <form action="/api/fireflies/poll" method="post">
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                Перевірити нові записи зараз
              </button>
            </form>
          </div>
        ) : (
          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">Не налаштовано</span>
        )}
        {ffOk && <p className="text-sm text-green-600">✓ {ffOk}</p>}
        {ffError && <p className="text-sm text-red-600">⚠️ {ffError}</p>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">✨ ШІ-помічник у Telegram</h2>
        <p className="text-gray-600 text-sm">
          У чаті вчительки можна просто писати боту, як колезі. Помічник відповідає лише в цьому чаті —
          учні й сторонні його не бачать.
        </p>
        <ul className="text-gray-600 text-sm list-disc pl-5 space-y-1">
          <li>«Маша сьогодні нарешті заговорила, але плутає has/have» — запише в журнал Маші.</li>
          <li>«Що робити з Ліною, їй нудно на уроках?» — порадить з урахуванням журналу й портрета.</li>
          <li>«Підготуй урок із Сонею» — складе план на найближчий урок, його можна зберегти в урок.</li>
          <li>Будь-яке методичне питання без конкретного учня.</li>
          <li>🎙️ Можна надсилати голосові (до 5 хвилин) — бот розпізнає їх і обробить як текст.</li>
        </ul>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">Як під'єднати учня</h2>
        <p className="text-gray-600 text-sm">
          1. Переконайся, що в картці учня вказано правильний Telegram username.
        </p>
        <p className="text-gray-600 text-sm">
          2. Попроси учня знайти бота в Telegram і натиснути кнопку «Start» (або надіслати команду /start).
        </p>
        <p className="text-gray-600 text-sm">
          3. Система сама визначить учня за username і збереже його chat ID для нагадувань.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Статус учнів</h2>
        <div className="divide-y divide-gray-100">
          {students.map((student: typeof students[number]) => (
            <div key={student.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-gray-800">
                  {student.firstName} {student.lastName ?? ""}
                </p>
                <p className="text-sm text-gray-500">
                  {student.telegramUsername || "Username не вказано"}
                </p>
              </div>
              {student.telegramChatId ? (
                <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg">
                  Підключено
                </span>
              ) : (
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">
                  Не підключено
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Журнал нагадувань</h2>
        {recentReminders.length === 0 ? (
          <p className="text-gray-500">Нагадувань ще не надсилалось.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentReminders.map((reminder: typeof recentReminders[number]) => (
              <div key={reminder.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-800">
                    {reminder.student.firstName} {reminder.student.lastName ?? ""}
                  </p>
                  <p className="text-sm text-gray-500">
                    {reminder.reminderType === "H24" ? "За 24 год" : "За 2 год"} ·{" "}
                    {new Date(reminder.createdAt).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })}
                  </p>
                </div>
                {reminder.status === "SENT" ? (
                  <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg">
                    Надіслано
                  </span>
                ) : (
                  <span className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded-lg" title={reminder.errorMessage ?? ""}>
                    Помилка
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}