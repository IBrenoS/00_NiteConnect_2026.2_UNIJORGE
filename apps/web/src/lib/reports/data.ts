import "server-only";
import {getApiJson} from "../api/server";
import {parseReportListing} from "./contracts";
export function getReports(bearer:string,memberId:string,parentId?:string,offset=0) {
  const params=new URLSearchParams({reportsOnly:"true",limit:"50",offset:String(offset)});
  if(parentId)params.set("parentId",parentId);
  return getApiJson(`/api/v1/library/members/${encodeURIComponent(memberId)}/documents?${params}`,bearer,parseReportListing);
}
