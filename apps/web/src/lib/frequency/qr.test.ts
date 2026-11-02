import { describe, expect, it } from "vitest";
import { frequencyScanUrl, qrIdentityFromFrequencyUrl, tokenForFrequencyList, tokenFromFrequencyQr, tokenFromFragment } from "./qr";

const token = "A".repeat(43);
const origin = "https://nite.example.org";
const listId = "93000000-0000-4000-8000-000000000001";

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

  it("vincula a leitura interna à identidade da lista sem colocar token na query", () => {
    const url = frequencyScanUrl(token, origin, listId);
    expect(new URL(url).search).toBe("");
    expect(qrIdentityFromFrequencyUrl(url, origin)).toEqual({ token, listId });
    expect(qrIdentityFromFrequencyUrl(frequencyScanUrl(token, origin), origin)).toEqual({ token, listId: null });
    expect(tokenForFrequencyList({ token, listId }, listId)).toBe(token);
    expect(tokenForFrequencyList({ token, listId }, "93000000-0000-4000-8000-000000000002")).toBeNull();
    expect(tokenForFrequencyList({ token, listId: null }, listId)).toBeNull();
    expect(tokenFromFrequencyQr(url, origin)).toBe(token);
    expect(tokenFromFragment(new URL(url).hash)).toBe(token);
  });
});
