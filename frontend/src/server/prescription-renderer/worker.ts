import { readFile } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { z } from "zod";
import { PrescriptionPdfError } from "../../lib/prescriptions/pdf/layout.ts";
import { renderServerPrescription, sha256 } from "./render.ts";
import { renderingRequestSchema, MAX_INPUT_BYTES, TEMPLATE_SHA256, FONT_SHA256, type RenderingErrorCode } from "./protocol.ts";

/** One request on private stdin, one bounded response on stdout, no diagnostics with content. */
async function main() {
  let requestId: string | null = null;
  try {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += data.length;
      if (size > MAX_INPUT_BYTES) throw new Error("INVALID_INPUT");
      chunks.push(data);
    }
    let input: unknown;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new Error("INVALID_INPUT"); }
    if (input && typeof input === "object" && "requestId" in input && z.uuid().safeParse(input.requestId).success)
      requestId = input.requestId as string;
    const parsed = renderingRequestSchema.safeParse(input);
    if (!parsed.success) throw new Error("INVALID_INPUT");
    requestId = parsed.data.requestId;
    // These paths are fixed at build time; request data never selects resources or files.
    const directory = path.resolve(__dirname, "../../assets");
    const [template, font] = await Promise.all([
      readFile(path.join(directory, "ordonnance-a5.pdf")), readFile(path.join(directory, "LiberationSans-Regular.ttf")),
    ]).catch(() => { throw new PrescriptionPdfError("PDF resources unavailable", "ASSET_INVALID"); });
    const pdf = await renderServerPrescription(parsed.data, { template, font });
    process.stdout.write(JSON.stringify({ protocolVersion: 1, requestId, ok: true,
      pdfBase64: Buffer.from(pdf).toString("base64"), pdfBytes: pdf.length, sha256: sha256(pdf),
      templateSha256: TEMPLATE_SHA256, fontSha256: FONT_SHA256, rendererId: "prescription-a5-v1" }));
  } catch (error) {
    const code: RenderingErrorCode = error instanceof PrescriptionPdfError ? error.code
      : error instanceof Error && error.message === "INVALID_INPUT" ? "INVALID_INPUT" : "OUTPUT_INVALID";
    process.stdout.write(JSON.stringify({ protocolVersion: 1, requestId, ok: false, code }));
  }
}
void main().catch(() => { process.exitCode = 1; });
