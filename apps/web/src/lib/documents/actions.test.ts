import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  resolveApiUrl: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.getSession }));
vi.mock("../api/server", () => ({ resolveApiUrl: mocks.resolveApiUrl }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { importPersonalDocx } from "./actions";

function form(fileName: string, title: string): FormData {
  const result = new FormData();
  result.set("file", new File(["fictitious docx"], fileName, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }));
  result.set("title", title);
  return result;
}

describe("importação de DOCX pessoal", () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ bearer: "server-only-token" });
    mocks.resolveApiUrl.mockReturnValue("http://localhost:8080/api/v1/me/documents");
    mocks.fetch.mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("usa o nome do DOCX sem extensão quando o título não foi informado", async () => {
    await expect(importPersonalDocx(form("nite-connect-b05-1-ficticio.docx", "")))
      .rejects.toThrow("redirect:/documentos");

    const request = mocks.fetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = request?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("title")).toBe("nite-connect-b05-1-ficticio");
  });

  it("preserva o título editado pela pessoa", async () => {
    await expect(importPersonalDocx(form("modelo.docx", "Relatório de teste")))
      .rejects.toThrow("redirect:/documentos");

    const request = mocks.fetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = request?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("title")).toBe("Relatório de teste");
  });
});
