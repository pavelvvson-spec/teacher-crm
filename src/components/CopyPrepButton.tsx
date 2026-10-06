"use client";

import { useState } from "react";
import { LESSON_STATUS_LABELS } from "@/lib/calendar-utils";

type Source = {
  id: string;
  startAt: string;
  status: string;
  teacherNotes: string | null;
  homework: string | null;
  materialsCount: number;
};

type CopyResult = {
  teacherNotes: string | null;
  homework: string | null;
  materialsAdded: number;
};

export default function CopyPrepButton({
  lessonId,
  onCopied,
}: {
  lessonId: string;
  onCopied: (result: CopyResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setError("");
    setMessage("");
    setLoading(true);
    const res = await fetch(`/api/lessons/${lessonId}/copy-prep`);
    const data = await res.json().catch(() => []);
    setSources(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function copyFrom(sourceLessonId: string) {
    setError("");
    setMessage("");
    setCopyingId(sourceLessonId);
    const res = await fetch(`/api/lessons/${lessonId}/copy-prep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceLessonId }),
    });
    setCopyingId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не вдалося скопіювати");
      return;
    }

    const result: CopyResult = await res.json();
    setMessage(
      result.materialsAdded > 0
        ? `Скопійовано. Додано матеріалів: ${result.materialsAdded}.`
        : "Скопійовано (нових матеріалів не було)."
    );
    onCopied(result);
  }

  return (
    <div className="border-b border-gray-100 pb-4 space-y-3">
      <button
        type="button"
        onClick={toggle}
        className="px-4 py-2 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100"
      >
        {open ? "Сховати список" : "Скопіювати з іншого уроку"}
      </button>

      {open && (
        <div className="space-y-2">
          {loading ? (
            <p className="text-gray-400 text-sm">Завантаження...</p>
          ) : sources.length === 0 ? (
            <p className="text-gray-500 text-sm">
              У цього учня немає інших уроків з нотаткою, ДЗ чи матеріалами.
            </p>
          ) : (
            sources.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {new Date(s.startAt).toLocaleString("uk-UA", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    <span className="text-xs text-gray-500">
                      · {LESSON_STATUS_LABELS[s.status] ?? s.status}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {s.teacherNotes ? "📝 " : ""}
                    {s.homework ? "📚 " : ""}
                    {s.materialsCount > 0 ? `📎 ${s.materialsCount}` : ""}
                    {s.teacherNotes ?? s.homework ?? ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyFrom(s.id)}
                  disabled={copyingId === s.id}
                  className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700 disabled:opacity-50 shrink-0"
                >
                  {copyingId === s.id ? "Копіюю..." : "Скопіювати"}
                </button>
              </div>
            ))
          )}
          {message && <p className="text-green-600 text-sm">{message}</p>}
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      )}
    </div>
  );
}