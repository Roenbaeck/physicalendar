import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ensureDirectory, runChrome, startStaticServer } from "./chrome-tools.mjs";

const args = parseArgs(process.argv.slice(2));
const outputDir = resolve(args.outputDir || "artifacts/print-snapshots");
const templates = args.templates.length > 0 ? args.templates : ["classic", "gallery", "compact"];
const profileDir = await mkdtemp(`${tmpdir()}/physicalendar-chrome-`);
const server = await startStaticServer(resolve("."));

try {
  await ensureDirectory(outputDir);

  for (const template of templates) {
    const outputPath = resolve(outputDir, `${template}.png`);
    const url = `${server.origin}/print-fixtures.html?template=${encodeURIComponent(template)}&year=${encodeURIComponent(args.year)}`;

    await rm(outputPath, { force: true });
    await runChrome([
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-extensions",
      "--hide-scrollbars",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=2500",
      "--window-size=1280,1800",
      `--user-data-dir=${profileDir}`,
      `--screenshot=${outputPath}`,
      url
    ], { successFile: outputPath, timeoutMs: 30000 });

    const info = await stat(outputPath);

    if (info.size < 10000) {
      throw new Error(`${outputPath} looks too small to be a useful snapshot (${info.size} bytes).`);
    }

    console.log(`Wrote ${outputPath} (${info.size} bytes)`);
  }
} finally {
  await server.close();
  await rm(profileDir, { recursive: true, force: true });
}

function parseArgs(argv) {
  const parsed = {
    templates: [],
    year: 2027
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--outdir") {
      parsed.outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--template") {
      parsed.templates.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--year") {
      parsed.year = Number(argv[index + 1] || 2027);
      index += 1;
    }
  }

  return parsed;
}
