@AGENTS.md

# Teacher CRM — інструкція для Claude

CRM для онлайн-уроків англійської Саші (Олександри). Власник проєкту — Паша. Мова інтерфейсу, повідомлень і коментарів — **українська**. Часовий пояс — **Europe/Kyiv** (сервер Vercel працює в UTC, тож дати завжди форматуй з `timeZone: "Europe/Kyiv"`).

Продакшн: https://teacher-crm-psi.vercel.app (Vercel, проєкт `teacher-crm`, тариф Hobby). Репозиторій: GitHub `pavelvvson-spec/teacher-crm`, гілка `main`.

## ⚠️ Правила (обов'язково)

1. **Кожен push у `main` одразу йде на робочий сайт Саші.** Спершу коротко опиши Паші план змін і дочекайся «так». Великі зміни — по частинах.
2. **Жодних ключів, токенів, паролів у коді, комітах чи чаті.** Усі секрети — лише у Vercel → Settings → Environment Variables. Якщо користувач вставив секрет у чат — попроси його замінити.
3. **База оновлюється сама під час деплою**: `build` = `prisma migrate deploy && next build`. Зміни схеми — завжди через новий файл міграції в `prisma/migrations/<timestamp>_<name>/migration.sql` (PostgreSQL, Neon). Міграції лише додають (нові таблиці/колонки з default або nullable) — нічого не видаляй і не перейменовуй без явного дозволу.
4. Перед комітом перевір типи: `npx tsc --noEmit`. Якщо впаде міграція або збірка — Vercel залишить попередню версію сайту.
5. Файли в репозиторії з кінцями рядків **CRLF** (Windows) — зберігай так само.
6. Це **Next.js 16** (App Router, `src/proxy.ts` замість middleware) і **Prisma 7** (`prisma.config.ts`, `@prisma/adapter-pg`). API можуть відрізнятися від того, що ти пам'ятаєш, — див. `AGENTS.md`.
7. Паша відправляє зміни з комп'ютера командами `git add .` → `git commit -m "..."` → `git push`. Пояснюй йому кроки простою мовою, покроково.

## Що вміє CRM

- **Учні, уроки, оплати, розклад** (повторювані уроки), звіти — основа CRM.
- **Telegram-бот** (`/api/telegram/webhook`): нагадування учням, ДЗ, вечірній чекап для вчительки (кнопки «Проведено / Не відбувся / Оплачено»).
- **ШІ-підготовка уроку**: кнопка «✨ Підготувати з ШІ» у вікні підготовки уроку → план + ДЗ.
- **Журнал учня** (`StudentJournalEntry`) — сирі записи для ШІ: текст ✍️, голосові 🎙️, записи уроків 🎧 Fireflies. **Портрет учня** (`Student.aiPortrait`) — підсумок ШІ з журналу, оновлюється кнопкою.
- **ШІ-помічник у Telegram** — лише в чаті вчительки (`Settings.teacherTelegramChatId`): записує в журнал, радить щодо учня, готує урок (кнопка «Зберегти в урок»), розуміє голосові (Groq Whisper). Пам'ять розмови — 3 год (`AssistantMessage`).
- **Google-календар Саші**: CRM сама ставить уроки на 5 тижнів уперед (службовий акаунт), оновлює при змінах уроків і щовечора. Потрібно, щоб Fireflies сам заходив на уроки.
- **Fireflies → журнал**: після уроку вебхук → CRM бере транскрипт → Claude робить короткий конспект → запис у журнал учня + повідомлення вчительці в Telegram (з кнопкою «Прибрати з журналу»). Підстраховка — щоденна перевірка в cron і кнопка в налаштуваннях.
- **Посилання на Zoom учню**: кнопка «🔗 Надіслати посилання Zoom» у вікні уроку. Telegram + підключений бот → автоматично; Viber або непідключений Telegram → відкривається месенджер з готовим текстом (Viber-бот платний — €100/міс, тому не використовується). У картці учня: `contactChannel` (TELEGRAM/VIBER) і `viberPhone`.

