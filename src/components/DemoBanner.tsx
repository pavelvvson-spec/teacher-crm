"use client";

import { useEffect, useState } from "react";

// Смужка вгорі, коли увімкнено демо-режим (у цьому браузері)
export default function DemoBanner() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOn(document.cookie.split("; ").some((c) => c === "crm_demo=1"));
  }, []);

  if (!on) return null;

  async function exit() {
    setBusy(true);
    await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: false }),
    }).catch(() => null);
    window.location.href = "/";
  }

  async function reset() {
    if (!confirm("Повернути демо-дані в початковий стан?")) return;
    setBusy(true);
    await fetch("/api/demo/reset", { method: "POST" }).catch(() => null);
    window.location.reload();
  }

  return (
    <div className="sticky top-0 z-50 bg-amber-400 text-amber-950 text-sm">
      <div className="max-w-6xl mx-auto px-4 py-1.5 flex items-center gap-3">
        <span className="font-semibold">🎭 Демо-режим</span>
        <span className="hidden sm:inline text-amber-900">усі дані вигадані</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="px-2.5 py-1 rounded-lg hover:bg-amber-300 disabled:opacity-50"
          >
            Скинути
          </button>
          <button
            type="button"
            onClick={exit}
            disabled={busy}
            className="px-3 py-1 rounded-lg bg-amber-950 text-amber-50 font-medium hover:bg-black disabled:opacity-50"
          >
            {busy ? "…" : "Вийти"}
          </button>
        </div>
      </div>
    </div>
  );
}
