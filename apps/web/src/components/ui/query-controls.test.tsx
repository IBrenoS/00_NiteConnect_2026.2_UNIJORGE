import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchField } from "./search-field";
import { FilterSelect } from "./filter-select";
import { DatePicker, DateRangePicker } from "./date-picker";
import { Button } from "./button";
import { calendarDays, shiftMonth } from "./calendar";

describe("controles de consulta", () => {
  it("preserva limites, valor inicial e submissão da pesquisa", () => {
    const html = renderToStaticMarkup(<SearchField name="q" defaultValue="NITE" minLength={2} maxLength={160} required aria-label="Pesquisar" />);
    expect(html).toContain('type="search"');
    expect(html).toContain('name="q"');
    expect(html).toContain('value="NITE"');
    expect(html).toContain('minLength="2"');
    expect(html).toContain('required=""');
    expect(html).toContain('<svg');
    expect(html).not.toContain('Limpar pesquisa');
  });
  it("preserva select, opção selecionada e obrigatoriedade sem inputs duplicados", () => {
    const html = renderToStaticMarkup(<FilterSelect name="status" defaultValue="active" required aria-label="Situação"><option value="">Todas</option><option value="active">Ativa</option></FilterSelect>);
    expect(html).toContain('<select');
    expect(html).toContain('name="status"');
    expect(html).toContain('value="active" selected=""');
    expect(html).toContain('required=""');
    expect(html).not.toContain('<input');
  });
  it("preserva nomes ISO, limites e datas dos formulários", () => {
    const html = renderToStaticMarkup(<DatePicker name="dueOn" defaultValue="2026-11-22" min="2026-01-01" max="2026-12-31" required aria-label="Prazo" />);
    expect(html).toContain('type="date"');
    expect(html).toContain('name="dueOn"');
    expect(html).toContain('value="2026-11-22"');
    expect(html).toContain('min="2026-01-01"');
    expect(html).toContain('max="2026-12-31"');
    expect(html).toContain('required=""');
    expect(html).toContain('popover="auto"');
    const range = renderToStaticMarkup(<DateRangePicker from={{ name: "dueFrom", defaultValue: "2026-11-01" }} to={{ name: "dueTo" }} />);
    expect(range).toContain('name="dueFrom"');
    expect(range).toContain('name="dueTo"');
  });
  it("calcula calendário por datas civis, incluindo bissexto e mudança de ano", () => {
    const days = calendarDays("2024-02-01");
    expect(days).toHaveLength(35);
    expect(days[0]).toBe("2024-01-28");
    expect(days).toContain("2024-02-29");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });
  it("oferece densidade compacta sem alterar default de Button", () => {
    expect(renderToStaticMarkup(<Button size="compact">Aplicar</Button>)).toContain('data-size="compact"');
    expect(renderToStaticMarkup(<Button>Enviar</Button>)).toContain('min-h-11');
  });
});