- **Методика**: усі ШІ-запити отримують загальну методичну інструкцію (`src/lib/pedagogy.ts`, вікові групи, помилки, тон) + «Мою методику» вчительки (`Settings.methodology`, має пріоритет) + вік учня (`Student.birthYear` / `isAdult`). Методика формується з анкети (15 питань), скриньки ідей (текст, голос, скріншоти; у боті — «в методику: …» або фото) і нових питань, які ШІ складає зі спостережень на уроках (від 5 спостережень). ШІ ніколи не змінює методику без «Прийняти» вчительки. Нагадування — у вечірньому cron.

Налаштування й статуси всіх інтеграцій — сторінка CRM **Налаштування** (`/settings/telegram`).

## Де що в коді

| Що | Файли |
|---|---|
| Схема БД | `prisma/schema.prisma`, `prisma/migrations/` |
| Виклик Claude API | `src/lib/anthropic.ts` (`callClaude`, `journalToText`) |
| План уроку з ШІ | `src/lib/lesson-prep.ts`, `src/app/api/lessons/[id]/ai-prep/route.ts`, `src/components/AiPrepButton.tsx` |
| Журнал і портрет | `src/app/api/students/[id]/journal`, `.../portrait`, `src/components/StudentJournal.tsx` |
| Telegram-бот | `src/app/api/telegram/webhook/route.ts`, `src/lib/telegram.ts` |
| ШІ-помічник | `src/lib/teacher-assistant.ts`, голос — `src/lib/transcribe.ts` |
| Google-календар | `src/lib/google-calendar.ts` (`syncCalendarSafely` викликається після змін уроків) |
| Fireflies | `src/lib/fireflies.ts`, `src/lib/fireflies-webhook.ts`, `src/app/api/fireflies/*` |
| Zoom-посилання | `src/lib/lesson-link.ts`, `src/app/api/lessons/[id]/send-link`, `src/components/SendLinkButton.tsx` |
| Календар і вікно уроку | `src/components/CalendarView.tsx`, підготовка — `src/components/LessonsPrepView.tsx` |
| Картка учня | `src/components/StudentForm.tsx`, `src/app/(dashboard)/students/[id]/page.tsx` |
| Методика | `src/lib/pedagogy.ts`, `src/lib/methodology.ts`, `src/app/api/methodology/*`, `src/components/MethodologyPanel.tsx` |
| Cron | `vercel.json` (щоденний чекап; там же синхронізація календаря й перевірка Fireflies) |
| Захист сторінок | `src/proxy.ts` — усе закрито входом, крім публічних шляхів (вебхуки, cron, логін) |

## Змінні у Vercel (лише назви)

`DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_APP_URL`, `BLOB2_READ_WRITE_TOKEN` (сховище файлів),
`ANTHROPIC_API_KEY` (+ необов'язково `ANTHROPIC_MODEL`), `GROQ_API_KEY`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (або `GOOGLE_SERVICE_ACCOUNT_JSON`), `GOOGLE_CALENDAR_ID`, `DEFAULT_MEETING_LINK`,
`FIREFLIES_API_KEY`, `FIREFLIES_WEBHOOK_SECRET`. Необов'язково: `TELEGRAM_WEBHOOK_SECRET`.

Після зміни змінної потрібен Redeploy.

## ШІ і витрати

- Модель за замовчуванням — **Claude Haiku** (`claude-haiku-5-5`), змінюється через `ANTHROPIC_MODEL` без зміни коду.
- Ліміт витрат в Anthropic Console — $10/міс, автопоповнення вимкнене. Реальні витрати ~$3–5/міс (Claude + Groq).
- Fireflies — безкоштовний тариф (API: 50 запитів/добу). Не додавай частих запитів до Fireflies.
- Перш ніж додавати платний сервіс або дорожчу модель — скажи Паші, скільки це коштуватиме на місяць при реальному обсязі (~100 уроків/міс).

## Безпека даних учнів

Серед учнів є діти. У ШІ надсилаються лише ім'я, рівень, нотатки, журнал, транскрипти — без телефонів і прізвищ, де можна обійтися. ШІ-помічник відповідає тільки в чаті вчительки, учні його не бачать. Записи уроків — лише з попередженням учнів/батьків.
