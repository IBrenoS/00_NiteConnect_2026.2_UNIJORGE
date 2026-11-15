import { describe,expect,it } from "vitest";
import { parseDocumentInformation,parseLibraryListing,parseSearchPage,parseSentListing,parseSharedListing,parseTrashListing,parseVersionPage,resourceOwnerLabel,type DocumentIdentity } from "./library-contracts";

const folder={id:"11111111-1111-4111-8111-111111111111",parentId:null,name:"Meus arquivos",color:"#D6A432",kind:"PERSONAL",
  systemKey:null,ownerId:"22222222-2222-4222-8222-222222222222",ownerName:"Integrante",projectId:null,createdByName:"Integrante",
  createdAt:"2026-11-13T10:00:00Z",modifiedByName:"Integrante",modifiedAt:"2026-11-13T10:00:00Z"};
const file={id:"33333333-3333-4333-8333-333333333333",folderId:folder.id,title:"Ata.docx",context:"PERSONAL",ownerId:folder.ownerId,
  projectId:null,mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",revision:2,size:1024,ownerName:"Integrante",
  createdByName:"Integrante",createdAt:"2026-11-13T10:00:00Z",modifiedByName:"Integrante",modifiedAt:"2026-11-13T10:00:00Z",
  sharedByName:null,sharedAt:null,sharedWithCount:1,lastOpenedByName:null,lastOpenedAt:null,folderName:"Meus arquivos"};
const identity:DocumentIdentity={spaceOwnerId:folder.ownerId,resourceOwnerKind:"MEMBER",resourceOwnerId:folder.ownerId,
  createdBy:folder.ownerId,modifiedBy:folder.ownerId,createdFor:null,origin:"PERSONAL_CREATED",protection:"NONE",
  retentionHold:false,protectionReason:null,protectionSetBy:null,protectionRevision:0};
const capabilities={policyVersion:1,canView:true,canDownload:true,canEdit:true,canAddChild:false,
  canRename:true,canMove:true,canCopy:false,canShare:true,canDeleteToTrash:false,canRestore:false,
  canPermanentlyDelete:false,canArchiveInstitutionally:false,canManageProtection:false,
  deniedReasons:{canCopy:"STATE",canDeleteToTrash:"STATE"}};

