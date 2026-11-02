const qrTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function tokenFromFragment(fragment: string): string | null {
  const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const params = new URLSearchParams(value);
  const tokens = params.getAll("t");
  const keys = [...params.keys()];
  return keys.length === 1 && keys[0] === "t" && tokens.length === 1 && qrTokenPattern.test(tokens[0] ?? "") ? tokens[0] ?? null : null;
}

export function frequencyScanUrl(token: string, origin: string): string {
  if (!qrTokenPattern.test(token)) throw new TypeError("Token de Frequência inválido.");
  const base = new URL(origin);
  return `${base.origin}/frequency/scan#t=${encodeURIComponent(token)}`;
}

export function tokenFromFrequencyQr(value: string, origin: string): string | null {
  try {
    const url = new URL(value);
    const base = new URL(origin);
    if (url.origin !== base.origin || url.pathname !== "/frequency/scan" || url.search !== "") return null;
    return tokenFromFragment(url.hash);
  } catch {
    return null;
  }
}
