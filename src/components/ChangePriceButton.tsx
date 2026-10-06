"use client";

import { useState } from "react";

export default function ChangePriceButton({
  studentId,
  currentPrice,
  onDone,
}: {
  studentId: string;
  currentPrice: number;
  onDone: (newPrice: number) => void;
}) {
  const today = new Date().toLocaleDateString("en-CA");

  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(currentPrice));
  const [fromDate, setFromDate] = useState(today);
  const [includePaid, setIncludePaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  function openModal() {
    setPrice(String(currentPrice));
    setFromDate(today);
    setIncludePaid(false);
    setError("");
    setResult("");
    setOpen(true);
  }

  async function save() {
    setError("");
    setResult("");
    const numeric = Number(price);
    if (!Number.isFinite(numeric) || numeric < 0 || price === "") {
      setError("Вкажіть коректну ціну");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/students/${studentId}/price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: numeric, fromDate, includePaid }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не вдалося змінити ціну");
      return;
    }

    const data = await res.json();
    setResult(`Готово. Оновлено уроків: ${data.updatedLessons}.`);
    onDone(numeric);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="px-4 py-3 bg-pink-50 text-pink-700 rounded-xl text-sm font-medium hover:bg-pink-100 whitespace-nowrap"
      >
        Змінити ціну
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Змінити ціну уроку</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Нова ціна (грн)</label>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Рахувати по новій ціні з дати
              </label>
              <input
                type="date"
                max={today}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
              <button
                type="button"
                onClick={() => setFromDate("2000-01-01")}
                className="mt-2 text-sm text-pink-600 underline"
              >
                З самого початку (усі уроки)
              </button>
            </div>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={includePaid}
                onChange={(e) => setIncludePaid(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm text-gray-700">
                Змінити і вже оплачені уроки (зміняться суми в звітах, реально отримані гроші не зміняться)
              </span>
            </label>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            {result && <p className="text-green-600 text-sm">{result}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-5 py-3 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700 disabled:opacity-50"
              >
                {saving ? "Збереження..." : "Застосувати"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-5 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}