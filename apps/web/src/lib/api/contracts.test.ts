import { expect, it } from "vitest";
import { apiIssueFromStatus } from "./contracts";
it("separa autenticação, autorização e indisponibilidade", () => {
 expect(apiIssueFromStatus(401)).toBe("unauthenticated");
 expect(apiIssueFromStatus(403)).toBe("access");
 expect(apiIssueFromStatus(503)).toBe("unavailable");
});
