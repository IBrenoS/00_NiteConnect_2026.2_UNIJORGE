import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingJoinErrorView } from "./meeting-join-error-view";

describe("MeetingJoinErrorView", () => {
  it("explica acesso negado e oferece retorno e nova tentativa segura", () => {
    const html = renderToStaticMarkup(<MeetingJoinErrorView reason="forbidden" meetingId="f563d6d1-0376-43cc-ab5b-ab720b8fd9ef" />);

    expect(html).toContain("Sua sessão não tem acesso a esta reunião");
    expect(html).toContain("conta institucional associada à reunião");
    expect(html).toContain("/reunioes");
    expect(html).toContain("/reunioes/f563d6d1-0376-43cc-ab5b-ab720b8fd9ef/entrar");
    expect(html).not.toContain("OBO_CONSENT_REQUIRED");
  });

  it("diferencia falha de sessão e não inventa uma ação de repetição sem reunião", () => {
    const html = renderToStaticMarkup(<MeetingJoinErrorView reason="session-required" meetingId={null} />);

    expect(html).toContain("Sua sessão precisa ser renovada");
    expect(html).toContain("O serviço não aceitou a sessão institucional atual");
    expect(html).not.toContain("Tentar novamente");
  });
});
