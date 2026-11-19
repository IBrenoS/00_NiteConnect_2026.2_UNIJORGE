/** Local document destinations only; never trusts an external return URL. */
export function documentReturnTo(value: unknown): string {
 if(typeof value!=="string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f\x7f]/.test(value)) return "/documentos";
 try {
  const url=new URL(value,"http://nite.local");
  const uuid="[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}";
  const paths=new RegExp(`^/(?:documentos(?:/lixeira)?|biblioteca|projetos/${uuid}/arquivos|meus-projetos/${uuid}/documentos(?:/(?:lixeira|aprovacoes))?)$`,"i");
  return url.origin==="http://nite.local"&&!url.hash&&paths.test(url.pathname)?`${url.pathname}${url.search}`:"/documentos";
 }catch{return "/documentos";}
}
