import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("../../../components/shell/authenticated-shell", () => ({
  AuthenticatedShell: ({ children }: { children: ReactNode }) => children,
}));

import DashboardPreviewPage from "./page";

async function render(searchParams: { role?: string; density?: string; context?: string; period?: string }) {
  vi.stubEnv("NODE_ENV", "development");
  return renderToStaticMarkup(await DashboardPreviewPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("prévia isolada da Visão Geral", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("mostra apenas Meu espaço para integrante, mesmo com contexto institucional na URL", async () => {
    const html = await render({ role: "integrante", context: "institutional" });
    expect(html).toContain("Precisa da sua atenção");
    expect(html).not.toContain("Pendências administrativas");
    expect(html).not.toContain("href=\"/dev/dashboard-preview?role=integrante&amp;density=dados&amp;context=institutional");
  });

  it("oferece a visão institucional ao gestor geral e mantém pendências no filtro histórico", async () => {
    const html = await render({ role: "geral", context: "institutional", period: "7" });
    expect(html).toContain("Saúde dos projetos");
    expect(html).toContain("Pendências administrativas");
    expect(html).toContain("Período histórico");
    expect(html).toContain("Projeto Aurora com atividades atrasadas");
  });

  it("inclui liderança pessoal e estados vazios coerentes", async () => {
    const personal = await render({ role: "projeto", density: "poucos" });
    expect(personal).toContain("Sob minha liderança");
    expect(personal).not.toContain("Pendências administrativas");
    const institutional = await render({ role: "coordenador", context: "institutional", density: "vazio" });
    expect(institutional).toContain("Nenhum projeto para classificar.");
    expect(institutional).toContain("Nenhuma pendência administrativa.");
  });

  it("não expõe a prévia fora do ambiente de desenvolvimento", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(DashboardPreviewPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
  });
});
