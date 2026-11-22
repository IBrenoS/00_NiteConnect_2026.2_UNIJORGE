import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterToolbar } from "./filter-toolbar";
import { EmptyState, ErrorState, LoadingState } from "./query-states";

describe("padrões de consulta", () => {
  it("mantém valores avançados no formulário recolhido e indica quando estão ativos", () => {
    const advanced = <input name="dueFrom" defaultValue="2026-11-01" />;
    const closed = renderToStaticMarkup(<FilterToolbar compact method="get" advanced={advanced}><input name="q" /></FilterToolbar>);
    expect(closed).toContain('method="get"');
    expect(closed).toContain('name="dueFrom"');
    expect(closed).not.toContain('<details open');
    const active = renderToStaticMarkup(<FilterToolbar compact advanced={advanced} advancedActive><input name="q" /></FilterToolbar>);
    expect(active).toContain('<details open=""');
    expect(active).toContain('Filtros avançados · aplicados');
  });
  it("compõe uma toolbar de formulário e identifica filtros ativos com ação de limpeza", () => {
    const html = renderToStaticMarkup(
      <FilterToolbar
        aria-label="Consultar registros"
        hasActiveFilters
        onClear={() => undefined}
        actions={<button type="submit">Aplicar</button>}
      >
        <label htmlFor="search">Pesquisar</label>
        <input id="search" type="search" />
      </FilterToolbar>,
    );

    expect(html).toContain('data-slot="filter-toolbar"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain("Filtros aplicados");
    expect(html).toContain("Limpar filtros");
    expect(html).toContain('aria-label="Consultar registros"');
    expect(html).toContain("Aplicar");
  });

  it("distingue ausência inicial de resultados filtrados", () => {
    const initial = renderToStaticMarkup(<EmptyState kind="initial" />);
    const filtered = renderToStaticMarkup(<EmptyState kind="filtered" />);

    expect(initial).toContain('data-kind="initial"');
    expect(initial).toContain("Ainda não há registros");
    expect(filtered).toContain('data-kind="filtered"');
    expect(filtered).toContain("Nenhum resultado encontrado");
  });

  it("expõe carregamento ocupado e erro com tentativa de recuperação opcional", () => {
    const loading = renderToStaticMarkup(<LoadingState />);
    const error = renderToStaticMarkup(
      <ErrorState description="A consulta falhou." onRetry={() => undefined} />,
    );
    const errorWithoutRetry = renderToStaticMarkup(
      <ErrorState description="A consulta falhou." />,
    );

    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(error).toContain('data-slot="error-state"');
    expect(error).toContain('data-variant="error"');
    expect(error).toContain("Tentar novamente");
    expect(errorWithoutRetry).not.toContain("Tentar novamente");
  });
});
