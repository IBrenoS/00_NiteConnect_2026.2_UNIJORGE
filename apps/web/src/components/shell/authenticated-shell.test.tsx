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
import { AuthenticatedNavigation, buildAuthenticatedNavigationGroups } from "./authenticated-navigation";

describe("shell autenticado", () => {
  it("identifica o gestor de projeto sem liberar navegação administrativa global", () => {
    const markup = renderToStaticMarkup(
      <AuthenticatedShell
        member={{ id: "member-1", name: "Pessoa de teste", institutionalEmail: "person@example.invalid", status: "ATIVO" }}
        roles={["INTEGRANTE", "GESTOR_PROJETO"]}
        projects={[]}
        leadershipProjectsUnavailable={false}
      >
        <p>Conteúdo.</p>
      </AuthenticatedShell>,
    );

    expect(markup).toContain("Gestão de Projeto");
    expect(markup).not.toContain('href="/relatorios"');
    expect(markup).not.toContain('href="/biblioteca"');
  });
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

    expect(markup).toContain("w-64");
    expect(markup).toContain("md:flex");
    expect(markup).toContain("md:pl-64");
    expect(markup).toContain('aria-label="Abrir navegação"');
    expect(markup).toContain("md:hidden");
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain("data-navigation-icon");
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
    const markup = renderToStaticMarkup(<AuthenticatedNavigation groups={buildAuthenticatedNavigationGroups({
      projects: [], canAdminister: true, canCoordinate: true,
    })} />);

    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('data-navigation-icon="dashboard"');
    expect(markup).toContain('data-navigation-icon="checklist"');
    expect(markup).toContain('data-navigation-icon="network"');
    expect(markup).toContain('data-navigation-icon="video"');
    expect(markup).toContain('data-navigation-icon="people"');
    expect(markup).toContain('data-navigation-icon="books"');
    expect(markup).toContain('data-navigation-icon="sliders"');
    expect(markup).toContain('href="/dashboard"');
    expect(markup).toContain('href="/atividades"');
    expect(markup).toContain('href="/projetos"');
    expect(markup).toContain('href="/relatorios"');
    expect(markup).not.toMatch(/<a[^>]+(?:Minha participação|Projetos|Frequência e revisões|Administração)/);
    expect(markup).not.toContain("Espaço de trabalho");
  });

});
