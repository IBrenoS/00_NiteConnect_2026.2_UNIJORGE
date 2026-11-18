import type { LibraryFile, LibraryFolder, LibraryListing } from "../documents/library-contracts";

export function getVisualDocuments(projectId: string, folderId?: string, query = ""): LibraryListing {
  const rootId = `${projectId}-documents`;
  const folder = (id: string, name: string, parentId: string | null): LibraryFolder => ({ id, name, parentId, color: "#D6A432", kind: parentId ? "CUSTOM" : "PROJECT", projectId, systemKey: null, ownerId: null, ownerName: null, createdByName: "Equipe fictícia", createdAt: "2026-11-16T12:00:00Z", modifiedByName: null, modifiedAt: "2026-11-18T12:00:00Z" });
  const folders = [folder(`${projectId}-research`, "Pesquisa e referências", rootId), folder(`${projectId}-deliveries`, "Entregas", rootId)];
  const current = folders.find(f => f.id === folderId) ?? folder(rootId, "Documentos do projeto", null);
  const file = (id: string, title: string, mimeType: string, fileFolder: string): LibraryFile => ({ id: `${projectId}-${id}`, title, mimeType, folderId: fileFolder, context: "PROJECT", projectId, ownerId: null, ownerName: "Projeto", revision: 1, size: 24576, createdByName: "Equipe fictícia", createdAt: "2026-11-16T12:00:00Z", modifiedByName: "Equipe fictícia", modifiedAt: "2026-11-18T12:00:00Z", sharedByName: null, sharedAt: null, sharedWithCount: 0, lastOpenedByName: null, lastOpenedAt: null, folderName: current.name });
  const files = [file("brief", "Apresentação do projeto.pdf", "application/pdf", rootId), file("scope", "Escopo e objetivos.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", rootId), file("research-notes", "Síntese da pesquisa.pdf", "application/pdf", folders[0].id)];
  const normalized = query.toLocaleLowerCase("pt-BR");
  const selectedFiles = files.filter(f => f.folderId === current.id && f.title.toLocaleLowerCase("pt-BR").includes(normalized));
  return { folder: current, folders: current.id === rootId ? folders.filter(f => f.name.toLocaleLowerCase("pt-BR").includes(normalized)) : [], files: selectedFiles, totalFiles: selectedFiles.length, nextCursor: null, hasMore: false };
}
