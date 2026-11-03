import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { probeMeetingCalendar } from "./meetings-graph-probe";

describe("prova de capacidade do calendário Teams", () => {
  it("chama apenas a API NITE com o bearer no servidor e retorna as capacidades", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      allowedOnlineMeetingProviders: ["teamsForBusiness"],
      defaultOnlineMeetingProvider: "teamsForBusiness",
      supportsTeamsForBusiness: true,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(probeMeetingCalendar("api-token-test", "http://localhost:8080", fetcher)).resolves.toEqual({
      status: "AVAILABLE",
      capabilities: {
        allowedOnlineMeetingProviders: ["teamsForBusiness"],
        defaultOnlineMeetingProvider: "teamsForBusiness",
        supportsTeamsForBusiness: true,
      },
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("http://localhost:8080/api/v1/meetings/calendar/capabilities"),
      expect.objectContaining({
        headers: { Authorization: "Bearer api-token-test", Accept: "application/json" },
        cache: "no-store",
        redirect: "error",
      }),
    );
  });

  it("expõe apenas status e código interno quando OBO/API falha", async () => {
    const rawMessage = "AADSTS65001: sensitive provider detail";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      status: 403,
      code: "OBO_CONSENT_REQUIRED",
      detail: rawMessage,
    }), { status: 403, headers: { "Content-Type": "application/problem+json" } }));

    const result = await probeMeetingCalendar("api-token-test", "http://localhost:8080", fetcher);

    expect(result).toEqual({ status: "API_ERROR", httpStatus: 403, code: "OBO_CONSENT_REQUIRED" });
    expect(JSON.stringify(result)).not.toContain(rawMessage);
  });

  it("não encaminha bearer por HTTP para origem que não seja loopback", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(probeMeetingCalendar("api-token-test", "http://api.example.edu", fetcher)).resolves.toEqual({
      status: "UNAVAILABLE",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
