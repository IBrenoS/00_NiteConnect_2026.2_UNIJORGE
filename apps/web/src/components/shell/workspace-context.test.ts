import { describe, expect, it } from "vitest";
import { resolveWorkspaceContext, workspaceContextHref } from "./workspace-context";

const projects = [{ projectId: "project-1", title: "Projeto de teste" }];

describe("contexto do espaço de trabalho", () => {
  it("aceita somente contexto pessoal, institucional permitido e projetos autorizados", () => {
    expect(resolveWorkspaceContext(null, projects, false)).toBe("personal");
    expect(resolveWorkspaceContext("personal", projects, false)).toBe("personal");
    expect(resolveWorkspaceContext("institutional", projects, false)).toBe("personal");
    expect(resolveWorkspaceContext("institutional", projects, true)).toBe("institutional");
    expect(resolveWorkspaceContext("project:project-1", projects, false)).toBe("project:project-1");
    expect(resolveWorkspaceContext("project:project-2", projects, true)).toBe("personal");
    expect(resolveWorkspaceContext("project:", projects, true)).toBe("personal");
  });

  it("altera o contexto na rota atual e preserva somente filtros conhecidos sem fragmento", () => {
    const href = workspaceContextHref(
      "/dashboard",
      "scope=personal&from=2026-10-25&to=2026-10-31&q=reuni%C3%A3o&tab=all&access_token=secret",
      "project:project-1",
    );
    const url = new URL(href, "https://nite.example.invalid");

    expect(url.pathname).toBe("/dashboard");
    expect(url.searchParams.get("scope")).toBe("project:project-1");
    expect(url.searchParams.get("from")).toBe("2026-10-25");
    expect(url.searchParams.get("to")).toBe("2026-10-31");
    expect(url.searchParams.get("q")).toBe("reunião");
    expect(url.searchParams.has("tab")).toBe(false);
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(url.hash).toBe("");
  });

  it("recusa um caminho protocol-relative antes de formar o destino", () => {
    expect(workspaceContextHref("//outside.example", "q=test", "personal")).toBe("/dashboard?q=test&scope=personal");
  });
});
