"use server";

import { getAuthenticatedNiteSession } from "./server-session";
import { recordApplicationEntry } from "./access";

export async function recordVisibleApplicationEntry(): Promise<void> {
  const session = await getAuthenticatedNiteSession();
  if (session) await recordApplicationEntry(session.bearer);
}
