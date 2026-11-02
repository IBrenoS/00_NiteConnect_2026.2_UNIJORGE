import { describe, expect, it } from "vitest";
import { canManageFrequency, currentBahiaMonth, periodFromSelection } from "./query";

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
});
