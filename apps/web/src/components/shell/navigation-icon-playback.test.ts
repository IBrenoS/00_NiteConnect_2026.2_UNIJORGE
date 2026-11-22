import { describe, expect, it, vi } from "vitest";
import { createNavigationIconPlayback } from "./navigation-icon-playback";

function setup() {
  const player = { play: vi.fn(), pause: vi.fn(), seek: vi.fn() };
  const playback = createNavigationIconPlayback(() => player);
  return { player, playback };
}

describe("reprodução dos ícones", () => {
  it("aguarda ready e cancela uma entrada que terminou durante o carregamento", () => {
    const { player, playback } = setup();
    playback.interact("pointer", true);
    expect(player.play).not.toHaveBeenCalled();
    playback.interact("pointer", false);
    playback.ready();
    expect(player.play).not.toHaveBeenCalled();
    playback.interact("focus", true);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("não reinicia ao sobrepor foco e hover, sair ou reentrar durante um ciclo", () => {
    const { player, playback } = setup();
    playback.ready();
    playback.interact("pointer", true);
    playback.interact("focus", true);
    playback.interact("pointer", false);
    playback.interact("focus", false);
    playback.interact("pointer", true);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.seek).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
  });

  it("finaliza em repouso, sem loop, e só reproduz novamente numa nova interação", () => {
    const { player, playback } = setup();
    playback.ready();
    playback.interact("pointer", true);
    playback.complete();
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenLastCalledWith(0);
    playback.interact("focus", true);
    expect(player.play).toHaveBeenCalledTimes(1);
    playback.interact("pointer", false);
    playback.interact("focus", false);
    playback.interact("focus", true);
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it("interrompe imediatamente ao reduzir movimento, incluindo entradas pendentes", () => {
    const { player, playback } = setup();
    playback.interact("pointer", true);
    playback.setReducedMotion(true);
    playback.ready();
    expect(player.play).not.toHaveBeenCalled();
    playback.setReducedMotion(false);
    expect(player.play).not.toHaveBeenCalled();
    playback.interact("pointer", false);
    playback.interact("focus", true);
    expect(player.play).toHaveBeenCalledTimes(1);
    playback.setReducedMotion(true);
    expect(player.pause).toHaveBeenCalled();
    expect(player.seek).toHaveBeenLastCalledWith(0);
  });
  it("conclui depois de sair e permite uma nova entrada sem acumular reproduções", () => {
    const { player, playback } = setup();
    playback.ready();
    playback.interact("pointer", true);
    playback.interact("pointer", false);
    expect(player.pause).not.toHaveBeenCalled();
    playback.complete();
    playback.interact("focus", true);
    playback.interact("focus", true);
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it("mantém itens desabilitados estáticos mesmo com foco e hover", () => {
    const { player, playback } = setup();
    playback.setReducedMotion(true);
    playback.ready();
    playback.interact("pointer", true);
    playback.interact("focus", true);
    playback.interact("pointer", false);
    playback.interact("focus", false);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.seek).toHaveBeenLastCalledWith(0);
  });

});
