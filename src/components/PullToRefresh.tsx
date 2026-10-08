"use client";

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 70; // наскільки потягнути вниз (px), щоб оновити
const MAX_PULL = 110;

// Чи знаходиться елемент у вікні/модалці або в прокрученому блоці — тоді не заважаємо
function blockedTarget(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (style.position === "fixed") return true; // відкрите вікно (модалка), нижнє меню
    if (node.scrollTop > 0) return true; // прокручений внутрішній блок
    node = node.parentElement;
  }
  return false;
}

// «Потягни вниз, щоб оновити» для телефона (особливо коли CRM встановлена як застосунок)
export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    function onStart(e: TouchEvent) {
      if (refreshing || e.touches.length !== 1) return;
      if (window.scrollY > 0 || blockedTarget(e.target)) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    }
    function onMove(e: TouchEvent) {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const value = Math.min(MAX_PULL, dy * 0.5);
      pullRef.current = value;
      setPull(value);
    }
    function onEnd() {
      if (startY.current == null) return;
      startY.current = null;
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        window.location.reload();
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    }
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refreshing]);

  if (pull <= 0 && !refreshing) return null;

  const ready = pull >= THRESHOLD;
  return (
    <div
      className="fixed left-0 right-0 top-0 z-[60] flex justify-center pointer-events-none"
      style={{ transform: `translateY(${pull - 40}px)` }}
    >
      <div className="bg-white shadow-md rounded-full px-4 py-2 text-sm text-pink-600 font-medium flex items-center gap-2">
        <span
          className={refreshing ? "inline-block animate-spin" : "inline-block transition-transform"}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        >
          ⟳
        </span>
        {refreshing ? "Оновлюю…" : ready ? "Відпусти, щоб оновити" : "Потягни, щоб оновити"}
      </div>
    </div>
  );
}
