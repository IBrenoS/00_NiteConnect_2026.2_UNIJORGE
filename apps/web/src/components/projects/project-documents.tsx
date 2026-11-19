import { MyFilesExplorer } from "../documents/my-files-explorer";
import type { LibraryListing, LibraryFolder } from "../../lib/documents/library-contracts";
import styles from "./projects.module.css";
export type ProjectDocumentParams={folder?:string;error?:string;saved?:string;uploaded?:string;search?:string;type?:string;sort?:string;direction?:string};
export function ProjectDocuments({projectId,name,listing,ancestors,memberId,canManage,params}:{projectId:string;name:string;listing:LibraryListing;ancestors:LibraryFolder[];memberId:string;canManage:boolean;params:ProjectDocumentParams}) {
 const basePath=`/meus-projetos/${projectId}/documentos`;
 const key=JSON.stringify([projectId,listing.folder.id,params.search,params.type,params.sort,params.direction,params.saved,params.uploaded]);
 return <div className={styles.sectionPage}><MyFilesExplorer key={key} listing={listing} ancestors={ancestors} issue={null} view="personal" memberId={memberId} templates={[]} params={params} projectContext={{id:projectId,name,basePath,trashPath:`${basePath}/lixeira`,requestsPath:`${basePath}/aprovacoes`,canRequestDeletion:canManage,canViewTrash:canManage}}/></div>;
}
