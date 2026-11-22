import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("handoff de convite", () => {
  it("guarda somente o identificador em cookie HTTP e sai da URL", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const response = await GET(new Request(`https://nite.example/convites/aceitar?id=${id}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://nite.example/login");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain(`nite-invitation=${id}`);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("rejeita identificador inválido", async () => {
    const response = await GET(new Request("https://nite.example/convites/aceitar?id=bad"));
    expect(response.headers.get("location")).toBe("https://nite.example/login?error=InvitationInvalid");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
