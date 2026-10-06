"use client";

import { useState } from "react";

type Entry = {
  key: string;
  date: string;
  kind: "lesson" | "payment";
  title: string;
  note: string;
  coverage: string;
  delta: number;
  cash: number;
  balanceAfter: number;
};

type Ledger = {
  name: string;
  entries: Entry[];
  finalBalance: number;
  cashByLessonFlags: number;
  cashByPayments: number;
};

function balanceText(n: number): string {
  if (n > 0) return `борг ${n} грн`;
  if (n < 0) return `передоплата ${Math.abs(n)} грн`;
  return "0 грн";
}

function formatDate(iso: string, withTime: boolean): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}

export default function StudentLedgerButton({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ledger, setLedger] = useState<Ledger | null>(null);

  async function load() {
    setOpen(true);
    setLoading(true);
    setError("");
    setLedger(null);

    const res = await fetch(`/api/students/${studentId}/ledger`);
    setLoading(false);

    if (!res.ok) {
      setError("Не вдалося завантажити журнал");
      return;
    }
    setLedger(await res.json());
  }

  return (
    <>
      <button
        type="button"
        onClick={load}
        className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200"
      >
        Журнал
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start gap-2">
              <h2 className="text-lg font-semibold text-gray-800">Журнал: {studentName}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                Закрити
              </button>
            </div>

            {loading && <p className="text-gray-400 text-sm">Завантажую...</p>}
            {error && <p className="text-red-600 text-sm">{error}</p>}

            {ledger && (
              <>
                <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                  <p className="text-sm font-medium text-gray-800">
                    Баланс зараз: {balanceText(ledger.finalBalance)}
                  </p>
                  <p className="text-xs text-gray-600">
                    Гроші, що надійшли: {ledger.cashByLessonFlags + ledger.cashByPayments} грн, з них
                    позначками на уроках {ledger.cashByLessonFlags} грн і окремими оплатами{" "}
                    {ledger.cashByPayments} грн.
                  </p>
                </div>

                {ledger.entries.length === 0 ? (
                  <p className="text-sm text-gray-500">Проведених уроків і оплат ще немає.</p>
                ) : (
                  <div>
                    {ledger.entries.map((e) => (
                      <div
                        key={e.key}
                        className="grid grid-cols-[1fr_auto] gap-3 py-2 border-b border-gray-100"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">{e.title}</p>
                          <p className="text-xs text-gray-500">
                            {formatDate(e.date, e.kind === "lesson")} · {e.note}
                          </p>
                          {e.coverage && <p className="text-xs text-blue-700">{e.coverage}</p>}
                          {e.cash > 0 && (
                            <p className="text-xs text-green-700">Надійшло: {e.cash} грн</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-sm font-semibold ${
                              e.delta > 0 ? "text-red-600" : e.delta < 0 ? "text-green-600" : "text-gray-400"
                            }`}
                          >
                            {e.delta > 0 ? `+${e.delta}` : e.delta < 0 ? `−${Math.abs(e.delta)}` : "0"}
                          </p>
                          <p className="text-xs text-gray-500">{balanceText(e.balanceAfter)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-gray-500">
                  Плюс означає борг, мінус означає передоплату. Синім показано, яку оплату який урок закрив
                  (спершу закриваються найстаріші). Уроки з позначкою «оплачено» в баланс не входять, але
                  гроші за них показано як надходження.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}