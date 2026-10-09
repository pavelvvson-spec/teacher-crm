// Підручники вчительки: PDF лежить у Vercel Blob частинами по chunkSize сторінок.
// Тут — переведення сторінок, витяг потрібних сторінок для ШІ, аналіз книжки і просування учня.
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { callClaude, type ClaudeContentBlock } from "@/lib/anthropic";

export const MAX_PAGES_FOR_AI = 6; // скільки сторінок максимум даємо ШІ за раз
export const DEFAULT_PAGES_PER_LESSON = 2;

type TextbookLike = {
  id: string;
  title: string;
  level: string | null;
  summary: string | null;
  contents: string | null;
  pageCount: number;
  chunkSize: number;
  chunkUrls: string[];
  pageOffset: number;
};

// Друкований номер сторінки → номер сторінки в PDF (обидва з 1)
export function printedToPdf(tb: Pick<TextbookLike, "pageOffset" | "pageCount">, printed: number) {
  return Math.min(Math.max(printed + tb.pageOffset, 1), tb.pageCount);
}

// Посилання, яке відкриває PDF-частину на потрібній сторінці
export function pageLink(tb: Pick<TextbookLike, "pageOffset" | "pageCount" | "chunkSize" | "chunkUrls">, printed: number) {
  const pdfPage = printedToPdf(tb, printed);
  const chunk = Math.floor((pdfPage - 1) / tb.chunkSize);
  const url = tb.chunkUrls[chunk];
  if (!url) return null;
  return `${url}#page=${pdfPage - chunk * tb.chunkSize}`;
}

// Збирає PDF-сторінки [fromPdf..toPdf] в один маленький PDF (base64)
export async function extractPdfPages(tb: TextbookLike, fromPdf: number, toPdf: number): Promise<string | null> {
  const from = Math.max(1, Math.min(fromPdf, tb.pageCount));
  const to = Math.max(from, Math.min(toPdf, tb.pageCount, from + MAX_PAGES_FOR_AI - 1));
  const out = await PDFDocument.create();
  const cache = new Map<number, PDFDocument>();
  for (let p = from; p <= to; p++) {
    const chunk = Math.floor((p - 1) / tb.chunkSize);
    let doc = cache.get(chunk);
    if (!doc) {
      const url = tb.chunkUrls[chunk];
      if (!url) return null;
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) return null;
      doc = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true });
      cache.set(chunk, doc);
    }
    const [page] = await out.copyPages(doc, [p - 1 - chunk * tb.chunkSize]);
    out.addPage(page);
  }
  return Buffer.from(await out.save()).toString("base64");
}

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

type Analysis = {
  title?: string;
  level?: string | null;
  summary?: string;
  contents?: string;
  samplePrinted?: (number | null)[];
};

// Витягує рядкове поле JSON навіть з обірваної відповіді.
// allowCut — якщо рядок обірвався (довгий зміст), повертає все до останнього повного рядка.
function looseString(text: string, key: string, allowCut = false): string | undefined {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(text);
  if (!m) return undefined;
  let i = m.index + m[0].length;
  let out = "";
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      const nx = text[i + 1];
      out += nx === "n" ? "\n" : nx === "t" ? " " : (nx ?? "");
      i += 2;
      continue;
    }
    if (ch === '"') return out;
    out += ch;
    i++;
  }
  if (!allowCut) return undefined;
  const cut = out.lastIndexOf("\n");
  return cut > 0 ? out.slice(0, cut) : out;
}

// Розбір відповіді ШІ з запасом міцності: довгий зміст іноді обрізається
// або містить «сирі» переноси рядків — тоді витягуємо поля по одному.
function parseAnalysis(text: string): Analysis | null {
  const strict = parseJson<Analysis>(text);
  if (strict) return strict;
  const level = /"level"\s*:\s*"([^"]*)"/.exec(text)?.[1] ?? null;
  const sp = /"samplePrinted"\s*:\s*\[\s*(null|\d+)\s*,\s*(null|\d+)\s*\]/.exec(text);
  const result: Analysis = {
    title: looseString(text, "title"),
    level,
    summary: looseString(text, "summary"),
    contents: looseString(text, "contents", true),
    samplePrinted: sp
      ? [sp[1] === "null" ? null : Number(sp[1]), sp[2] === "null" ? null : Number(sp[2])]
      : undefined,
  };
  return result.title || result.level || result.contents ? result : null;
}

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

