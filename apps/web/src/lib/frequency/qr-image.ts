import { BarcodeFormat, EncodeHintType, QRCodeWriter } from "@zxing/library";

export function qrSvg(contents: string): string {
  const hints = new Map<EncodeHintType, number>([[EncodeHintType.MARGIN, 4]]);
  const matrix = new QRCodeWriter().encode(contents, BarcodeFormat.QR_CODE, 256, 256, hints);
  const size = matrix.getWidth();
  const runs: string[] = [];
  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (!matrix.get(x, y)) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < size && matrix.get(x, y)) x += 1;
      runs.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR Code temporário da lista de Frequência"><path fill="#0b1728" d="${runs.join("")}"/></svg>`;
}
