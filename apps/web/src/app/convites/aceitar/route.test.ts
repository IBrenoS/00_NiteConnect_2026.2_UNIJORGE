import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), accept: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/auth/server-session", () => ({ getAuthenticatedNiteSession: mocks.session }));
vi.mock("../../../lib/auth/invitation", () => ({ acceptInvitationForSignIn: mocks.accept }));
import { GET } from "./route";

describe("handoff de convite", () => {
  beforeEach(() => { mocks.session.mockReset().mockResolvedValue(null); mocks.accept.mockReset(); });
  it("guarda somente o identificador em cookie HTTP e sai da URL", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const response = await GET(new Request(`https://nite.example/convites/aceitar?id=${id}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://nite.example/login");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain(`nite-invitation=${id}`);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("rejeita identificador inválido", async () => {
    const response = await GET(new Request("https://nite.example/convites/aceitar?id=bad"));
    expect(response.headers.get("location")).toBe("https://nite.example/convites/resultado?status=invalid");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("aceita automaticamente usando uma sessão existente", async () => {
    mocks.session.mockResolvedValue({ bearer: "server-only" });
    mocks.accept.mockResolvedValue("success");
    const response = await GET(new Request("https://nite.example/convites/aceitar?id=11111111-1111-4111-8111-111111111111"));
    expect(mocks.accept).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "server-only", "");
    expect(response.headers.get("location")).toBe("https://nite.example/convites/resultado?status=success");
    expect(response.headers.get("set-cookie")).toContain("nite-invitation-success=1");
  });
});
