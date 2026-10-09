"use client";

import { useEffect, useState } from "react";
import PaymentsHistoryButton from "@/components/PaymentsHistoryButton";
import StudentLedgerButton from "@/components/StudentLedgerButton";

type Finding = { level: "warn" | "info"; text: string };
type Report = {
  checkedStudents: number;
  students: { studentId: string; name: string; findings: Finding[] }[];
};

// Перевірка даних у фінансах.
// variant="menu" — пункт у меню «⋯»; variant="banner" — рядок-попередження над картками (лише коли щось знайдено)
export default function MoneyCheckButton({
  variant = "menu",
  warnCount = 0,
}: {
  variant?: "menu" | "banner";
  warnCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  async function check() {
    setOpen(true);
    setLoading(true);
    setError("");
    setReport(null);
    const res = await fetch("/api/money-check").catch(() => null);
    setLoading(false);
    if (!res || !res.ok) {
      setError("Не вдалося перевірити дані");
      return;
    }
    setReport(await res.json());
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const word = (n: number) => {
    const l = n % 10;
    const t = n % 100;
    if (t >= 11 && t <= 14) return "неточностей";
    if (l === 1) return "неточність";
    if (l >= 2 && l <= 4) return "неточності";
    return "неточностей";
  };

  return (
    <>
      {variant === "banner" ? (
        <button
          type="button"
          onClick={check}
          className="w-full text-left flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 text-amber-800 text-sm hover:bg-amber-100"
        >
          <span>⚠️</span>
          <span className="flex-1">
            Знайдено {warnCount} {word(warnCount)} в даних — через них цифри можуть бути неточні
          </span>
          <span className="font-medium whitespace-nowrap">Переглянути ›</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={check}
          className="w-full text-left px-3 py-2 text-gray-700 rounded-lg text-sm hover:bg-gray-100"
        >
          Перевірити дані
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-xl text-left">
            <div className="flex justify-between items-start gap-3">
              <h2 className="text-lg font-semibold text-gray-800">Перевірка даних</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрити"
                className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            {loading && <p className="text-gray-400 text-sm">Перевіряю уроки й оплати...</p>}

            {report && report.students.length === 0 && (
              <p className="text-green-600 text-sm font-medium">
                ✓ Усе гаразд. Перевірено учнів: {report.checkedStudents}. Неточностей не знайдено.
              </p>
            )}

            {report && report.students.length > 0 && (
              <>
                <p className="text-sm text-gray-600">
                  Це лише підказки, нічого не змінено. <span className="text-red-600">Червоне</span> — точно
                  варто виправити (наприклад, відмітити урок у календарі). Сіре — просто перевірте.
                </p>
                <div className="space-y-3">
                  {report.students.map((s) => (
                    <div key={s.studentId} className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <p className="font-medium text-gray-800">{s.name}</p>
                      {s.findings.map((f, i) => (
                        <p key={i} className={`text-sm ${f.level === "warn" ? "text-red-600" : "text-gray-600"}`}>
                          {f.level === "warn" ? "⚠️ " : "• "}
                          {f.text}
                        </p>
                      ))}
                      <div className="flex gap-1 flex-wrap">
                        <PaymentsHistoryButton studentId={s.studentId} studentName={s.name} />
                        <StudentLedgerButton studentId={s.studentId} studentName={s.name} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
