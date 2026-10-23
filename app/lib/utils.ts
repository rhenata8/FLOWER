/**
 * Utility functions for IDR formatting, date handling in Asia/Jakarta timezone,
 * and weekly/monthly range calculations.
 */

const TIMEZONE = "Asia/Jakarta";

// ─── Currency Formatting ───────────────────────────────────────────────

export function formatIdr(amount: number): string {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export function parseIdr(str: string): number | null {
  const cleaned = str.replace(/[Rp.,\s]/g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) || num <= 0 ? null : num;
}

// ─── Date Helpers (Asia/Jakarta) ───────────────────────────────────────

export function nowJakarta(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: TIMEZONE })
  );
}

export function toJakartaDate(epochMs: number): Date {
  return new Date(
    new Date(epochMs).toLocaleString("en-US", { timeZone: TIMEZONE })
  );
}

export function formatDateJakarta(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("id-ID", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTimeJakarta(epochMs: number): string {
  return new Date(epochMs).toLocaleString("id-ID", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeJakarta(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("id-ID", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function todayKeyLocal(): string {
  return toJakartaDateKey(Date.now());
}

export function toJakartaDateKey(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(epochMs));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function toJakartaTimeKey(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(epochMs));
  let hour = parts.find((p) => p.type === "hour")?.value;
  if (hour === "24") hour = "00";
  const minute = parts.find((p) => p.type === "minute")?.value;
  return `${hour}:${minute}`;
}

export function dateKeyToEpoch(dateKey: string): number {
  // Parse "2026-10-15" as Asia/Jakarta local midnight
  const [y, m, d] = dateKey.split("-").map(Number);
  // Create date in Jakarta timezone
  const jakartaStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+07:00`;
  return new Date(jakartaStr).getTime();
}

// ─── Weekly Range (Monday 00:00 → next Monday 00:00, Jakarta) ──────────

export function getCurrentWeekRange(): { start: number; end: number; weekKey: string } {
  const now = nowJakarta();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  // Week key: ISO week format
  const weekNum = getISOWeek(monday);
  const weekKey = `${monday.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;

  return {
    start: dateKeyToEpoch(`${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`),
    end: dateKeyToEpoch(`${nextMonday.getFullYear()}-${String(nextMonday.getMonth() + 1).padStart(2, "0")}-${String(nextMonday.getDate()).padStart(2, "0")}`) - 1,
    weekKey,
  };
}

export function getCurrentMonthRange(): { start: number; end: number } {
  const now = nowJakarta();
  const year = now.getFullYear();
  const month = now.getMonth();

  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const nextMonth = month === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 2).padStart(2, "0")}-01`;

  return {
    start: dateKeyToEpoch(firstDay),
    end: dateKeyToEpoch(nextMonth) - 1,
  };
}

export function getTodayRange(): { start: number; end: number } {
  return getDayRange(todayKeyLocal());
}

/** Exactly one Jakarta calendar day (Jakarta has no DST, so a day is always 24h). */
export function getDayRange(dateKey: string): { start: number; end: number } {
  const start = dateKeyToEpoch(dateKey);
  return { start, end: start + 24 * 60 * 60 * 1000 - 1 };
}

/** Calendar math on "YYYY-MM-DD" keys, independent of the browser timezone. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function nextDateKeys(startKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysToDateKey(startKey, i));
}

/** "Jumat, 23 Okt 2026" for a "YYYY-MM-DD" key. */
export function formatDateKeyLong(dateKey: string): string {
  return new Date(dateKeyToEpoch(dateKey)).toLocaleDateString("id-ID", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function weekdayShort(dateKey: string): string {
  return new Date(dateKeyToEpoch(dateKey)).toLocaleDateString("id-ID", {
    timeZone: TIMEZONE,
    weekday: "short",
  });
}

/** Maximum grocery spend for the generated 7-day menu. */
export const WEEKLY_MENU_BUDGET_IDR = 120_000;

function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

export function getWeekDates(weekStart: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + i * 24 * 60 * 60 * 1000);
    const jd = toJakartaDate(d.getTime());
    dates.push(`${jd.getFullYear()}-${String(jd.getMonth() + 1).padStart(2, "0")}-${String(jd.getDate()).padStart(2, "0")}`);
  }
  return dates;
}

// ─── Relative Time ─────────────────────────────────────────────────────

export function relativeTime(epochMs: number): string {
  const now = Date.now();
  const diff = now - epochMs;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  if (days < 7) return `${days} hari lalu`;
  return formatDateJakarta(epochMs);
}
