import { expect,it } from "vitest";
import { documentReturnTo } from "./navigation";
const id="11111111-1111-4111-8111-111111111111";
it("preserva retorno contextual e pesquisa com espaços codificados",()=>{
 const path=`/meus-projetos/${id}/documentos?folder=${id}&search=plano+real`;
 expect(documentReturnTo(path)).toBe(path);
 expect(documentReturnTo(`/meus-projetos/${id}/documentos/lixeira?sortBy=name`)).toContain("/lixeira?");
 expect(documentReturnTo("/documentos?view=shared")).toBe("/documentos?view=shared");
});
it.each(["https://evil.invalid","//evil.invalid/documentos","/dashboard","/documentos#fragment","/meus-projetos/not-id/documentos","/documentos\\evil","/documentos\n"])("rejeita retorno inseguro %s",path=>{expect(documentReturnTo(path)).toBe("/documentos");});
