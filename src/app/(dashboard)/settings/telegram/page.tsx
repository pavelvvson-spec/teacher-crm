import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { isCalendarConfigured, serviceAccountEmail } from "@/lib/google-calendar";
import CalendarSyncButton from "@/components/CalendarSyncButton";
import { isFirefliesConfigured } from "@/lib/fireflies";
import MethodologyPanel from "@/components/MethodologyPanel";
import BreakNotificationsPanel from "@/components/BreakNotificationsPanel";

export const dynamic = "force-dynamic";

type Tab = "method" | "telegram" | "connections";

function StatusChip({ ok, okText = "Працює", badText = "Не налаштовано" }: { ok: boolean; okText?: string; badText?: string }) {
  return ok ? (
    <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg whitespace-nowrap">✓ {okText}</span>
  ) : (
    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-lg whitespace-nowrap">{badText}</span>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; calOk?: string; calError?: string; ffOk?: string; ffError?: string }>;
}) {
  const { tab: tabParam, calOk, calError, ffOk, ffError } = await searchParams;
  // Після «Синхронізувати» / «Перевірити записи» повертаємось на вкладку «Підключення»
  const tab: Tab =
    tabParam === "telegram" || tabParam === "connections" || tabParam === "method"
      ? tabParam
      : calOk || calError || ffOk || ffError
        ? "connections"
        : "method";

  const firefliesReady = isFirefliesConfigured();
  const calendarReady = isCalendarConfigured();
  const saEmail = serviceAccountEmail();
  const settings = await prisma.settings.findFirst();
  const teacherConnected = Boolean(settings?.teacherTelegramChatId);
  const tickReady = Boolean(process.env.TICK_SECRET);

  const TABS: { key: Tab; label: string }[] = [
    { key: "method", label: "Методика" },
    { key: "telegram", label: "Telegram" },
    { key: "connections", label: "Підключення" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Налаштування</h1>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/settings/telegram?tab=${t.key}`}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium ${
                tab === t.key ? "bg-white text-pink-700 shadow-sm" : "text-gray-600 hover:text-gray-800"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {tab === "method" && <MethodologyPanel />}

      {tab === "telegram" && (
        <>
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-800">🤖 Бот для вчительки</h2>
              <StatusChip ok={teacherConnected} okText="Підключено" badText="Не підключено" />
            </div>
            {teacherConnected ? (
              <p className="text-gray-600 text-sm">
                Бот пише Саші в Telegram: після уроків, вечірній чекап о 21:00 (непідтверджені уроки й підсумок за
                день), записи з Fireflies і відповіді ШІ-помічника.
              </p>
            ) : (
              <>
                <p className="text-gray-600 text-sm">Щоб підключити, відкрийте чат з ботом у Telegram і надішліть:</p>
                <div className="bg-gray-50 rounded-xl px-4 py-2 font-mono text-sm text-gray-800">/start_teacher</div>
              </>
            )}
            {teacherConnected && (
              <form action="/api/telegram/unlink-teacher" method="post">
                <button type="submit" className="text-xs text-gray-400 hover:text-red-600 underline">
                  Відключити чат вчительки
                </button>
              </form>
            )}
          </div>

          <BreakNotificationsPanel
            initialEnabled={settings?.breakNotificationsEnabled ?? true}
            initialMinMinutes={settings?.breakMinMinutes ?? 20}
            telegramConnected={teacherConnected}
            tickConfigured={tickReady}
          />

          <details className="group bg-white rounded-2xl shadow-sm p-5">
            <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-800">✨ Що вміє ШІ-помічник</h2>
              <span className="text-sm text-gray-400 group-open:hidden">показати</span>
              <span className="text-sm text-gray-400 hidden group-open:inline">сховати</span>
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-gray-600 text-sm">
                У чаті вчительки можна просто писати боту, як колезі. Помічник відповідає лише в цьому чаті — учні й
                сторонні його не бачать.
              </p>
              <ul className="text-gray-600 text-sm list-disc pl-5 space-y-1">
                <li>«Маша сьогодні нарешті заговорила, але плутає has/have» — запише в журнал Маші.</li>
                <li>«Що робити з Ліною, їй нудно на уроках?» — порадить з урахуванням журналу й портрета.</li>
                <li>«Підготуй урок із Сонею» — складе план на найближчий урок, його можна зберегти в урок.</li>
                <li>Будь-яке методичне питання без конкретного учня.</li>
                <li>🎙️ Можна надсилати голосові (до 5 хвилин) — бот розпізнає їх і обробить як текст.</li>
              </ul>
            </div>
          </details>

          <p className="text-xs text-gray-400 px-1">
            Чи підключений учень до бота — тепер видно в картці учня, біля поля Telegram.
          </p>
        </>
      )}

      {tab === "connections" && (
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
          <div className="p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-800">📅 Google-календар</h2>
              <StatusChip ok={calendarReady} />
            </div>
            <p className="text-gray-500 text-sm">
              Уроки на 5 тижнів уперед самі з'являються в календарі Саші з посиланням Zoom — так Fireflies знає, на
              який урок зайти.
            </p>
            {calOk && <p className="text-sm text-green-600">✓ Синхронізовано: {calOk}</p>}
            {calError && <p className="text-sm text-red-600">⚠️ {calError}</p>}
            {calendarReady && (
              <details className="group">
                <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer text-sm text-gray-400 hover:text-gray-600">
                  <span className="group-open:hidden">Детальніше ▾</span>
                  <span className="hidden group-open:inline">Сховати ▴</span>
                </summary>
                <div className="mt-2 space-y-2">
                  {saEmail && (
                    <p className="text-xs text-gray-500 break-all">
                      Службовий акаунт (йому має бути відкрито доступ до календаря): {saEmail}
                    </p>
                  )}
                  <CalendarSyncButton />
                </div>
              </details>
            )}
          </div>

          <div className="p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-800">🎧 Fireflies</h2>
              <StatusChip ok={firefliesReady} />
            </div>
            <p className="text-gray-500 text-sm">
              Після записаного уроку ШІ робить стислий запис у журнал учня, а Саші приходить повідомлення в Telegram.
            </p>
            {ffOk && <p className="text-sm text-green-600">✓ {ffOk}</p>}
            {ffError && <p className="text-sm text-red-600">⚠️ {ffError}</p>}
            {firefliesReady && (
              <details className="group">
                <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer text-sm text-gray-400 hover:text-gray-600">
                  <span className="group-open:hidden">Детальніше ▾</span>
                  <span className="hidden group-open:inline">Сховати ▴</span>
                </summary>
                <form action="/api/fireflies/poll" method="post" className="mt-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                  >
                    Перевірити нові записи зараз
                  </button>
                </form>
              </details>
            )}
          </div>

          <div className="p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-800">⏰ Будильник (cron-job.org)</h2>
              <StatusChip ok={tickReady} okText="Налаштовано" />
            </div>
            <p className="text-gray-500 text-sm">
              Кожні 5 хвилин перевіряє розклад — потрібен для повідомлень про перерви після уроків.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
