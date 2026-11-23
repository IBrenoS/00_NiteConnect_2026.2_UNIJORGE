import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), fetch: vi.fn(), revalidate: vi.fn() }));
vi.mock("../auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.session }));
vi.mock("../api/server", () => ({ resolveApiUrl: (path: string) => new URL(path, "https://api.example.test") }));
vi.mock("./data", () => ({ initialRoles: ["INTEGRANTE", "GESTOR_PROJETO", "GESTOR_GERAL", "COORDENADOR"] }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { changeInstitutionalRole, createInvitation, resendInvitation, revokeInvitation } from "./actions";

const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ bearer: "private-bearer", roles: ["COORDENADOR"] });
  mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", mocks.fetch);
});
describe("mutações administrativas", () => {
  it("cria convite com quatro papéis sem identificador Entra, projeto ou validade enviada pelo cliente", async () => {
    for (const role of ["INTEGRANTE", "GESTOR_PROJETO", "GESTOR_GERAL", "COORDENADOR"] as const) {
      const result = await createInvitation({ name: "Ana", email: "Ana@unijorge.com.br", role });
      expect(result.ok).toBe(true);
      const request = mocks.fetch.mock.lastCall;
      expect(request?.[0].toString()).toBe("https://api.example.test/api/v1/invitations");
      const body = JSON.parse(request?.[1].body as string);
      expect(body).toEqual({ name: "Ana", institutionalEmail: "ana@unijorge.com.br", initialRole: role });
      expect(body).not.toHaveProperty("objectId");
      expect(body).not.toHaveProperty("projectId");
    }
  });
  it("reenvia, revoga, concede e revoga papel com versão e motivo opcional", async () => {
    expect((await resendInvitation(id)).ok).toBe(true);
    expect(mocks.fetch.mock.lastCall?.[0].pathname).toBe(`/api/v1/invitations/${id}/send`);
    expect((await revokeInvitation(id, "")).ok).toBe(true);
    expect(JSON.parse(mocks.fetch.mock.lastCall?.[1].body)).toEqual({ reason: null });
    expect((await changeInstitutionalRole({ memberId: id, role: "GESTOR_PROJETO", version: 2, reason: "", operation: "grant" })).ok).toBe(true);
    expect(JSON.parse(mocks.fetch.mock.lastCall?.[1].body)).toEqual({ role: "GESTOR_PROJETO", expectedVersion: 2 });
    expect((await changeInstitutionalRole({ memberId: id, role: "GESTOR_PROJETO", version: 3, reason: "Ajuste", operation: "revoke" })).ok).toBe(true);
    expect(mocks.fetch.mock.lastCall?.[0].pathname).toBe(`/api/v1/members/${id}/roles/GESTOR_PROJETO`);
    expect(JSON.parse(mocks.fetch.mock.lastCall?.[1].body)).toEqual({ expectedVersion: 3, reason: "Ajuste" });
  });
  it("apresenta impedimentos específicos e recusa papel sem autoridade", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ detail: "É necessário preservar um administrador ativo" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ detail: "Encerre ou transfira as lideranças vigentes antes de revogar o papel" }, { status: 409 }));
    expect((await changeInstitutionalRole({ memberId: id, role: "COORDENADOR", version: 0, reason: "", operation: "revoke" })).message).toContain("administrador ativo");
    expect((await changeInstitutionalRole({ memberId: id, role: "GESTOR_PROJETO", version: 0, reason: "", operation: "revoke" })).message).toContain("lideranças de projeto");
    mocks.session.mockResolvedValue({ bearer: "private-bearer", roles: ["GESTOR_PROJETO"] });
    expect((await resendInvitation(id)).ok).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
