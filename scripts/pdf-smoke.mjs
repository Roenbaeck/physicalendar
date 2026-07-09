import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { ensureDirectory, runChrome, startStaticServer } from "./chrome-tools.mjs";

const args = parseArgs(process.argv.slice(2));
const root = resolve(".");
const outputPath = resolve(args.output || `artifacts/pdf-smoke/${args.template}-${args.year}.pdf`);
const profileDir = await mkdtemp(`${tmpdir()}/physicalendar-pdf-smoke-`);
const server = await startStaticServer(root);

try {
  await ensureDirectory(dirname(outputPath));
  await rm(outputPath, { force: true });

  const fixtureUrl = new URL("/print-fixtures.html", server.origin);
  fixtureUrl.searchParams.set("source", args.source);
  fixtureUrl.searchParams.set("year", String(args.year));
  fixtureUrl.searchParams.set("template", args.template);

  await runChrome([
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-extensions",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=2000",
    `--user-data-dir=${profileDir}`,
    "--print-to-pdf-no-header",
    `--print-to-pdf=${outputPath}`,
    fixtureUrl.href
  ], { successFile: outputPath, timeoutMs: 30000 });

  await runNodeScript("scripts/verify-pdf.mjs", [
    "--input", outputPath,
    "--pages", "12",
    "--width", "210",
    "--height", "297",
    "--unit", "mm"
  ]);

  const info = await stat(outputPath);
  console.log(`PDF smoke passed: ${outputPath} (${info.size} bytes)`);
} finally {
  await server.close();
  await rm(profileDir, { recursive: true, force: true });
}

function parseArgs(argv) {
  const parsed = {
    output: "",
    source: "sweden",
    template: "classic",
    year: 2027
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--output") {
      parsed.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source") {
      parsed.source = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--template") {
      parsed.template = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--year") {
      parsed.year = Number(argv[index + 1]);
      index += 1;
    }
  }

  return parsed;
}

function runNodeScript(script, scriptArgs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], { stdio: "inherit" });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${script} exited with code ${code}.`));
    });
  });
}