// ШІ дивиться перші сторінки (обкладинка, зміст) і пару сторінок із середини,
// щоб визначити назву, рівень, зміст і зсув між друкованими номерами та номерами в PDF.
export async function analyzeTextbook(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const tb = await prisma.textbook.findUnique({ where: { id } });
  if (!tb) return { ok: false, error: "Підручник не знайдено" };

  const firstTo = Math.min(tb.pageCount, 6);
  const first = await extractPdfPages(tb, 1, firstTo);
  const tocFrom = firstTo + 1;
  const toc = tocFrom <= tb.pageCount ? await extractPdfPages(tb, tocFrom, Math.min(tb.pageCount, tocFrom + 5)) : null;
  const sample = Math.min(Math.max(Math.floor(tb.pageCount * 0.4), 15), tb.pageCount);
  const sampleDoc = tb.pageCount >= 15 ? await extractPdfPages(tb, sample, Math.min(sample + 1, tb.pageCount)) : null;
  if (!first) return { ok: false, error: "Не вдалося прочитати PDF" };

  const blocks: ClaudeContentBlock[] = [
    { type: "text", text: `Документ 1: сторінки PDF 1–${firstTo}.` },
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: first } },
  ];
  if (toc) {
    blocks.push({ type: "text", text: `Документ 2: сторінки PDF ${tocFrom}–${Math.min(tb.pageCount, tocFrom + 5)}.` });
    blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: toc } });
  }
  if (sampleDoc) {
    blocks.push({ type: "text", text: `Документ 3: сторінки PDF ${sample} і ${sample + 1} (з середини книжки).` });
    blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: sampleDoc } });
  }
  blocks.push({
    type: "text",
    text: `Це підручник англійської мови (всього ${tb.pageCount} сторінок у PDF, файл «${tb.fileName ?? tb.title}»).
Визнач і відповідай СТРОГО одним JSON без markdown. Поля саме в такому порядку, "contents" — останнім:
{
  "title": "назва підручника як на обкладинці (серія, рівень, Student's Book / Workbook)",
  "level": "один рівень CEFR: A1, A2, B1, B2, C1 або C2 (Elementary — A1/A2, Pre-intermediate — A2, Intermediate — B1, Upper-intermediate — B2, Advanced — C1); null, якщо неможливо",
  "summary": "1–2 речення українською: що це за книжка, для кого (діти/підлітки/дорослі), як побудована (наприклад: кожен юніт — розворот із 2 сторінок: зліва пояснення, справа вправи)",
  "samplePrinted": [друкований номер на першій сторінці документа 3 або null, друкований номер на другій або null],
  "contents": "стислий зміст, кожен юніт з нового рядка: 'U1 Present continuous — 2'. Число в кінці — ДРУКОВАНА сторінка початку юніта; якщо в змісті сторінок немає, а юніти йдуть розворотами по 2 сторінки — порахуй її. Лише рядки змісту, без пояснень. Якщо змісту не видно — порожній рядок"
}`,
  });

  const result = await callClaude(
    "Ти уважно читаєш сторінки підручників англійської мови і витягаєш з них факти. Нічого не вигадуй.",
    blocks,
    8000
  );
  if (!result.ok) return { ok: false, error: result.error };
  const parsed = parseAnalysis(result.text);
  if (!parsed) {
    console.error("textbook analyze: unparsable", result.text.slice(0, 2000));
    return { ok: false, error: "ШІ відповів незрозуміло — спробуйте ще раз" };
  }

  let pageOffset = tb.pageOffset;
  const sp = parsed.samplePrinted ?? [];
  if (sampleDoc && typeof sp[0] === "number" && sp[0] > 0) pageOffset = sample - sp[0];
  else if (sampleDoc && typeof sp[1] === "number" && sp[1] > 0) pageOffset = sample + 1 - sp[1];

  const level = parsed.level && LEVELS.includes(String(parsed.level).toUpperCase()) ? String(parsed.level).toUpperCase() : tb.level;
  await prisma.textbook.update({
    where: { id },
    data: {
      title: parsed.title?.trim() || tb.title,
      level,
      summary: parsed.summary?.trim() || null,
      contents: parsed.contents?.trim() || null,
      pageOffset,
      analyzedAt: new Date(),
    },
  });
  return { ok: true };
}

