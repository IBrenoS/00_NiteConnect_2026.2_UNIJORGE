function isApplicationOrigin(value: string | undefined, allowLocalHttp: boolean): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const localHttp = allowLocalHttp && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    return (
      (url.protocol === "https:" || localHttp) &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function isApiScope(value: string | undefined): boolean {
  return Boolean(value && /^(?:api:\/\/|https:\/\/)[^\s/]+\/[^\s]+$/.test(value));
}

export function meetingsGraphConsentScope(apiScope: string | undefined): string | null {
  if (typeof apiScope !== "string" || !isApiScope(apiScope) || /[?#]/.test(apiScope)) return null;
  const finalSlash = apiScope.lastIndexOf("/");
  if (finalSlash <= 0 || finalSlash === apiScope.length - 1) return null;
  return `${apiScope.slice(0, finalSlash)}/.default`;
}

export function isAuthConfigured(): boolean {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  return Boolean(
    process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 &&
      clientId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId) &&
      process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
      tenantId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId) &&
      isApiScope(process.env.ENTRA_API_SCOPE) &&
      isApplicationOrigin(process.env.API_BASE_URL, true) &&
      isApplicationOrigin(process.env.AUTH_URL, true),
  );
}

export function entraIssuer(): string {
  const tenantId = process.env.ENTRA_TENANT_ID;
  return tenantId ? `https://login.microsoftonline.com/${tenantId}/v2.0` : "";
}
