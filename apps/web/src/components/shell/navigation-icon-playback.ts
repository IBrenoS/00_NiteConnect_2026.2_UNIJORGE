export type IconInteraction = "pointer" | "focus";
type Player = { play: () => void; pause: () => void; seek: (frame: number) => void };

// A saída conclui o ciclo curto, cujo último desenho é idêntico ao primeiro.
// Isso evita tanto cortes abruptos quanto inversões no meio de ações semânticas.
export function createNavigationIconPlayback(player: () => Player | null) {
  const interactions = new Set<IconInteraction>();
  let loaded = false;
  let reduced = false;
  let running = false;
  let consumed = false;
  const rest = () => { player()?.pause(); player()?.seek(0); };
  const start = () => {
    if (!loaded || reduced || running || consumed || !interactions.size) return;
    running = true;
    consumed = true;
    player()?.play();
  };
  return {
    interact(source: IconInteraction, active: boolean) {
      if (active) interactions.add(source);
      else interactions.delete(source);
      if (!interactions.size) consumed = false;
      start();
    },
    ready() { loaded = true; if (reduced) rest(); else start(); },
    complete() {
      running = false;
      rest();
      consumed = interactions.size > 0;
    },
    setReducedMotion(value: boolean) {
      reduced = value;
      if (!value) return;
      running = false;
      consumed = interactions.size > 0;
      if (loaded) rest();
    },
  };
}
