// Генерація вигаданих даних для демо-режиму. Працює ЛИШЕ з демо-базою (getDemoPrisma).
import type { PrismaClient } from "@prisma/client";
import { kyivWallTimeToUtc } from "@/lib/kyiv-time";

type Freq = "PER_LESSON" | "WEEKLY" | "MONTHLY" | "END_OF_WEEK" | "END_OF_MONTH" | "MONTHLY_PREPAID";
type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

type DemoStudent = {
  key: string;
  firstName: string;
  lastName: string;
  gender: "M" | "F";
  level: Level;
  duration: number;
  price: number;
  freq: Freq;
  slots: { wd: number; time: string }[]; // wd: 1=Пн … 5=Пт
  birth?: { d: number; m: number; y?: number; adult?: boolean } | "today";
  telegram?: string;
  notes?: string;
  active?: boolean;
};

const STUDENTS: DemoStudent[] = [
  { key: "s1", firstName: "Марко", lastName: "Ковальчук", gender: "M", level: "A2", duration: 50, price: 400, freq: "PER_LESSON", slots: [{ wd: 1, time: "15:00" }, { wd: 3, time: "15:00" }], birth: { d: 12, m: 3, y: 2014 }, telegram: "marko_k", notes: "Любить Minecraft і футбол. Мета — впевнено говорити на канікулах в Англії." },
  { key: "s2", firstName: "Софія", lastName: "Мельник", gender: "F", level: "B1", duration: 60, price: 450, freq: "MONTHLY_PREPAID", slots: [{ wd: 2, time: "16:00" }, { wd: 4, time: "16:00" }], birth: "today", telegram: "sofia_mel", notes: "Готується до НМТ. Сильна граматика, соромиться говорити." },
  { key: "s3", firstName: "Андрій", lastName: "Бондар", gender: "M", level: "B2", duration: 60, price: 550, freq: "END_OF_MONTH", slots: [{ wd: 1, time: "18:00" }, { wd: 4, time: "18:00" }], birth: { d: 5, m: 11, adult: true }, notes: "IT, працює з іноземними клієнтами. Потрібна бізнес-англійська і small talk." },
  { key: "s4", firstName: "Дарина", lastName: "Ткаченко", gender: "F", level: "A1", duration: 45, price: 350, freq: "PER_LESSON", slots: [{ wd: 2, time: "14:00" }, { wd: 5, time: "14:00" }], birth: { d: 22, m: 6, y: 2017 }, notes: "Перший рік англійської. Любить пісні й малювання." },
  { key: "s5", firstName: "Олег", lastName: "Савченко", gender: "M", level: "C1", duration: 60, price: 600, freq: "PER_LESSON", slots: [{ wd: 3, time: "19:00" }], birth: { d: 30, m: 1, adult: true }, notes: "Лікар, готується до IELTS (мета 7.5)." },
  { key: "s6", firstName: "Вікторія", lastName: "Лисенко", gender: "F", level: "A2", duration: 50, price: 400, freq: "END_OF_WEEK", slots: [{ wd: 1, time: "16:00" }, { wd: 3, time: "16:00" }], birth: { d: 14, m: 9, y: 2013 } },
  { key: "s7", firstName: "Максим", lastName: "Кравець", gender: "M", level: "B1", duration: 50, price: 450, freq: "PER_LESSON", slots: [{ wd: 2, time: "17:00" }, { wd: 5, time: "17:00" }], birth: { d: 3, m: 4, y: 2010 }, telegram: "max_kravets", notes: "Фанат комп'ютерних ігор, хоче стримити англійською." },
  { key: "s8", firstName: "Анна", lastName: "Шевчук", gender: "F", level: "B2", duration: 60, price: 550, freq: "MONTHLY_PREPAID", slots: [{ wd: 4, time: "19:00" }], birth: { d: 18, m: 12, adult: true }, notes: "Переїжджає до Канади. Фокус — розмовна мова і побутові ситуації." },
  { key: "s9", firstName: "Ілля", lastName: "Руденко", gender: "M", level: "A1", duration: 45, price: 350, freq: "PER_LESSON", slots: [{ wd: 3, time: "14:00" }], birth: { d: 9, m: 8, y: 2016 } },
  { key: "s10", firstName: "Катерина", lastName: "Поліщук", gender: "F", level: "B1", duration: 60, price: 500, freq: "MONTHLY", slots: [{ wd: 1, time: "11:00" }, { wd: 5, time: "11:00" }], birth: { d: 27, m: 2, adult: true }, notes: "Маркетолог. Хоче вільно читати професійні статті й вести дзвінки." },
  { key: "s11", firstName: "Тимур", lastName: "Гончар", gender: "M", level: "A2", duration: 50, price: 400, freq: "PER_LESSON", slots: [{ wd: 4, time: "15:00" }], birth: { d: 1, m: 5, y: 2012 } },
  { key: "s12", firstName: "Ліза", lastName: "Мороз", gender: "F", level: "A2", duration: 50, price: 400, freq: "PER_LESSON", slots: [{ wd: 2, time: "15:00" }], birth: { d: 20, m: 7, y: 2013 }, telegram: "liza_moroz" },
  { key: "s13", firstName: "Роман", lastName: "Захарченко", gender: "M", level: "B2", duration: 60, price: 550, freq: "PER_LESSON", slots: [], birth: { d: 11, m: 10, adult: true }, notes: "Графік плаваючий — домовляємось щоразу окремо." },
  { key: "s14", firstName: "Юлія", lastName: "Вовк", gender: "F", level: "C1", duration: 60, price: 600, freq: "END_OF_MONTH", slots: [{ wd: 3, time: "10:00" }], birth: { d: 6, m: 6, adult: true } },
  { key: "s15", firstName: "Денис", lastName: "Литвин", gender: "M", level: "A2", duration: 50, price: 400, freq: "PER_LESSON", slots: [], birth: { d: 2, m: 2, y: 2011 }, active: false },
];

