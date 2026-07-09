import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist");
const entries = [
  "index.html",
  "print.html",
  "tests.html",
  "print-fixtures.html",
  "src"
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of entries) {
  await copyEntry(entry);
}

console.log(`Built static app in ${path.relative(root, outDir)}`);

async function copyEntry(entry) {
  const source = path.join(root, entry);
  const target = path.join(outDir, entry);
  const info = await stat(source);

  if (info.isDirectory()) {
    await cp(source, target, { recursive: true });
    return;
  }

  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target);
}
