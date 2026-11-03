import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthConfigured, meetingsGraphConsentScope } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("isAuthConfigured", () => {
  it("requires the tenant, web client, API scope, API origin, and session secret", () => {
    vi.stubEnv("AUTH_SECRET", "01234567890123456789012345678901234567890123");
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "33333333-3333-4333-8333-333333333333");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "server-secret");
    vi.stubEnv("ENTRA_TENANT_ID", "11111111-1111-4111-8111-111111111111");
    vi.stubEnv("ENTRA_API_SCOPE", "api://22222222-2222-4222-8222-222222222222/access_as_user");
    vi.stubEnv("API_BASE_URL", "http://localhost:8080");

    expect(isAuthConfigured()).toBe(true);
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "");
    expect(isAuthConfigured()).toBe(false);
  });

  it("rejects a non-UUID tenant identifier", () => {
    vi.stubEnv("AUTH_SECRET", "01234567890123456789012345678901234567890123");
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "33333333-3333-4333-8333-333333333333");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "server-secret");
    vi.stubEnv("ENTRA_TENANT_ID", "organizations");
    vi.stubEnv("ENTRA_API_SCOPE", "api://api/access_as_user");
    vi.stubEnv("API_BASE_URL", "http://localhost:8080");

    expect(isAuthConfigured()).toBe(false);
  });
});

describe("meetingsGraphConsentScope", () => {
  it("converte o escopo delegado da API para o recurso /.default", () => {
    expect(meetingsGraphConsentScope("api://22222222-2222-4222-8222-222222222222/access_as_user"))
      .toBe("api://22222222-2222-4222-8222-222222222222/.default");
  });

  it("preserva URIs de recurso com caminho e remove somente o escopo final", () => {
    expect(meetingsGraphConsentScope("https://api.example.edu/nite/access_as_user"))
      .toBe("https://api.example.edu/nite/.default");
  });

  it.each([undefined, "", "not-a-scope", "api://resource/access_as_user?next=evil", "api://resource/"])(
    "rejeita configuração inválida (%s)",
    (scope) => expect(meetingsGraphConsentScope(scope)).toBeNull(),
  );
});
