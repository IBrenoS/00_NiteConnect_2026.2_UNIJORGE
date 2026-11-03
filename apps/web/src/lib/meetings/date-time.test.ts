import { describe, expect, it } from "vitest";
import { formatMeetingDateTime, localDateTimeInputValues, toBahiaOffsetDateTime } from "./date-time";

describe("datas e horários de Reuniões", () => {
  it("converte horário institucional para OffsetDateTime sem depender do fuso do navegador", () => {
    const value = toBahiaOffsetDateTime("2026-11-05", "10:00");

    expect(value).toBe("2026-11-05T10:00:00-03:00");
    expect(new Date(value ?? "").toISOString()).toBe("2026-11-05T13:00:00.000Z");
  });

  it("rejeita data civil impossível e horário fora do intervalo", () => {
    expect(toBahiaOffsetDateTime("2026-02-30", "10:00")).toBeNull();
    expect(toBahiaOffsetDateTime("2026-11-05", "24:00")).toBeNull();
  });

  it("apresenta instantes no fuso institucional", () => {
    expect(formatMeetingDateTime("2026-11-05T13:00:00Z")).toBe("5 de nov. de 2026, 10:00");
    expect(localDateTimeInputValues("2026-11-05T13:00:00Z")).toEqual({ date: "2026-11-05", time: "10:00" });
  });
});
