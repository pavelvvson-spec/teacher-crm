// «Моя методика» вчительки: стартова анкета, скринька ідей, оновлення документа,
// нові питання з уроків і нагадування у вечірньому чекапі.

import { prisma } from "@/lib/prisma";
import { callClaude, type ClaudeContentBlock } from "@/lib/anthropic";
import { sendTelegramHtmlMessage } from "@/lib/telegram";

export const ONBOARDING_QUESTIONS = [
  "Що для тебе хороший урок? Як ти розумієш, що він вдався?",
  "Як ти зазвичай починаєш урок?",
  "Як виглядає типовий урок з дитиною, а як — з дорослим?",
  "Що ти робиш, коли учень втомився або втратив інтерес?",
  "Як ти виправляєш помилки у дітей, підлітків і дорослих?",
  "Як ти хвалиш і мотивуєш? Що точно працює?",
  "Скільки англійської і скільки української на уроці на різних рівнях?",
  "Які прийоми з арт-терапії ти використовуєш на уроках?",
  "Твої улюблені ігри та вправи, які спрацьовують майже завжди.",
  "Чого ти на уроках принципово не робиш?",
  "Яке ДЗ ти даєш і як його перевіряєш?",
  "Як ти працюєш з батьками дітей-учнів?",
  "Як ти розумієш, що учень готовий до нової теми?",
  "Як працюєш із сором'язливими учнями, які бояться говорити?",
  "Які матеріали, підручники, сайти чи канали любиш, а які ні?",
];

const FOLLOWUP_THRESHOLD = 5; // скільки нових спостережень з уроків потрібно для нових питань
const REMIND_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

function parseJson<T>(text: string): T | null {
  const st = text.indexOf("{");
  const en = text.lastIndexOf("}");
  if (st === -1 || en <= st) return null;
  try {
    return JSON.parse(text.slice(st, en + 1)) as T;
  } catch {
    return null;
  }
}

async function getSettings() {
  const s = await prisma.settings.findFirst();
  if (s) return s;
  return prisma.settings.create({ data: { teacherName: "Вчитель" } });
}

// Створює стартову анкету, якщо методики ще немає і анкету не створювали
export async function ensureOnboarding() {
  const settings = await getSettings();
  if (settings.methodology?.trim()) return;
  const exists = await prisma.methodologyQuestion.count({ where: { batch: "onboarding" } });
  if (exists > 0) return;
  await prisma.methodologyQuestion.createMany({
    data: ONBOARDING_QUESTIONS.map((q, i) => ({ batch: "onboarding", order: i + 1, question: q })),
  });
}

export async function getMethodologyState() {
  await ensureOnboarding();
  const settings = await getSettings();
  const open = await prisma.methodologyQuestion.findMany({
    where: { status: "OPEN" },
    orderBy: [{ createdAt: "asc" }, { order: "asc" }],
  });
  const batch = open[0]?.batch ?? null;
  const batchTotal = batch ? await prisma.methodologyQuestion.count({ where: { batch } }) : 0;
  const answered = await prisma.methodologyQuestion.findMany({
    where: { status: "ANSWERED" },
    orderBy: [{ createdAt: "asc" }, { order: "asc" }],
    select: { id: true, question: true, answer: true },
  });
  const inbox = await prisma.methodologyInbox.findMany({
    where: { usedAt: null, kind: { not: "OBSERVATION" } },
    orderBy: { createdAt: "desc" },
  });
  return {
    methodology: settings.methodology ?? "",
    methodologyUpdatedAt: settings.methodologyUpdatedAt,
    openQuestions: open.map((q) => ({ id: q.id, question: q.question, batch: q.batch })),
    batchTotal,
    isOnboarding: batch === "onboarding",
    answered,
    inbox: inbox.map((i) => ({
      id: i.id,
      kind: i.kind,
      content: i.content,
      imageUrl: i.imageUrl,
      createdAt: i.createdAt,
    })),
  };
}

export async function answerQuestion(id: string, answer: string | null) {
  const text = answer?.trim();
  await prisma.methodologyQuestion.update({
    where: { id },
    data: text
      ? { answer: text.slice(0, 8000), status: "ANSWERED", answeredAt: new Date() }
      : { status: "SKIPPED", answeredAt: new Date() },
  });
}

export async function addInbox(kind: "TEXT" | "VOICE" | "IMAGE", content: string, imageUrl?: string | null) {
  return prisma.methodologyInbox.create({
    data: { kind, content: content.slice(0, 8000), imageUrl: imageUrl ?? null },
  });
}

