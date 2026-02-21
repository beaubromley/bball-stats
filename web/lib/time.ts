/**
 * Format a UTC datetime string from the database in Central Time.
 * SQLite stores CURRENT_TIMESTAMP as UTC — this converts for display.
 */
export function formatCT(
  utcStr: string,
  options?: Intl.DateTimeFormatOptions
): string {
  // Append Z to force UTC interpretation (SQLite datetimes have no timezone suffix)
  const normalized = utcStr.includes("T") ? utcStr : utcStr.replace(" ", "T");
  const date = new Date(normalized + "Z");
  return date.toLocaleString("en-US", { timeZone: "America/Chicago", ...options });
}

/** Format as date only: "Feb 16, 2026" */
export function formatDateCT(utcStr: string): string {
  return formatCT(utcStr, { month: "short", day: "numeric", year: "numeric" });
}

/** Format as short date: "2/16/2026" */
export function formatShortDateCT(utcStr: string): string {
  return formatCT(utcStr, { month: "numeric", day: "numeric", year: "numeric" });
}

/** Format as time only: "06:10 AM" */
export function formatTimeCT(utcStr: string): string {
  return formatCT(utcStr, { hour: "2-digit", minute: "2-digit" });
}

/** Format as time with seconds: "06:10:37 AM" */
export function formatTimeSecCT(utcStr: string): string {
  return formatCT(utcStr, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Format as full datetime: "Feb 16, 2026, 6:10 AM" */
export function formatFullCT(utcStr: string): string {
  return formatCT(utcStr, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
