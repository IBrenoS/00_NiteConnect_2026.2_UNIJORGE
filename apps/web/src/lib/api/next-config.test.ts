import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("limite de Server Actions do Next.js", () => {
  it("permite requisições multipart de até 32 MiB com margem para o envelope", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("35mb");
  });
});
