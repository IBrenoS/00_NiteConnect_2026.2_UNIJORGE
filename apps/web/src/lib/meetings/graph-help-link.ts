const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function meetingGraphHelpHref(nodeEnvironment: string | undefined, hostHeader: string | null): string | null {
  if (nodeEnvironment !== "development" || !hostHeader) return null;

  const host = hostHeader.trim().toLowerCase();
  const hostname = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.split(":", 1)[0];

  return localHostnames.has(hostname) ? "/dev/meetings-graph-consent/calendar" : null;
}
