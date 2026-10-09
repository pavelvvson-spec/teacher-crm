"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import PullToRefresh from "@/components/PullToRefresh";
import DemoBanner from "@/components/DemoBanner";

const NAV_ITEMS = [
  { href: "/", label: "Головна" },
  { href: "/calendar", label: "Календар" },
  { href: "/students", label: "Учні" },
  { href: "/lessons", label: "Підготовка до уроку" },
  { href: "/payments", label: "Фінанси" },
  { href: "/settings/telegram", label: "Налаштування" },
];

// «Фінанси» мають дві вкладки: /payments (Учні) і /reports (Підсумки)
const FINANCE_PATHS = ["/payments", "/reports"];

// Нижня панель на телефоні: 4 головні сторінки + «Ще»
const BOTTOM_MAIN = [
  { href: "/", label: "Головна" },
  { href: "/calendar", label: "Календар" },
  { href: "/students", label: "Учні" },
  { href: "/payments", label: "Фінанси" },
];

const BOTTOM_MORE = [
  { href: "/lessons", label: "Підготовка до уроку" },
  { href: "/settings/telegram", label: "Налаштування" },
];

// Сторінки першого рівня: на них кнопка «Назад» не потрібна
const TOP_LEVEL_PATHS = [...NAV_ITEMS.map((item) => item.href), "/reports"];

function NavIcon({ href }: { href: string }) {
  const common = {
    className: "w-6 h-6",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (href === "/") {
    return (
      <svg {...common}>
        <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (href === "/calendar") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    );
  }
  if (href === "/students") {
    return (
      <svg {...common}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </svg>
    );
  }
  if (href === "/payments") {
    return (
      <svg {...common}>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  // «Ще»
  return (
    <svg {...common}>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </svg>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/payments") return FINANCE_PATHS.some((p) => pathname.startsWith(p));
    return pathname.startsWith(href);
  }

  const moreActive = BOTTOM_MORE.some((item) => isActive(item.href));

  const showBack = !TOP_LEVEL_PATHS.includes(pathname);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    // Якщо історії немає (відкрили сторінку напряму), йдемо на рівень вище
    const parts = pathname.split("/").filter(Boolean);
    parts.pop();
    router.push(parts.length > 0 ? "/" + parts.join("/") : "/");
  }

  return (
    <div className="min-h-screen">
      <DemoBanner />
      {/* Верхнє меню: тільки на комп'ютері */}
      <header className="hidden sm:block bg-white border-b border-gray-200">
        <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg font-medium ${
                  isActive(item.href)
                    ? "bg-pink-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <LogoutButton />
        </nav>
      </header>

      <PullToRefresh />
      <main className="max-w-6xl mx-auto px-4 py-6 pb-28 sm:pb-6">
        {showBack && (
          <button
            type="button"
            onClick={goBack}
            className="mb-4 inline-flex items-center gap-1 px-3 py-2 sm:py-1.5 -ml-1 rounded-xl bg-white text-pink-600 font-medium shadow-sm hover:bg-pink-50 sm:text-sm"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Назад
          </button>
        )}
        {children}
      </main>

      {/* Нижня панель: тільки на телефоні */}
      {moreOpen && (
        <div className="sm:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute left-3 right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] bg-white rounded-2xl shadow-lg p-2"
            onClick={(e) => e.stopPropagation()}
          >
            {BOTTOM_MORE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-3 rounded-xl font-medium ${
                  isActive(item.href) ? "bg-pink-50 text-pink-700" : "text-gray-700"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="px-4 py-3 border-t border-gray-100 mt-1">
              <LogoutButton />
            </div>
          </div>
        </div>
      )}

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {BOTTOM_MAIN.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium ${
                isActive(item.href) ? "text-pink-600" : "text-gray-500"
              }`}
            >
              <NavIcon href={item.href} />
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium ${
              moreActive || moreOpen ? "text-pink-600" : "text-gray-500"
            }`}
          >
            <NavIcon href="more" />
            Ще
          </button>
        </div>
      </nav>
    </div>
  );
}