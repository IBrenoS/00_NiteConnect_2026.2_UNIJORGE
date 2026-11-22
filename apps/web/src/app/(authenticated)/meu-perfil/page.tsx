import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getOwnProfile } from "../../../lib/profile/data";
import { ProfileEditor } from "../../../components/profile/profile-editor";

export const metadata = { title: "Meu Perfil" };

export default async function MyProfilePage() {
  const session = await requireAuthenticatedNiteSession();
  const result = await getOwnProfile(session.bearer);
  if (!result.data) return <section className="mx-auto max-w-3xl rounded-panel border border-nite-border-soft bg-nite-surface p-6">
    <h1 className="font-display text-2xl font-semibold">Meu Perfil</h1>
    <p role="alert" className="mt-3 text-status-error">Não foi possível carregar seu perfil. Atualize a página e tente novamente.</p>
  </section>;
  return <ProfileEditor key={result.data.version} initial={result.data}/>;
}
