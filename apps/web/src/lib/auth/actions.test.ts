import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  isConfigured: vi.fn(),
  cookies: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("../../../auth", () => ({ auth: mocks.auth, signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("./config", async (importOriginal) => ({
  ...await importOriginal<typeof import("./config")>(),
  isAuthConfigured: mocks.isConfigured,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { requestMeetingsGraphConsent, signInWithMicrosoft } from "./actions";

describe("destino de autenticação do handoff", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENTRA_API_SCOPE", "api://22222222-2222-4222-8222-222222222222/access_as_user");
    mocks.isConfigured.mockReturnValue(true);
    mocks.auth.mockResolvedValue({
      niteMember: { id: "member-1", name: "Pessoa", institutionalEmail: "pessoa@example.edu", status: "ATIVO" },
      niteRoles: ["MEMBRO"],
      error: undefined,
    });
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

  it("solicita consentimento combinado apenas para o recurso da API sem forçar prompt de consentimento", async () => {
    await requestMeetingsGraphConsent();

    expect(mocks.signIn).toHaveBeenCalledWith(
      "microsoft-entra-id",
      { redirectTo: "/dev/meetings-graph-consent/calendar" },
      { scope: "openid api://22222222-2222-4222-8222-222222222222/.default" },
    );
  });

  it("não inicia o consentimento sem sessão de integrante ativo", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(requestMeetingsGraphConsent()).rejects.toThrow("redirect:/login");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("não inicia o consentimento fora do ambiente local de desenvolvimento", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(requestMeetingsGraphConsent()).rejects.toThrow("redirect:/dashboard");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
