import { describe, expect, it } from "vitest";
import { parseLeadershipProjects } from "./contracts";

describe("contratos dos projetos sob liderança", () => {
  it("aceita somente o contrato de lideranças vigentes", () => {
    expect(parseLeadershipProjects({ items: [
      { projectId: "current", title: "Projeto atual" },
    ] })).toEqual([{ projectId: "current", title: "Projeto atual" }]);
  });

  it("rejeita um contrato inconsistente", () => {
    expect(parseLeadershipProjects({ items: [{ projectId: "current", title: 1 }] })).toBeNull();
  });
});
