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

export function isRegularFrequencyMeeting(kind: string, modality: string, startsAt: string | Date): boolean {
  const instant = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(instant.getTime()) || kind !== "ENCONTRO" || modality !== "PRESENCIAL") return false;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Bahia", weekday: "short" }).format(instant) === "Thu";
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

export function stepFrequencySelection(selection: string, groupBy: FrequencyGroupBy, step: -1 | 1): string | null {
  if (groupBy === "MONTH") {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(selection);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const date = new Date(Date.UTC(year, month - 1 + step, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const match = /^(\d{4})-S([12])$/.exec(selection);
  if (!match) return null;
  const absoluteSemester = Number(match[1]) * 2 + (match[2] === "2" ? 1 : 0) + step;
  const year = Math.floor(absoluteSemester / 2);
  const semester = absoluteSemester % 2 === 0 ? 1 : 2;
  return `${year}-S${semester}`;
}

export function switchFrequencyGroup(selection: string, from: FrequencyGroupBy, to: FrequencyGroupBy): string | null {
  if (from === to) return periodFromSelection(selection, from) ? selection : null;
  if (from === "MONTH") {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(selection);
    if (!match) return null;
    return `${match[1]}-S${Number(match[2]) <= 6 ? "1" : "2"}`;
  }
  const match = /^(\d{4})-S([12])$/.exec(selection);
  if (!match) return null;
  const [year, semester] = [Number(match[1]), Number(match[2])];
  const now = currentBahiaMonth();
  const [currentYear, currentMonth] = now.split("-").map(Number);
  const firstMonth = semester === 1 ? 1 : 7;
  const lastMonth = semester === 1 ? 6 : 12;
  const month = currentYear === year && currentMonth >= firstMonth && currentMonth <= lastMonth
    ? currentMonth
    : firstMonth;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function frequencySelectionLabel(selection: string, groupBy: FrequencyGroupBy): string {
  if (!periodFromSelection(selection, groupBy)) return selection;
  if (groupBy === "SEMESTER") {
    const [, year = "", semester = ""] = /^(\d{4})-S([12])$/.exec(selection) ?? [];
    return `${semester}º semestre de ${year}`;
  }
  const [year = "", month = ""] = selection.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

export function formatFrequencyDate(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: "America/Bahia" }).format(date);
}
