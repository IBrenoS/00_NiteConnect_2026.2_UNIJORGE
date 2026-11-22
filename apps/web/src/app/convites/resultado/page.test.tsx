import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), cookie: vi.fn() }));
vi.mock("../../../lib/auth/server-session", () => ({ getAuthenticatedNiteSession: mocks.session }));
vi.mock("next/headers", () => ({ cookies: mocks.cookie }));
import Page from "./page";
beforeEach(() => { mocks.session.mockReset().mockResolvedValue(null); mocks.cookie.mockReset().mockResolvedValue({ get: () => ({ value: "1" }) }); });
it("não declara ingresso concluído sem sessão institucional válida", async () => {
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ status: "success" }) }));
  expect(html).toContain("Identidade não confirmada");
  expect(html).not.toContain("Ingresso concluído");
});
it("mostra sucesso apenas com sessão validada", async () => {
  mocks.session.mockResolvedValue({ bearer: "private-bearer" });
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ status: "success" }) }));
  expect(html).toContain("Ingresso concluído");
  expect(html).not.toContain("private-bearer");
});
it("não usa apenas o parâmetro de URL como prova de aceite", async () => {
  mocks.session.mockResolvedValue({ bearer: "private-bearer" });
  mocks.cookie.mockResolvedValue({ get: () => undefined });
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ status: "success" }) }));
  expect(html).toContain("Identidade não confirmada");
});
