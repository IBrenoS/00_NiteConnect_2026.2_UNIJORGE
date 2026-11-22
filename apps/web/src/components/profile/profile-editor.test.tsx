import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProfileEditor } from "./profile-editor";
import { MemberAvatar } from "../ui/member-avatar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../lib/profile/actions", () => ({ updateOwnProfile: vi.fn(), uploadOwnPhoto: vi.fn(), removeOwnPhoto: vi.fn() }));
vi.mock("../../lib/projects/actions", () => ({ decideProjectMembershipAction: vi.fn() }));

const profile = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Ana Silva",
  institutionalEmail: "ana@unijorge.com.br", course: null, practiceArea: null,
  birthDate: null, hasPhoto: true, version: 2 };

describe("Meu Perfil e avatar", () => {
  it("exibe identidade institucional somente leitura e campos opcionais editáveis", () => {
    const html = renderToStaticMarkup(<ProfileEditor initial={profile}/>);
    expect(html).toContain("Meu Perfil");
    expect(html).toContain('id="profile-email"');
    expect(html).toMatch(/id="profile-email"[^>]*readOnly/i);
    expect(html).toContain('id="profile-course"');
    expect(html).toContain('id="profile-birth"');
    expect(html).toContain("Remover foto");
  });

  it("usa foto autenticada e iniciais na alternativa", () => {
    const photo = renderToStaticMarkup(<MemberAvatar name="Ana Silva" memberId={profile.id}/>);
    const fallback = renderToStaticMarkup(<MemberAvatar name="Ana Silva"/>);
    expect(photo).toContain(`/api/profile-photos/${profile.id}`);
    expect(fallback).toContain("AS");
  });
});
