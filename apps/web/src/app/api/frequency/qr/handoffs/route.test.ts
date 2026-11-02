import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/api/server", () => ({ resolveApiUrl: (path: string) => new URL(path, process.env.API_BASE_URL) }));

import { POST } from "./route";

const token = "A".repeat(43);
const handoffId = "H".repeat(43);

describe("route same-origin de handoff QR", () => {
  beforeEach(() => {
    vi.stubEnv("API_BASE_URL", "https://api.example.invalid");
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejeita token inválido sem chamar a API", async () => {
    const response = await POST(new Request("https://nite.example.org/api/frequency/qr/handoffs", { method: "POST", body: JSON.stringify({ qrToken: "bad" }) }));
    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("guarda handoff apenas em cookie protegido e não devolve o ID ao navegador", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ handoffId, expiresAt }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const response = await POST(new Request("https://nite.example.org/api/frequency/qr/handoffs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qrToken: token }) }));
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.cookies.get("__Host-nite-frequency-handoff")?.value).toBe(handoffId);
    expect(response.cookies.get("__Host-nite-frequency-handoff")).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(response.cookies.get("__Host-nite-frequency-handoff")?.maxAge).toBeGreaterThanOrEqual(350);
    expect(response.cookies.get("__Host-nite-frequency-handoff")?.maxAge).toBeLessThanOrEqual(360);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({ expiresAt });
    expect(JSON.stringify(body)).not.toContain(handoffId);
    const [url, init] = mocks.fetch.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/frequency/qr/handoffs");
    expect(JSON.parse(String(init.body))).toEqual({ qrToken: token });
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("propaga 429 e Retry-After sem expor payloads da API", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ internal: "hidden" }), { status: 429, headers: { "Retry-After": "15" } }));
    const response = await POST(new Request("https://nite.example.org/api/frequency/qr/handoffs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qrToken: token }) }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(await response.json()).toEqual({ message: "O QR expirou ou não está disponível." });
    expect(response.cookies.get("__Host-nite-frequency-handoff")).toBeUndefined();
  });

  it("não cria cookie quando o handoff expirou antes da resposta", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ handoffId, expiresAt: new Date(Date.now() - 1_000).toISOString() }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const response = await POST(new Request("https://nite.example.org/api/frequency/qr/handoffs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qrToken: token }) }));
    expect(response.status).toBe(409);
    expect(response.cookies.get("__Host-nite-frequency-handoff")).toBeUndefined();
    expect(await response.json()).toEqual({ message: "O QR expirou ou não está disponível." });
  });
});
