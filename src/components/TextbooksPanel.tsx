"use client";

import { useEffect, useState } from "react";

type Textbook = {
  id: string;
  title: string;
  level: string | null;
  summary: string | null;
  contents: string | null;
  pageCount: number;
  pageOffset: number;
  fileName: string | null;
  fileSize: number;
  analyzedAt: string | null;
  _count: { students: number };
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const CHUNK_SIZE = 10; // сторінок в одній частині PDF
const PARALLEL = 3;

function mb(bytes: number) {
  return bytes > 0 ? `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} МБ` : "";
}

// Бібліотека підручників вчительки (вкладка в Налаштуваннях)
export default function TextbooksPanel() {
  const [list, setList] = useState<Textbook[] | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/textbooks").catch(() => null);
    setList(res && res.ok ? await res.json() : []);
  }

  useEffect(() => {
    load();
  }, []);

  async function uploadFile(file: File) {
    setError("");
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setError("Потрібен PDF-файл");
      return;
    }
    setBusy(true);
    try {
      setProgress("Відкриваю PDF…");
      const [{ PDFDocument }, { upload }] = await Promise.all([import("pdf-lib"), import("@vercel/blob/client")]);
      let src;
      try {
        src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
      } catch {
        throw new Error("Не вдалося відкрити PDF — можливо, файл пошкоджений або захищений паролем");
      }
      const pageCount = src.getPageCount();
      const chunks = Math.ceil(pageCount / CHUNK_SIZE);
      const slug =
        file.name
          .replace(/\.pdf$/i, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) || "book";
      const urls: string[] = new Array(chunks);
      let done = 0;
      let next = 0;

      async function worker() {
        while (next < chunks) {
          const i = next++;
          const doc = await PDFDocument.create();
          const idx = Array.from(
            { length: Math.min(CHUNK_SIZE, pageCount - i * CHUNK_SIZE) },
            (_, k) => i * CHUNK_SIZE + k
          );
          const pages = await doc.copyPages(src!, idx);
          pages.forEach((p) => doc.addPage(p));
          const bytes = await doc.save();
          const blob = await upload(
            `textbooks/${slug}-${String(i + 1).padStart(3, "0")}.pdf`,
            new Blob([bytes as BlobPart], { type: "application/pdf" }),
            {
              access: "public",
              handleUploadUrl: "/api/textbooks/upload",
              contentType: "application/pdf",
              multipart: bytes.length > 8 * 1024 * 1024,
            }
          );
          urls[i] = blob.url;
          done++;
          setProgress(`Завантажую: ${done} з ${chunks} частин (${pageCount} стор.)`);
        }
      }
      setProgress(`Завантажую: 0 з ${chunks} частин (${pageCount} стор.)`);
      await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks) }, worker));

      const res = await fetch("/api/textbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, pageCount, chunkSize: CHUNK_SIZE, chunkUrls: urls }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Не вдалося зберегти підручник");
      const created: Textbook = await res.json();
      await load();

      setProgress("ШІ читає обкладинку і зміст…");
      const ar = await fetch(`/api/textbooks/${created.id}/analyze`, { method: "POST" }).catch(() => null);
      if (!ar || !ar.ok) {
        const d = ar ? await ar.json().catch(() => ({})) : {};
        setError(
          `Підручник збережено, але ШІ не зміг його прочитати${d.error ? `: ${d.error}` : ""}. Рівень і назву можна вписати вручну.`
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-800">📚 Мої підручники</h2>
          <label
            className={`px-4 py-2 rounded-xl text-sm font-medium ${
              busy ? "bg-gray-100 text-gray-400" : "bg-pink-600 text-white hover:bg-pink-700 cursor-pointer"
            }`}
          >
            + Додати PDF
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="text-sm text-gray-500">
          Завантажте підручник один раз — потім у картці учня виберіть його і вкажіть сторінку. ШІ читатиме саме ці
          сторінки, коли готуватиме урок.
        </p>
        {progress && <p className="text-sm text-pink-700">⏳ {progress}</p>}
        {busy && <p className="text-xs text-gray-400">Не закривайте сторінку, доки йде завантаження.</p>}
        {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
      </div>

      {list === null ? (
        <p className="text-sm text-gray-400 px-1">Завантаження…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-400 px-1">Поки немає жодного підручника.</p>
      ) : (
        <div className="space-y-3">
          {list.map((tb) => (
            <TextbookCard key={tb.id} tb={tb} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function TextbookCard({ tb, onChanged }: { tb: Textbook; onChanged: () => void }) {
  const [title, setTitle] = useState(tb.title);
  const [level, setLevel] = useState(tb.level ?? "");
  const [offset, setOffset] = useState(String(tb.pageOffset));
  const [contents, setContents] = useState(tb.contents ?? "");
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState("");

  const dirty =
    title !== tb.title || level !== (tb.level ?? "") || offset !== String(tb.pageOffset) || contents !== (tb.contents ?? "");

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/textbooks/${tb.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, level: level || null, pageOffset: Number(offset) || 0, contents }),
    }).catch(() => null);
    setSaving(false);
    setMsg(res && res.ok ? "✓ Збережено" : "Не вдалося зберегти");
    setTimeout(() => setMsg(""), 3000);
    onChanged();
  }

  async function reanalyze() {
    setAnalyzing(true);
    setMsg("");
    const res = await fetch(`/api/textbooks/${tb.id}/analyze`, { method: "POST" }).catch(() => null);
    setAnalyzing(false);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setMsg(d.error || "ШІ не зміг прочитати");
      return;
    }
    // Простіше перезавантажити сторінку, щоб підтягнути нові поля в форму
    window.location.reload();
  }

  async function remove() {
    const warn = tb._count.students
      ? `Цей підручник вибрано в ${tb._count.students} учн. — у них він зникне. Видалити?`
      : "Видалити підручник?";
    if (!confirm(warn)) return;
    await fetch(`/api/textbooks/${tb.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <details className="group bg-white rounded-2xl shadow-sm">
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer p-4 flex items-center gap-3">
        <span className="text-2xl">📘</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 truncate">{tb.title}</p>
          <p className="text-xs text-gray-400">
            {tb.pageCount} стор.{tb.fileSize ? ` · ${mb(tb.fileSize)}` : ""}
            {tb._count.students ? ` · учнів: ${tb._count.students}` : ""}
            {!tb.analyzedAt && " · ШІ ще не прочитав"}
          </p>
        </div>
        {tb.level && (
          <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-pink-50 text-pink-700">{tb.level}</span>
        )}
        <span className="text-gray-300 group-open:rotate-180 transition-transform">▾</span>
      </summary>

      <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
        {tb.summary && <p className="text-sm text-gray-600">{tb.summary}</p>}

        <div>
          <label className="block text-sm text-gray-600 mb-1">Назва</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Рівень</label>
          <div className="grid grid-cols-6 gap-1 max-w-xs">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(level === l ? "" : l)}
                className={`py-1.5 rounded-lg text-sm font-medium ${
                  level === l ? "bg-pink-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Нумерація сторінок</label>
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <span>Сторінка в PDF = друкована +</span>
            <input
              type="number"
              inputMode="numeric"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
            />
            <a
              href={`/api/textbooks/${tb.id}/open?page=10`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pink-600 underline decoration-pink-200 hover:decoration-pink-600"
            >
              перевірити: відкрити стор. 10
            </a>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            ШІ визначає це сам. Якщо за посиланням відкрилась не 10-та сторінка — підправте число.
          </p>
        </div>

        <details className="group/c">
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            <span className="group-open/c:hidden">Зміст ▾</span>
            <span className="hidden group-open/c:inline">Сховати зміст ▴</span>
          </summary>
          <textarea
            value={contents}
            onChange={(e) => setContents(e.target.value)}
            rows={8}
            placeholder="Unit 1 — … — стор. 6"
            className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pink-300"
          />
        </details>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-2 bg-pink-600 text-white rounded-xl text-sm font-medium hover:bg-pink-700 disabled:opacity-40"
          >
            {saving ? "Збереження…" : "Зберегти"}
          </button>
          <button
            type="button"
            onClick={reanalyze}
            disabled={analyzing}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200 disabled:opacity-50"
          >
            {analyzing ? "ШІ читає…" : "✨ Прочитати ШІ ще раз"}
          </button>
          <a
            href={`/api/textbooks/${tb.id}/open?page=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200"
          >
            Відкрити
          </a>
          <button type="button" onClick={remove} className="ml-auto text-xs text-gray-400 hover:text-red-600 underline">
            Видалити
          </button>
          {msg && <span className="text-sm text-gray-500 w-full">{msg}</span>}
        </div>
      </div>
    </details>
  );
}
