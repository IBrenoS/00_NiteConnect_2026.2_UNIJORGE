import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("../../../../../lib/auth/server-session", () => ({
  getAuthenticatedNiteSession: vi.fn(),
}));
vi.mock("../../../../../lib/api/server", () => ({
  resolveApiUrl: vi.fn(() => "https://api.example.test/api/v1/meetings/test-meeting/join"),
}));

import { getAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";

const meetingId = "f563d6d1-0376-43cc-ab5b-ab720b8fd9ef";

describe("GET /reunioes/[meetingId]/entrar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("encaminha 403 genérico à tela de erro com o motivo, sem rotulá-lo como Graph", async () => {
    vi.mocked(getAuthenticatedNiteSession).mockResolvedValue({
      member: { id: "member-1", name: "Pessoa", institutionalEmail: "pessoa@example.invalid", status: "ATIVO" },
      roles: [],
      bearer: "test-bearer",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "FORBIDDEN" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })));

    const response = await GET(new NextRequest(`http://localhost/reunioes/${meetingId}/entrar`), { params: Promise.resolve({ meetingId }) });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://localhost/reunioes/erro?reason=forbidden&meetingId=${meetingId}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("mantém a página Graph exclusiva para OBO_CONSENT_REQUIRED", async () => {
    vi.mocked(getAuthenticatedNiteSession).mockResolvedValue({
      member: { id: "member-1", name: "Pessoa", institutionalEmail: "pessoa@example.invalid", status: "ATIVO" },
      roles: [],
      bearer: "test-bearer",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "OBO_CONSENT_REQUIRED" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })));

    const response = await GET(new NextRequest(`http://localhost/reunioes/${meetingId}/entrar`), { params: Promise.resolve({ meetingId }) });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/reunioes/erro-403");
  });
});
