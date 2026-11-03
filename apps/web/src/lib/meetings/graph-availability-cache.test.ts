import { describe, expect, it } from "vitest";
import { readMeetingGraphAvailabilityCache, writeMeetingGraphAvailabilityCache } from "./graph-availability-cache";

type MemoryStorage = {
  values: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function memoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

const consent = { state: "consent-required", httpStatus: 403, code: "OBO_CONSENT_REQUIRED" } as const;
const available = { state: "available", httpStatus: 200, code: null } as const;

describe("cache de disponibilidade Graph", () => {
  it("isola o resultado por integrante", () => {
    const storage = memoryStorage();
    writeMeetingGraphAvailabilityCache(storage, "member-a", consent, 1_000);

    expect(readMeetingGraphAvailabilityCache(storage, "member-a", 2_000)).toEqual(consent);
    expect(readMeetingGraphAvailabilityCache(storage, "member-b", 2_000)).toBeNull();
  });

  it("expira o resultado ao completar cinco minutos", () => {
    const storage = memoryStorage();
    writeMeetingGraphAvailabilityCache(storage, "member-a", consent, 1_000);

    expect(readMeetingGraphAvailabilityCache(storage, "member-a", 300_999)).toEqual(consent);
    expect(readMeetingGraphAvailabilityCache(storage, "member-a", 301_000)).toBeNull();
  });

  it("descarta dados malformados e timestamps no futuro", () => {
    const storage = memoryStorage();
    storage.values.set("nite-meetings-graph-availability:member-a:v1", "{");
    expect(readMeetingGraphAvailabilityCache(storage, "member-a", 2_000)).toBeNull();

    writeMeetingGraphAvailabilityCache(storage, "member-a", consent, 3_000);
    expect(readMeetingGraphAvailabilityCache(storage, "member-a", 2_000)).toBeNull();
  });

  it("substitui o consentimento armazenado pelo resultado da nova consulta", () => {
    const storage = memoryStorage();
    writeMeetingGraphAvailabilityCache(storage, "member-a", consent, 1_000);
    writeMeetingGraphAvailabilityCache(storage, "member-a", available, 2_000);

    expect(readMeetingGraphAvailabilityCache(storage, "member-a", 2_001)).toEqual(available);
  });
});
