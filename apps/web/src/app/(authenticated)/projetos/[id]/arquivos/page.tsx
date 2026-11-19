import { notFound,redirect } from "next/navigation";
import { validUuid } from "../../../../../lib/documents/library-contracts";
export const metadata={title:"Documentos do projeto"};
export default async function ProjectFilesLegacyPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const {id}=await params;if(!validUuid(id))notFound();
 const incoming=await searchParams,query=new URLSearchParams();
 for(const key of ["folder","search","type","sort","direction","saved","uploaded","error"]) {const value=incoming[key];if(typeof value==="string")query.set(key,value);}
 redirect(`/meus-projetos/${id}/documentos${query.size?`?${query}`:""}`);
}
