import { describe, expect, it } from "vitest";
import { cameraStartErrorMessage } from "./scanner";

describe("erros de inicialização do scanner", () => {
  it("orienta quando o integrante nega a permissão da câmera", () => {
    expect(cameraStartErrorMessage("NotAllowedError")).toContain("permissão da câmera foi negada");
    expect(cameraStartErrorMessage("PermissionDeniedError")).toContain("Autorize o acesso no navegador");
  });

  it("informa quando o dispositivo não tem câmera e trata falhas genéricas", () => {
    expect(cameraStartErrorMessage("NotFoundError")).toContain("Nenhuma câmera disponível");
    expect(cameraStartErrorMessage("NotReadableError")).toContain("Verifique a permissão");
  });
});
