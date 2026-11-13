import { describe,expect,it } from "vitest";
import { parseLibraryListing,parseSharedListing } from "./library-contracts";

const folder={id:"11111111-1111-4111-8111-111111111111",parentId:null,name:"Meus arquivos",color:"#D6A432",kind:"PERSONAL",
  systemKey:null,ownerId:"22222222-2222-4222-8222-222222222222",ownerName:"Integrante",projectId:null,createdByName:"Integrante",
  createdAt:"2026-11-13T10:00:00Z",modifiedByName:"Integrante",modifiedAt:"2026-11-13T10:00:00Z"};
const file={id:"33333333-3333-4333-8333-333333333333",folderId:folder.id,title:"Ata.docx",context:"PERSONAL",ownerId:folder.ownerId,
  projectId:null,mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",revision:2,size:1024,ownerName:"Integrante",
  createdByName:"Integrante",createdAt:"2026-11-13T10:00:00Z",modifiedByName:"Integrante",modifiedAt:"2026-11-13T10:00:00Z",
  sharedByName:null,sharedAt:null,sharedWithCount:1,lastOpenedByName:null,lastOpenedAt:null,folderName:"Meus arquivos"};

describe("contratos da biblioteca documental",()=>{
  it("preserva metadados e cursor da listagem",()=>{
    const result=parseLibraryListing({folder,folders:[],files:[file],totalFiles:11,nextCursor:"cursor-opaco",hasMore:true});
    expect(result?.files[0]?.sharedWithCount).toBe(1);
    expect(result?.totalFiles).toBe(11);
    expect(result?.nextCursor).toBe("cursor-opaco");
    expect(result?.hasMore).toBe(true);
  });

  it("rejeita itens inválidos sem descartar o cursor silenciosamente",()=>{
    expect(parseLibraryListing({folder,folders:[],files:[{...file,id:"inválido"}],totalFiles:1,nextCursor:null,hasMore:false})).toBeNull();
  });

  it("reconhece somente referências compartilhadas com permissão explícita",()=>{
    const result=parseSharedListing({items:[{grantId:"44444444-4444-4444-8444-444444444444",id:file.id,type:"DOCUMENT",name:file.title,
      permission:"VIEW",ownerId:folder.ownerId,ownerName:"Integrante",sharedBy:folder.ownerId,sharedByName:"Integrante",
      sharedAt:"2026-11-13T10:00:00Z",modifiedAt:file.modifiedAt}],nextCursor:null,hasMore:false});
    expect(result?.items[0]?.permission).toBe("VIEW");
    expect(parseSharedListing({items:[{id:file.id,type:"DOCUMENT",name:file.title}],nextCursor:null,hasMore:false})).toBeNull();
  });
});