// Діапазон сторінок для уроку: збережений або запропонований (з поточної сторінки учня)
export function effectiveRange(
  saved: { from: number | null; to: number | null },
  studentPage: number | null
): { from: number; to: number; suggested: boolean } | null {
  if (saved.from) return { from: saved.from, to: Math.max(saved.to ?? saved.from, saved.from), suggested: false };
  if (!studentPage) return null;
  return { from: studentPage, to: studentPage + DEFAULT_PAGES_PER_LESSON - 1, suggested: true };
}

// Текст і сторінки підручника для ШІ-підготовки уроку
export async function textbookForPrep(
  studentId: string,
  saved: { from: number | null; to: number | null }
): Promise<{ text: string; blocks: ClaudeContentBlock[]; range: { from: number; to: number } | null }> {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    select: { textbookPage: true, textbook: true },
  });
  const tb = s?.textbook;
  if (!tb) return { text: "", blocks: [], range: null };

  const range = effectiveRange(saved, s.textbookPage);
  const lines = [
    `ПІДРУЧНИК, ЗА ЯКИМ ЗАЙМАЄТЬСЯ УЧЕНЬ: ${tb.title}${tb.level ? ` (рівень ${tb.level})` : ""}`,
    tb.summary ? `Про підручник: ${tb.summary}` : "",
    tb.contents ? `Зміст підручника:\n${tb.contents.slice(0, 4000)}` : "",
    range
      ? `На цьому уроці — сторінки ${range.from}–${range.to} (друковані номери)${range.suggested ? ", це припущення з поточної сторінки учня" : ""}. Сторінки додано нижче як PDF.`
      : "Поточна сторінка учня не вказана — спирайся на зміст і рівень.",
  ].filter(Boolean);

  const blocks: ClaudeContentBlock[] = [];
  if (range) {
    const data = await extractPdfPages(tb, printedToPdf(tb, range.from), printedToPdf(tb, range.to)).catch(() => null);
    if (data) {
      blocks.push({ type: "text", text: `Сторінки підручника «${tb.title}» ${range.from}–${range.to}:` });
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    } else {
      lines.push("(Сторінки не вдалося відкрити — спирайся на зміст.)");
    }
  }
  return { text: lines.join("\n"), blocks, range: range ? { from: range.from, to: range.to } : null };
}

// Після проведеного уроку: учень «переходить» на сторінку після тих, що були на уроці
export async function advanceTextbookAfterLesson(lessonId: string) {
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { textbookTo: true, student: { select: { id: true, textbookId: true, textbookPage: true } } },
    });
    if (!lesson?.textbookTo || !lesson.student.textbookId) return;
    const next = lesson.textbookTo + 1;
    if ((lesson.student.textbookPage ?? 0) >= next) return;
    await prisma.student.update({ where: { id: lesson.student.id }, data: { textbookPage: next } });
  } catch (e) {
    console.error("advanceTextbookAfterLesson", e);
  }
}

// Стан «підручник і сторінки» для вікна підготовки уроку / чернетки
export async function textbookPagesState(studentId: string, saved: { from: number | null; to: number | null }) {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    select: { textbookPage: true, textbook: true },
  });
  const tb = s?.textbook;
  if (!tb) return { textbook: null };
  const range = effectiveRange(saved, s.textbookPage);
  return {
    textbook: { id: tb.id, title: tb.title, level: tb.level },
    studentPage: s.textbookPage,
    from: range?.from ?? null,
    to: range?.to ?? null,
    suggested: range?.suggested ?? false,
    link: range ? pageLink(tb, range.from) : null,
  };
}

// Розбір сторінок із запиту: { from, to } → числа або null
export function parsePagesBody(body: { from?: unknown; to?: unknown } | null) {
  const from = Math.max(0, Math.floor(Number(body?.from) || 0)) || null;
  const toRaw = Math.max(0, Math.floor(Number(body?.to) || 0)) || null;
  const to = from ? Math.max(from, toRaw ?? from) : null;
  return { from, to };
}
