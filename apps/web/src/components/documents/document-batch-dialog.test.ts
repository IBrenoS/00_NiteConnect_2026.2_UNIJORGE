import { describe,expect,it } from "vitest";
import { batchListingUrl } from "./document-batch-dialog";

describe("destinos de operações documentais em lote",()=>{
  it("mantém a consulta no contexto do projeto para raiz e subpastas",()=>{
    const root=new URL(batchListingUrl("31467e62-310f-45b0-b0c4-54c17a3c06d1"),"http://localhost");
    expect(root.searchParams.get("projectId")).toBe("31467e62-310f-45b0-b0c4-54c17a3c06d1");
    expect(root.searchParams.get("view")).toBe("personal");
    const child=new URL(batchListingUrl("31467e62-310f-45b0-b0c4-54c17a3c06d1","21467e62-310f-45b0-b0c4-54c17a3c06d1"),"http://localhost");
    expect(child.searchParams.get("projectId")).toBe("31467e62-310f-45b0-b0c4-54c17a3c06d1");
    expect(child.searchParams.get("folder")).toBe("21467e62-310f-45b0-b0c4-54c17a3c06d1");
  });

  it("não acrescenta um projeto ao contexto pessoal",()=>{
    const url=new URL(batchListingUrl(),"http://localhost");
    expect(url.searchParams.get("view")).toBe("personal");
    expect(url.searchParams.has("projectId")).toBe(false);
  });
});
