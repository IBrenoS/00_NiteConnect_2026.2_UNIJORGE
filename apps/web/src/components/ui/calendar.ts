/** Date-only arithmetic in UTC, independent of the browser timezone and DST. */
export function dateKey(date: Date): string { return date.toISOString().slice(0, 10); }
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function shiftMonth(month: string, step: number): string {
  const date = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + step);
  return dateKey(date);
}
export function calendarDays(month: string): string[] {
  const first = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const count = Math.ceil((first.getUTCDay() + last.getUTCDate()) / 7) * 7;
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    return dateKey(day);
  });
}
