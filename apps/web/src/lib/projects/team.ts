import "server-only";
import { getApiJson } from "../api/server";
export type ProjectTeamMember={memberId:string;memberName:string};
export const getProjectTeam=(bearer:string,id:string)=>getApiJson(
  `/api/v1/projects/${encodeURIComponent(id)}/members?page=0&size=100`,bearer,(v):ProjectTeamMember[]|null=>{
    if(typeof v!=="object"||v===null||!("items" in v)||!Array.isArray(v.items))return null;
    const items:ProjectTeamMember[]=[];
    for(const p of v.items){
      if(typeof p!=="object"||p===null||typeof p.memberId!=="string"||typeof p.memberName!=="string")return null;
      items.push({memberId:p.memberId,memberName:p.memberName});
    }
    return items;
  });
