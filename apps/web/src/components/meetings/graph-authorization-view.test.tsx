import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GraphAuthorizationView } from "./graph-authorization-view";
import { graphAuthorizationStatusMessage, resolveGraphAuthorizationViewState } from "./graph-authorization-state";

describe("GraphAuthorizationView", () => {
  it("shows a non-error loading state without claiming an authorization code", () => {
    const html = renderToStaticMarkup(
      <GraphAuthorizationView state="checking" statusMessage={null} onCheckAgain={vi.fn()} />,
    );

    expect(html).toContain("Verificando autorização do Microsoft 365");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("OBO_CONSENT_REQUIRED");
  });

  it("renders the approved 403 narrative and real navigation only for exact OBO consent", () => {
    const result = resolveGraphAuthorizationViewState({
      state: "consent-required",
      httpStatus: 403,
      code: "OBO_CONSENT_REQUIRED",
    });
    if (result === "available") throw new Error("A resposta de consentimento não pode ser disponibilidade.");
    const html = renderToStaticMarkup(
      <GraphAuthorizationView
        state={result}
        statusMessage={"A autorização institucional ainda está pendente."}
        onCheckAgain={vi.fn()}
      />,
    );

    expect(result).toBe("consent-required");
    expect(html).toContain("Erro 403");
    expect(html).toContain("A conexão com o Microsoft 365 ainda não foi autorizada");
    expect(html).toContain("Código: 403 · OBO_CONSENT_REQUIRED");
    expect(html).toContain("A criação e o gerenciamento automáticos das reuniões dependem de autorização institucional.");
    expect(html).toContain("Enquanto isso, você ainda pode consultar convites, histórico e detalhes já disponíveis no NITE Connect.");
    expect(html).toContain("Quando a autorização for concedida, o fluxo completo de Reuniões poderá ser habilitado após a validação da integração.");
    expect(html).toContain('href="/reunioes"');
    expect(html).toContain("Verificar novamente");
    expect(html).toContain("A autorização institucional ainda está pendente.");
  });

  it.each([
    { state: "admin-approval-required", httpStatus: 403, code: "OBO_ADMIN_APPROVAL_REQUIRED" },
    { state: "unavailable", httpStatus: 403, code: "ACCESS_DENIED" },
    { state: "unavailable", httpStatus: null, code: null },
    { state: "consent-required", httpStatus: 403, code: "ACCESS_DENIED" },
    { state: "consent-required", httpStatus: 200, code: "OBO_CONSENT_REQUIRED" },
  ] as const)("does not label $code as the approved 403", (result) => {
    const state = resolveGraphAuthorizationViewState(result);
    if (state === "available") throw new Error("Esta resposta não pode indicar disponibilidade.");
    const html = renderToStaticMarkup(
      <GraphAuthorizationView state={state} statusMessage="Não foi possível verificar a integração." onCheckAgain={vi.fn()} />,
    );

    expect(state).not.toBe("consent-required");
    expect(html).not.toContain("Erro 403");
    expect(html).not.toContain("OBO_CONSENT_REQUIRED");
    expect(html).toContain("Não foi possível verificar a integração.");
  });

  it("exposes the check status as an accessible live message", () => {
    const html = renderToStaticMarkup(
      <GraphAuthorizationView
        state="unavailable"
        statusMessage="A conexão está temporariamente indisponível. Tente novamente."
        onCheckAgain={vi.fn()}
      />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("A conexão está temporariamente indisponível. Tente novamente.");
  });

  it("disables repeat checks while pending and describes a real temporary failure", () => {
    const checking = renderToStaticMarkup(
      <GraphAuthorizationView state="consent-required" statusMessage="Verificando a disponibilidade…" isChecking onCheckAgain={vi.fn()} />,
    );

    expect(checking).toContain('aria-busy="true"');
    expect(checking).toContain('disabled=""');
    expect(checking).toContain("Verificando…");
    expect(graphAuthorizationStatusMessage("unavailable")).toContain("temporariamente indisponível");
    expect(graphAuthorizationStatusMessage("admin-approval-required")).toContain("aprovação administrativa");
  });

  it("resolves a fully available response to the meetings route instead of the 403 view", () => {
    expect(resolveGraphAuthorizationViewState({ state: "available", httpStatus: 200, code: null })).toBe("available");
  });
});
