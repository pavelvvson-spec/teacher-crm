import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TelegramSettingsPage() {
  const students = await prisma.student.findMany({
    where: { isActive: true },
    orderBy: { firstName: "asc" },
  });

  const recentReminders = await prisma.reminder.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { student: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Налаштування Telegram</h1>

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
                    {new Date(reminder.createdAt).toLocaleString("uk-UA")}
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