async function imageBlock(url: string): Promise<ClaudeContentBlock | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!/^image\/(jpeg|png|gif|webp)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4.5 * 1024 * 1024) return null;
    return { type: "image", source: { type: "base64", media_type: type.split(";")[0], data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

const COMPILE_PROMPT = `Ти допомагаєш вчительці англійської вести документ «Моя методика» — її власні принципи викладання. Цей документ потім читає ШІ-помічник перед кожною порадою.

Тобі дають поточний документ (може бути порожній), її відповіді на питання і нові ідеї/нотатки/скріншоти.
Онови документ:
- Пиши від її імені, коротко, по суті, українською (англійські терміни й приклади — англійською).
- Зберігай усе, що вже є, якщо нове цьому не суперечить. Якщо суперечить — новіше має пріоритет.
- Нічого не вигадуй від себе. Лише те, що вона сказала, написала або що видно на скріншоті.
- Структура — розділи з заголовками у вигляді рядка ВЕЛИКИМИ ЛІТЕРАМИ, під ними пункти через «- ». Розділи на кшталт: ПРО УРОК, СТРУКТУРА УРОКУ, ДІТИ, ПІДЛІТКИ, ДОРОСЛІ, ПОМИЛКИ, МОТИВАЦІЯ, АРТ-ТЕРАПІЯ, ІГРИ І ВПРАВИ, ДЗ, БАТЬКИ, ЧОГО НЕ РОБЛЮ, МАТЕРІАЛИ. Лише ті розділи, для яких є зміст.
- Без markdown-символів # і **.

Відповідай СТРОГО одним JSON без тексту навколо:
{"methodology": "повний оновлений документ", "changes": ["коротко, що додано або змінено — 1 рядок на зміну"]}`;

export async function compileProposal() {
  const settings = await getSettings();
  const answered = await prisma.methodologyQuestion.findMany({
    where: { status: "ANSWERED" },
    orderBy: [{ createdAt: "asc" }, { order: "asc" }],
  });
  const inbox = await prisma.methodologyInbox.findMany({
    where: { usedAt: null, kind: { not: "OBSERVATION" } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  if (answered.length === 0 && inbox.length === 0) {
    return { ok: false as const, error: "Немає нових відповідей чи ідей для методики" };
  }

  const blocks: ClaudeContentBlock[] = [];
  let text = `ПОТОЧНИЙ ДОКУМЕНТ
${settings.methodology?.trim() || "(порожній)"}

ВІДПОВІДІ НА ПИТАННЯ
${answered.map((q) => `Питання: ${q.question}\nВідповідь: ${q.answer}`).join("\n\n") || "немає"}

НОВІ ІДЕЇ ТА НОТАТКИ
${
  inbox
    .filter((i) => i.kind !== "IMAGE")
    .map((i) => `- ${i.content}`)
    .join("\n") || "немає"
}`;
  const images = inbox.filter((i) => i.kind === "IMAGE" && i.imageUrl).slice(0, 5);
  if (images.length) text += `\n\nСКРІНШОТИ (${images.length}) — нижче; підписи: ${images.map((i, n) => `${n + 1}) ${i.content}`).join("; ")}`;
  blocks.push({ type: "text", text });
  for (const img of images) {
    const b = await imageBlock(img.imageUrl!);
    if (b) blocks.push(b);
  }

  const ai = await callClaude(COMPILE_PROMPT, blocks, 6000);
  if (!ai.ok) return { ok: false as const, error: ai.error };
  const parsed = parseJson<{ methodology?: string; changes?: string[] }>(ai.text);
  if (!parsed?.methodology) return { ok: false as const, error: "ШІ повернув відповідь у незрозумілому форматі, спробуйте ще раз" };
  return {
    ok: true as const,
    methodology: parsed.methodology.trim(),
    changes: (parsed.changes ?? []).map(String).slice(0, 20),
    questionIds: answered.map((q) => q.id),
    inboxIds: inbox.map((i) => i.id),
  };
}

export async function applyMethodology(text: string, questionIds: string[] = [], inboxIds: string[] = []) {
  const settings = await getSettings();
  await prisma.settings.update({
    where: { id: settings.id },
    data: { methodology: text.trim().slice(0, 30000), methodologyUpdatedAt: new Date() },
  });
  if (questionIds.length) {
    await prisma.methodologyQuestion.updateMany({
      where: { id: { in: questionIds }, status: "ANSWERED" },
      data: { status: "MERGED" },
    });
  }
  if (inboxIds.length) {
    await prisma.methodologyInbox.updateMany({ where: { id: { in: inboxIds } }, data: { usedAt: new Date() } });
  }
}

// ── Нові питання з уроків ─────────────────────────────────────────────

export async function addObservations(items: string[]) {
  const clean = items.map((x) => String(x).trim()).filter(Boolean).slice(0, 5);
  if (!clean.length) return;
  await prisma.methodologyInbox.createMany({
    data: clean.map((c) => ({ kind: "OBSERVATION", content: c.slice(0, 1000) })),
  });
  await maybeCreateFollowupQuestions();
}

const FOLLOWUP_PROMPT = `Ти допомагаєш вчительці англійської розвивати документ «Моя методика».
Тобі дають її поточну методику і спостереження з її реальних уроків — прийоми чи рішення, яких у методиці ще немає.
Склади до 5 коротких, конкретних, дружніх запитань до неї (на «ти», українською), щоб вона пояснила свій підхід своїми словами і це увійшло в методику.
Кожне питання прив'язуй до конкретного спостереження («На уроці з Ліною ти … — коли ти так робиш і навіщо?»). Не питай про те, що вже описано в методиці.
Відповідай СТРОГО JSON: {"questions": ["...", "..."]}`;

export async function maybeCreateFollowupQuestions() {
  const openCount = await prisma.methodologyQuestion.count({ where: { status: "OPEN" } });
  if (openCount > 0) return;
  const obs = await prisma.methodologyInbox.findMany({
    where: { kind: "OBSERVATION", usedAt: null },
    orderBy: { createdAt: "asc" },
    take: 15,
  });
  if (obs.length < FOLLOWUP_THRESHOLD) return;
  const settings = await getSettings();
  const ai = await callClaude(
    FOLLOWUP_PROMPT,
    `МЕТОДИКА\n${settings.methodology?.trim() || "(ще порожня)"}\n\nСПОСТЕРЕЖЕННЯ З УРОКІВ\n${obs.map((o) => `- ${o.content}`).join("\n")}`,
    1500
  );
  if (!ai.ok) return;
  const qs = (parseJson<{ questions?: string[] }>(ai.text)?.questions ?? [])
    .map((q) => String(q).trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!qs.length) return;
  const batch = `followup-${new Date().toISOString().slice(0, 10)}`;
  await prisma.methodologyQuestion.createMany({
    data: qs.map((q, i) => ({ batch, order: i + 1, question: q })),
  });
  await prisma.methodologyInbox.updateMany({
    where: { id: { in: obs.map((o) => o.id) } },
    data: { usedAt: new Date() },
  });
  // нові питання — нове нагадування
  await prisma.settings.update({ where: { id: settings.id }, data: { methodologyNotifiedAt: null } });
}

// ── Нагадування у вечірньому чекапі ───────────────────────────────────

export async function notifyMethodologyQuestions() {
  const settings = await prisma.settings.findFirst();
  if (!settings?.teacherTelegramChatId) return;
  const open = await prisma.methodologyQuestion.findMany({ where: { status: "OPEN" } });
  if (!open.length) return;
  if (settings.methodologyNotifiedAt && Date.now() - settings.methodologyNotifiedAt.getTime() < REMIND_EVERY_MS) {
    return;
  }
  const onboarding = open.some((q) => q.batch === "onboarding");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const n = open.length;
  const html = onboarding
    ? `🔔🔔🔔\n<b>АНКЕТА «МОЯ МЕТОДИКА»</b>\n\nЗалишилось питань: <b>${n}</b>. Твої відповіді — основа для всіх порад ШІ.\n\n👉 <b>Налаштування → Моя методика</b>`
    : `🔔🔔🔔\n<b>НОВІ ПИТАННЯ ЩОДО ТВОЄЇ МЕТОДИКИ</b>\n\nПісля останніх уроків я помітила прийоми, яких ще немає в твоїй методиці. Коротке опитування: <b>${n} ${n === 1 ? "питання" : n < 5 ? "питання" : "питань"}</b>.\n\n👉 <b>Налаштування → Моя методика</b>`;
  const buttons = appUrl ? [[{ text: "📝 Пройти опитування", url: `${appUrl}/settings/telegram` }]] : undefined;
  await sendTelegramHtmlMessage(settings.teacherTelegramChatId, html, buttons);
  await prisma.settings.update({ where: { id: settings.id }, data: { methodologyNotifiedAt: new Date() } });
}