describe("contratos da biblioteca documental",()=>{
  it("preserva metadados e cursor da listagem",()=>{
    const result=parseLibraryListing({folder:{...folder,effectivePermission:"EDIT"},folders:[{...folder,effectivePermission:"VIEW"}],files:[{...file,effectivePermission:"EDIT"}],totalFiles:11,nextCursor:"cursor-opaco",hasMore:true});
    expect(result?.files[0]?.sharedWithCount).toBe(1);
    expect(result?.files[0]?.effectivePermission).toBe("EDIT");
    expect(result?.folders[0]?.effectivePermission).toBe("VIEW");
    expect(result?.totalFiles).toBe(11);
    expect(result?.nextCursor).toBe("cursor-opaco");
    expect(result?.hasMore).toBe(true);
  });

  it("rejeita itens inválidos sem descartar o cursor silenciosamente",()=>{
    expect(parseLibraryListing({folder,folders:[],files:[{...file,id:"inválido"}],totalFiles:1,nextCursor:null,hasMore:false})).toBeNull();
  });

  it("preserva identidade e capacidades calculadas pelo backend",()=>{
    const result=parseLibraryListing({folder:{...folder,identity,capabilities},folders:[],
      files:[{...file,identity,capabilities}],totalFiles:1,nextCursor:null,hasMore:false});
    expect(result?.files[0]?.identity?.resourceOwnerKind).toBe("MEMBER");
    expect(result?.files[0]?.capabilities?.canShare).toBe(true);
    expect(parseLibraryListing({folder,folders:[],files:[{...file,identity,capabilities:{...capabilities,canShare:"yes"}}],
      totalFiles:1,nextCursor:null,hasMore:false})).toBeNull();
  });

  it("mostra o proprietário lógico sem atribuir conteúdo de gestão ao titular do espaço",()=>{
    expect(resourceOwnerLabel({...identity,resourceOwnerKind:"INSTITUTION",resourceOwnerId:null},"Gestora","Integrante")).toBe("NITE");
    expect(resourceOwnerLabel(identity,"Integrante","Outro titular")).toBe("Integrante");
    expect(resourceOwnerLabel({...identity,resourceOwnerKind:"UNKNOWN",resourceOwnerId:null},"Gestora","Integrante")).toBe("Não determinado");
  });

  it("reconhece somente referências compartilhadas com permissão explícita",()=>{
    const result=parseSharedListing({items:[{grantId:"44444444-4444-4444-8444-444444444444",id:file.id,type:"DOCUMENT",name:file.title,
      permission:"VIEW",ownerId:folder.ownerId,ownerName:"Integrante",sharedBy:folder.ownerId,sharedByName:"Integrante",
      sharedAt:"2026-11-13T10:00:00Z",modifiedAt:file.modifiedAt}],nextCursor:null,hasMore:false});
    expect(result?.items[0]?.permission).toBe("VIEW");
    expect(parseSharedListing({items:[{id:file.id,type:"DOCUMENT",name:file.title}],nextCursor:null,hasMore:false})).toBeNull();
  });

  it("valida compartilhamentos enviados, Lixeira, pesquisa e versões sem confiar em campos incompletos",()=>{
    const grant={id:"44444444-4444-4444-8444-444444444444",memberId:folder.ownerId,memberName:"Integrante",permission:"VIEW",grantedBy:folder.ownerId,grantedByName:"Gestão",createdAt:file.createdAt,revokedAt:null};
    expect(parseSentListing({items:[{id:file.id,type:"DOCUMENT",name:file.title,sharedAt:file.createdAt,recipients:[grant],identity,capabilities}],nextCursor:null,hasMore:false})?.items[0]?.recipients[0]?.permission).toBe("VIEW");
    expect(parseSentListing({items:[{id:file.id,type:"DOCUMENT",name:file.title,sharedAt:file.createdAt,recipients:[{...grant,permission:"ADMIN"}],identity,capabilities}],nextCursor:null,hasMore:false})).toBeNull();
    const trash={id:file.id,name:file.title,type:"DOCUMENT",resourceOwnerKind:"MEMBER",createdBy:folder.ownerId,createdByName:"Integrante",createdAt:file.createdAt,deletedBy:folder.ownerId,deletedByName:"Integrante",deletedAt:file.modifiedAt,originalFolderId:folder.id,originalFolderName:folder.name,origin:"PERSONAL_CREATED",protection:"NONE",retentionHold:false,size:file.size,subtreeItems:0,batchId:null};
    expect(parseTrashListing({items:[{item:trash,capabilities}],limit:50,offset:0,hasMore:false})?.items[0]?.item.id).toBe(file.id);
    expect(parseSearchPage({items:[{id:file.id,type:"DOCUMENT",name:file.title,mimeType:file.mimeType,size:file.size,createdAt:file.createdAt,modifiedAt:file.modifiedAt,identity,capabilities}],nextCursor:"cursor",hasMore:true})?.nextCursor).toBe("cursor");
    expect(parseVersionPage({items:[{id:grant.id,revision:1,size:10,createdBy:folder.ownerId,createdAt:file.createdAt,current:false}],nextBeforeRevision:1,hasMore:true})?.items[0]?.revision).toBe(1);
  });

  it("rejeita detalhes com grants malformados",()=>{
    const access={effectivePermission:"VIEW",canManage:false,grants:[],capabilities};
    const details={id:file.id,type:"DOCUMENT",name:file.title,extension:"docx",mimeType:file.mimeType,size:file.size,parentId:folder.id,parentName:folder.name,identity,createdBy:folder.ownerId,createdAt:file.createdAt,modifiedBy:folder.ownerId,modifiedAt:file.modifiedAt,lifecycleState:"ACTIVE",folderCount:0,fileCount:0,capabilities,access,activity:{items:[],nextCursor:null,hasMore:false}};
    expect(parseDocumentInformation(details)?.access.grants).toEqual([]);
    expect(parseDocumentInformation({...details,access:{...access,grants:[{grant:{memberName:"sem identificador"},origin:"DIRECT",sourceFolderId:null,depth:0}]}})).toBeNull();
  });
});
