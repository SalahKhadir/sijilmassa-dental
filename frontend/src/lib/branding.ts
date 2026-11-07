import { existsSync } from "node:fs";
import path from "node:path";

/** Evaluated on the server during rendering. Add the official asset and rebuild. */
export function getLogoSource(): string | undefined {
  const extensions = ["svg", "png", "webp"];
  const extension = extensions.find((candidate) =>
    existsSync(
      path.join(
        process.cwd(),
        "public",
        "branding",
        `sijilmassa-dental-logo.${candidate}`,
      ),
    ),
  );
  return extension
    ? `/branding/sijilmassa-dental-logo.${extension}`
    : undefined;
}
