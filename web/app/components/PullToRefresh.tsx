"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function PullToRefresh({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isStandalone, setIsStandalone] = useState(false);

  const THRESHOLD = 60;
  const MAX_PULL = 80;

  useEffect(() => {
    const isCapacitor = !!(window as any).Capacitor;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true ||
      isCapacitor;
    setIsStandalone(standalone);

    if (isCapacitor) {
      document.documentElement.classList.add("capacitor");
    }
  }, []);

  useEffect(() => {
    if (!isStandalone) return;

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onTouchStart = (e: TouchEvent) => {
      if (wrapper.scrollTop === 0) {
        startYRef.current = e.touches[0].clientY;
        pullingRef.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current) return;

      const currentY = e.touches[0].clientY;
      const distance = currentY - startYRef.current;

      if (distance > 0 && wrapper.scrollTop === 0) {
        e.preventDefault();
        setPullDistance(Math.min(distance, MAX_PULL));
      } else {
        pullingRef.current = false;
        setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (pullingRef.current && pullDistance >= THRESHOLD) {
        window.location.reload();
      }
      pullingRef.current = false;
      setPullDistance(0);
    };

    wrapper.addEventListener("touchstart", onTouchStart, { passive: true });
    wrapper.addEventListener("touchmove", onTouchMove, { passive: false });
    wrapper.addEventListener("touchend", onTouchEnd);

    return () => {
      wrapper.removeEventListener("touchstart", onTouchStart);
      wrapper.removeEventListener("touchmove", onTouchMove);
      wrapper.removeEventListener("touchend", onTouchEnd);
    };
  }, [isStandalone, pullDistance]);

  if (!isStandalone) {
    return <>{children}</>;
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        touchAction: "manipulation",
        minHeight: "100vh",
        overflowY: "auto",
      }}
    >
      {/* Pull indicator */}
      <div
        style={{
          height: pullDistance > 0 ? `${pullDistance}px` : "0px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          transition: pullingRef.current ? "none" : "height 0.2s ease",
        }}
      >
        {pullDistance > 0 && (
          <span
            style={{
              fontSize: "12px",
              opacity: Math.min(pullDistance / THRESHOLD, 1),
              color: "#9ca3af",
            }}
          >
            {pullDistance >= THRESHOLD ? "Release to refresh" : "Pull to refresh"}
          </span>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(0)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
