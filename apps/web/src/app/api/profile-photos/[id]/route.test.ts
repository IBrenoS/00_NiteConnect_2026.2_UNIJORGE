import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), resolve: vi.fn() }));
vi.mock("../../../../lib/auth/server-session", () => ({ getAuthenticatedNiteSession: mocks.session }));
vi.mock("../../../../lib/api/server", () => ({ resolveApiUrl: mocks.resolve }));
import { GET } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const request = new Request(`http://localhost/api/profile-photos/${id}`);
const context = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ bearer: "private-token" });
  mocks.resolve.mockReturnValue(new URL(`http://localhost:8080/api/v1/members/${id}/photo`));
});

it("bloqueia sessão ausente e identificador inválido antes de consultar a API", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  mocks.session.mockResolvedValueOnce(null);
  expect((await GET(request, context)).status).toBe(401);
  expect((await GET(request, { params: Promise.resolve({ id: "wrong" }) })).status).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRestore();
});

it("entrega somente imagens aceitas sem cache e sem expor o bearer", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]),
    { headers: { "content-type": "image/png" } }));
  const response = await GET(request, context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
    headers: { Authorization: "Bearer private-token" },
  }));
  expect(JSON.stringify([...response.headers])).not.toContain("private-token");
  fetcher.mockRestore();
});
