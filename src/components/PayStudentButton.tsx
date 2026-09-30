"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PayStudentButton({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function openModal() {
    setAmount("");
    setError("");
    setOpen(true);
  }

  async function handleConfirm() {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("Введи суму більше нуля");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, amount: value }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Помилка збереження");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={openModal}
        className="px-3 py-1.5 bg-pink-50 text-pink-700 rounded-lg text-xs font-medium hover:bg-pink-100"
      >
        Оплачено
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Внести оплату</h2>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Сума, грн"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              autoFocus
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="px-4 py-2 bg-pink-600 text-white rounded-xl text-sm font-medium hover:bg-pink-700 disabled:opacity-50"
              >
                {loading ? "Збереження..." : "Підтвердити"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}