export function cameraStartErrorMessage(name: string): string {
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "A permissão da câmera foi negada. Autorize o acesso no navegador e tente novamente.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhuma câmera disponível foi encontrada neste dispositivo.";
  }
  return "Não foi possível iniciar a câmera. Verifique a permissão e tente novamente.";
}
