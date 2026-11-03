import type { MeetingGraphAvailability, MeetingGraphAvailabilityResult } from "./contracts";

export const MEETING_GRAPH_AVAILABILITY_CACHE_TTL_MS = 5 * 60_000;

type CacheStorage = Pick<Storage, "getItem" | "setItem">;
type CacheEntry = MeetingGraphAvailabilityResult & { checkedAt: number };

function isAvailabilityState(value: unknown): value is Exclude<MeetingGraphAvailability, "checking"> {
  return value === "available"
    || value === "consent-required"
    || value === "admin-approval-required"
    || value === "not-configured"
    || value === "teams-unavailable"
    || value === "session-required"
    || value === "unavailable";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAvailabilityResult(value: unknown): value is MeetingGraphAvailabilityResult {
  if (!isRecord(value)
    || !isAvailabilityState(value.state)
    || !(value.httpStatus === null || (typeof value.httpStatus === "number" && Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599))
    || !(value.code === null || (typeof value.code === "string" && /^[A-Z0-9_]{1,80}$/.test(value.code)))) return false;

  if (value.state === "consent-required") return value.httpStatus === 403 && value.code === "OBO_CONSENT_REQUIRED";
  if (value.state === "admin-approval-required") return value.httpStatus === 403 && value.code === "OBO_ADMIN_APPROVAL_REQUIRED";
  return true;
}

function cacheKey(viewerId: string): string {
  return `nite-meetings-graph-availability:${viewerId}:v1`;
}

export function readMeetingGraphAvailabilityCache(
  storage: CacheStorage,
  viewerId: string,
  now: number = Date.now(),
): MeetingGraphAvailabilityResult | null {
  if (!viewerId || !Number.isFinite(now)) return null;
  try {
    const serialized = storage.getItem(cacheKey(viewerId));
    if (!serialized) return null;
    const entry: unknown = JSON.parse(serialized);
    if (!isRecord(entry)) return null;
    const checkedAt = entry.checkedAt;
    if (!isAvailabilityResult(entry) || typeof checkedAt !== "number" || !Number.isFinite(checkedAt)) return null;
    const age = now - checkedAt;
    if (age < 0 || age >= MEETING_GRAPH_AVAILABILITY_CACHE_TTL_MS) return null;
    return { state: entry.state, httpStatus: entry.httpStatus, code: entry.code };
  } catch {
    return null;
  }
}

export function writeMeetingGraphAvailabilityCache(
  storage: CacheStorage,
  viewerId: string,
  result: MeetingGraphAvailabilityResult,
  now: number = Date.now(),
): void {
  if (!viewerId || !Number.isFinite(now) || !isAvailabilityResult(result)) return;
  try {
    const entry: CacheEntry = { ...result, checkedAt: now };
    storage.setItem(cacheKey(viewerId), JSON.stringify(entry));
  } catch {
    // Graph availability remains usable for the current render if storage is unavailable.
  }
}
