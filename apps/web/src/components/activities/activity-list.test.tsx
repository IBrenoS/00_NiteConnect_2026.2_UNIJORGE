import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { previewActivities, previewProjectTitles } from "../../lib/activities/preview-fixtures";
import { ActivityEmptyState, ActivityRows, ActivityStatusBadge } from "./activity-list";

describe("lista pessoal de atividades", () => {
  it("mantém títulos em largura integral antes de alinhar os metadados na mesma linha", () => {
    const markup = renderToStaticMarkup(<ActivityRows activities={[previewActivities.at(-1)!]} />);
    const rowClass = markup.match(/<li class="([^"]*)"/)?.[1] ?? "";

    expect(rowClass).toContain("flex-col");
    expect(rowClass).toContain("lg:flex-row");
    expect(rowClass).not.toContain("sm:flex-row");
  });

  it("mantém situação e atraso distintos e representa atividades independentes", () => {
    const markup = renderToStaticMarkup(
      <ActivityRows
        activities={previewActivities}
        projectTitles={previewProjectTitles}
        returnTo="/atividades?q=orienta&status=EM_EXECUCAO"
      />,
    );

    expect(markup).toContain("Atividade independente");
    expect(markup).toContain("Pesquisa em protocolos institucionais");
    expect(markup).toContain("Em execução");
    expect(markup).toContain("Em atraso");
    expect(markup).toContain("Concluída");
    expect(markup).toContain("Cancelada");
    expect(markup).toContain("Mapear com integrantes os passos de entrada");
  });

  it("usa tokens semânticos distintos para os quatro estados oficiais", () => {
    const statuses = ["PLANEJADA", "EM_EXECUCAO", "CONCLUIDA", "CANCELADA"] as const;
    const badges = statuses.map((status) => renderToStaticMarkup(<ActivityStatusBadge status={status} />)).join(" ");

    expect(badges).toContain("Planejada");
    expect(badges).toContain("Em execução");
    expect(badges).toContain("Concluída");
    expect(badges).toContain("Cancelada");
    expect(badges).toContain("status-cancelled-border");
    expect(badges).toContain("status-cancelled-soft");
    expect(badges).toContain("text-status-cancelled");
    expect(badges).not.toContain("Em atraso");
  });

  it("mostra uma próxima ação breve no vazio e distingue filtros sem resultado", () => {
    const empty = renderToStaticMarkup(<ActivityEmptyState filtered={false} canCreate actionHref="/atividades/nova" />);
    const filtered = renderToStaticMarkup(<ActivityEmptyState filtered clearHref="/atividades?status=CANCELADA" />);

    expect(empty).toContain("Nenhuma atividade atribuída por enquanto");
    expect(empty).toContain("href=\"/atividades/nova\"");
    expect(filtered).toContain("Nenhuma atividade encontrada");
    expect(filtered).toContain("Limpar filtros");
    expect(filtered).not.toContain("Nenhuma atividade atribuída por enquanto");
  });
});
