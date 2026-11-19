import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ authority: vi.fn(), session: vi.fn() }));
vi.mock("../../../../lib/auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.session }));
vi.mock("../../../../lib/projects/data", () => ({ getProjectAuthority: mocks.authority }));
vi.mock("../../../../components/projects/project-administration", () => ({ ProjectDetailsForm: () => <p>FORMULÁRIO PRIVADO</p> }));
vi.mock("../../../../components/projects/project-ui", () => ({ ProjectIssue: ({issue}:{issue:string}) => <p>{issue}</p> }));
import NewProjectPage from "./page";
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ bearer:"private", roles:["GESTOR_GERAL"] }); });
it("nega formulário com autoridade efetiva revogada",async () => {
 mocks.authority.mockResolvedValue({data:{canCreate:false},issue:null});
 const html=renderToStaticMarkup(await NewProjectPage()); expect(html).toContain("access"); expect(html).not.toContain("FORMULÁRIO PRIVADO");
});
it("permite formulário somente com autoridade confirmada sem expor bearer",async () => {
 mocks.authority.mockResolvedValue({data:{canCreate:true},issue:null});
 const result=await NewProjectPage(); expect(renderToStaticMarkup(result)).toContain("FORMULÁRIO PRIVADO"); expect(renderToStaticMarkup(result)).not.toContain("private");
});
it("não simula permissão quando API indisponível",async () => {
 mocks.authority.mockResolvedValue({data:null,issue:"unavailable"}); expect(renderToStaticMarkup(await NewProjectPage())).toContain("unavailable");
});
