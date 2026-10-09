"use client";

import { useEffect, useMemo, useState } from "react";
import InfoTip from "@/components/InfoTip";

type MonthRow = { id: string; name: string; price: number; isActive: boolean; lessons: number; earned: number; received: number };
type YearRow = { id: string; name: string; price: number; isActive: boolean; months: number[] };

const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const MONTHS_SHORT = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];

const fmt = (n: number) => Math.round(n).toLocaleString("uk-UA");

type SortKey = "name" | "price" | "lessons" | "earned" | "received" | "total" | `m${number}`;

// Таблиця фінансів по учнях: місяць (ціна, уроки, зароблено, отримано) або рік (отримано по місяцях)
export default function FinanceTable() {
  const today = new Date();
  const [mode, setMode] = useState<"month" | "year">("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [monthRows, setMonthRows] = useState<MonthRow[] | null>(null);
  const [yearRows, setYearRows] = useState<YearRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "received", dir: -1 });

  useEffect(() => {
    setLoading(true);
    const url =
      mode === "month"
        ? `/api/finance/table?mode=month&year=${year}&month=${month}`
        : `/api/finance/table?mode=year&year=${year}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (mode === "month") setMonthRows(d.rows ?? []);
        else setYearRows(d.rows ?? []);
      })
      .catch(() => (mode === "month" ? setMonthRows([]) : setYearRows([])))
      .finally(() => setLoading(false));
  }, [mode, year, month]);

  function shift(delta: number) {
    if (mode === "year") {
      setYear((y) => y + delta);
      return;
    }
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));
  }

  const sortedMonth = useMemo(() => {
    const rows = [...(monthRows ?? [])];
    const k = sort.key as keyof MonthRow;
    rows.sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name, "uk") * sort.dir;
      return (((a[k] as number) ?? 0) - ((b[k] as number) ?? 0)) * sort.dir || a.name.localeCompare(b.name, "uk");
    });
    return rows;
  }, [monthRows, sort]);

  const sortedYear = useMemo(() => {
    const rows = (yearRows ?? []).map((r) => ({ ...r, total: r.months.reduce((a, b) => a + b, 0) }));
    rows.sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name, "uk") * sort.dir;
      const val = (r: (typeof rows)[number]) =>
        sort.key === "total" ? r.total : sort.key.startsWith("m") ? r.months[Number(sort.key.slice(1))] ?? 0 : sort.key === "price" ? r.price : r.total;
      return (val(a) - val(b)) * sort.dir || a.name.localeCompare(b.name, "uk");
    });
    return rows;
  }, [yearRows, sort]);

  const monthTotals = useMemo(
    () =>
      (monthRows ?? []).reduce(
        (t, r) => ({ lessons: t.lessons + r.lessons, earned: t.earned + r.earned, received: t.received + r.received }),
        { lessons: 0, earned: 0, received: 0 }
      ),
    [monthRows]
  );
  const yearTotals = useMemo(() => {
    const cols = Array(12).fill(0) as number[];
    for (const r of yearRows ?? []) r.months.forEach((v, i) => (cols[i] += v));
    return { cols, total: cols.reduce((a, b) => a + b, 0) };
  }, [yearRows]);

  // Завантаження для Excel (CSV з «;» — Excel відкриває одразу, з українськими літерами)
  function download() {
    const lines: string[][] = [];
    if (mode === "month") {
      lines.push(["Учень", "Ціна уроку", "Уроків", "Зароблено", "Отримано"]);
      for (const r of sortedMonth) lines.push([r.name, fmt(r.price), String(r.lessons), String(r.earned), String(r.received)]);
      lines.push(["Разом", "", String(monthTotals.lessons), String(monthTotals.earned), String(monthTotals.received)]);
    } else {
      lines.push(["Учень", "Ціна уроку", ...MONTHS, "Разом"]);
      for (const r of sortedYear) lines.push([r.name, String(r.price), ...r.months.map(String), String(r.total)]);
      lines.push(["Разом", "", ...yearTotals.cols.map(String), String(yearTotals.total)]);
    }
    const csv = "﻿" + lines.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = mode === "month" ? `finansy-${year}-${String(month + 1).padStart(2, "0")}.csv` : `finansy-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const Th = ({ k, children, left = false }: { k: SortKey; children: React.ReactNode; left?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-3 py-2 font-medium text-gray-500 cursor-pointer select-none whitespace-nowrap hover:text-gray-800 ${
        left ? "text-left" : "text-right"
      }`}
    >
      {children}
      {sort.key === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  const stickyCell = "sticky left-0 z-10 bg-white";

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-1.5 mr-auto">
          Таблиця по учнях
          <InfoTip
            title="Таблиця по учнях"
            text="«Зароблено» — ціна проведених уроків за місяць (скільки роботи зроблено). «Отримано» — гроші, які учень реально заплатив у цьому місяці (за датою оплати). У режимі «Рік» — отримано по місяцях. Натисніть на заголовок колонки, щоб відсортувати."
          />
        </h2>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {(["month", "year"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setSort({ key: m === "month" ? "received" : "total", dir: -1 });
              }}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${
                mode === m ? "bg-white text-pink-700 shadow-sm" : "text-gray-600 hover:text-gray-800"
              }`}
            >
              {m === "month" ? "Місяць" : "Рік"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Назад" className="w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100">
            ←
          </button>
          <span className="min-w-[8.5rem] text-center font-medium text-gray-800">
            {mode === "month" ? `${MONTHS[month]} ${year}` : `${year} рік`}
          </span>
          <button type="button" onClick={() => shift(1)} aria-label="Вперед" className="w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100">
            →
          </button>
        </div>
        <button
          type="button"
          onClick={download}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40"
        >
          ⬇︎ Для Excel
        </button>
      </div>

      <div className={`overflow-x-auto -mx-4 sm:mx-0 ${loading ? "opacity-50" : ""}`}>
        {mode === "month" ? (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr>
                <th className={`${stickyCell} px-3 py-2 text-left font-medium text-gray-500 cursor-pointer`} onClick={() => toggleSort("name")}>
                  Учень{sort.key === "name" ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
                <Th k="price">Ціна</Th>
                <Th k="lessons">Уроків</Th>
                <Th k="earned">Зароблено</Th>
                <Th k="received">Отримано</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedMonth.map((r) => (
                <tr key={r.id} className={r.isActive ? "" : "text-gray-400"}>
                  <td className={`${stickyCell} px-3 py-2 whitespace-nowrap`}>{r.name}</td>
                  <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{fmt(r.price)}</td>
                  <td className="px-3 py-2 text-right">{r.lessons || "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{r.earned ? fmt(r.earned) : "—"}</td>
                  <td className="px-3 py-2 text-right font-medium text-green-700 whitespace-nowrap">{r.received ? fmt(r.received) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 font-semibold">
              <tr>
                <td className={`${stickyCell} px-3 py-2`}>Разом</td>
                <td />
                <td className="px-3 py-2 text-right">{monthTotals.lessons}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{fmt(monthTotals.earned)} грн</td>
                <td className="px-3 py-2 text-right text-green-700 whitespace-nowrap">{fmt(monthTotals.received)} грн</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr>
                <th className={`${stickyCell} px-3 py-2 text-left font-medium text-gray-500 cursor-pointer`} onClick={() => toggleSort("name")}>
                  Учень{sort.key === "name" ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
                {MONTHS_SHORT.map((m, i) => (
                  <Th key={m} k={`m${i}`}>
                    {m}
                  </Th>
                ))}
                <Th k="total">Разом</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedYear.map((r) => (
                <tr key={r.id} className={r.isActive ? "" : "text-gray-400"}>
                  <td className={`${stickyCell} px-3 py-2 whitespace-nowrap`}>{r.name}</td>
                  {r.months.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right whitespace-nowrap text-gray-700">
                      {v ? fmt(v) : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold text-green-700 whitespace-nowrap">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 font-semibold">
              <tr>
                <td className={`${stickyCell} px-3 py-2`}>Разом</td>
                {yearTotals.cols.map((v, i) => (
                  <td key={i} className="px-3 py-2 text-right whitespace-nowrap">
                    {v ? fmt(v) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-green-700 whitespace-nowrap">{fmt(yearTotals.total)} грн</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      {mode === "year" && <p className="text-xs text-gray-400">У режимі «Рік» показано отримані гроші по місяцях.</p>}
    </div>
  );
}
