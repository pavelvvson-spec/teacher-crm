"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PaymentRow = {
  id: string;
  amount: number;
  paidAt: string | null;
  createdAt: string;
};

function toDateInput(iso: string | null, fallback: string): string {
  return (iso ?? fallback).slice(0, 10);
}

export default function PaymentsHistoryButton({
  studentId,
  studentName,
  compact = false,
}: {
  studentId: string;
  studentName: string;
  compact?: boolean; // маленька кнопка-іконка (для списку на сторінці оплат)
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/payments?studentId=${studentId}`);
    const data = await res.json().catch(() => []);
    setPayments(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  function openModal() {
    setOpen(true);
    setEditingId(null);
    setError("");
    load();
  }

  function startEdit(p: PaymentRow) {
    setEditingId(p.id);
    setEditAmount(String(p.amount));
    setEditDate(toDateInput(p.paidAt, p.createdAt));
    setError("");
  }

  async function saveEdit(id: string) {
    setError("");
    const res = await fetch(`/api/payments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(editAmount), paidAt: editDate }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не вдалося зберегти");
      return;
    }
    setEditingId(null);
    await load();
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Видалити цю оплату?")) return;
    const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Не вдалося видалити");
      return;
    }
    await load();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Історія оплат"
        aria-label="Історія оплат"
        className={
          compact
            ? "w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            : "px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200"
        }
      >
        {compact ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3 2" />
          </svg>
        ) : (
          "Історія оплат"
        )}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-semibold text-gray-800">Оплати: {studentName}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                Закрити
              </button>
            </div>

            {loading ? (
              <p className="text-gray-400 text-sm">Завантаження...</p>
            ) : payments.length === 0 ? (
              <p className="text-gray-500 text-sm">Записів про оплату немає.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <div key={p.id} className="py-3">
                    {editingId === p.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            min={1}
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveEdit(p.id)}
                            className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700"
                          >
                            Зберегти
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                          >
                            Скасувати
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-800">{p.amount} грн</p>
                          <p className="text-xs text-gray-500">
                            {new Date(p.paidAt ?? p.createdAt).toLocaleDateString("uk-UA")}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg text-sm font-medium hover:bg-yellow-100"
                          >
                            Змінити
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(p.id)}
                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100"
                          >
                            Видалити
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {error && <p className="text-red-600 text-sm">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}