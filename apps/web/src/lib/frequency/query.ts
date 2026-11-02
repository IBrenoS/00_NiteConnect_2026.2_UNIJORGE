export function canManageFrequency(roles: readonly string[]): boolean {
  return roles.includes("COORDENADOR") || roles.includes("GESTOR_GERAL");
}

export type FrequencyGroupBy = "MONTH" | "SEMESTER";
export type FrequencyRange = { from: string; to: string; groupBy: FrequencyGroupBy };
export type FrequencyRangeOption = { value: string; label: string };

export function currentBahiaMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export function currentBahiaSemester(now = new Date()): string {
  const month = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Bahia", month: "numeric" }).format(now));
  const year = new Intl.DateTimeFormat("en", { timeZone: "America/Bahia", year: "numeric" }).format(now);
  return `${year}-S${month <= 6 ? "1" : "2"}`;
}

export function periodFromSelection(selection: string, groupBy: FrequencyGroupBy): FrequencyRange | null {
  if (groupBy === "MONTH") {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(selection);
    if (!match) return null;
    const [, year = "", month = ""] = match;
    const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    return { from: `${year}-${month}-01`, to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`, groupBy };
  }
  const match = /^(\d{4})-S([12])$/.exec(selection);
  if (!match) return null;
  const [, year = "", semester = ""] = match;
  return semester === "1"
    ? { from: `${year}-01-01`, to: `${year}-06-30`, groupBy }
    : { from: `${year}-07-01`, to: `${year}-12-31`, groupBy };
}

export function adjacentRangeKey(currentKey: string, direction: "previous" | "next", options: readonly FrequencyRangeOption[]): string | null {
  const match = /^(MONTH|SEMESTER):/.exec(currentKey);
  if (!match) return null;
  const groupBy: FrequencyGroupBy = match[1] === "SEMESTER" ? "SEMESTER" : "MONTH";
  const group = options.filter((option) => option.value.startsWith(`${groupBy}:`));
  const index = group.findIndex((option) => option.value === currentKey);
  if (index < 0) return null;
  const targetIndex = direction === "previous" ? index + 1 : index - 1;
  return group[targetIndex]?.value ?? null;
}

export function rangeKeyForGroup(currentKey: string, targetGroup: FrequencyGroupBy, options: readonly FrequencyRangeOption[], now = new Date()): string | null {
  if (currentKey.startsWith(`${targetGroup}:`)) return options.some((option) => option.value === currentKey) ? currentKey : null;
  let selection: string | null = null;
  if (targetGroup === "SEMESTER") {
    const match = /^MONTH:(\d{4})-(0[1-9]|1[0-2])$/.exec(currentKey);
    if (match) {
      const [, year = "", month = ""] = match;
      selection = `${year}-S${Number(month) <= 6 ? "1" : "2"}`;
    }
  } else {
    const match = /^SEMESTER:(\d{4})-S([12])$/.exec(currentKey);
    if (match) {
      const [, year = "", semester = ""] = match;
      const currentMonth = currentBahiaMonth(now);
      const currentMonthMatch = /^(\d{4})-(\d{2})$/.exec(currentMonth);
      const currentYear = currentMonthMatch?.[1];
      const currentMonthNumber = Number(currentMonthMatch?.[2]);
      const currentInSelectedSemester = currentYear === year && (Number(semester) === 1 ? currentMonthNumber <= 6 : currentMonthNumber >= 7);
      selection = currentInSelectedSemester ? currentMonth : `${year}-${semester === "1" ? "01" : "07"}`;
    }
  }
  const target = selection ? `${targetGroup}:${selection}` : "";
  return options.some((option) => option.value === target) ? target : null;
}

export function formatFrequencyDate(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: "America/Bahia" }).format(date);
}
