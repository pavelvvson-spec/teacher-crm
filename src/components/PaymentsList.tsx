"use client";

import { useMemo, useState } from "react";
import AddPaymentButton from "@/components/AddPaymentButton";
import PaymentsHistoryButton from "@/components/PaymentsHistoryButton";
import StudentLedgerButton from "@/components/StudentLedgerButton";

export type PaymentKind = "perLesson" | "periodic" | "prepaid" | "other";

export type PaymentRow = {
  id: string;
  fullName: string;
  balance: number; // > 0 винен, < 0 передоплата, 0 усе оплачено
  overdue: number; // борг: термін оплати вже минув
  upcoming: number; // до сплати за графіком (кінець тижня/місяця ще не настав)
  kind: PaymentKind;
  lessonsLeft: number | null; // лише для «Передоплата на місяць»
  unpaidLessons: { id: string; date: string; time: string; amount: number }[];
  lessonPrice: number;
};

const TABS: { key: "all" | PaymentKind; label: string }[] = [
  { key: "all", label: "Усі" },
  { key: "perLesson", label: "Поурочно" },
  { key: "periodic", label: "Помісячно / потижнево" },
  { key: "prepaid", label: "Наперед" },
];

const KIND_LABEL: Record<PaymentKind, string> = {
  perLesson: "поурочно",
  periodic: "помісячно / потижнево",
  prepaid: "наперед",
  other: "",
};

function money(n: number): string {
  return `${Math.abs(n).toLocaleString("uk-UA")} грн`;
}

function lessonsWord(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "уроків";
  if (last === 1) return "урок";
  if (last >= 2 && last <= 4) return "уроки";
  return "уроків";
}

function Amount({ row }: { row: PaymentRow }) {
  if (row.overdue > 0) {
    return (
      <div className="text-right">
        <p className="font-semibold text-red-600 whitespace-nowrap">Борг {money(row.overdue)}</p>
        {row.upcoming > 0 && (
          <p className="text-xs text-amber-600 whitespace-nowrap">+ {money(row.upcoming)} до сплати</p>
        )}
      </div>
    );
  }
  if (row.upcoming > 0) {
    return (
      <div className="text-right">
        <p className="font-semibold text-amber-600 whitespace-nowrap">До сплати {money(row.upcoming)}</p>
        <p className="text-xs text-gray-400">за графіком</p>
      </div>
    );
  }
  if (row.balance < 0) {
    return (
      <div className="text-right">
        <p className="font-semibold text-violet-700 whitespace-nowrap">
          {row.kind === "prepaid" ? "Залишок" : "Передоплата"} {money(row.balance)}
        </p>
        {row.lessonsLeft !== null && (
          <p className="text-xs text-violet-500">
            ≈ {row.lessonsLeft} {lessonsWord(row.lessonsLeft)}
          </p>
        )}
      </div>
    );
  }
  return <p className="text-sm text-green-600 whitespace-nowrap">Усе оплачено</p>;
}

function Row({ row, showKind }: { row: PaymentRow; showKind: boolean }) {
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-800 truncate">{row.fullName}</p>
        {showKind && KIND_LABEL[row.kind] && <p className="text-xs text-gray-400">{KIND_LABEL[row.kind]}</p>}
      </div>
      <div className="shrink-0 text-right">
        <Amount row={row} />
      </div>
      <div className="flex items-center gap-1 w-full sm:w-auto justify-end shrink-0">
        <PaymentsHistoryButton studentId={row.id} studentName={row.fullName} compact />
        <StudentLedgerButton studentId={row.id} studentName={row.fullName} compact />
        <AddPaymentButton
          studentId={row.id}
          studentName={row.fullName}
          lessons={row.unpaidLessons}
          lessonPrice={row.lessonPrice}
          primary
        />
      </div>
    </div>
  );
}

function Group({
  title,
  dot,
  rows,
  showKind,
}: {
  title: string;
  dot: string;
  rows: PaymentRow[];
  showKind: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 pt-4 pb-1">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        {title} · {rows.length}
      </h3>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => (
          <Row key={r.id} row={r} showKind={showKind} />
        ))}
      </div>
    </section>
  );
}

export default function PaymentsList({ rows }: { rows: PaymentRow[] }) {
  const [tab, setTab] = useState<"all" | PaymentKind>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => (tab === "all" || r.kind === tab) && (!q || r.fullName.toLowerCase().includes(q))
    );
  }, [rows, tab, query]);

  const debtors = visible.filter((r) => r.overdue > 0).sort((a, b) => b.overdue - a.overdue);
  const upcoming = visible
    .filter((r) => r.overdue <= 0 && r.upcoming > 0)
    .sort((a, b) => b.upcoming - a.upcoming);
  const prepaid = visible.filter((r) => r.balance < 0).sort((a, b) => a.balance - b.balance);
  const paid = visible.filter((r) => r.balance === 0);
  const showKind = tab === "all";

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
                tab === t.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs ${tab === t.key ? "text-gray-300" : "text-gray-400"}`}>
                {counts[t.key] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук учня…"
          className="sm:ml-auto w-full sm:w-56 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-gray-500 text-sm py-6 text-center">Нікого не знайдено.</p>
      ) : (
        <>
          <Group title="Боргують" dot="bg-red-500" rows={debtors} showKind={showKind} />
          <Group title="До сплати за графіком" dot="bg-amber-400" rows={upcoming} showKind={showKind} />
          <Group title="Передоплата" dot="bg-violet-500" rows={prepaid} showKind={showKind} />
          <Group title="Усе оплачено" dot="bg-green-500" rows={paid} showKind={showKind} />
        </>
      )}
    </div>
  );
}
