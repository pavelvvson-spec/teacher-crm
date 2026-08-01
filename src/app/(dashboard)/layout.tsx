import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

const NAV_ITEMS = [
  { href: "/", label: "Головна" },
  { href: "/calendar", label: "Календар" },
  { href: "/students", label: "Учні" },
  { href: "/lessons", label: "Підготовка до уроку" },
  { href: "/payments", label: "Оплати" },
  { href: "/reports", label: "Звіти" },
  { href: "/settings/telegram", label: "Telegram" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200">
        <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 font-medium"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <LogoutButton />
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}