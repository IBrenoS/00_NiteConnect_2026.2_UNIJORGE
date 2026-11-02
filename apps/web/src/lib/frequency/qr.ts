const qrTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const listIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tokenFromFragment(fragment: string): string | null {
  const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const params = new URLSearchParams(value);
  const tokens = params.getAll("t");
  const keys = [...params.keys()];
  const listIds = params.getAll("l");
  const validKeys = keys.length === 1 && keys[0] === "t" || keys.length === 2 && keys.includes("l") && keys.includes("t");
  const validListId = listIds.length === 0 || listIds.length === 1 && listIdPattern.test(listIds[0] ?? "");
  return validKeys && validListId && tokens.length === 1 && qrTokenPattern.test(tokens[0] ?? "") ? tokens[0] ?? null : null;
}

export function frequencyScanUrl(token: string, origin: string, listId?: string): string {
  if (!qrTokenPattern.test(token)) throw new TypeError("Token de Frequência inválido.");
  if (listId !== undefined && !listIdPattern.test(listId)) throw new TypeError("Lista de Frequência inválida.");
  const base = new URL(origin);
  const fragment = new URLSearchParams();
  if (listId) fragment.set("l", listId);
  fragment.set("t", token);
  return `${base.origin}/frequency/scan#${fragment}`;
}

export type FrequencyQrIdentity = { token: string; listId: string | null };

export function tokenForFrequencyList(identity: FrequencyQrIdentity, expectedListId: string): string | null {
  return identity.listId === expectedListId ? identity.token : null;
}

export function qrIdentityFromFrequencyUrl(value: string, origin: string): FrequencyQrIdentity | null {
  try {
    const url = new URL(value);
    const base = new URL(origin);
    if (url.origin !== base.origin || url.pathname !== "/frequency/scan" || url.search !== "") return null;
    const token = tokenFromFragment(url.hash);
    if (!token) return null;
    const params = new URLSearchParams(url.hash.slice(1));
    const listIds = params.getAll("l");
    return { token, listId: listIds[0] ?? null };
  } catch {
    return null;
  }
}

export function tokenFromFrequencyQr(value: string, origin: string): string | null {
  return qrIdentityFromFrequencyUrl(value, origin)?.token ?? null;
}
