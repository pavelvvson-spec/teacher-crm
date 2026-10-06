"use client";

import { useState } from "react";
import PaymentsHistoryButton from "@/components/PaymentsHistoryButton";

type Finding = { level: "warn" | "info"; text: string };
type Report = {
  checkedStudents: number;
  students: { studentId: string; name: string; findings: Finding[] }[];
};

export default function MoneyCheckButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  async function check() {
    setOpen(true);
    setLoading(true);
    setError("");
    setReport(null);

    const res = await fetch("/api/money-check");
    setLoading(false);

    if (!res.ok) {
      setError("Не вдалося перевірити гроші");
      return;
    }
    setReport(await res.json());
  }

  return (
    <>
      <button
        type="button"
        onClick={check}
        className="px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-100"
      >
        Перевірка грошей
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-semibold text-gray-800">Перевірка грошей</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                Закрити
              </button>
            </div>

            {loading && <p className="text-gray-400 text-sm">Перевіряю уроки й оплати...</p>}
            {error && <p className="text-red-600 text-sm">{error}</p>}

            {report && report.students.length === 0 && (
              <p className="text-green-600 text-sm font-medium">
                Усе гаразд. Перевірено учнів: {report.checkedStudents}. Підозрілого не знайдено.
              </p>
            )}

            {report && report.students.length > 0 && (
              <>
                <p className="text-sm text-gray-600">
                  Це лише підказки, нічого не змінено. Оплати виправляй кнопкою «Історія оплат» біля
                  учня, а ціни через «Змінити ціну» в його картці.
                </p>
                <div className="space-y-3">
                  {report.students.map((s) => (
                    <div key={s.studentId} className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <p className="font-medium text-gray-800">{s.name}</p>
                      {s.findings.map((f, i) => (
                        <p
                          key={i}
                          className={`text-sm ${f.level === "warn" ? "text-red-600" : "text-gray-700"}`}
                        >
                          {f.level === "warn" ? "Увага: " : "Перевір: "}
                          {f.text}
                        </p>
                      ))}
                      <PaymentsHistoryButton studentId={s.studentId} studentName={s.name} />
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