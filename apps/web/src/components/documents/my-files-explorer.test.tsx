import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../lib/documents/library-actions", () => ({
  createPersonalTemplateCopy: vi.fn(),
  organizeLibraryFile: vi.fn(),
  updateLibraryFolder: vi.fn(),
}));

import { DetailsPanel, MyFilesExplorer, SelectionToolbar, toggleDetailsPanel } from "./my-files-explorer";

describe("explorador Meus arquivos", () => {
  it("fecha os detalhes quando o controle contextual é acionado pela segunda vez", () => {
    const onOpen = vi.fn(), onClose = vi.fn();

    toggleDetailsPanel(true, onOpen, onClose);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();

    toggleDetailsPanel(false, onOpen, onClose);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("mantém a seleção e as ações compatíveis na barra contextual", () => {
    const folder = { id: "folder-1", name: "Pasta de exemplo", kind: "folder" as const };
    const oneSelected = renderToStaticMarkup(<SelectionToolbar
      items={[folder]}
      view="personal"
      details={false}
      onShare={vi.fn()}
      onDownload={vi.fn()}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onClear={vi.fn()}
      onDetails={vi.fn()}
    />);
    expect(oneSelected).toContain("1 selecionado");
    for (const action of ["Compartilhar", "Copiar link", "Solicitar arquivos", "Excluir", "Adicionar aos favoritos", "Baixar", "Duplicar", "Mover para", "Copiar para", "Renomear"]) {
      expect(oneSelected).toContain(action);
    }
    expect(oneSelected).toContain("Automatizar");
    expect(oneSelected).toMatch(/<summary aria-label="Mais opções de organização"/);
    expect(oneSelected).toContain('disabled="" title="Links compartilháveis ainda não estão disponíveis no módulo documental."');
    expect(oneSelected).toContain('aria-label="Limpar seleção"');
    const closedMenu=oneSelected.match(/<details[^>]*>(.*?)<\/details>/)?.[1]??"";
    expect(closedMenu).toContain("Renomear");
    expect(closedMenu).toContain("Automatizar");
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
      onShare={vi.fn()}
      onDownload={vi.fn()}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onClear={vi.fn()}
      onDetails={vi.fn()}
    />);
    const expandedMenu=detailsExpanded.match(/<details[^>]*>(.*?)<\/details>/)?.[1]??"";
    for (const action of ["Duplicar", "Mover para", "Copiar para", "Renomear", "Automatizar"]) {
      expect(expandedMenu).toContain(action);
    }
    const expandedToolbar=detailsExpanded.split("<details")[0]??"";
    expect(expandedToolbar).not.toContain("Duplicar");
    expect(expandedToolbar).not.toContain("Mover para");
    expect(expandedToolbar).not.toContain("Copiar para");

    const twoSelected = renderToStaticMarkup(<SelectionToolbar
      items={[folder, { ...folder, id: "folder-2", name: "Outra pasta" }]}
      view="personal"
      details={false}
      onShare={vi.fn()}
      onDownload={vi.fn()}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onClear={vi.fn()}
      onDetails={vi.fn()}
    />);
    expect(twoSelected).toContain("2 selecionados");
    expect(twoSelected).toContain("Compartilhar");
    expect(twoSelected).toContain("Copiar para");
    expect(twoSelected).toContain("Renomear");
    expect(twoSelected).toContain('disabled="" title="Ação em lote ainda não está disponível para esta operação."');
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
    expect(html).toContain("lg:h-[calc(100svh-5.75rem)]");
    expect(html).toContain("lg:mb-[-1.75rem]");
    expect(html).toContain("h-[calc(100svh-6.5rem)]");
    expect(html).toContain("grid h-full min-h-0 min-w-0 items-stretch");
    expect(html).toContain('aria-label="Criar ou carregar"');
    expect(html).toContain("min-h-9 items-center gap-2.5 rounded-xl");
    expect(html).toContain("py-2 pl-2.5 pr-3 text-sm");
    expect(html).toContain("Nova pasta");
    expect(html).toContain("Carregar arquivos");
    expect(html).toContain("Carregar pasta");
    expect(html).toContain("bg-nite-surface-elevated");
    expect(html).toContain("Criar ou carregar");
    expect(html).toContain('aria-label="Filtros rápidos por tipo"');
    expect(html).toContain("NiteConnect-Word.svg");
    expect(html).toContain("NiteConnect-Excel.svg");
    expect(html).toContain("NiteConnect-PowerPoint.svg");
    expect(html).toContain("NiteConnect-PDF.svg");
    expect(html).toContain("NiteConnect-Filtro.svg");
    expect(html).toContain("Word");
    expect(html).toContain("PowerPoint ainda não é aceito no módulo documental");
    expect(html).toContain("Compartilhamento");
    expect(html).toContain("Atividade");
    expect(html).toMatch(/<thead class="[^"]*text-sm[^"]*"/);
    expect(html).toContain('aria-label="Selecionar Pasta de exemplo"');
    expect(html).not.toContain("Selecionar todos os itens desta página");
    expect(html).toContain('aria-label="Mais ações para Pasta de exemplo"');
    expect(html).toContain("Copiar para");
    expect(html).toContain("Renomear");
    expect(html).toContain('aria-label="Adicionar Pasta de exemplo aos favoritos"');
    expect(html).not.toContain("pastas · 0 arquivos");
    expect(html).not.toContain('role="search"');
    expect(html).not.toContain("Pesquisar em Meus arquivos");
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
    expect(html).toContain("Dimensionar");
    expect(html).toContain("Não disponível");
    expect(html).not.toContain("Proprietário");
    expect(html).not.toContain("Compartilhamento");
    expect(html).not.toContain("Renomear");
  });
});
