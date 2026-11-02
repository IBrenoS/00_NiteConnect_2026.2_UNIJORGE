import { HandoffConfirmation } from "../../../../components/frequency/handoff-confirmation";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Concluir confirmação · Frequência" };

export default async function FrequencyConfirmPage() {
  await requireAuthenticatedNiteSession();
  return <HandoffConfirmation />;
}
