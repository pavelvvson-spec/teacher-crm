"use client";

import { useState } from "react";

export default function BreakNotificationsPanel({
  initialEnabled,
  initialMinMinutes,
  telegramConnected,
  tickConfigured,
}: {
  initialEnabled: boolean;
  initialMinMinutes: number;
  telegramConnected: boolean;
  tickConfigured: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [minMinutes, setMinMinutes] = useState(String(initialMinMinutes));
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(next: { enabled?: boolean; minMinutes?: number }) {
    setBusy(true);
    setMsg("");
    setError("");
    const res = await fetch("/api/settings/breaks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
    setBusy(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setError(data.error || "Не вдалося зберегти");
      return false;
    }
    setEnabled(data.enabled);
    setMinMinutes(String(data.minMinutes));
    setMsg("✓ Збережено");
    setTimeout(() => setMsg(""), 2500);
    return true;
  }

  async function sendTest() {
    setBusy(true);
    setMsg("");
    setError("");
    const res = await fetch("/api/settings/breaks", { method: "POST" }).catch(() => null);
    setBusy(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) setError(data.error || "Не вдалося надіслати");
    else setMsg("✓ Надіслано — перевірте Telegram");
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <h2 className="text-lg font-semibold text-gray-800">☕ Повідомлення про перерви</h2>
      <p className="text-gray-600 text-sm">
        Щойно урок закінчується, бот пише в Telegram: скільки триває перерва до наступного уроку і з ким він.
        Якщо наступний урок ще не підготовлено — нагадає. Після останнього уроку дня — тепле «на сьогодні все».
      </p>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !telegramConnected}
          onChange={(e) => save({ enabled: e.target.checked })}
          className="w-5 h-5"
        />
        <span className="text-sm text-gray-800">Надсилати повідомлення після уроків</span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">Писати про перерву, якщо вона не менша ніж</span>
        <input
          type="number"
          inputMode="numeric"
          min={5}
          max={240}
          value={minMinutes}
          onChange={(e) => setMinMinutes(e.target.value)}
          className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <span className="text-sm text-gray-600">хв</span>
        <button
          type="button"
          onClick={() => save({ minMinutes: Number(minMinutes) })}
          disabled={busy || !telegramConnected}
          className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-40"
        >
          Зберегти
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={sendTest}
          disabled={busy || !telegramConnected}
          className="px-3 py-2 bg-pink-50 text-pink-700 rounded-lg text-sm font-medium hover:bg-pink-100 disabled:opacity-40"
        >
          Надіслати приклад у Telegram
        </button>
        {tickConfigured ? (
          <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg">«Будильник» налаштовано</span>
        ) : (
          <span className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded-lg">
            Потрібен «будильник» (TICK_SECRET у Vercel + cron-job.org)
          </span>
        )}
      </div>

      {!telegramConnected && <p className="text-sm text-gray-500">Спершу підключіть Telegram вчительки (вище).</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
