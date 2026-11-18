import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getToken: vi.fn(), resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../auth", () => ({ resolveNiteToken: mocks.resolve, authSessionCookieName: "nite-connect.session" }));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.getToken }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); } }));
import { getAuthenticatedNiteSession, requireAuthenticatedNiteSession } from "./server-session";
const member = { id: "member-1", name: "Teste", institutionalEmail: "test@example.invalid", status: "ATIVO" };
beforeEach(() => { vi.stubEnv("AUTH_SECRET", "test"); vi.clearAllMocks(); });
it("usa identidade e bearer do mesmo token renovado", async () => {
 mocks.getToken.mockResolvedValue({ accessToken: "expired" });
 mocks.resolve.mockResolvedValue({ accessToken: "renewed", niteMember: member, niteRoles: ["INTEGRANTE"] });
 await expect(getAuthenticatedNiteSession()).resolves.toEqual({ member, roles: ["INTEGRANTE"], bearer: "renewed" });
 expect(mocks.resolve).toHaveBeenCalledWith({ accessToken: "expired" });
});
it("bloqueia erros, identidade inativa, token ausente e bearer ausente", async () => {
 mocks.getToken.mockResolvedValue({});
 for (const token of [ {authError: "SessionExpired"}, {niteMember: {...member,status: "INATIVO"}, niteRoles: ["INTEGRANTE"], accessToken: "x"}, {niteMember: member, niteRoles: ["INTEGRANTE"]} ]) {
 mocks.resolve.mockResolvedValue(token);
 await expect(getAuthenticatedNiteSession()).resolves.toBeNull();
 }
 mocks.getToken.mockResolvedValue(null);
 await expect(requireAuthenticatedNiteSession()).rejects.toThrow("/login");
});
it("bloqueia ausência do segredo", async () => {
 vi.stubEnv("AUTH_SECRET", "");
 await expect(getAuthenticatedNiteSession()).resolves.toBeNull();
 expect(mocks.getToken).not.toHaveBeenCalled();
});
