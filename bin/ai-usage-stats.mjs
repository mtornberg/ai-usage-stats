#!/usr/bin/env node
// Thin launcher so the tool can be run as a global bin while the source stays TS.
// Uses tsx (a dependency) to execute the TypeScript entry point directly.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, "../src/index.ts");
const tsx = resolve(here, "../node_modules/.bin/tsx");

const res = spawnSync(tsx, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(res.status ?? 1);
