"use client";

import { useEffect, useRef, useState } from "react";

// Кружечок «i» біля цифри: на комп'ютері підказка з'являється при наведенні,
// на телефоні — при дотику (і закривається дотиком будь-де)
export default function InfoTip({
  text,
  title,
  align = "center",
}: {
  text: string;
  title?: string;
  align?: "center" | "right"; // "right" — для карток біля правого краю
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const visible = open || hover;

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-label={title ? `Що означає «${title}»` : "Пояснення"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-4 h-4 sm:w-[18px] sm:h-[18px] inline-flex items-center justify-center rounded-full border border-gray-300 text-[10px] sm:text-[11px] font-semibold italic text-gray-400 hover:text-pink-600 hover:border-pink-300 leading-none"
      >
        i
      </button>
      {visible && (
        <span
          role="tooltip"
          className={`fixed left-4 right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 sm:absolute ${align === "right" ? "sm:left-auto sm:right-0" : "sm:left-1/2 sm:right-auto sm:-translate-x-1/2"} sm:bottom-auto sm:top-full sm:mt-2 sm:w-72 bg-gray-900 text-white text-sm font-normal not-italic normal-case tracking-normal text-left leading-snug rounded-xl px-4 py-3 shadow-xl`}
        >
          {title && <span className="block font-semibold mb-1">{title}</span>}
          {text}
        </span>
      )}
    </span>
  );
}
