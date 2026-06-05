import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReportData } from "./types.js";

const PLACEHOLDER = "__USAGE_DATA_PLACEHOLDER__";

function templatePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Built single-file viewer lives at <repo>/viewer/dist/index.html.
  return join(here, "..", "viewer", "dist", "index.html");
}

/**
 * Inject the report data into the prebuilt single-file viewer template and
 * write the final self-contained HTML report.
 *
 * The template contains `window.__USAGE_DATA__ = "__USAGE_DATA_PLACEHOLDER__"`.
 * We replace the placeholder token with a JSON string that the viewer will
 * JSON.parse, so the embedded payload is always a valid JS string literal.
 */
export async function writeReport(
  data: ReportData,
  outPath: string,
): Promise<void> {
  let template: string;
  try {
    template = await readFile(templatePath(), "utf8");
  } catch {
    throw new Error(
      `Viewer template not found at ${templatePath()}.\n` +
        `Run "npm run build" first to build the viewer.`,
    );
  }

  if (!template.includes(PLACEHOLDER)) {
    throw new Error(
      "Viewer template is missing the data placeholder. Rebuild the viewer.",
    );
  }

  // Encode as a JS string literal body: JSON-encode twice-safe.
  // Start from JSON, then escape the chars that are unsafe inside a
  // double-quoted JS string embedded in <script>.
  const sep2028 = String.fromCharCode(0x2028);
  const sep2029 = String.fromCharCode(0x2029);
  const encoded = JSON.stringify(data)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(new RegExp(sep2028, "g"), "\\u2028")
    .replace(new RegExp(sep2029, "g"), "\\u2029");

  const html = template.replace(PLACEHOLDER, encoded);
  await writeFile(outPath, html, "utf8");
}
