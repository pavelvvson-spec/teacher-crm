"use client";

import { useState } from "react";

// Непомітний перемикач демо-режиму (в самому низу налаштувань)
export default function DemoModeToggle({ active }: { active: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: !active }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error || "Не вдалося перемкнути");
      setBusy(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="pt-6 pb-2 flex flex-col items-center gap-1">
      <label className="inline-flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer select-none">
        <span>режим показу</span>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          onClick={toggle}
          disabled={busy}
          className={`relative w-7 h-4 rounded-full transition-colors ${active ? "bg-amber-400" : "bg-gray-200"} disabled:opacity-50`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
              active ? "translate-x-3" : ""
            }`}
          />
        </button>
      </label>
      {busy && <span className="text-[11px] text-gray-400">Готую дані…</span>}
      {error && <span className="text-[11px] text-red-500">{error}</span>}
    </div>
  );
}
