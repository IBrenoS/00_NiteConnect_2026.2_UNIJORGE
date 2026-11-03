import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard",
  search: "scope=personal",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
      React.createElement("a", { ...props, href }),
  };
});

vi.mock("../theme-control", async () => {
  const React = await import("react");
  return {
    ThemeControl: () => React.createElement("select", { "aria-label": "Tema da interface" },
      React.createElement("option", { value: "system" }, "Sistema")),
  };
});

vi.mock("../../lib/auth/actions", () => ({ signOutOfNite: async () => undefined }));

import { AuthenticatedShell } from "./authenticated-shell";

describe("shell autenticado", () => {
  it("usa a sidebar desktop a partir do breakpoint de 768 px e reserva o drawer para telas menores", () => {
    const markup = renderToStaticMarkup(
      <AuthenticatedShell
        member={{ id: "member-1", name: "Pessoa de teste", institutionalEmail: "person@example.invalid", status: "ATIVO" }}
        roles={["INTEGRANTE"]}
        projects={[]}
        leadershipProjectsUnavailable={false}
      >
        <p>Conteúdo da rota.</p>
      </AuthenticatedShell>,
    );

    expect(markup).toContain("w-[250px]");
    expect(markup).toContain("md:flex");
    expect(markup).toContain("md:pl-[250px]");
    expect(markup).toContain('aria-label="Abrir navegação"');
    expect(markup).toContain("md:hidden");
    expect(markup.match(/aria-label="Fechar navegação"/g)).toHaveLength(2);
  });

  it("renderiza conteúdo composto sem carregar estrutura do dashboard", () => {
    const markup = renderToStaticMarkup(
      <AuthenticatedShell
        member={{ id: "member-1", name: "Pessoa de teste", institutionalEmail: "person@example.invalid", status: "ATIVO" }}
        roles={["INTEGRANTE"]}
        projects={[]}
        leadershipProjectsUnavailable={false}
      >
        <article data-shell-test="independent-content"><h1>Conteúdo independente do painel</h1></article>
      </AuthenticatedShell>,
    );

    expect(markup).toContain('id="authenticated-content"');
    expect(markup).toContain('data-shell-test="independent-content"');
    expect(markup).toContain("Conteúdo independente do painel");
    expect(markup).not.toContain("Indicadores principais");
    expect(markup).not.toContain("Precisa de atenção");
  });

  it("mantém a visão geral ativa e módulos sem rota sem ação de teclado ou mouse", () => {
    const markup = renderToStaticMarkup(
      <AuthenticatedShell
        member={{ id: "member-1", name: "Pessoa de teste", institutionalEmail: "person@example.invalid", status: "ATIVO" }}
        roles={["COORDENADOR"]}
        projects={[{ projectId: "project-1", title: "Projeto autorizado" }]}
        leadershipProjectsUnavailable={false}
      >
        <p>Conteúdo da rota.</p>
      </AuthenticatedShell>,
    );

    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('data-icon="metrics"');
    expect(markup).toContain('data-icon="logs"');
    expect(markup).toContain('data-icon="workflow"');
    expect(markup).toContain('data-icon="video"');
    expect(markup).toContain('data-icon="audience"');
    expect(markup).toContain('data-icon="templates"');
    expect(markup).toContain('data-icon="settings"');
    expect(markup).toContain('href="/dashboard"');
    expect(markup).toContain('href="/atividades"');
    expect(markup).toContain('aria-disabled="true" aria-label="Projetos, em desenvolvimento"');
    expect(markup).not.toMatch(/<a[^>]+(?:Minha participação|Projetos|Frequência e revisões|Relatórios|Administração)/);
    expect(markup).not.toContain("Espaço de trabalho");
  });

});
