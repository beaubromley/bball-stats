"use client";

import { useEffect, useState } from "react";
import { isIndependenceWeek } from "./useIndependenceWeek";

/**
 * Active holiday-themed logo for a given date, or null on regular days.
 *
 * Independence Day reuses the existing Jun 30 – Jul 7 window so the
 * July4Theme banner and the logo swap stay synced. Every other holiday
 * runs ±4 days around the date itself.
 */
export function holidayLogoFor(d: Date): string | null {
  if (isIndependenceWeek(d)) return "/logo-july4.jpeg";

  const m = d.getMonth(); // 0-indexed
  const day = d.getDate();

  // Valentine's: Feb 10–18 (Feb 14 ±4)
  if (m === 1 && day >= 10 && day <= 18) return "/logo-valentines.jpeg";

  // Halloween: Oct 27 – Nov 4 (Oct 31 ±4)
  if ((m === 9 && day >= 27) || (m === 10 && day <= 4)) {
    return "/logo-halloween.jpeg";
  }

  // Thanksgiving: 4th Thursday of November, ±4 days.
  const thanksgiving = nthWeekdayOfMonth(d.getFullYear(), 10 /* Nov */, 4 /* Thursday */, 4 /* 4th */);
  if (sameDayWindow(d, thanksgiving, 4)) return "/logo-thanksgiving.jpeg";

  // Christmas: Dec 21–29 (Dec 25 ±4)
  if (m === 11 && day >= 21 && day <= 29) return "/logo-christmas.jpeg";

  return null;
}

/** Date object for the Nth occurrence of a given weekday in a month
 *  (e.g. 4th Thursday of November). */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

function sameDayWindow(a: Date, b: Date, days: number): boolean {
  const ms = Math.abs(
    new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() -
      new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime(),
  );
  return ms <= days * 24 * 60 * 60 * 1000;
}

/** Client hook — gated on mount so server/client date mismatch can't
 *  cause hydration warnings (mirrors useIndependenceWeek). */
export function useHolidayLogo(): string | null {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    setPath(holidayLogoFor(new Date()));
  }, []);
  return path;
}
