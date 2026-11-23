import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  isConfigured: vi.fn(),
  cookies: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("../../../auth", () => ({ auth: mocks.auth, signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("./config", async (importOriginal) => ({
  ...await importOriginal<typeof import("./config")>(),
  isAuthConfigured: mocks.isConfigured,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { requestInvitationDirectoryConsent, requestMeetingsGraphConsent, signInWithMicrosoft } from "./actions";

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
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet, set: mocks.cookieSet });
  });

  afterEach(() => vi.clearAllMocks());

  it("mantém o destino padrão quando não há handoff", async () => {
    await signInWithMicrosoft();
    expect(mocks.signIn).toHaveBeenCalledWith("microsoft-entra-id", { redirectTo: "/dashboard" });
  });

  it("continua somente para rota interna fixa quando o cookie protegido existe", async () => {
    mocks.cookieGet.mockImplementation((name: string) => name === "__Host-nite-frequency-handoff" ? { value: "opaque-handoff-id-12345678901234567890" } : undefined);
    await signInWithMicrosoft();
    expect(mocks.signIn).toHaveBeenCalledWith("microsoft-entra-id", { redirectTo: "/frequency/confirm" });
  });

  it("solicita consentimento combinado apenas para o recurso da API sem forçar prompt de consentimento", async () => {
    await requestMeetingsGraphConsent();

    expect(mocks.signIn).toHaveBeenCalledWith(
      "microsoft-entra-id",
      { redirectTo: "/reunioes/integracao/microsoft/calendario" },
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

  it("prepara consentimento de perfil básico para o registro da API somente a gestores", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", "https://nite-connect-web.vercel.app");
    vi.stubEnv("ENTRA_TENANT_ID", "11111111-1111-4111-8111-111111111111");
    mocks.auth.mockResolvedValue({
      niteMember: { id: "member-1", name: "Pessoa", institutionalEmail: "pessoa@unijorge.com.br", status: "ATIVO" },
      niteRoles: ["COORDENADOR"],
      error: undefined,
    });

    let redirectMessage = "";
    try { await requestInvitationDirectoryConsent(); }
    catch (error) { redirectMessage = error instanceof Error ? error.message : String(error); }
    expect(redirectMessage).toMatch(/^redirect:https:\/\/login\.microsoftonline\.com\//);
    const [cookie, state, options] = mocks.cookieSet.mock.calls[0];
    expect(cookie).toBe("__Host-nite-invitation-directory-consent-state");
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 600 });
    const redirectUrl = new URL(redirectMessage.slice("redirect:".length));
    expect(redirectUrl.hostname).toBe("login.microsoftonline.com");
    expect(redirectUrl.searchParams.get("client_id")).toBe("22222222-2222-4222-8222-222222222222");
    expect(redirectUrl.searchParams.get("scope")).toBe("openid https://graph.microsoft.com/User.ReadBasic.All");
    expect(redirectUrl.searchParams.get("response_type")).toBe("code");
    expect(redirectUrl.searchParams.get("redirect_uri")).toBe("https://nite-connect-web.vercel.app/convites/consentimento-microsoft/retorno");
  });
});
