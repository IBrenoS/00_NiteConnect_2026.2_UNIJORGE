import "server-only";
import { getApiJson } from "../api/server";
export type MyProject={id:string;title:string;description:string;status:string};
export async function getMyProjects(bearer:string) {
  return getApiJson("/api/v1/me/projects?page=0&size=100",bearer,(v):MyProject[]|null=>{
    if(typeof v!=="object"||v===null||!("items" in v)||!Array.isArray(v.items))return null;
    const items:MyProject[]=[];
    for(const p of v.items){
      if(typeof p!=="object"||p===null||typeof p.id!=="string"||typeof p.title!=="string"||typeof p.description!=="string"||typeof p.status!=="string")return null;
      items.push({id:p.id,title:p.title,description:p.description,status:p.status});
    }
    return items;
  });
}
