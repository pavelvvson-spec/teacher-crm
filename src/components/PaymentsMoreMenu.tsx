"use client";

import { useEffect, useRef, useState } from "react";

// Маленьке меню «⋯» для рідкісних і небезпечних дій (наприклад, «Очистити оплати»)
export default function PaymentsMoreMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Інші дії"
        aria-label="Інші дії"
        className="w-10 h-10 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 text-xl leading-none"
      >
        ⋯
      </button>
      <div
        className={`${open ? "block" : "hidden"} absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 p-1 z-40`}
      >
        {children}
      </div>
    </div>
  );
}
