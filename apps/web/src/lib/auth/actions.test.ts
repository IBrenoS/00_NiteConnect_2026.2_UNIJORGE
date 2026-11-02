import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  isConfigured: vi.fn(),
  cookies: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("../../../auth", () => ({ signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("./config", () => ({ isAuthConfigured: mocks.isConfigured }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { signInWithMicrosoft } from "./actions";

describe("destino de autenticação do handoff", () => {
  beforeEach(() => {
    mocks.isConfigured.mockReturnValue(true);
    mocks.signIn.mockResolvedValue(undefined);
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
  });

  afterEach(() => vi.clearAllMocks());

  it("mantém o destino padrão quando não há handoff", async () => {
    await signInWithMicrosoft();
    expect(mocks.signIn).toHaveBeenCalledWith("microsoft-entra-id", { redirectTo: "/dashboard" });
  });

  it("continua somente para rota interna fixa quando o cookie protegido existe", async () => {
    mocks.cookieGet.mockReturnValue({ value: "opaque-handoff-id-12345678901234567890" });
    await signInWithMicrosoft();
    expect(mocks.signIn).toHaveBeenCalledWith("microsoft-entra-id", { redirectTo: "/frequency/confirm" });
  });
});
