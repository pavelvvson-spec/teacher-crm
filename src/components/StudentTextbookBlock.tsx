"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Book = { id: string; title: string; level: string | null; pageCount: number };

// Картка учня: за яким підручником займається і на якій сторінці зараз
export default function StudentTextbookBlock({
  studentId,
  books,
  initialTextbookId,
  initialPage,
  studentLevel,
}: {
  studentId: string;
  books: Book[];
  initialTextbookId: string | null;
  initialPage: number | null;
  studentLevel: string;
}) {
  const router = useRouter();
  const [bookId, setBookId] = useState(initialTextbookId ?? "");
  const [page, setPage] = useState(initialPage ? String(initialPage) : "");
  const [saved, setSaved] = useState({ bookId: initialTextbookId ?? "", page: initialPage ? String(initialPage) : "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const dirty = bookId !== saved.bookId || page !== saved.page;
  const book = books.find((b) => b.id === bookId);
  const savedBook = books.find((b) => b.id === saved.bookId);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/students/${studentId}/textbook`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textbookId: bookId || null, textbookPage: Number(page) || null }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      setMsg("Не вдалося зберегти");
      return;
    }
    setSaved({ bookId, page: bookId ? page : "" });
    if (!bookId) setPage("");
    setMsg("✓ Збережено");
    setTimeout(() => setMsg(""), 2500);
    router.refresh();
  }

  if (books.length === 0 && !initialTextbookId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
        <span className="text-xl">📖</span>
        <p className="text-sm text-gray-500 flex-1">
          Підручник: поки не вибрано.{" "}
          <Link href="/settings/telegram?tab=books" className="text-pink-600 underline decoration-pink-200">
            Додати підручник у бібліотеку
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-800">📖 Підручник</h2>
        {savedBook && saved.page && !dirty && (
          <a
            href={`/api/textbooks/${savedBook.id}/open?page=${saved.page}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2.5 py-1 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200"
          >
            Відкрити стор. {saved.page}
          </a>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          <option value="">— без підручника —</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
              {b.level ? ` · ${b.level}` : ""}
            </option>
          ))}
        </select>
        {bookId && (
          <label className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
            зараз на стор.
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={page}
              onChange={(e) => setPage(e.target.value)}
              placeholder="34"
              className="w-20 px-2 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </label>
        )}
      </div>

      {book?.level && book.level !== studentLevel && (
        <p className="text-xs text-amber-700">
          Рівень підручника — {book.level}, а в картці учня — {studentLevel}. Якщо треба, змініть рівень в анкеті учня.
        </p>
      )}

      {(dirty || msg) && (
        <div className="flex items-center gap-3">
          {dirty && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-pink-600 text-white rounded-xl text-sm font-medium hover:bg-pink-700 disabled:opacity-50"
            >
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          )}
          {msg && <span className="text-sm text-green-600">{msg}</span>}
        </div>
      )}

      {bookId && !dirty && (
        <p className="text-xs text-gray-400">
          ШІ бере ці сторінки, коли готує урок. Після проведеного уроку сторінка сама переходить далі.
        </p>
      )}
    </div>
  );
}
