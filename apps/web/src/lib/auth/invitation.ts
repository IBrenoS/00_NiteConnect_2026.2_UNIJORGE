/** Invoked with the newly issued API access token in the Microsoft sign-in callback. */
export async function acceptInvitationForSignIn(
  id: string,
  accessToken: string,
  apiBaseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
  const base = new URL(apiBaseUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
    throw new TypeError("API_BASE_URL deve usar HTTPS fora do ambiente local.");
  }
  const endpoint = new URL(`/api/v1/invitations/${id}/accept`, base);
  const result = await fetcher(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  return result.ok;
}
