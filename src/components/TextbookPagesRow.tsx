"use client";

import { useEffect, useState } from "react";

type State = {
  textbook: { id: string; title: string; level: string | null } | null;
  from?: number | null;
  to?: number | null;
  suggested?: boolean;
  link?: string | null;
};

// Рядок «📖 Підручник · сторінки 34–35» у вікні підготовки уроку. Зберігається сам.
export default function TextbookPagesRow({ url }: { url: string }) {
  const [state, setState] = useState<State | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [saving, setSaving] = useState(false);

  function apply(d: State) {
    setState(d);
    setFrom(d.from ? String(d.from) : "");
    setTo(d.to ? String(d.to) : "");
  }

  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && apply(d))
      .catch(() => {});
  }, [url]);

  if (!state?.textbook) return null;

  const changed = from !== String(state.from ?? "") || to !== String(state.to ?? "");

  async function save() {
    if (!changed && !state?.suggested) return;
    setSaving(true);
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: Number(from) || null, to: Number(to) || Number(from) || null }),
    }).catch(() => null);
    setSaving(false);
    if (res && res.ok) apply(await res.json());
  }

  const inputCls =
    "w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-pink-300";

  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-700 font-medium truncate max-w-full">📖 {state.textbook.title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span>сторінки</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onBlur={save}
          className={inputCls}
        />
        <span>–</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={save}
          className={inputCls}
        />
        {state.link && !changed && (
          <a
            href={state.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-pink-600 underline decoration-pink-200 hover:decoration-pink-600"
          >
            відкрити
          </a>
        )}
        {saving && <span className="text-xs text-gray-400">збереження…</span>}
      </div>
      {state.suggested && !changed && (
        <p className="text-xs text-gray-400">Підставлено з картки учня — ШІ візьме саме ці сторінки. Можна змінити.</p>
      )}
    </div>
  );
}
