import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), identity: vi.fn() }));
vi.mock("next-auth", () => ({ default: () => ({}) }));
vi.mock("./tokens", () => ({ refreshEntraToken: mocks.refresh }));
vi.mock("./api", () => ({ getNiteIdentity: mocks.identity, NiteApiUnauthorizedError: class extends Error {} }));
import { resolveNiteToken } from "../../../auth";
const member = { id: "1", name: "Teste", institutionalEmail: "t@example.invalid", status: "ATIVO" as const };
beforeEach(() => vi.clearAllMocks());
it("renova bearer, refresh token e identidade juntos", async () => {
 mocks.refresh.mockResolvedValue({ accessToken: "new", refreshToken: "rotated", expiresAt: Date.now() + 3600000 });
 mocks.identity.mockResolvedValue({ member, roles: ["INTEGRANTE"] });
 const result = await resolveNiteToken({ accessToken: "old", refreshToken: "original", accessTokenExpiresAt: 0 });
 expect(result).toMatchObject({ accessToken: "new", refreshToken: "rotated", niteMember: member, niteRoles: ["INTEGRANTE"] });
 expect(mocks.identity).toHaveBeenCalledWith("new", expect.any(String));
});
it("não renova token válido e bloqueia refresh falho", async () => {
 const token = { accessToken: "valid", accessTokenExpiresAt: Date.now() + 3600000 };
 expect(await resolveNiteToken(token)).toEqual(token);
 expect(mocks.refresh).not.toHaveBeenCalled();
 mocks.refresh.mockRejectedValue(new Error("offline"));
 expect(await resolveNiteToken({ ...token, accessTokenExpiresAt: 0, refreshToken: "r" })).toMatchObject({authError: "SessionExpired"});
});
