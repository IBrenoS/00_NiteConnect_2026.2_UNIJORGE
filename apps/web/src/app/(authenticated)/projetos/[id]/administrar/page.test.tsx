import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../../../../components/projects/project-administration-legacy-redirect", () => ({ ProjectAdministrationLegacyRedirect: (props: { projectId: string }) => ({ type: "redirect", props }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import AdministerProjectPage from "./page";

beforeEach(() => vi.resetAllMocks());
it("mantém a URL legada e envia o projeto ao redirecionador contextual", async () => {
  const result = await AdministerProjectPage({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
  expect(result.props.projectId).toBe("11111111-1111-4111-8111-111111111111");
});
it("não aceita identificador inválido na rota administrativa antiga", async () => {
  await expect(AdministerProjectPage({ params: Promise.resolve({ id: "invalido" }) })).rejects.toThrow("NOT_FOUND");
});
