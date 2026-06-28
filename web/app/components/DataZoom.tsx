"use client";

import { useRef, useState, useCallback, ReactNode } from "react";

/**
 * Data-space pinch/pan for scatter charts. Unlike a CSS transform, this
 * narrows the axis domains so the chart re-fits with the same-sized
 * markers and labels — exactly what you want for picking apart a tight
 * cluster of points.
 *
 * Usage:
 *   <DataZoom xFull={[0, 100]} yFull={[0, 100]}>
 *     {(xDomain, yDomain, scale) => (
 *       <ResponsiveContainer ...>
 *         <ScatterChart>
 *           <XAxis domain={xDomain} allowDataOverflow type="number" ... />
 *           <YAxis domain={yDomain} allowDataOverflow type="number" ... />
 *           ...
 *         </ScatterChart>
 *       </ResponsiveContainer>
 *     )}
 *   </DataZoom>
 *
 * Gestures:
 *   • Two-finger pinch → narrow/widen both domains (1×–5×).
 *   • One-finger drag (only when zoomed) → pan the visible region.
 *   • Double-tap → reset.
 *   • Ctrl+wheel → zoom on desktop.
 */
export default function DataZoom({
  xFull,
  yFull,
  maxScale = 5,
  children,
}: {
  xFull: [number, number];
  yFull: [number, number];
  maxScale?: number;
  children: (
    xDomain: [number, number],
    yDomain: [number, number],
    scale: number,
  ) => ReactNode;
}) {
  // pan is in units of "fraction of full range." panX = 0.1 means the
  // visible center is shifted 10% of the full x range to the right.
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    w: number;
    h: number;
  } | null>(null);
  const lastTapRef = useRef<number>(0);

  // Compute visible domains from scale + pan, clamped so the view can't
  // leave the full data range.
  const xWidthFull = xFull[1] - xFull[0];
  const yWidthFull = yFull[1] - yFull[0];
  const xVisible = xWidthFull / scale;
  const yVisible = yWidthFull / scale;
  // Max pan magnitude (in fractions of full range) before the view's edge
  // crosses the full range's edge.
  const maxPanX = (xWidthFull - xVisible) / 2 / xWidthFull;
  const maxPanY = (yWidthFull - yVisible) / 2 / yWidthFull;
  const px = Math.max(-maxPanX, Math.min(maxPanX, pan.x));
  const py = Math.max(-maxPanY, Math.min(maxPanY, pan.y));
  const xCenter = (xFull[0] + xFull[1]) / 2 + px * xWidthFull;
  const yCenter = (yFull[0] + yFull[1]) / 2 + py * yWidthFull;
  const xDomain: [number, number] = [xCenter - xVisible / 2, xCenter + xVisible / 2];
  const yDomain: [number, number] = [yCenter - yVisible / 2, yCenter + yVisible / 2];

  const distance = (touches: React.TouchList): number => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const reset = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { startDist: distance(e.touches), startScale: scale };
        panRef.current = null;
      } else if (e.touches.length === 1 && scale > 1 && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        panRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          startPanX: pan.x,
          startPanY: pan.y,
          w: rect.width,
          h: rect.height,
        };
      }
    },
    [scale, pan.x, pan.y],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (pinchRef.current && e.touches.length === 2) {
        e.preventDefault();
        const newDist = distance(e.touches);
        const next = Math.max(
          1,
          Math.min(
            maxScale,
            pinchRef.current.startScale * (newDist / pinchRef.current.startDist),
          ),
        );
        setScale(next);
        if (next === 1) setPan({ x: 0, y: 0 });
      } else if (panRef.current && e.touches.length === 1 && scale > 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - panRef.current.startX;
        const dy = e.touches[0].clientY - panRef.current.startY;
        // Drag right → reveal what's to the left → panX decreases.
        // Drag down → reveal what's above (higher y) → panY increases.
        const dPanX = -dx / (panRef.current.w * scale);
        const dPanY = dy / (panRef.current.h * scale);
        setPan({
          x: panRef.current.startPanX + dPanX,
          y: panRef.current.startPanY + dPanY,
        });
      }
    },
    [scale, maxScale],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      pinchRef.current = null;
      if (e.touches.length === 0) panRef.current = null;

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

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.01;
      setScale((s) => {
        const next = Math.max(1, Math.min(maxScale, s + delta));
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    },
    [maxScale],
  );

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      style={{
        touchAction: scale > 1 ? "none" : "pan-y",
        position: "relative",
      }}
    >
      {children(xDomain, yDomain, scale)}
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
