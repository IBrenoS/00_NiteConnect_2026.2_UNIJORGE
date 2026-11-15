import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it } from "vitest";
import { DocumentSearchResults } from "./document-search-results";
import type { SearchPage } from "../../lib/documents/library-contracts";

describe("pesquisa documental",()=>{
  it("mantém filtros no cursor e apresenta apenas itens autorizados recebidos do servidor",()=>{
    const page:SearchPage={items:[],nextCursor:"cursor-opaco",hasMore:true};
    const html=renderToStaticMarkup(<DocumentSearchResults page={page} issue={null} memberId="integrante" filters={{search:"ata",type:"DOCUMENT",sortBy:"name"}}/>);
    expect(html).toContain('name="advanced" value="1"');
    expect(html).toContain('name="search"');
    expect(html).toContain("cursor=cursor-opaco");
    expect(html).toContain("search=ata");
    expect(html).toContain("Nenhum recurso encontrado");
  });
});
