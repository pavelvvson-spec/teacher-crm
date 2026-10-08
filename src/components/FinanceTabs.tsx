import Link from "next/link";

// Заголовок розділу «Фінанси» з двома вкладками
export default function FinanceTabs({
  active,
  actions,
}: {
  active: "students" | "summary";
  actions?: React.ReactNode; // кнопки праворуч (наприклад, «Перевірка грошей» і «⋯»)
}) {
  const tab = (key: "students" | "summary", href: string, label: string) => (
    <Link
      href={href}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
        active === key ? "bg-white text-pink-700 shadow-sm" : "text-gray-600 hover:text-gray-800"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold text-gray-800">Фінанси</h1>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {tab("students", "/payments", "Учні")}
          {tab("summary", "/reports", "Підсумки")}
        </div>
        {actions}
      </div>
    </div>
  );
}