// Простий передбачуваний генератор випадкових чисел (щоб демо щоразу було однаковим)
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function kyivToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: Number(map.year), m: Number(map.month) - 1, d: Number(map.day), wd: WD[map.weekday] ?? 1 };
}

// Дата (y,m,d) + n днів, у вигляді {y,m,d,wd}
function addDays(base: { y: number; m: number; d: number }, n: number) {
  const dt = new Date(Date.UTC(base.y, base.m, base.d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), wd: dt.getUTCDay() };
}

const NOTES_POOL = [
  "Повторити неправильні дієслова (go/went, see/saw). Гра «Що ти робив учора?» — 5 хв.",
  "Тема: подорожі. Ролева гра «В аеропорту». Нові слова: boarding pass, gate, luggage.",
  "Present Perfect vs Past Simple — 3 приклади з життя учня, потім вправа на картках.",
  "Говоріння: опис картинки 2 хв без зупинок. Виписати помилки, розібрати в кінці.",
  "Listening: коротке відео BBC Learning English, 5 питань на розуміння.",
  "Лексика «Їжа»: гра в ресторан, учень — офіціант. Порахувати рахунок англійською.",
  "Повторити числа до 100 і час. Пісенька «What time is it?»",
  "Phrasal verbs з get: get up, get on, get over. Склади історію з усіма трьома.",
];
const HOMEWORK_POOL = [
  "Вивчити 10 нових слів з картки і скласти з 5 речення.",
  "Workbook стор. 24, вправи 1–3. Записати голосове 1 хв про свої вихідні.",
  "Подивитися відео з уроку ще раз і виписати 5 нових фраз.",
  "Написати 6 речень про свою кімнату (There is / There are).",
  "Пройти вправу на Wordwall за посиланням і зробити скріншот результату.",
];
const JOURNAL_POOL: Record<string, { source: "TEXT" | "VOICE" | "FIREFLIES"; content: string; pct?: number }[]> = {
  s1: [
    { source: "TEXT", content: "Сьогодні нарешті сам розповів про свій футбольний матч, плутав was/were, але говорив сміливо." },
    { source: "FIREFLIES", content: "Що робили: Past Simple, розповідь про вихідні; гра «Правда чи вигадка».\nЩо вийшло: охоче говорив про футбол, швидко згадував правильні форми після підказки.\nТруднощі: was/were, закінчення -ed у вимові.\nНаступного разу: більше питань у Past Simple (Did you…?).", pct: 46 },
    { source: "VOICE", content: "Мама Марка написала, що він сам почав дивитися мультики англійською — це дуже мотивує." },
  ],
  s2: [
    { source: "TEXT", content: "Граматика майже ідеальна, але на говорінні замикається. Спрацювало, коли дала 1 хв на підготовку." },
    { source: "FIREFLIES", content: "Що робили: формат НМТ, читання і завдання на відповідність.\nЩо вийшло: читання 9/10, впевнено пояснює вибір.\nТруднощі: довгі паузи у вільному говорінні.\nНаступного разу: 3 короткі монологи з таймером.", pct: 31 },
  ],
  s3: [
    { source: "TEXT", content: "Попросив розібрати, як ввічливо не погодитись з клієнтом на дзвінку. Дала фрази I see your point, however…" },
    { source: "FIREFLIES", content: "Що робили: ролева гра «дзвінок з клієнтом», small talk.\nЩо вийшло: вільно тримає розмову, гарна лексика IT.\nТруднощі: артиклі, інколи пряма калька з української.\nНаступного разу: email-листування, 3 шаблони.", pct: 62 },
  ],
  s4: [
    { source: "TEXT", content: "Дуже любить співати. Пісня про кольори — запам'ятала всі 8 кольорів за урок!" },
    { source: "TEXT", content: "Швидко втомлюється після 30 хвилин — краще міняти активність кожні 7–10 хв." },
  ],
  s7: [
    { source: "FIREFLIES", content: "Що робили: лексика ігор і стримів, як описати свою гру.\nЩо вийшло: багато говорив, мотивований.\nТруднощі: порядок слів у питаннях, do/does.\nНаступного разу: інтерв'ю «стрімера» — питання і відповіді.", pct: 55 },
  ],
  s8: [
    { source: "TEXT", content: "Тема переїзду — оренда житла і банк. Дуже практичний урок, попросила більше таких ситуацій." },
  ],
  s13: [
    { source: "FIREFLIES", content: "Що робили: професії, Present Simple, частотні вирази.\nЩо вийшло: охоче розповідав про роботу родичів.\nТруднощі: -s у третій особі, прийменники at/in/for.\nНаступного разу: міні-презентація про свою роботу.", pct: 58 },
  ],
};
const PORTRAITS: Record<string, string> = {
  s1: "РІВЕНЬ І ПРОГРЕС: A2, помітний прогрес у говорінні за останній місяць.\n\nСИЛЬНІ СТОРОНИ: Сміливий, охоче говорить на улюблені теми (футбол, Minecraft).\n\nСЛАБКІ МІСЦЯ: was/were, вимова -ed.\n\nЩО МОТИВУЄ: футбол, ігри, мультики англійською.\n\nРЕКОМЕНДАЦІЇ:\n1. Будувати вправи на темі футболу.\n2. Коротка гра на Past Simple на початку кожного уроку.\n3. Хвалити за сміливість, помилки розбирати в кінці.",
  s2: "РІВЕНЬ І ПРОГРЕС: B1+, сильна граматика, читання на рівні B2.\n\nСЛАБКІ МІСЦЯ: страх говорити спонтанно.\n\nЩО ПРАЦЮЄ: хвилина на підготовку перед монологом, таймер.\n\nРЕКОМЕНДАЦІЇ:\n1. Щоуроку 2–3 короткі монологи з таймером.\n2. Теми з її інтересів (книги, подорожі).",
  s3: "РІВЕНЬ І ПРОГРЕС: B2, впевнений у бізнес-розмові.\n\nСЛАБКІ МІСЦЯ: артиклі, кальки з української.\n\nЦІЛІ: дзвінки й листування з клієнтами.\n\nРЕКОМЕНДАЦІЇ: ролеві ігри на реальних кейсах, шаблони листів.",
};
const METHODOLOGY = `Мої принципи:
- Учень має говорити більше, ніж я (мета — 60%+ часу).
- Кожен урок починаю з 5 хвилин розмови про життя учня.
- З дітьми міняю активність кожні 7–10 хвилин, з дорослими — працюю на реальних ситуаціях.
- Помилки розбираю в кінці, не перебиваю під час говоріння.
- ДЗ коротке, але щодня по 10 хвилин.`;

