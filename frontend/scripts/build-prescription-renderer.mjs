import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".prescription-renderer");
await rm(output, { recursive: true, force: true });
const compile = spawnSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.prescription-renderer.json"],
  { cwd: root, stdio: "inherit" });
if (compile.status !== 0) process.exit(1);
await mkdir(path.join(output, "assets"), { recursive: true });
for (const [source, target] of [["public/pdf-templates/ordonnance-a5.pdf", "assets/ordonnance-a5.pdf"],
  ["public/fonts/LiberationSans-Regular.ttf", "assets/LiberationSans-Regular.ttf"]])
  await copyFile(path.join(root, source), path.join(output, target));
const files = {};
async function inventory(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inventory(file);
    else files[path.relative(output, file).split(path.sep).join("/")] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
}
await inventory(output);
const manifest = JSON.stringify({ protocolVersion: 1, rendererId: "prescription-a5-v1", files });
await writeFile(path.join(output, "manifest.json"), manifest + "\n");
const hash = createHash("sha256").update(manifest + "\n").digest("hex");
console.log(`Prescription worker built. Manifest SHA-256: ${hash}`);
