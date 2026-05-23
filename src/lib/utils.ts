/**
 * Returns today's date string in YYYY-MM-DD format using local timezone.
 * Do NOT use new Date().toISOString().split("T")[0] — it returns UTC date,
 * which will be wrong in UTC+8 during 00:00-07:59 local time.
 */
export function getLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Returns a date string offset by `days` from today (local timezone).
 * Positive days = future, negative days = past.
 */
export function getLocalDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}