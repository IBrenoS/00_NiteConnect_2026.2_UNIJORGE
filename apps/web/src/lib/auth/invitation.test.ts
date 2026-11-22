import { describe, expect, it, vi } from "vitest";
import { acceptInvitationForSignIn } from "./invitation";

const id = "11111111-1111-4111-8111-111111111111";

describe("aceite no callback Microsoft", () => {
  it("envia o token Microsoft recebido ao backend para sessão nova ou SSO existente", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await acceptInvitationForSignIn(id, "access-token", "https://api.example.test", fetcher)).toBe("success");
    expect(fetcher).toHaveBeenCalledWith(new URL(`https://api.example.test/api/v1/invitations/${id}/accept`),
      expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer access-token" }, cache: "no-store" }));
  });

  it("nega aceite recusado e não chama o backend com identificador inválido", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(await acceptInvitationForSignIn(id, "access-token", "https://api.example.test", fetcher)).toBe("different-account");
    expect(await acceptInvitationForSignIn("bad", "access-token", "https://api.example.test", fetcher)).toBe("invalid");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("separa conflito de convite de falha temporária sem consultar dados do destinatário", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await acceptInvitationForSignIn(id, "token", "https://api.example.test", fetcher)).toBe("expired-or-revoked");
    expect(await acceptInvitationForSignIn(id, "token", "https://api.example.test", fetcher)).toBe("temporary-failure");
  });
});
