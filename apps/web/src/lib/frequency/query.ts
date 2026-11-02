export function canManageFrequency(roles: readonly string[]): boolean {
  return roles.includes("COORDENADOR") || roles.includes("GESTOR_GERAL");
}

export type FrequencyGroupBy = "MONTH" | "SEMESTER";
export type FrequencyRange = { from: string; to: string; groupBy: FrequencyGroupBy };

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

export function formatFrequencyDate(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: "America/Bahia" }).format(date);
}
