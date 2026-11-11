import { PrescriptionApiError } from "./errors";
/** Uses the immutable backend bytes. No renderer, template or font dependencies. */
export async function prescriptionPdf(response: Response, id: string) {
  const filename = `ordonnance-${id.toLowerCase()}.pdf`;
  const wireLength = response.headers.get("Content-Length"), verifiedLength = response.headers.get("X-Prescription-PDF-Bytes");
  const length = verifiedLength ?? wireLength;
  if ((wireLength !== null && verifiedLength !== null && wireLength !== verifiedLength) || response.status !== 200 || response.headers.get("Content-Type") !== "application/pdf"
    || response.headers.get("Content-Disposition") !== `attachment; filename="${filename}"`
    || !length || !/^[1-9][0-9]*$/.test(length) || Number(length) > 2097152 || !response.body) throw new PrescriptionApiError(502);
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > Number(length)) { await reader.cancel(); throw new PrescriptionApiError(502); }
      chunks.push(new Uint8Array(value));
    }
  } catch { throw new PrescriptionApiError(502); }
  const blob = new Blob(chunks, { type: "application/pdf" });
  if (size !== Number(length) || !(await blob.slice(0, 5).text()).startsWith("%PDF-")) throw new PrescriptionApiError(502);
  return { blob, filename };
}
/** The URL lives only for this explicit download and is always revoked. */
export function savePrescriptionPdf({ blob, filename }: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try { link.href = url; link.download = filename; document.body.append(link); link.click(); }
  finally { link.remove(); URL.revokeObjectURL(url); }
}
