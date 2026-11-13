export const MAX_DOCUMENT_FILE_BYTES=8*1024*1024;
export const MAX_DOCUMENT_BATCH_BYTES=32*1024*1024;
export const MAX_DOCUMENT_BATCH_ITEMS=100;

export type UploadEntry={file:File;path:string};
export type RejectedUpload={file:File;reason:"empty"|"file-too-large"|"unsupported-format"|"invalid-path"};
export type UploadBatches={batches:UploadEntry[][];rejected:RejectedUpload[]};

const supported=/\.(docx|pdf|png|jpe?g)$/i;
function rejection(entry:UploadEntry):RejectedUpload["reason"]|null {
  if(entry.file.size===0)return "empty";
  if(entry.file.size>MAX_DOCUMENT_FILE_BYTES)return "file-too-large";
  if(!supported.test(entry.file.name))return "unsupported-format";
  if(!entry.path||entry.path.startsWith("/")||entry.path.includes("\\")||entry.path.split("/").some((part)=>!part||part==="."||part===".."))return "invalid-path";
  return null;
}

export function partitionUploadEntries(entries:UploadEntry[]):UploadBatches {
  const accepted:UploadEntry[]=[],rejected:RejectedUpload[]=[];
  for(const entry of entries) {
    const reason=rejection(entry);
    if(reason)rejected.push({file:entry.file,reason});else accepted.push(entry);
  }
  const batches:UploadEntry[][]=[];
  let batch:UploadEntry[]=[],size=0;
  for(const entry of accepted) {
    if(batch.length===MAX_DOCUMENT_BATCH_ITEMS||size+entry.file.size>MAX_DOCUMENT_BATCH_BYTES) {
      batches.push(batch);batch=[];size=0;
    }
    batch.push(entry);size+=entry.file.size;
  }
  if(batch.length)batches.push(batch);
  return {batches,rejected};
}
