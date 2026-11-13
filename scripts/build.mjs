// @ts-check
import * as esbuild from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "extension", "dist");

/** @type {ReadonlyArray<readonly [string, string]>} */
const entries = [
  ["src/background/index.ts", "background.js"],
  ["src/content/youtube.ts", "content-youtube.js"],
  ["src/content/twitter.ts", "content-twitter.js"],
  ["src/content/instagram.ts", "content-instagram.js"],
  ["src/content/tiktok.ts", "content-tiktok.js"],
  ["src/ui/popup.ts", "popup.js"],
  ["src/ui/options.ts", "options.js"],
];

async function main() {
  await mkdir(outDir, { recursive: true });
  await Promise.all(
    entries.map(([input, output]) =>
      esbuild.build({
        entryPoints: [path.join(rootDir, input)],
        outfile: path.join(outDir, output),
        bundle: true,
        format: "iife",
        target: ["chrome120"],
        minify: false,
        legalComments: "none",
      }),
    ),
  );
  console.log(`Built ${entries.length} extension bundles into extension/dist/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
