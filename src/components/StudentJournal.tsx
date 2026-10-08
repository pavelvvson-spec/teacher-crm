"use client";

import { useState } from "react";

type Entry = {
  id: string;
  source: string;
  content: string;
  createdAt: string;
};

const SOURCE_LABELS: Record<string, string> = {
  TEXT: "✍️",
  VOICE: "🎙️",
  FIREFLIES: "🎧 урок",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StudentJournal({
  studentId,
  initialEntries,
  initialPortrait,
  initialPortraitAt,
}: {
  studentId: string;
  initialEntries: Entry[];
  initialPortrait: string | null;
  initialPortraitAt: string | null;
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const [portrait, setPortrait] = useState(initialPortrait);
  const [portraitAt, setPortraitAt] = useState(initialPortraitAt);
  const [portraitLoading, setPortraitLoading] = useState(false);
  const [portraitError, setPortraitError] = useState("");
  const [showPortrait, setShowPortrait] = useState(true);

  async function addEntry() {
    if (!text.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/students/${studentId}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    }).catch(() => null);
    setSaving(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setError(data.error || "Не вдалося зберегти");
      return;
    }
    setEntries([data, ...entries]);
    setText("");
  }

  async function deleteEntry(entryId: string) {
    await fetch(`/api/students/${studentId}/journal`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId }),
    });
    setEntries(entries.filter((e) => e.id !== entryId));
    setConfirmDeleteId(null);
  }

  async function makePortrait() {
    setPortraitLoading(true);
    setPortraitError("");
    const res = await fetch(`/api/students/${studentId}/portrait`, { method: "POST" }).catch(
      () => null
    );
    setPortraitLoading(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setPortraitError(data.error || "Не вдалося скласти портрет");
      return;
    }
    setPortrait(data.aiPortrait);
    setPortraitAt(data.aiPortraitAt);
    setShowPortrait(true);
  }

  const visible = showAll ? entries : entries.slice(0, 5);
  const newSincePortrait = portraitAt
    ? entries.filter((e) => new Date(e.createdAt) > new Date(portraitAt)).length
    : entries.length;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 space-y-6">
      {/* Портрет учня */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">✨ Портрет учня</h2>
            <p className="text-xs text-gray-400">
              {portraitAt
                ? `Складено ${formatDate(portraitAt)}${newSincePortrait > 0 ? ` · нових записів у журналі: ${newSincePortrait}` : ""}`
                : "ШІ прочитає журнал і нотатки до уроків та складе підсумок"}
            </p>
          </div>
          <button
            type="button"
            onClick={makePortrait}
            disabled={portraitLoading}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            {portraitLoading
              ? "ШІ аналізує (до 30 секунд)..."
              : portrait
                ? "Оновити портрет"
                : "Скласти портрет"}
          </button>
        </div>
        {portraitError && <p className="text-red-600 text-sm">{portraitError}</p>}
        {portrait && (
          <div>
            <button
              type="button"
              onClick={() => setShowPortrait(!showPortrait)}
              className="text-xs text-indigo-600 hover:underline"
            >
              {showPortrait ? "Згорнути" : "Показати портрет"}
            </button>
            {showPortrait && (
              <div className="mt-2 bg-indigo-50/50 rounded-xl px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap">
                {portrait}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Журнал */}
      <div className="border-t border-gray-100 pt-5 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">📓 Журнал (для ШІ)</h2>
          <p className="text-xs text-gray-400">
            Пишіть усе підряд: думки після уроку, що вийшло, що ні, інтереси, повідомлення від батьків.
            Порядок не важливий. Не пишіть сюди паролі й телефони.
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Наприклад: сьогодні соромилась говорити, але коли перейшли на Minecraft — розговорилась. Плутає do/does..."
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button
          type="button"
          onClick={addEntry}
          disabled={saving || !text.trim()}
          className="px-4 py-2 bg-pink-50 text-pink-700 rounded-lg text-sm font-medium hover:bg-pink-100 disabled:opacity-50"
        >
          {saving ? "Збереження..." : "Додати в журнал"}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {entries.length === 0 ? (
          <p className="text-gray-500 text-sm">Записів ще немає.</p>
        ) : (
          <div className="space-y-2">
            {visible.map((e) => (
              <div key={e.id} className="bg-gray-50 rounded-xl px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-400">
                    {SOURCE_LABELS[e.source] ?? ""} {formatDate(e.createdAt)}
                  </p>
                  {confirmDeleteId === e.id ? (
                    <span className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => deleteEntry(e.id)}
                        className="text-red-600 font-medium hover:underline"
                      >
                        Так, видалити
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-gray-500 hover:underline"
                      >
                        Ні
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(e.id)}
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      Видалити
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{e.content}</p>
              </div>
            ))}
            {entries.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="text-sm text-indigo-600 hover:underline"
              >
                {showAll ? "Показати менше" : `Показати всі (${entries.length})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
