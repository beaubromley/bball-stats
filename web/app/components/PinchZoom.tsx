"use client";

import { useRef, useState, useCallback, ReactNode } from "react";

/**
 * Mobile pinch-to-zoom + drag-to-pan wrapper. Applies a CSS transform
 * to the inner content. Built for the scatter charts on /stats which
 * are too cramped on phones — the SVG inside scales cleanly because
 * recharts measures parent width at mount, not on each frame.
 *
 * Interactions:
 *   • Two-finger pinch: scale 1×–5×.
 *   • One-finger drag while scale > 1: pan the zoomed view.
 *   • Double-tap: reset to 1× and centered.
 *   • Desktop scroll wheel + ctrl: also zooms (browser-native gesture).
 *
 * Doesn't intercept gestures while at 1× and one finger is down, so
 * normal page scroll keeps working.
 */
export default function PinchZoom({
  children,
  maxScale = 5,
}: {
  children: ReactNode;
  maxScale?: number;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Refs hold gesture state — using refs avoids re-rendering on every move.
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const distance = (touches: React.TouchList): number => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { startDist: distance(e.touches), startScale: scale };
        panRef.current = null;
      } else if (e.touches.length === 1 && scale > 1) {
        panRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          startOffsetX: offset.x,
          startOffsetY: offset.y,
        };
      }
    },
    [scale, offset.x, offset.y],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (pinchRef.current && e.touches.length === 2) {
        e.preventDefault();
        const newDist = distance(e.touches);
        const next = Math.max(
          1,
          Math.min(maxScale, pinchRef.current.startScale * (newDist / pinchRef.current.startDist)),
        );
        setScale(next);
        // Snap back to centered when leaving zoom.
        if (next === 1) setOffset({ x: 0, y: 0 });
      } else if (panRef.current && e.touches.length === 1 && scale > 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - panRef.current.startX;
        const dy = e.touches[0].clientY - panRef.current.startY;
        setOffset({
          x: panRef.current.startOffsetX + dx,
          y: panRef.current.startOffsetY + dy,
        });
      }
    },
    [scale, maxScale],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      pinchRef.current = null;
      if (e.touches.length === 0) panRef.current = null;

      // Double-tap-to-reset detection (only when not in a pinch).
      if (e.changedTouches.length === 1 && e.touches.length === 0) {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          reset();
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }
    },
    [reset],
  );

  // Desktop: ctrl+wheel zooms.
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.01;
      setScale((s) => {
        const next = Math.max(1, Math.min(maxScale, s + delta));
        if (next === 1) setOffset({ x: 0, y: 0 });
        return next;
      });
    },
    [maxScale],
  );

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      style={{
        // touch-action: none disables native scroll inside this element
        // ONLY when a touch is on the chart — outside the chart, page
        // scroll still works normally. Combined with two-finger detection
        // above we only intercept genuine pinch gestures.
        touchAction: scale > 1 ? "none" : "pan-y",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: pinchRef.current || panRef.current ? "none" : "transform 0.15s ease-out",
        }}
      >
        {children}
      </div>
      {scale > 1 && (
        <button
          type="button"
          onClick={reset}
          className="absolute top-2 right-2 z-10 px-2 py-1 text-[10px] font-display uppercase tracking-wider rounded bg-gray-800/80 text-white"
        >
          Reset · {scale.toFixed(1)}×
        </button>
      )}
    </div>
  );
}
