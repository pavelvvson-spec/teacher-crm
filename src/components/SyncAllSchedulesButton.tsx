"use client";

import { useState } from "react";

type ReportStudent = {
  studentId: string;
  name: string;
  created: number;
  removedGray: number;
  cancelled: { id: string; startAt: string; hasPrep: boolean }[];
};

export default function SyncAllSchedulesButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState<ReportStudent[] | null>(null);
  const [keepIds, setKeepIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function check() {
    setOpen(true);
    setLoading(true);
    setError("");
    setDone(false);
    setReport(null);
    setKeepIds(new Set());

    const res = await fetch("/api/recurring-schedules/sync-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    setLoading(false);

    if (!res.ok) {
      setError("Не вдалося перевірити розклад");
      return;
    }
    const data = await res.json();
    setReport(data.students);
  }

  function toggleKeep(id: string) {
    setKeepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    setApplying(true);
    setError("");
    const res = await fetch("/api/recurring-schedules/sync-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: false, excludeLessonIds: Array.from(keepIds) }),
    });
    setApplying(false);

    if (!res.ok) {
      setError("Не вдалося застосувати зміни");
      return;
    }
    setDone(true);
  }

  function close() {
    setOpen(false);
    if (done) window.location.reload();
  }

  const nothingToDo = report !== null && report.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={check}
        className="px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-100"
      >
        Перевірити розклад усіх учнів
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-semibold text-gray-800">Перевірка розкладу</h2>
              <button type="button" onClick={close} className="text-gray-400 hover:text-gray-600">
                Закрити
              </button>
            </div>

            {loading && <p className="text-gray-400 text-sm">Перевіряю уроки всіх учнів...</p>}
            {error && <p className="text-red-600 text-sm">{error}</p>}

            {done && (
              <p className="text-green-600 text-sm font-medium">
                Готово. Після закриття вікна календар оновиться.
              </p>
            )}

            {nothingToDo && !done && (
              <p className="text-green-600 text-sm font-medium">
                Усе гаразд: усі майбутні уроки збігаються з розкладом, нічого міняти не треба.
              </p>
            )}

            {report && report.length > 0 && !done && (
              <>
                <p className="text-sm text-gray-600">
                  Нижче показано, що зміниться. Нічого ще не змінено. Зніми галочку з уроку, який треба
                  залишити як є.
                </p>

                <div className="space-y-4">
                  {report.map((s) => (
                    <div key={s.studentId} className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <p className="font-medium text-gray-800">{s.name}</p>
                      {s.created > 0 && (
                        <p className="text-sm text-green-700">Буде створено уроків за розкладом: {s.created}</p>
                      )}
                      {s.removedGray > 0 && (
                        <p className="text-sm text-gray-700">
                          Буде прибрано сірих (скасованих) уроків: {s.removedGray}
                        </p>
                      )}
                      {s.cancelled.map((c) => (
                        <label key={c.id} className="flex items-start gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={!keepIds.has(c.id)}
                            onChange={() => toggleKeep(c.id)}
                            className="mt-0.5"
                          />
                          <span>
                            {c.hasPrep ? "Скасувати урок" : "Прибрати урок"}{" "}
                            {new Date(c.startAt).toLocaleString("uk-UA", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {c.hasPrep && (
                              <span className="text-amber-700"> (є нотатка, ДЗ або матеріали)</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={apply}
                  disabled={applying}
                  className="px-5 py-3 bg-pink-600 text-white rounded-xl font-medium hover:bg-pink-700 disabled:opacity-50"
                >
                  {applying ? "Застосовую..." : "Застосувати"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
