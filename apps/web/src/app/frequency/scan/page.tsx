import { ScanHandoff } from "../../../components/frequency/scan-handoff";
import { getAuthenticatedNiteSession } from "../../../lib/auth/server-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirmar presença · Frequência" };

export default async function FrequencyScanPage() {
  const session = await getAuthenticatedNiteSession();
  return <ScanHandoff authenticated={session !== null} />;
}
