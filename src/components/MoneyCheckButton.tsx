"use client";

import { useState } from "react";
import PaymentsHistoryButton from "@/components/PaymentsHistoryButton";
import StudentLedgerButton from "@/components/StudentLedgerButton";

type Finding = { level: "warn" | "info"; text: string };
type Report = {
  checkedStudents: number;
  students: { studentId: string; name: string; findings: Finding[] }[];
};

type AuditRow = {
  studentId: string;
  name: string;
  paymentFrequency: string | null;
  oldBalance: number;
  newBalance: number;
  diff: number;
  earned: number;
  paidFlag: number;
  prepaidFlag: number;
  partialFlag: number;
  unpaidFlag: number;
  paymentsTotal: number;
  linkedPaymentsTotal: number;
  doubleCounted: number;
  paidNotCompletedCount: number;
  paidNotCompletedSum: number;
};

const FREQ_LABELS: Record<string, string> = {
  PER_LESSON: "поурочна",
  WEEKLY: "потижнева",
  MONTHLY: "помісячна",
  END_OF_WEEK: "в кінці тижня",
  END_OF_MONTH: "в кінці місяця",
  MONTHLY_PREPAID: "наперед на місяць",
};

function balanceText(n: number): string {
  if (n > 0) return `борг ${n} грн`;
  if (n < 0) return `передоплата ${Math.abs(n)} грн`;
  return "0 грн";
}

export default function MoneyCheckButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"hints" | "audit">("hints");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState("");

  async function check() {
    setOpen(true);
    setTab("hints");
    setLoading(true);
    setError("");
    setReport(null);
    setAudit(null);

    const res = await fetch("/api/money-check");
    setLoading(false);

    if (!res.ok) {
      setError("Не вдалося перевірити гроші");
      return;
    }
    setReport(await res.json());
  }

  async function openAudit() {
    setTab("audit");
    if (audit) return;
    setAuditLoading(true);
    setError("");
    const res = await fetch("/api/finance-audit");
    setAuditLoading(false);
    if (!res.ok) {
      setError("Не вдалося зробити звірку");
      return;
    }
    const data = await res.json();
    setAudit(data.rows);
  }

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium ${
      active ? "bg-pink-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`;

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
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
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

            <div className="flex gap-2">
              <button type="button" onClick={() => setTab("hints")} className={tabClass(tab === "hints")}>
                Підказки
              </button>
              <button type="button" onClick={openAudit} className={tabClass(tab === "audit")}>
                Нова схема: звірка
              </button>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            {tab === "hints" && (
              <>
                {loading && <p className="text-gray-400 text-sm">Перевіряю уроки й оплати...</p>}

                {report && report.students.length === 0 && (
                  <p className="text-green-600 text-sm font-medium">
                    Усе гаразд. Перевірено учнів: {report.checkedStudents}. Підозрілого не знайдено.
                  </p>
                )}

                {report && report.students.length > 0 && (
                  <>
                    <p className="text-sm text-gray-600">
                      Це лише підказки, нічого не змінено. Оплати виправляй кнопкою «Історія оплат» біля
                      учня, а ціни через «Змінити ціну» в його картці. Кнопка «Журнал» покаже всі уроки й
                      оплати учня одним списком.
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
                          <div className="flex gap-2 flex-wrap">
                            <PaymentsHistoryButton studentId={s.studentId} studentName={s.name} />
                            <StudentLedgerButton studentId={s.studentId} studentName={s.name} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === "audit" && (
              <>
                {auditLoading && <p className="text-gray-400 text-sm">Рахую за двома схемами...</p>}

                {audit && (
                  <>
                    <p className="text-sm text-gray-600">
                      Нічого не змінено. «Зараз» це баланс за поточною формулою, «Нова схема» це уроки
                      мінус усі оплати. Спершу йдуть учні, де числа розходяться.
                    </p>
                    <div className="space-y-3">
                      {audit.map((r) => (
                        <div
                          key={r.studentId}
                          className={`rounded-xl p-3 space-y-1 ${r.diff !== 0 ? "bg-red-50" : "bg-gray-50"}`}
                        >
                          <div className="flex justify-between gap-2">
                            <p className="font-medium text-gray-800">
                              {r.name}{" "}
                              <span className="text-xs text-gray-500">
                                ({r.paymentFrequency ? FREQ_LABELS[r.paymentFrequency] ?? r.paymentFrequency : "поурочна"})
                              </span>
                            </p>
                            {r.diff !== 0 && (
                              <p className="text-sm font-semibold text-red-600">різниця {r.diff} грн</p>
                            )}
                          </div>
                          <p className="text-sm text-gray-700">
                            Зараз: {balanceText(r.oldBalance)}. Нова схема: {balanceText(r.newBalance)}.
                          </p>
                          <p className="text-xs text-gray-500">
                            Проведено уроків на {r.earned} грн (оплачені позначкою {r.paidFlag}, передоплачені{" "}
                            {r.prepaidFlag}, частково {r.partialFlag}, неоплачені {r.unpaidFlag}). Оплат
                            усього {r.paymentsTotal} грн, з них прив'язаних до уроку {r.linkedPaymentsTotal}{" "}
                            грн.
                          </p>
                          {r.doubleCounted > 0 && (
                            <p className="text-xs text-red-600">
                              Можливе подвоєння: уроки на {r.doubleCounted} грн і позначені оплаченими, і мають
                              окрему оплату.
                            </p>
                          )}
                          {r.paidNotCompletedCount > 0 && (
                            <p className="text-xs text-red-600">
                              Оплачені, але не проведені уроки: {r.paidNotCompletedCount} шт на{" "}
                              {r.paidNotCompletedSum} грн.
                            </p>
                          )}
                          <StudentLedgerButton studentId={r.studentId} studentName={r.name} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}