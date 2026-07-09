import { access, mkdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

export const DEFAULT_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "google-chrome",
  "chromium",
  "chromium-browser",
  "msedge"
];

export async function findChrome() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  for (const candidate of DEFAULT_CHROME_PATHS) {
    if (candidate.includes("/")) {
      if (await isExecutable(candidate)) {
        return candidate;
      }
      continue;
    }

    if (await commandExists(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not find Chrome/Chromium. Set CHROME_PATH to the browser executable.");
}

export async function runChrome(args, options = {}) {
  const chrome = await findChrome();
  const { successFile, timeoutMs = 45000, ...spawnOptions } = options;
  const child = spawn(chrome, args, {
    stdio: ["ignore", "pipe", "pipe"],
    ...spawnOptions
  });
  let stdout = "";
  let stderr = "";
  let timedOutWithSuccess = false;
  let lastSuccessFileSize = 0;
  let stableSuccessPolls = 0;

  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  return new Promise((resolvePromise, reject) => {
    const successPoll = successFile ? setInterval(async () => {
      const size = await fileSize(successFile);

      if (size > 1000 && size === lastSuccessFileSize) {
        stableSuccessPolls += 1;
      } else {
        stableSuccessPolls = 0;
      }

      lastSuccessFileSize = size;

      if (stableSuccessPolls >= 2) {
        timedOutWithSuccess = true;
        child.kill("SIGTERM");
      }
    }, 500) : null;
    const timer = setTimeout(async () => {
      if (successFile && await fileLooksComplete(successFile)) {
        timedOutWithSuccess = true;
        child.kill("SIGTERM");
        return;
      }

      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(successPoll);

      if (code === 0 || timedOutWithSuccess) {
        resolvePromise({ stdout, stderr });
        return;
      }

      reject(new Error(`Chrome exited with code ${code}.\n${stderr || stdout}`));
    });
  });
}

export async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
}

export async function toFileUrl(path) {
  const resolved = resolve(path);
  const info = await stat(resolved);

  if (!info.isFile()) {
    throw new Error(`Expected a file: ${resolved}`);
  }

  return new URL(`file://${resolved}`).href;
}

export function startStaticServer(root, preferredPort = 0) {
  const mimeTypes = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".xml": "application/xml"
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host}`);
      const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = resolve(join(root, pathname));

      if (!filePath.startsWith(resolve(root))) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const { readFile } = await import("node:fs/promises");
      const bytes = await readFile(filePath);
      response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(preferredPort, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      resolvePromise({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClose) => server.close(resolveClose))
      });
    });
  });
}

async function isExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function fileLooksComplete(path) {
  try {
    const info = await stat(path);
    return info.size > 1000;
  } catch {
    return false;
  }
}

async function fileSize(path) {
  try {
    const info = await stat(path);
    return info.size;
  } catch {
    return 0;
  }
}

async function commandExists(command) {
  const child = spawn("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });

  return new Promise((resolvePromise) => {
    child.on("error", () => resolvePromise(false));
    child.on("close", (code) => resolvePromise(code === 0));
  });
}
