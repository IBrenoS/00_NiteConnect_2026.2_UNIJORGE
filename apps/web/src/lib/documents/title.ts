export function documentTitleFromFilename(fileName: string): string {
  return fileName.replace(/\.docx$/i, "").trim() || "Documento";
}
