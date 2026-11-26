import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getApiJson: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../api/server", () => ({ getApiJson: mocks.getApiJson }));
import { getMember, getMembers, parseDetail, parseSummary } from "./administrative";

const summary = { id: "member-id", name: "Ana Souza", institutionalEmail: "ana@unijorge.com.br",
  status: "ATIVO", roles: ["INTEGRANTE", "GESTOR_PROJETO"], hasPhoto: true, lastAccessAt: null };

describe("contrato do diretório administrativo", () => {
  it("valida os campos do cadastro e rejeita nascimento na lista", () => {
    expect(parseSummary(summary)).toEqual(summary);
    expect(parseSummary({ ...summary, roles: ["INTEGRANTE", 1] })).toBeNull();
    expect(parseDetail({ ...summary, course: null, practiceArea: "Pesquisa", birthDate: "2001-02-03", version: 2 })?.birthDate).toBe("2001-02-03");
    expect(parseDetail({ ...summary, course: null, practiceArea: null, birthDate: 123, version: 2 })).toBeNull();
  });
  it("envia busca, filtro, paginação e ficha apenas aos endpoints administrativos", async () => {
    mocks.getApiJson.mockImplementation(async (_path: string, _bearer: string, parse: (value: unknown) => unknown) => ({ data: parse({ items: [summary], page: 1, size: 20, total: 21 }), issue: null }));
    await getMembers("bearer", "Ana & Cia", "ATIVO", 1);
    expect(mocks.getApiJson.mock.calls[0]?.[0]).toBe("/api/v1/administrative/members?q=Ana+%26+Cia&status=ATIVO&page=1&size=20");
    await getMember("bearer", "member-id");
    expect(mocks.getApiJson.mock.calls[1]?.[0]).toBe("/api/v1/administrative/members/member-id");
    expect(mocks.getApiJson).toHaveBeenCalledTimes(2);
  });
});
