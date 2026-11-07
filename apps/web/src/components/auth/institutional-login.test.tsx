import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InstitutionalLogin } from "./institutional-login";
import { ThemeProvider } from "../theme-provider";

vi.mock("../../lib/auth/actions", () => ({
  signInWithMicrosoft: async () => undefined,
  signOutOfNite: async () => undefined,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function renderLogin(props?: Parameters<typeof InstitutionalLogin>[0]) {
  return renderToStaticMarkup(
    <ThemeProvider>
      <InstitutionalLogin {...props} />
    </ThemeProvider>,
  );
}

describe("InstitutionalLogin", () => {
  it("oferece entrada Microsoft ativa sem expor tokens ou dados de acesso local", () => {
    const html = renderLogin();

    expect(html).toContain("Bem-vindo ao");
    expect(html).toContain("NITE Connect.");
    expect(html).toContain("Acesse seu espaço de trabalho com sua conta institucional.");
    expect(html).toContain("Acesso exclusivo aos integrantes autorizados do NITE.");
    expect(html).not.toContain('aria-label="Tema da interface"');
    expect(html).toContain("Entrar com Microsoft");
    expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|>)/);
    expect(html).not.toContain("A entrada institucional ainda não está disponível nesta interface.");
    expect(html).not.toContain("integração Microsoft Entra ainda não está conectada");
    expect(html).toContain('autoPlay=""');
    expect(html).toContain('muted=""');
    expect(html).toContain('loop=""');
    expect(html).toContain('playsInline=""');
    expect(html).toContain('poster="/images/nite-connect-login-visual.png"');
    expect(html).toContain('data-src="/videos/nite-connect-login.mp4"');
    expect(html).toContain("min-[56rem]:grid-cols-[minmax(28rem,39%)_minmax(0,1fr)]");
    expect(html).toContain("h-full min-h-svh w-full overflow-hidden");
    expect(html).toContain("object-cover object-center");
    expect(html).toContain('alt=""');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("access_token");
  });

  it("diferencia erros conhecidos sem expor detalhes técnicos", () => {
    const configuration = renderLogin({ error: "Configuration" });
    expect(configuration).toContain("Autenticação indisponível");
    expect(configuration).toContain("A autenticação institucional ainda não está disponível neste ambiente.");

    const accessDenied = renderLogin({ error: "AccessDenied" });
    expect(accessDenied).toContain("Acesso não autorizado");
    expect(accessDenied).toContain("Sua conta não possui permissão para acessar o NITE Connect.");

    const sessionExpired = renderLogin({ error: "SessionExpired" });
    expect(sessionExpired).toContain("Sua sessão precisa ser renovada");

    const unknown = renderLogin({ error: "OAuthCallback" });
    expect(unknown).toContain("Não foi possível entrar com a Microsoft");
    expect(unknown).toContain("Se o problema continuar, entre em contato com a equipe responsável pelo acesso.");
    expect(unknown).not.toContain("OAuthCallback");
  });

  it("exibe somente a identidade e os papéis confirmados pela API após o login", () => {
    const html = renderLogin({
      member: {
        id: "db4bd5de-d9b3-4565-8340-066d32c08e11",
        name: "Pessoa Integrante",
        institutionalEmail: "integrante@unijorge.com.br",
        status: "ATIVO",
      },
      roles: ["INTEGRANTE"],
    });

    expect(html).toContain("Acesso autorizado.");
    expect(html).toContain("integrante@unijorge.com.br");
    expect(html).toContain("INTEGRANTE");
    expect(html).toContain("Sair");
    expect(html).not.toContain("Entrar com Microsoft");
    expect(html).not.toContain("access_token");
  });
});
