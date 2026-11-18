import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../lib/documents/library-actions", () => ({
  createLibraryFolder: vi.fn(),
  createPersonalTemplateCopy: vi.fn(),
  organizeLibraryFile: vi.fn(),
  updateLibraryFolder: vi.fn(),
}));

import { CreateMenuActions, DetailsPanel, MyFilesExplorer, SelectionToolbar, toggleDetailsPanel } from "./my-files-explorer";
import type { LibraryFolder } from "../../lib/documents/library-contracts";

describe("explorador Meus arquivos", () => {
  it("compartilha as opções e os ícones dos dois menus de criação e carregamento",()=>{
    for(const variant of ["title","primary"] as const) {
      const html=renderToStaticMarkup(<CreateMenuActions variant={variant} onClose={()=>undefined} onCreateFolder={()=>undefined} onUploadFiles={()=>undefined} onUploadFolder={()=>undefined}/>);
      expect(html).toContain(variant==="title"?"Nova pasta":"Pasta");
      expect(html).toContain("Carregamento de arquivos");
      expect(html).toContain("Carregamento de pasta");
      expect(html).toContain("border-t border-nite-border-soft");
      expect(html).not.toContain("Solicitar arquivos");
      for(const icon of ["upload-file","upload-folder"])expect(html).toContain(`/icons/onedrive-menu/${icon}.svg`);
    }
  });

  it("fecha os detalhes quando o controle contextual é acionado pela segunda vez", () => {
    const onOpen = vi.fn(), onClose = vi.fn();

    toggleDetailsPanel(true, onOpen, onClose);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();

    toggleDetailsPanel(false, onOpen, onClose);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("mantém o contador de seleção com borda própria",()=>{
    const html=renderToStaticMarkup(<SelectionToolbar
      items={[{id:"folder-1",name:"Pasta de exemplo",kind:"folder"}]}
      view="personal"
      details={false}
      canArchivePersonal
      onShare={vi.fn()}
      onCopyLink={vi.fn()}
      onDownload={vi.fn()}
      onArchive={vi.fn()}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onAutomate={vi.fn()}
      onClear={vi.fn()}
      onDetails={vi.fn()}
    />);
    const clearSelectionButton=html.match(/<button type="button" aria-label="Limpar seleção" class="([^"]+)"/)?.[1]??"";
    expect(clearSelectionButton).toContain("border border-nite-border-soft");
    expect(html).toContain("1 selecionado");
  });

  it("mantém a seleção e as ações compatíveis na barra contextual", () => {
    const folder = { id: "folder-1", name: "Pasta de exemplo", kind: "folder" as const };
    const oneSelected = renderToStaticMarkup(<SelectionToolbar
      items={[folder]}
      view="personal"
      details={false}
      canArchivePersonal
      onShare={vi.fn()}
      onCopyLink={vi.fn()}
      onDownload={vi.fn()}
      onArchive={vi.fn()}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onAutomate={vi.fn()}
      onClear={vi.fn()}
      onDetails={vi.fn()}
    />);
    expect(oneSelected).toContain("1 selecionado");
    expect(oneSelected).toContain('role="toolbar" aria-label="Ações para a seleção"');
    expect(oneSelected).toContain("/icons/onedrive-menu/details.svg");
    for (const action of ["Compartilhar", "Copiar link", "Solicitar arquivos", "Excluir", "Adicionar aos favoritos", "Baixar", "Duplicar", "Mover para", "Copiar para", "Renomear"]) {
      expect(oneSelected).toContain(action);
    }
    expect(oneSelected).toMatch(/<summary aria-label="Mais opções de organização"/);
    expect(oneSelected).not.toContain('disabled="" title="Selecione apenas um item para copiar o link interno."');
    expect(oneSelected).toContain('aria-label="Limpar seleção"');
    const closedMenu=oneSelected.match(/<details[^>]*>(.*?)<\/details>/)?.[1]??"";
    expect(closedMenu).toContain("Renomear");
    expect(closedMenu).toContain("Automatizar");
    expect(closedMenu.indexOf("Renomear")).toBeLessThan(closedMenu.indexOf("Automatizar"));
    expect(closedMenu).not.toContain("Duplicar");
    expect(closedMenu).not.toContain("Mover para");
    expect(closedMenu).not.toContain("Copiar para");
    const closedToolbar=oneSelected.split("<details")[0]??"";
    expect(closedToolbar).toContain("Duplicar");
    expect(closedToolbar).toContain("Mover para");
    expect(closedToolbar).toContain("Copiar para");

    const detailsExpanded=renderToStaticMarkup(<SelectionToolbar
      items={[folder]}
      view="personal"
      details
      canArchivePersonal
      onShare={vi.fn()}
      onCopyLink={vi.fn()}
      onDownload={vi.fn()}
      onArchive={vi.fn()}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onAutomate={vi.fn()}
      onClear={vi.fn()}
      onDetails={vi.fn()}
    />);
    const expandedMenu=detailsExpanded.match(/<details[^>]*>(.*?)<\/details>/)?.[1]??"";
    for (const action of ["Renomear", "Automatizar"]) {
      expect(expandedMenu).toContain(action);
    }
    const expandedToolbar=detailsExpanded.split("<details")[0]??"";
    for (const action of ["Duplicar", "Mover para", "Copiar para"]) expect(expandedToolbar).toContain(action);

    const twoSelected = renderToStaticMarkup(<SelectionToolbar
      items={[folder, { ...folder, id: "folder-2", name: "Outra pasta" }]}
      view="personal"
      details={false}
      canArchivePersonal
      onShare={vi.fn()}
      onCopyLink={vi.fn()}
      onDownload={vi.fn()}
      onArchive={vi.fn()}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onAutomate={vi.fn()}
      onClear={vi.fn()}
      onDetails={vi.fn()}
    />);
    expect(twoSelected).toContain("2 selecionados");
    expect(twoSelected).not.toContain("Compartilhar");
    expect(twoSelected).not.toContain("Copiar link");
    expect(twoSelected).not.toContain("Solicitar arquivos");
    expect(twoSelected).toContain("Copiar para");
    expect(twoSelected).toContain("Renomear");
    expect(twoSelected).toContain("Automatizar");
    expect(twoSelected).toContain('disabled="" title="Ação em lote ainda não está disponível para esta operação."');
  });

  it("exibe exclusão pessoal conforme capacidade, sem depender de papel de gestão",()=>{
    const item={id:"folder-1",name:"Pasta de exemplo",kind:"folder" as const};
    const manager=renderToStaticMarkup(<SelectionToolbar items={[item]} view="personal" canArchivePersonal details={false} onShare={vi.fn()} onCopyLink={vi.fn()} onDownload={vi.fn()} onArchive={vi.fn()} onRename={vi.fn()} onMove={vi.fn()} onClear={vi.fn()} onDetails={vi.fn()}/>);
    expect(manager).toContain("Excluir");
    expect(manager).toContain("Exclusão não autorizada para este item.");
    const member=renderToStaticMarkup(<SelectionToolbar items={[item]} view="personal" details={false} onShare={vi.fn()} onCopyLink={vi.fn()} onDownload={vi.fn()} onArchive={vi.fn()} onRename={vi.fn()} onMove={vi.fn()} onClear={vi.fn()} onDetails={vi.fn()}/>);
    expect(member).toContain("Excluir");
    const shared=renderToStaticMarkup(<SelectionToolbar items={[item]} view="shared" canArchivePersonal details={false} onShare={vi.fn()} onCopyLink={vi.fn()} onDownload={vi.fn()} onArchive={vi.fn()} onRename={vi.fn()} onMove={vi.fn()} onClear={vi.fn()} onDetails={vi.fn()}/>);
    expect(shared).not.toContain("Excluir");
  });

  it("usa capacidades do backend para desabilitar ações sobre item protegido",()=>{
    const folder:LibraryFolder={id:"11467e62-310f-45b0-b0c4-54c17a3c06d1",parentId:null,name:"Pasta protegida",
      color:"#d6a432",kind:"CUSTOM",systemKey:null,ownerId:null,ownerName:null,projectId:null,
      createdByName:null,createdAt:null,modifiedByName:null,modifiedAt:"2026-11-13T12:00:00Z",
      capabilities:{policyVersion:1,canView:true,canDownload:false,canEdit:false,canAddChild:false,
        canRename:false,canMove:false,canCopy:false,canShare:false,canDeleteToTrash:false,
        canRestore:false,canPermanentlyDelete:false,canArchiveInstitutionally:false,canManageProtection:false,
        deniedReasons:{canRename:"PROTECTED",canMove:"PROTECTED",canShare:"PROTECTED"}}};
    const html=renderToStaticMarkup(<SelectionToolbar items={[{id:folder.id,name:folder.name,kind:"folder",folder}]}
      view="personal" details={false} canArchivePersonal onShare={vi.fn()} onCopyLink={vi.fn()}
      onDownload={vi.fn()} onArchive={vi.fn()} onRename={vi.fn()} onMove={vi.fn()} onClear={vi.fn()}
      onDetails={vi.fn()}/>);
    expect(html).toContain("Compartilhamento não está disponível para esta seleção.");
    expect(html).toContain("Este item não pode ser movido neste contexto.");
    expect(html).toContain("Este item não pode ser renomeado neste contexto.");
    expect(html).toContain("Exclusão não autorizada para este item.");
  });

  it("organiza a página sem incluir a busca global e mantém a lista detalhada", () => {
    const html = renderToStaticMarkup(<MyFilesExplorer
      listing={{
        folder: {
          id: "11467e62-310f-45b0-b0c4-54c17a3c06d1",
          parentId: null,
          name: "BRENO CERQUEIRA DOS SANTOS",
          color: "#d6a432",
          kind: "ROOT",
          systemKey: null,
          ownerId: null,
          ownerName: "BRENO CERQUEIRA DOS SANTOS",
          projectId: null,
          createdByName: null,
          createdAt: null,
          modifiedByName: "BRENO CERQUEIRA DOS SANTOS",
          modifiedAt: "2026-11-13T12:00:00Z",
          capabilities:{policyVersion:1,canView:true,canDownload:false,canEdit:false,canAddChild:true,
            canRename:false,canMove:false,canCopy:false,canShare:true,canDeleteToTrash:false,
            canRestore:false,canPermanentlyDelete:false,canArchiveInstitutionally:false,canManageProtection:false,deniedReasons:{}},
        },
        folders: [{
          id: "21467e62-310f-45b0-b0c4-54c17a3c06d1",
          parentId: "11467e62-310f-45b0-b0c4-54c17a3c06d1",
          name: "Pasta de exemplo",
          color: "#f6c445",
          kind: "CUSTOM",
          systemKey: null,
          ownerId: null,
          ownerName: "BRENO CERQUEIRA DOS SANTOS",
          projectId: null,
          createdByName: "BRENO CERQUEIRA DOS SANTOS",
          createdAt: "2026-11-13T12:00:00Z",
          modifiedByName: "BRENO CERQUEIRA DOS SANTOS",
          modifiedAt: "2026-11-13T12:00:00Z",
          capabilities:{policyVersion:1,canView:true,canDownload:false,canEdit:false,canAddChild:false,
            canRename:false,canMove:false,canCopy:false,canShare:false,canDeleteToTrash:false,
            canRestore:false,canPermanentlyDelete:false,canArchiveInstitutionally:false,canManageProtection:false,deniedReasons:{}},
        }],
        files: [],
        totalFiles: 0,
        nextCursor: null,
        hasMore: false,
      }}
      issue={null}
      view="personal"
      templates={[]}
      params={{}}
    />);

    expect(html).toContain("Meus arquivos");
    expect(html).toContain("/icons/onedrive-menu/page.svg");
    expect(html).toContain("/icons/onedrive-menu/options.svg");
    expect(html).toContain("/icons/onedrive-menu/details.svg");
    expect(html).toContain("lg:h-[calc(100svh-6.25rem)]");
    expect(html).toContain("lg:mb-[-1.75rem]");
    expect(html).toContain("h-[calc(100svh-6.5rem)]");
    expect(html).toContain("grid h-full min-h-0 min-w-0 items-stretch");
    expect(html).toContain('aria-label="Criar ou carregar pelo título"');
    expect(html).toContain("min-h-9 items-center gap-2.5 rounded-xl");
    expect(html).toContain("py-2 pl-2.5 pr-3 text-sm");
    expect(html).toContain("Nova pasta");
    expect(html).toContain("Carregamento de arquivos");
    expect(html).toContain("Carregamento de pasta");
    expect(html).toContain("Solicitar arquivos");
    expect(html).toContain("/icons/onedrive-menu/upload-file.svg");
    expect(html).toContain("/icons/onedrive-menu/upload-folder.svg");
    expect(html).toContain('aria-label="Selecionar arquivos para carregar"');
    expect(html).toContain('aria-label="Selecionar pasta para carregar"');
    expect(html).toContain("bg-nite-surface-elevated");
    expect(html).toContain("Criar ou carregar");
    expect(html).not.toContain("Alterações salvas.");
    expect(html).not.toContain("Upload concluído.");
    const createButton=html.match(/<button type="button" aria-expanded="false" style="[^"]+" class="[^"]*">.*?Criar ou carregar<\/button>/)?.[0];
    expect(createButton).toBeDefined();
    expect(createButton).not.toContain(' disabled=""');
    expect(html).toContain('aria-label="Filtros rápidos por tipo"');
    expect(html).toContain("NiteConnect-Word.svg");
    expect(html).toContain("NiteConnect-Excel.svg");
    expect(html).toContain("NiteConnect-PowerPoint.svg");
    expect(html).toContain("NiteConnect-PDF.svg");
    expect(html).toContain("NiteConnect-Filtro.svg");
    expect(html).toContain("Word");
    expect(html).toContain("PowerPoint ainda não é aceito no módulo documental");
    expect(html).toContain("Compartilhamento");
    expect(html).toContain("Compartilhamento</span>");
    expect(html).toContain("Atividade");
    expect(html).toMatch(/<thead class="[^"]*text-sm[^"]*"/);
    expect(html).toContain("2xl:w-[56px]");
    expect(html).toContain("2xl:w-auto");
    expect(html).toContain("2xl:w-[200px]");
    expect(html).not.toContain('aria-label="Selecionar todas as linhas"');
    expect(html).toContain("overflow-x-hidden overflow-y-auto");
    expect(html).not.toContain("min-w-[680px]");
    expect(html).toContain('aria-label="Selecionar Pasta de exemplo"');
    expect(html).not.toContain("Selecionar todos os itens desta página");
    expect(html).toContain('aria-label="Mais ações para Pasta de exemplo"');
    expect(html).toContain('<td class="min-w-0 px-3 py-2"><div class="relative flex min-w-0 items-center gap-2"');
    expect(html).toContain("absolute left-0 top-0 z-50 w-60");
    expect(html).not.toContain("overflow-y-auto rounded-[8px]");
    expect(html).toContain("size-7 shrink-0");
    expect(html).toContain("size-7 shrink-0");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-label="Ações para Pasta de exemplo"');
    expect(html).toContain("/icons/onedrive-menu/share.svg");
    expect(html).toContain("/icons/onedrive-menu/folder-color.svg");
    expect(html).toContain('aria-label="Cor atual: Amarelo"');
    for (const action of ["Compartilhar", "Copiar link", "Solicitar arquivos", "Gerenciar acesso", "Excluir", "Adicionar aos favoritos", "Baixar", "Renomear", "Mover para", "Copiar para", "Duplicata", "Cor da pasta", "Detalhes"]) {
      expect(html).toContain(action);
    }
    expect(html).toContain("Automatizar");
    expect(html).toContain("Automações");
    expect(html).toContain("Renomear");
    expect(html).toContain('aria-label="Adicionar Pasta de exemplo aos favoritos"');
    expect(html).not.toContain("pastas · 0 arquivos");
    expect(html).not.toContain('role="search"');
    expect(html).not.toContain("Pesquisar arquivos e pastas");
    expect(html).not.toContain('aria-label="Visões dos arquivos"');
    expect(html).toContain("Criar ou carregar");
  });

  it("apresenta confirmação quando uma mutação redireciona com sucesso",()=>{
    const html=renderToStaticMarkup(<MyFilesExplorer listing={null} issue={null} view="personal" templates={[]} params={{saved:"1"}}/>);
    expect(html).toContain('role="status"');
    expect(html).toContain("Alteração concluída e listagem atualizada.");
    expect(html).toContain('data-transient-feedback=""');
  });

  it("mantém falha de carregamento persistente e torna apenas o retorno da operação temporário",()=>{
    const structural=renderToStaticMarkup(<MyFilesExplorer listing={null} issue="access" view="personal" templates={[]} params={{}}/>);
    expect(structural).toContain("Você não tem acesso a esta pasta.");
    expect(structural).not.toContain("data-transient-feedback");
    const flash=renderToStaticMarkup(<MyFilesExplorer listing={null} issue="access" view="personal" templates={[]} params={{error:"conflict"}}/>);
    expect(flash.match(/data-transient-feedback/g)).toHaveLength(1);
    expect(flash).toContain("Você não tem acesso a esta pasta.");
  });

  it("oculta a alternância de visão e criação sem permissão efetiva de edição",()=>{
    const html=renderToStaticMarkup(<MyFilesExplorer
      listing={{folder:{
        id:"11467e62-310f-45b0-b0c4-54c17a3c06d1",parentId:null,name:"Compartilhada",color:"#d6a432",kind:"CUSTOM",
        systemKey:null,ownerId:null,ownerName:null,projectId:null,createdByName:null,createdAt:null,modifiedByName:null,
        modifiedAt:"2026-11-13T12:00:00Z",effectivePermission:"VIEW",
      },folders:[],files:[],totalFiles:0,nextCursor:null,hasMore:false}}
      ancestors={[]} issue={null} view="shared" templates={[]} params={{folder:"11467e62-310f-45b0-b0c4-54c17a3c06d1"}}
    />);
    expect(html).not.toContain('aria-label="Visões dos arquivos"');
    expect(html).not.toContain("Nova pasta");
    expect(html).not.toContain("Carregar arquivos");
    expect(html).toContain('disabled="" aria-expanded="false" title="Você não tem permissão para adicionar arquivos nesta pasta."');
    expect(html).toContain("Criar ou carregar");
  });

  it("mostra somente atividade quando nenhum item está selecionado", () => {
    const html = renderToStaticMarkup(<DetailsPanel
      item={{ id: "root", name: "Meus arquivos", kind: "folder" }}
      activity={{ items: [], nextCursor: null, hasMore: false }}
      activityOnly
      loading={false}
      atRoot
      onClose={vi.fn()}
      onLoadMoreActivity={vi.fn()}
    />);
    expect(html).toContain('aria-label="Detalhes do item" class="fixed right-0 top-16 z-40');
    expect(html).toContain("lg:h-full");

    expect(html).toContain("Atividade");
    expect(html).toContain("Nenhuma atividade registrada.");
    expect(html).not.toContain("Tipo");
    expect(html).not.toContain("Caminho");
  });

  it("mostra atividade e os metadados compatíveis do item selecionado", () => {
    const folder = {
      id: "21467e62-310f-45b0-b0c4-54c17a3c06d1",
      parentId: "11467e62-310f-45b0-b0c4-54c17a3c06d1",
      name: "Pasta de exemplo",
      color: "#f6c445",
      kind: "CUSTOM" as const,
      systemKey: null,
      ownerId: null,
      ownerName: null,
      projectId: null,
      createdByName: "BRENO CERQUEIRA DOS SANTOS",
      createdAt: "2026-11-13T12:00:00Z",
      modifiedByName: "BRENO CERQUEIRA DOS SANTOS",
      modifiedAt: "2026-11-13T12:00:00Z",
    };
    const html = renderToStaticMarkup(<DetailsPanel
      item={{ id: folder.id, name: folder.name, kind: "folder", folder }}
      activity={{ items: [], nextCursor: null, hasMore: false }}
      activityOnly={false}
      loading={false}
      currentFolder={{ ...folder, id: "11467e62-310f-45b0-b0c4-54c17a3c06d1", name: "Raiz", kind: "ROOT", parentId: null }}
      atRoot
      onClose={vi.fn()}
      onLoadMoreActivity={vi.fn()}
    />);

    expect(html).toContain("Atividade");
    expect(html).toContain("Tipo");
    expect(html).toContain("Pasta");
    expect(html).toContain("Modificado");
    expect(html).toContain("Data de criação");
    expect(html).toContain("Meus arquivos &gt; Pasta de exemplo");
    expect(html).toContain("Tamanho");
    expect(html).toContain("Não disponível");
    expect(html).toContain("Proprietário");
    expect(html).not.toContain("Compartilhamento");
    expect(html).not.toContain("Renomear");
  });
});
