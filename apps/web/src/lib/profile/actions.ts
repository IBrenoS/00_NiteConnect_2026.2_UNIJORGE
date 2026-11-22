"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedNiteSession } from "../auth/server-session";
import { resolveApiUrl } from "../api/server";
import { parseMemberProfile, type MemberProfile } from "./contracts";

type Result = { data: MemberProfile | null; error: string | null };
const failure = (message: string): Result => ({ data: null, error: message });

async function send(path: string, method: "PATCH" | "POST" | "DELETE", body: string | FormData): Promise<Result> {
  const session = await requireAuthenticatedNiteSession();
  const url = resolveApiUrl(path);
  if (!url) return failure("Serviço de perfil indisponível.");
  try {
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${session.bearer}`, Accept: "application/json",
        ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      if (response.status === 409) return failure("O perfil foi alterado em outra sessão. Recarregue a página antes de salvar.");
      if (response.status === 400 || response.status === 413 || response.status === 415) return failure("Confira os campos e use uma foto JPEG ou PNG de até 2 MiB.");
      if (response.status === 401 || response.status === 403) return failure("Sua sessão não permite esta alteração. Entre novamente.");
      return failure("Não foi possível salvar o perfil. Tente novamente.");
    }
    const data = parseMemberProfile(await response.json());
    if (!data) return failure("O serviço retornou dados de perfil inválidos.");
    revalidatePath("/meu-perfil");
    revalidatePath("/", "layout");
    return { data, error: null };
  } catch {
    return failure("Serviço de perfil indisponível. Tente novamente.");
  }
}

export async function updateOwnProfile(input: { course: string; practiceArea: string; birthDate: string; expectedVersion: number }): Promise<Result> {
  if (!input || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0
    || input.course.length > 160 || input.practiceArea.length > 160
    || (input.birthDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate))) return failure("Confira os dados informados.");
  return send("/api/v1/me/profile", "PATCH", JSON.stringify({
    course: input.course || null, practiceArea: input.practiceArea || null,
    birthDate: input.birthDate || null, expectedVersion: input.expectedVersion,
  }));
}

export async function uploadOwnPhoto(form: FormData): Promise<Result> {
  const file = form.get("file");
  const version = Number(form.get("expectedVersion"));
  if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024
    || !["image/jpeg", "image/png"].includes(file.type) || !Number.isSafeInteger(version) || version < 0)
    return failure("Selecione uma foto JPEG ou PNG de até 2 MiB.");
  return send(`/api/v1/me/profile/photo?expectedVersion=${version}`, "POST", form);
}

export async function removeOwnPhoto(expectedVersion: number): Promise<Result> {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return failure("Versão do perfil inválida.");
  return send("/api/v1/me/profile/photo", "DELETE", JSON.stringify({ expectedVersion }));
}
