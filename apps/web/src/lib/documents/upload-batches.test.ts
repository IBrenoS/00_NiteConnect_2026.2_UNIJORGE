import { describe,expect,it } from "vitest";
import { MAX_DOCUMENT_BATCH_BYTES,MAX_DOCUMENT_FILE_BYTES,partitionUploadEntries } from "./upload-batches";

function entry(name:string,size:number,path=name) {
  return {file:new File([new Uint8Array(size)],name),path};
}

describe("limites do upload documental",()=>{
  it("rejeita arquivos vazios, formatos não aceitos, nomes acima de 8 MiB e caminhos inseguros",()=>{
    const result=partitionUploadEntries([
      entry("vazio.pdf",0),entry("planilha.xlsx",20),entry("grande.pdf",MAX_DOCUMENT_FILE_BYTES+1),entry("ok.pdf",10,"../fora.pdf"),entry("valido.pdf",10),
    ]);
    expect(result.batches.flat().map((item)=>item.file.name)).toEqual(["valido.pdf"]);
    expect(result.rejected.map((item)=>item.reason)).toEqual(["empty","unsupported-format","file-too-large","invalid-path"]);
  });

  it("separa lotes no limite de 100 itens e 32 MiB sem excedê-los",()=>{
    const byCount=partitionUploadEntries(Array.from({length:101},(_,index)=>entry(`${index}.pdf`,1)));
    expect(byCount.batches.map((batch)=>batch.length)).toEqual([100,1]);
    const bySize=partitionUploadEntries(Array.from({length:5},(_,index)=>entry(`${index}.pdf`,MAX_DOCUMENT_FILE_BYTES)));
    expect(bySize.batches.map((batch)=>batch.reduce((sum,item)=>sum+item.file.size,0))).toEqual([MAX_DOCUMENT_BATCH_BYTES,MAX_DOCUMENT_FILE_BYTES]);
    expect(bySize.rejected).toHaveLength(0);
  });
});
