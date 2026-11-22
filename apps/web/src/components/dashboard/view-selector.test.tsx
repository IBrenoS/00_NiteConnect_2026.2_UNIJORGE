import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("scope=personal"),
}));
import { ViewSelector } from "./view-selector";

describe("seletor de visão", () => {
  it("apresenta apenas perspectivas autorizadas", () => {
    const member = renderToStaticMarkup(<ViewSelector id="view" projects={[]} canAdminister={false} />);
    expect(member).toContain('aria-label="Visão"');
    expect(member).toContain("Meu espaço");
    expect(member).not.toContain("Visão geral do NITE");
    expect(member).not.toContain("Projeto autorizado");
    const admin = renderToStaticMarkup(<ViewSelector id="view" projects={[{ projectId: "p1", title: "Projeto autorizado" }]} canAdminister />);
    expect(admin).toContain('data-slot="filter-select"');
    expect(admin).toContain("Projeto autorizado");
    expect(admin).toContain("Visão geral do NITE");
  });
});
