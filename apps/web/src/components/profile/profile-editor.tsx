"use client";

import { Button } from "../ui/button";

import { DatePicker } from "../ui";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MemberAvatar } from "../ui/member-avatar";
import { removeOwnPhoto, updateOwnProfile, uploadOwnPhoto } from "../../lib/profile/actions";
import type { MemberProfile } from "../../lib/profile/contracts";

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ProfileEditor({ initial }: { initial: MemberProfile }) {
  const [profile, setProfile] = useState(initial);
  const [course, setCourse] = useState(initial.course ?? "");
  const [area, setArea] = useState(initial.practiceArea ?? "");
  const [birthDate, setBirthDate] = useState(initial.birthDate ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const complete = (result: { data: MemberProfile | null; error: string | null }, success: string, photo = false) => {
    setPending(false);
    if (result.error || !result.data) { setError(result.error ?? "Não foi possível salvar."); setMessage(""); return; }
    setProfile(result.data);
    setError("");
    setMessage(success);
    if (photo) window.dispatchEvent(new Event("nite-profile-photo-updated"));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (birthDate && (birthDate < "1900-01-01" || birthDate > todayLocal())) {
      setError("Informe uma data de nascimento entre 1900 e hoje."); return;
    }
    setPending(true); setError(""); setMessage("");
    complete(await updateOwnProfile({ course, practiceArea: area, birthDate, expectedVersion: profile.version }), "Perfil salvo com sucesso.");
  };

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || pending) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("Selecione uma foto JPEG ou PNG de até 2 MiB."); return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("expectedVersion", String(profile.version));
    setPending(true); setError(""); setMessage("");
    complete(await uploadOwnPhoto(form), "Foto atualizada com sucesso.", true);
    if (fileRef.current) fileRef.current.value = "";
  };

  const remove = async () => {
    if (pending) return;
    setPending(true); setError(""); setMessage("");
    complete(await removeOwnPhoto(profile.version), "Foto removida com sucesso.", true);
  };

  return <div className="mx-auto max-w-3xl space-y-5">
    <header><p className="text-type-metadata font-semibold uppercase tracking-wide text-nite-text-muted">Conta institucional</p>
      <h1 className="mt-1 font-display text-3xl font-semibold text-nite-text-primary">Meu Perfil</h1>
      <p className="mt-2 text-nite-text-secondary">Atualize seus dados acadêmicos e sua foto de perfil.</p></header>
    <section aria-labelledby="photo-heading" className="rounded-panel border border-nite-border-soft bg-nite-surface p-5 sm:p-6">
      <h2 id="photo-heading" className="font-display text-xl font-semibold">Foto de perfil</h2>
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <MemberAvatar name={profile.name} memberId={profile.hasPhoto ? profile.id : null} size={80}/>
        <div className="min-w-0 flex-1 space-y-2"><label htmlFor="profile-photo" className="block text-type-body-compact font-medium">Escolher foto</label>
          <input ref={fileRef} id="profile-photo" type="file" accept="image/jpeg,image/png" disabled={pending}
            className="block w-full max-w-sm text-type-body-compact text-nite-text-secondary file:mr-3 file:rounded-control file:border-0 file:bg-nite-brand-soft file:px-3 file:py-2 file:text-nite-brand-accent"/>
          <p className="text-type-metadata text-nite-text-muted">JPEG ou PNG, até 2 MiB.</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><Button size="compact" variant="primary" type="button" onClick={upload} disabled={pending}>{profile.hasPhoto ? "Substituir foto" : "Adicionar foto"}</Button>
        {profile.hasPhoto && <Button size="compact" variant="secondary" type="button" onClick={remove} disabled={pending}>Remover foto</Button>}</div>
    </section>
    <form onSubmit={save} className="rounded-panel border border-nite-border-soft bg-nite-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Dados cadastrais</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div><label htmlFor="profile-name" className="block text-type-body-compact font-medium">Nome completo</label>
          <input id="profile-name" value={profile.name} readOnly className="mt-2 w-full rounded-control border border-nite-border-soft bg-nite-surface-subtle px-3 py-2 text-nite-text-secondary"/>
          <p className="mt-1 text-type-metadata text-nite-text-muted">Alterado pelo cadastro institucional.</p></div>
        <div><label htmlFor="profile-email" className="block text-type-body-compact font-medium">E-mail institucional</label>
          <input id="profile-email" value={profile.institutionalEmail} readOnly className="mt-2 w-full rounded-control border border-nite-border-soft bg-nite-surface-subtle px-3 py-2 text-nite-text-secondary"/>
          <p className="mt-1 text-type-metadata text-nite-text-muted">Vinculado à sua identidade Microsoft Entra.</p></div>
        <div><label htmlFor="profile-course" className="block text-type-body-compact font-medium">Curso</label>
          <input id="profile-course" value={course} maxLength={160} onChange={event => setCourse(event.target.value)} disabled={pending}
            className="mt-2 w-full rounded-control border border-nite-border-soft bg-nite-background px-3 py-2 focus-visible:outline-3 focus-visible:outline-nite-focus"/></div>
        <div><label htmlFor="profile-area" className="block text-type-body-compact font-medium">Área de atuação</label>
          <input id="profile-area" value={area} maxLength={160} onChange={event => setArea(event.target.value)} disabled={pending}
            className="mt-2 w-full rounded-control border border-nite-border-soft bg-nite-background px-3 py-2 focus-visible:outline-3 focus-visible:outline-nite-focus"/></div>
        <div><label htmlFor="profile-birth" className="block text-type-body-compact font-medium">Data de nascimento</label>
          <DatePicker id="profile-birth"  min="1900-01-01" max={todayLocal()} value={birthDate}
            onChange={event => setBirthDate(event.target.value)} disabled={pending}/>
          <p className="mt-1 text-type-metadata text-nite-text-muted">Visível apenas no seu perfil.</p></div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3"><Button size="compact" variant="primary" type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</Button>
        {error && <Button size="compact" variant="secondary" type="button" onClick={() => router.refresh()}>Recarregar perfil</Button>}</div>
      <div aria-live="polite" className="mt-3">{message && <p role="status" className="text-status-success">{message}</p>}
        {error && <p role="alert" className="text-status-error">{error}</p>}</div>
    </form>
  </div>;
}