export async function seedDemo(db: PrismaClient): Promise<{ students: number; lessons: number; payments: number }> {
  // 1) Очищаємо демо-базу
  await db.lessonMaterial.deleteMany({});
  await db.payment.deleteMany({});
  await db.reminder.deleteMany({});
  await db.studentJournalEntry.deleteMany({});
  await db.assistantMessage.deleteMany({});
  await db.lesson.deleteMany({});
  await db.recurringSchedule.deleteMany({});
  await db.student.deleteMany({});
  await db.settings.deleteMany({});

  const rand = rng(20261009);
  const today = kyivToday();
  const now = new Date();
  const studentId = (key: string) => `demo-${key}`;

  // 2) Налаштування вчительки
  await db.settings.create({
    data: {
      teacherName: "Олена",
      methodology: METHODOLOGY,
      methodologyUpdatedAt: now,
      breakNotificationsEnabled: true,
      breakMinMinutes: 20,
    },
  });

  // 3) Учні
  for (const s of STUDENTS) {
    const birth =
      s.birth === "today"
        ? { birthDay: today.d, birthMonth: today.m + 1, birthYear: 2011, isAdult: false }
        : s.birth
          ? {
              birthDay: s.birth.d,
              birthMonth: s.birth.m,
              birthYear: s.birth.y ?? null,
              isAdult: Boolean(s.birth.adult),
            }
          : {};
    await db.student.create({
      data: {
        id: studentId(s.key),
        firstName: s.firstName,
        lastName: s.lastName,
        gender: s.gender,
        englishLevel: s.level,
        lessonFormat: "ONLINE",
        defaultLessonDuration: s.duration,
        defaultLessonPrice: s.price,
        paymentFrequency: s.freq,
        telegramUsername: s.telegram ?? null,
        notes: s.notes ?? null,
        isActive: s.active !== false,
        aiPortrait: PORTRAITS[s.key] ?? null,
        aiPortraitAt: PORTRAITS[s.key] ? new Date(now.getTime() - 3 * 86400000) : null,
        ...birth,
      },
    });
    for (const slot of s.slots) {
      await db.recurringSchedule.create({
        data: {
          studentId: studentId(s.key),
          dayOfWeek: slot.wd,
          startTime: slot.time,
          duration: s.duration,
          format: "ONLINE",
          price: s.price,
          activeFrom: new Date(now.getTime() - 120 * 86400000),
        },
      });
    }
  }

  // 4) Уроки: 6 тижнів назад і 4 тижні вперед за сталими графіками
  type L = {
    id: string;
    studentId: string;
    key: string;
    startAt: Date;
    endAt: Date;
    duration: number;
    price: number;
    status: "SCHEDULED" | "COMPLETED" | "NO_SHOW" | "CANCELLED_BY_STUDENT";
    teacherNotes: string | null;
    homework: string | null;
  };
  const lessons: L[] = [];
  let lid = 0;
  const pushLesson = (s: DemoStudent, day: { y: number; m: number; d: number }, time: string) => {
    const [h, mi] = time.split(":").map(Number);
    const startAt = kyivWallTimeToUtc(day.y, day.m, day.d, h, mi);
    const endAt = new Date(startAt.getTime() + s.duration * 60000);
    const past = endAt < now;
    let status: L["status"] = past ? "COMPLETED" : "SCHEDULED";
    if (past) {
      const r = rand();
      if (r < 0.05) status = "NO_SHOW";
      else if (r < 0.1) status = "CANCELLED_BY_STUDENT";
    }
    lessons.push({
      id: `demo-l${++lid}`,
      studentId: studentId(s.key),
      key: s.key,
      startAt,
      endAt,
      duration: s.duration,
      price: s.price,
      status,
      teacherNotes: past && status === "COMPLETED" && rand() < 0.5 ? NOTES_POOL[Math.floor(rand() * NOTES_POOL.length)] : null,
      homework: past && status === "COMPLETED" && rand() < 0.4 ? HOMEWORK_POOL[Math.floor(rand() * HOMEWORK_POOL.length)] : null,
    });
  };
  for (let offset = -42; offset <= 28; offset++) {
    const day = addDays(today, offset);
    for (const s of STUDENTS) {
      if (s.active === false) continue;
      for (const slot of s.slots) if (slot.wd === day.wd) pushLesson(s, day, slot.time);
    }
  }
  // Сьогодні вихідний або мало уроків — додаємо кілька, щоб головна виглядала «живою»
  const todayCount = lessons.filter((l) => {
    const k = addDays(today, 0);
    const st = kyivWallTimeToUtc(k.y, k.m, k.d, 0, 0);
    return l.startAt >= st && l.startAt < new Date(st.getTime() + 86400000);
  }).length;
  if (todayCount < 3) {
    const extra: [string, string][] = [["s1", "10:00"], ["s7", "12:00"], ["s12", "15:00"], ["s2", "17:30"]];
    for (const [key, time] of extra) pushLesson(STUDENTS.find((x) => x.key === key)!, today, time);
  }
  // Роман — без сталого графіка: 3 уроки в минулому, наступного ще немає (є чернетка)
  const roman = STUDENTS.find((x) => x.key === "s13")!;
  for (const [off, time] of [[-16, "09:00"], [-9, "09:00"], [-2, "09:00"]] as [number, string][]) {
    pushLesson(roman, addDays(today, off), time);
  }
  // Денис (неактивний) — займався два місяці тому
  const denys = STUDENTS.find((x) => x.key === "s15")!;
  for (const off of [-60, -57, -53, -50, -46]) pushLesson(denys, addDays(today, off), "13:00");
  // Один минулий урок залишаємо невідміченим — щоб було видно «Перевірку даних»
  const unmarked = lessons.filter((l) => l.status === "COMPLETED" && l.key === "s11").pop();
  if (unmarked) unmarked.status = "SCHEDULED";
  // Найближчі уроки половини учнів — уже підготовлені
  const prepared = new Set(["s1", "s2", "s3", "s5", "s7", "s10"]);
  for (const key of prepared) {
    const next = lessons.filter((l) => l.key === key && l.startAt > now).sort((a, b) => +a.startAt - +b.startAt)[0];
    if (next) {
      next.teacherNotes = NOTES_POOL[Math.floor(rand() * NOTES_POOL.length)];
      next.homework = HOMEWORK_POOL[Math.floor(rand() * HOMEWORK_POOL.length)];
    }
  }
  // «Не прийшов, але оплачується» — один приклад
  const paidNoShow = lessons.find((l) => l.key === "s6" && l.status === "COMPLETED");
  if (paidNoShow) paidNoShow.teacherNotes = "Не з'явилась, урок оплачується";

  await db.lesson.createMany({
    data: lessons.map((l) => ({
      id: l.id,
      studentId: l.studentId,
      startAt: l.startAt,
      endAt: l.endAt,
      duration: l.duration,
      format: "ONLINE" as const,
      price: l.price,
      status: l.status,
      paymentStatus: "UNPAID" as const,
      teacherNotes: l.teacherNotes,
      homework: l.homework,
      endNotifiedAt: l.endAt < now ? l.endAt : null,
    })),
  });

  // Матеріали до кількох підготовлених уроків
  const materials: { lessonId: string; type: "YOUTUBE" | "LINK"; title: string; url: string }[] = [];
  for (const key of ["s1", "s2", "s7"]) {
    const next = lessons.filter((l) => l.key === key && l.startAt > now).sort((a, b) => +a.startAt - +b.startAt)[0];
    if (!next) continue;
    materials.push({ lessonId: next.id, type: "YOUTUBE", title: "Пісня для розминки", url: "https://www.youtube.com/results?search_query=english+song+for+kids" });
    materials.push({ lessonId: next.id, type: "LINK", title: "Вправа на Wordwall", url: "https://wordwall.net/" });
  }
  if (materials.length) await db.lessonMaterial.createMany({ data: materials });

  // 5) Оплати — за типом оплати кожного учня
  const payments: { studentId: string; amount: number; paidAt: Date; method: "CARD" | "CASH" | "TRANSFER" }[] = [];
  const completedOf = (key: string) =>
    lessons.filter((l) => l.key === key && l.status === "COMPLETED").sort((a, b) => +a.startAt - +b.startAt);
  const monthKey = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit" }).format(d);
    return p; // "2026-10"
  };
  const curMonth = monthKey(now);
  const method = () => (rand() < 0.7 ? "CARD" : rand() < 0.5 ? "TRANSFER" : "CASH") as "CARD" | "CASH" | "TRANSFER";
  // скільки останніх уроків учень ще не оплатив (борг) або оплатив наперед
  const owedLast: Record<string, number> = { s1: 2, s4: 1, s13: 1 };
  const prepaidExtra: Record<string, number> = { s11: 2 };

  for (const s of STUDENTS) {
    const done = completedOf(s.key);
    if (s.freq === "PER_LESSON") {
      const owe = owedLast[s.key] ?? 0;
      done.slice(0, Math.max(0, done.length - owe)).forEach((l) =>
        payments.push({ studentId: studentId(s.key), amount: l.price, paidAt: new Date(l.endAt.getTime() + 2 * 3600000), method: method() })
      );
      if (prepaidExtra[s.key]) {
        payments.push({ studentId: studentId(s.key), amount: s.price * prepaidExtra[s.key], paidAt: new Date(now.getTime() - 2 * 86400000), method: "CARD" });
      }
    } else if (s.freq === "MONTHLY_PREPAID") {
      // На початку кожного місяця — за всі уроки місяця наперед
      const byMonth = new Map<string, number>();
      for (const l of lessons.filter((x) => x.key === s.key)) byMonth.set(monthKey(l.startAt), (byMonth.get(monthKey(l.startAt)) ?? 0) + 1);
      for (const [mk, count] of byMonth) {
        if (mk > curMonth) continue;
        const [yy, mm] = mk.split("-").map(Number);
        payments.push({ studentId: studentId(s.key), amount: count * s.price, paidAt: kyivWallTimeToUtc(yy, mm - 1, 2, 10, 0), method: "CARD" });
      }
    } else if (s.freq === "END_OF_MONTH" || s.freq === "MONTHLY") {
      // Наприкінці кожного минулого місяця — за проведені уроки; поточний місяць — «до сплати»
      const byMonth = new Map<string, number>();
      for (const l of done) byMonth.set(monthKey(l.startAt), (byMonth.get(monthKey(l.startAt)) ?? 0) + l.price);
      for (const [mk, sum] of byMonth) {
        if (mk >= curMonth) continue;
        const [yy, mm] = mk.split("-").map(Number);
        payments.push({ studentId: studentId(s.key), amount: sum, paidAt: kyivWallTimeToUtc(yy, mm, 1, 9, 0), method: "TRANSFER" });
      }
    } else if (s.freq === "END_OF_WEEK" || s.freq === "WEEKLY") {
      // Щоп'ятниці — за тиждень; поточний тиждень — «до сплати»
      const weekStartOffset = -((today.wd + 6) % 7);
      const thisWeekStart = kyivWallTimeToUtc(...(Object.values(addDays(today, weekStartOffset)).slice(0, 3) as [number, number, number]), 0, 0);
      const byWeek = new Map<number, number>();
      for (const l of done) {
        if (l.startAt >= thisWeekStart) continue;
        const wk = Math.floor((thisWeekStart.getTime() - l.startAt.getTime()) / (7 * 86400000));
        byWeek.set(wk, (byWeek.get(wk) ?? 0) + l.price);
      }
      for (const [wk, sum] of byWeek) {
        payments.push({ studentId: studentId(s.key), amount: sum, paidAt: new Date(thisWeekStart.getTime() - wk * 7 * 86400000 - 2 * 86400000), method: "CARD" });
      }
    }
  }
  await db.payment.createMany({
    data: payments.map((p) => ({ studentId: p.studentId, amount: p.amount, paidAt: p.paidAt, status: "PAID" as const, paymentMethod: p.method })),
  });

  // 6) Журнал
  for (const [key, entries] of Object.entries(JOURNAL_POOL)) {
    let ago = entries.length * 6 + 2;
    for (const e of entries) {
      await db.studentJournalEntry.create({
        data: {
          studentId: studentId(key),
          source: e.source,
          content: e.content,
          studentTalkPct: e.pct ?? null,
          createdAt: new Date(now.getTime() - ago * 86400000),
        },
      });
      ago -= 6;
    }
  }

  // 7) Чернетка наступного уроку для Романа (дати ще немає)
  await db.student.update({
    where: { id: studentId("s13") },
    data: {
      draftNotes: "Міні-презентація «Моя робота» (5 хв), потім питання. Повторити -s у третій особі: he works / she works.",
      draftHomework: "Записати голосове 1–2 хв про робочий день друга або родича.",
      draftUpdatedAt: new Date(now.getTime() - 2 * 86400000),
    },
  });

  // 8) Підручник: якщо в демо-бібліотеку вже завантажено книжку (Налаштування → Підручники в демо-режимі),
  //    прив'язуємо її до трьох учнів B1, щоб одразу було видно сторінки в картці й підготовці.
  const book = await db.textbook.findFirst({ orderBy: { createdAt: "asc" } });
  if (book) {
    const pages: [string, number][] = [["s2", 10], ["s7", 24], ["s10", 40]];
    for (const [key, page] of pages) {
      await db.student.update({ where: { id: studentId(key) }, data: { textbookId: book.id, textbookPage: page } });
    }
  }

  // 9) Готовий план (у новому форматі) на найближчий урок Софії — щоб показати «📋 План уроку»
  const sofiaNext = await db.lesson.findFirst({
    where: { studentId: studentId("s2"), startAt: { gt: now }, status: "SCHEDULED" },
    orderBy: { startAt: "asc" },
  });
  if (sofiaNext) {
    await db.lesson.update({
      where: { id: sofiaNext.id },
      data: {
        ...(book ? { textbookFrom: 10, textbookTo: 11 } : {}),
        teacherNotes: [
          "🎯 Мета: впевнено розрізняти Present continuous і Present simple в усній мові",
          "",
          "🔁 Повторити з минулого",
          "• 5 слів про шкільний розклад: timetable, subject, break, term, mark",
          "",
          "⏱ Хід уроку (60 хв)",
          "1) 0–5 хв · Розминка",
          "• «What are you doing this week that you don't usually do?»",
          "2) 5–20 хв · Пояснення на прикладах Софії",
          "• «I usually study at home, but this week I'm studying at the library.»",
          "3) 20–40 хв · Вправи з підручника",
          "• стор. 11, вправи 5.1–5.3 — усно, Софія пояснює свій вибір",
          "4) 40–55 хв · Говоріння",
          "• розповідь про звичайний день і про цей тиждень (по 1 хв)",
          "5) 55–60 хв · ДЗ і підсумок",
          "",
          "⚠️ На що звернути увагу",
          "• соромиться говорити — спершу дати 30 с на підготовку",
          "• хвалити за повні речення, помилки виправляти після відповіді",
        ].join("\n"),
        homework: "• стор. 11, вправа 5.4 письмово\n• записати голосове 1 хв: «My typical day vs this week»",
      },
    });
  }

  return { students: STUDENTS.length, lessons: lessons.length, payments: payments.length };
}
