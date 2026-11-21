import {expect,it,vi} from "vitest";
const {getApiJson}=vi.hoisted(()=>({getApiJson:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../api/server",()=>({getApiJson}));
import {getReports} from "./data";
it("usa a consulta V44 com classificação obrigatória e preserva pasta e paginação",async()=>{
 const member="11111111-1111-4111-8111-111111111111",folder="22222222-2222-4222-8222-222222222222";
 await getReports("server-only",member,folder,50);
 const url=new URL(getApiJson.mock.calls[0][0],"http://localhost");
 expect(url.pathname).toBe(`/api/v1/library/members/${member}/documents`);
 expect(Object.fromEntries(url.searchParams)).toEqual({reportsOnly:"true",limit:"50",offset:"50",parentId:folder});
});
