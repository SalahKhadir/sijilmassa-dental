const MAX_PDF_BYTES = 2 * 1024 * 1024;
export const MAX_INSURANCE_PDF_BYTES = 8 * 1024 * 1024;

export async function readPdfDownload(response: Response, filename: string, lengthHeader: string, invalid: () => Error, maxBytes = MAX_PDF_BYTES) {
  const wireLength = response.headers.get("Content-Length");
  const verifiedLength = response.headers.get(lengthHeader);
  const length = verifiedLength ?? wireLength;
  if ((wireLength !== null && verifiedLength !== null && wireLength !== verifiedLength) || response.status !== 200
    || response.headers.get("Content-Type") !== "application/pdf"
    || response.headers.get("Content-Disposition") !== `attachment; filename="${filename}"`
    || !length || !/^[1-9][0-9]*$/.test(length) || Number(length) > maxBytes || !response.body) throw invalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > Number(length)) { await reader.cancel(); throw invalid(); }
      chunks.push(new Uint8Array(value));
    }
  } catch { throw invalid(); }
  const blob = new Blob(chunks, { type: "application/pdf" });
  if (size !== Number(length) || !(await blob.slice(0, 5).text()).startsWith("%PDF-")) throw invalid();
  return { blob, filename };
}

export function savePdfDownload({ blob, filename }: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
