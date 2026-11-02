import { describe, expect, it } from "vitest";
import { adjacentRangeKey, canManageFrequency, currentBahiaMonth, periodFromSelection, rangeKeyForGroup } from "./query";

describe("filtros e acesso à Frequência", () => {
  it("restringe a gestão coletiva aos dois papéis autorizados", () => {
    expect(canManageFrequency(["INTEGRANTE"])).toBe(false);
    expect(canManageFrequency(["GESTOR_PROJETO"])).toBe(false);
    expect(canManageFrequency(["COORDENADOR"])).toBe(true);
    expect(canManageFrequency(["GESTOR_GERAL"])).toBe(true);
  });

  it("monta períodos mensais e semestrais civis sem deslocamento de fuso", () => {
    expect(periodFromSelection("2026-02", "MONTH")).toEqual({ from: "2026-02-01", to: "2026-02-28", groupBy: "MONTH" });
    expect(periodFromSelection("2026-S2", "SEMESTER")).toEqual({ from: "2026-07-01", to: "2026-12-31", groupBy: "SEMESTER" });
    expect(currentBahiaMonth(new Date("2026-11-01T01:30:00Z"))).toBe("2026-10");
  });

  it("rejeita seleções de período malformadas", () => {
    expect(periodFromSelection("2026-13", "MONTH")).toBeNull();
    expect(periodFromSelection("2026-S3", "SEMESTER")).toBeNull();
    expect(periodFromSelection("2026-01", "SEMESTER")).toBeNull();
  });

  it("navega períodos disponíveis e limita anterior/próximo às opções existentes", () => {
    const ranges = ["MONTH:2026-11", "MONTH:2026-10", "MONTH:2026-09", "SEMESTER:2026-S2", "SEMESTER:2026-S1"]
      .map((value) => ({ value, label: value }));
    expect(adjacentRangeKey("MONTH:2026-11", "previous", ranges)).toBe("MONTH:2026-10");
    expect(adjacentRangeKey("MONTH:2026-10", "next", ranges)).toBe("MONTH:2026-11");
    expect(adjacentRangeKey("MONTH:2026-11", "next", ranges)).toBeNull();
    expect(adjacentRangeKey("MONTH:2025-01", "previous", ranges)).toBeNull();
  });

  it("alterna agrupamento preservando o período selecionado quando aplicável", () => {
    const ranges = ["MONTH:2026-11", "MONTH:2026-10", "SEMESTER:2026-S2", "SEMESTER:2026-S1"]
      .map((value) => ({ value, label: value }));
    expect(rangeKeyForGroup("MONTH:2026-11", "SEMESTER", ranges)).toBe("SEMESTER:2026-S2");
    expect(rangeKeyForGroup("SEMESTER:2026-S2", "MONTH", ranges, new Date("2026-11-02T12:00:00Z"))).toBe("MONTH:2026-11");
    expect(rangeKeyForGroup("SEMESTER:2026-S1", "MONTH", ranges, new Date("2026-11-02T12:00:00Z"))).toBeNull();
  });
});
