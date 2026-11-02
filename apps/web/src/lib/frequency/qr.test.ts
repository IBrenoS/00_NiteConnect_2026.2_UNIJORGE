import { describe, expect, it } from "vitest";
import { frequencyScanUrl, tokenFromFrequencyQr, tokenFromFragment } from "./qr";

const token = "A".repeat(43);
const origin = "https://nite.example.org";

describe("endereços temporários do QR da Frequência", () => {
  it("gera URL same-origin com token somente no fragmento", () => {
    const url = new URL(frequencyScanUrl(token, origin));
    expect(url.pathname).toBe("/frequency/scan");
    expect(url.search).toBe("");
    expect(tokenFromFragment(url.hash)).toBe(token);
  });

  it("aceita somente QR da rota de scan nesta origem e sem query string", () => {
    expect(tokenFromFrequencyQr(frequencyScanUrl(token, origin), origin)).toBe(token);
    expect(tokenFromFrequencyQr(`https://evil.example/frequency/scan#t=${token}`, origin)).toBeNull();
    expect(tokenFromFrequencyQr(`${origin}/frequency/scan?token=${token}#t=${token}`, origin)).toBeNull();
    expect(tokenFromFrequencyQr(`${origin}/frequency/confirm#t=${token}`, origin)).toBeNull();
    expect(tokenFromFragment("#t=bad")).toBeNull();
  });
});
