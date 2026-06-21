"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "./icons";

/**
 * Horizontal carousel with a smooth glide (no hard scroll-snap). Touch users
 * flick with native momentum; mouse users click-drag. After either gesture it
 * eases to the nearest item — the same smooth motion as the arrow buttons.
 *
 * `loop`: the caller renders THREE identical copies of the items; the carousel
 * keeps the scroll within the middle copy and jumps by one copy-width at the
 * edges (instant + invisible, since the copies are identical) — giving an
 * endless left/right loop.
 */
export default function Carousel({
  children,
  className = "",
  trackClassName = "",
  controlsClassName = "",
  loop = false,
}: {
  children: React.ReactNode;
  className?: string;
  trackClassName?: string;
  controlsClassName?: string;
  loop?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Each child's scroll position (the scrollLeft that puts its left edge flush
  // with the track's left edge), measured live so it is correct regardless of
  // positioning or flex `order`. Sorted left-to-right.
  const positions = (el: HTMLDivElement) => {
    const elLeft = el.getBoundingClientRect().left;
    return Array.from(el.children)
      .map((c) => el.scrollLeft + (c as HTMLElement).getBoundingClientRect().left - elLeft)
      .sort((a, b) => a - b);
  };

  const nearestIndex = (pos: number[], scrollLeft: number) => {
    let idx = 0;
    let min = Infinity;
    for (let i = 0; i < pos.length; i++) {
      const d = Math.abs(pos[i] - scrollLeft);
      if (d < min) {
        min = d;
        idx = i;
      }
    }
    return idx;
  };

  // Keep scrollLeft inside the middle copy (loop mode). Instant + seamless.
  const keepInBand = (el: HTMLDivElement) => {
    const cl = Math.floor(el.children.length / 3);
    if (cl < 1) return;
    const pos = positions(el);
    const start = pos[cl];
    const span = pos[cl] - pos[0];
    if (span <= 0) return;
    if (el.scrollLeft >= start + span) el.scrollLeft -= span;
    else if (el.scrollLeft < start) el.scrollLeft += span;
  };

  const settle = () => {
    const el = ref.current;
    if (!el || el.children.length === 0) return;
    const pos = positions(el);
    const idx = nearestIndex(pos, el.scrollLeft);
    let target = pos[idx];
    let behavior: ScrollBehavior = "smooth";
    if (loop) {
      const cl = Math.floor(el.children.length / 3);
      const start = pos[cl];
      const span = pos[cl] - pos[0];
      if (span > 0) {
        if (target >= start + span) {
          target -= span;
          behavior = "auto";
        } else if (target < start) {
          target += span;
          behavior = "auto";
        }
      }
    }
    if (Math.abs(target - el.scrollLeft) < 2) return;
    el.scrollTo({ left: target, behavior });
  };

  const nudge = (dir: number) => {
    const el = ref.current;
    if (!el || el.children.length === 0) return;
    if (loop) keepInBand(el);
    const pos = positions(el);
    const idx = nearestIndex(pos, el.scrollLeft);
    let next = idx + dir;
    if (!loop) next = Math.max(0, Math.min(pos.length - 1, next));
    if (next < 0 || next >= pos.length) return;
    el.scrollTo({ left: pos[next], behavior: "smooth" });
  };

  const onScroll = () => {
    if (drag.current.active) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settle, 120);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return; // touch/pen scroll natively
    const el = ref.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
    el.style.cursor = "grabbing";
    try { el.setPointerCapture(e.pointerId); } catch {}
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startLeft - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const el = ref.current;
    if (!el) return;
    drag.current.active = false;
    el.style.cursor = "";
    try { el.releasePointerCapture(e.pointerId); } catch {}
    settle();
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  // Center on the middle copy (loop), and re-align after a resize — card widths
  // rescale and the grid/carousel layout flips at the breakpoint on resize,
  // which would otherwise strand the scroll position between cards.
  useEffect(() => {
    const center = () => {
      const el = ref.current;
      if (!el || !loop || el.children.length === 0) return;
      const cl = Math.floor(el.children.length / 3);
      if (cl < 1) return;
      const elLeft = el.getBoundingClientRect().left;
      const pos = Array.from(el.children)
        .map((c) => el.scrollLeft + (c as HTMLElement).getBoundingClientRect().left - elLeft)
        .sort((a, b) => a - b);
      el.scrollLeft = pos[cl];
    };
    const realign = () => {
      const el = ref.current;
      if (!el || el.children.length === 0) return;
      if (loop) {
        center();
        return;
      }
      const elLeft = el.getBoundingClientRect().left;
      let target = el.scrollLeft;
      let min = Infinity;
      for (let i = 0; i < el.children.length; i++) {
        const delta = (el.children[i] as HTMLElement).getBoundingClientRect().left - elLeft;
        if (Math.abs(delta) < min) {
          min = Math.abs(delta);
          target = el.scrollLeft + delta;
        }
      }
      if (min >= 2) el.scrollTo({ left: target });
    };

    center();
    const fontSettle = setTimeout(center, 250); // re-center after webfont swap

    let t: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(realign, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(fontSettle);
      if (t) clearTimeout(t);
    };
  }, [loop]);

  return (
    <div className={className}>
      <div className={`mb-3 flex justify-end gap-2 ${controlsClassName}`}>
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Previous"
          className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-navy transition hover:border-navy hover:bg-slate-50"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Next"
          className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-navy transition hover:border-navy hover:bg-slate-50"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div
        ref={ref}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        className={`no-scrollbar flex cursor-grab select-none overflow-x-auto ${trackClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
