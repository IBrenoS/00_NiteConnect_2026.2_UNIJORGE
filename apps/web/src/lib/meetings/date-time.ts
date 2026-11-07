const institutionalTimeZone = "America/Bahia";

type DateTimeParts = { year: string; month: string; day: string; hour: string; minute: string; second: string };

function partsAtBahia(instant: Date): DateTimeParts | null {
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: institutionalTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const find = (type: keyof DateTimeParts) => parts.find((part) => part.type === type)?.value;
  const values = { year: find("year"), month: find("month"), day: find("day"), hour: find("hour"), minute: find("minute"), second: find("second") };
  return Object.values(values).every((value): value is string => value !== undefined) ? values as DateTimeParts : null;
}

export function formatMeetingDate(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: institutionalTimeZone }).format(date);
}

export function formatMeetingTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Horário indisponível" : new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: institutionalTimeZone }).format(date);
}

export function formatMeetingTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Horário indisponível";

  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: institutionalTimeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  if (dayFormatter.format(start) === dayFormatter.format(end)) return `${formatMeetingTime(startsAt)}–${formatMeetingTime(endsAt)}`;

  const startYear = new Intl.DateTimeFormat("en-US", { timeZone: institutionalTimeZone, year: "numeric" }).format(start);
  const endYear = new Intl.DateTimeFormat("en-US", { timeZone: institutionalTimeZone, year: "numeric" }).format(end);
  const endDate = formatMeetingDate(endsAt, { day: "numeric", month: "short", ...(startYear === endYear ? {} : { year: "numeric" }) });
  return `${formatMeetingTime(startsAt)}–${formatMeetingTime(endsAt)} · termina em ${endDate}`;
}

export function formatMeetingDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data e horário indisponíveis" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: institutionalTimeZone }).format(date);
}

export function localDateTimeInputValues(value?: string | null): { date: string; time: string } {
  const parts = value ? partsAtBahia(new Date(value)) : partsAtBahia(new Date());
  return parts ? { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` } : { date: "", time: "" };
}

export function toBahiaOffsetDateTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(localAsUtc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  let instant = localAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const localParts = partsAtBahia(new Date(instant));
    if (!localParts) return null;
    const representedLocal = Date.UTC(Number(localParts.year), Number(localParts.month) - 1, Number(localParts.day), Number(localParts.hour), Number(localParts.minute), Number(localParts.second));
    const offset = representedLocal - instant;
    const nextInstant = localAsUtc - offset;
    if (nextInstant === instant) break;
    instant = nextInstant;
  }
  const localParts = partsAtBahia(new Date(instant));
  if (!localParts || Number(localParts.year) !== year || Number(localParts.month) !== month || Number(localParts.day) !== day || Number(localParts.hour) !== hour || Number(localParts.minute) !== minute) return null;
  const representedLocal = Date.UTC(Number(localParts.year), Number(localParts.month) - 1, Number(localParts.day), Number(localParts.hour), Number(localParts.minute), Number(localParts.second));
  const offsetMinutes = Math.round((representedLocal - instant) / 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, "0")}:${String(absoluteOffset % 60).padStart(2, "0")}`;
  return `${date}T${time}:00${offset}`;
}

export function formatMeetingDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "Indisponível";
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
