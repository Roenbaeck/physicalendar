import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servedDir = path.resolve(root, process.argv[2] || ".");
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".zip": "application/zip"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const filePath = await resolveRequestPath(url.pathname);
    const body = await readFile(filePath);

    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    response.end(body);
  } catch (error) {
    const status = error.code === "EACCES" ? 403 : 404;
    response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    response.end(status === 403 ? "Forbidden" : "Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Serving ${path.relative(root, servedDir) || "."} at http://${host}:${port}/`);
});

async function resolveRequestPath(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(servedDir, relativePath);
  const relativeToRoot = path.relative(servedDir, filePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    const error = new Error("Request escapes served directory.");
    error.code = "EACCES";
    throw error;
  }

  const info = await stat(filePath);
  if (info.isDirectory()) {
    return path.join(filePath, "index.html");
  }

  return filePath;
}
