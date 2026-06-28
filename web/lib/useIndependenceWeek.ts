"use client";

import { useEffect, useState } from "react";

/**
 * True for the Independence Day window: June 30 through July 7 (getMonth() is
 * 0-indexed, so 5 = June, 6 = July).
 */
export function isIndependenceWeek(d: Date): boolean {
  const m = d.getMonth();
  const day = d.getDate();
  return (m === 5 && day === 30) || (m === 6 && day >= 1 && day <= 7);
}

/**
 * Banner wording. 2026 is the 250th anniversary (Semiquincentennial), so it
 * gets the special "Happy 250 America"; every other year uses the evergreen
 * greeting.
 */
export function independenceBannerText(d: Date): string {
  return d.getFullYear() === 2026 ? "Happy 250 America" : "Happy Birthday America";
}

/**
 * Client hook for the Independence Week window. Returns false on the server
 * and first client render, then resolves after mount — so callers can swap
 * decorative content (logo, banner) without risking a hydration mismatch.
 */
export function useIndependenceWeek(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    setActive(isIndependenceWeek(new Date()));
  }, []);
  return active;
}
