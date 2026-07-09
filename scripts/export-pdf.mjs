import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { ensureDirectory, findChrome, startStaticServer, toFileUrl } from "./chrome-tools.mjs";

const args = parseArgs(process.argv.slice(2));

if ((!args.input && !args.route) || !args.output) {
  printUsage();
  process.exit(1);
}

const server = args.route ? await startStaticServer(resolve(".")) : null;
const inputUrl = args.route ? routeUrl(args.route, server.origin) : (isUrl(args.input) ? args.input : await toFileUrl(args.input));
const outputPath = resolve(args.output);
const profileDir = await mkdtemp(`${tmpdir()}/physicalendar-chrome-`);

try {
  await ensureDirectory(dirname(outputPath));
  await rm(outputPath, { force: true });
  await printUrlToPdf(inputUrl, outputPath, profileDir);

  const info = await stat(outputPath);

  if (info.size < 1000) {
    throw new Error(`PDF was created but looks too small: ${info.size} bytes.`);
  }

  console.log(`Wrote ${outputPath} (${info.size} bytes)`);
} finally {
  if (server) {
    await server.close();
  }
  await rm(profileDir, { recursive: true, force: true });
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      parsed.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--route") {
      parsed.route = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--output") {
      parsed.output = argv[index + 1];
      index += 1;
      continue;
    }
  }

  return parsed;
}

function routeUrl(route, origin) {
  if (isUrl(route)) {
    return route;
  }

  const path = route.startsWith("/") ? route : `/${route}`;
  return new URL(path, origin).href;
}

function isUrl(value) {
  return /^https?:\/\//u.test(value || "") || /^file:\/\//u.test(value || "");
}

function printUsage() {
  console.error("Usage: node scripts/export-pdf.mjs --input print.html --output calendar.pdf");
  console.error("   or: node scripts/export-pdf.mjs --route \"print.html?source=./src/data/calendars/sweden.xml&year=2027\" --output calendar.pdf");
}

async function printUrlToPdf(inputUrl, outputPath, profileDir) {
  const chrome = await findChrome();
  const child = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-extensions",
    "--run-all-compositor-stages-before-draw",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank"
  ], {
    stdio: ["ignore", "ignore", "pipe"]
  });
  let closed = false;
  const childClosed = new Promise((resolvePromise) => {
    child.once("close", () => {
      closed = true;
      resolvePromise();
    });
  });

  try {
    const browserWebSocket = await waitForDevToolsUrl(child);
    const target = await createPageTarget(browserWebSocket, inputUrl);
    const client = await connectCdp(target.webSocketDebuggerUrl);

    try {
      await client.send("Page.enable");
      await waitForPageReady(client);
      const printSettings = await pagePrintSettings(client);
      const printed = await client.send("Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: false,
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        ...printSettings
      });

      await writeFile(outputPath, Buffer.from(printed.data, "base64"));
    } finally {
      client.close();
    }
  } finally {
    if (!closed) {
      child.kill("SIGTERM");
      await Promise.race([childClosed, delay(3000)]);
    }
  }
}

async function pagePrintSettings(client) {
  const result = await client.send("Runtime.evaluate", {
    expression: `(() => ({
      width: document.body.dataset.paperWidth || "",
      height: document.body.dataset.paperHeight || "",
      unit: document.body.dataset.paperUnit || "mm"
    }))()`,
    returnByValue: true
  });
  const value = result.result?.value || {};
  const width = unitToInches(value.width, value.unit);
  const height = unitToInches(value.height, value.unit);

  return {
    paperWidth: width || 210 / 25.4,
    paperHeight: height || 297 / 25.4
  };
}

function unitToInches(value, unit) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  if (unit === "in") {
    return number;
  }

  if (unit === "cm") {
    return number / 2.54;
  }

  if (unit === "pt") {
    return number / 72;
  }

  return number / 25.4;
}

function waitForDevToolsUrl(child) {
  return new Promise((resolvePromise, reject) => {
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for Chrome DevTools.\n${stderr}`));
    }, 15000);

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u);

      if (match) {
        clearTimeout(timer);
        resolvePromise(match[1]);
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (!stderr.includes("DevTools listening on")) {
        clearTimeout(timer);
        reject(new Error(`Chrome exited before DevTools was ready, code ${code}.\n${stderr}`));
      }
    });
  });
}

async function createPageTarget(browserWebSocket, inputUrl) {
  const devTools = new URL(browserWebSocket);
  const endpoint = new URL(`/json/new?${encodeURIComponent(inputUrl)}`, `http://${devTools.host}`);
  const response = await fetch(endpoint, { method: "PUT" });

  if (!response.ok) {
    throw new Error(`Could not create Chrome target: ${response.status}`);
  }

  return response.json();
}

async function waitForPageReady(client) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const result = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const error = document.querySelector(".error")?.textContent || "";
        return {
          ready: document.readyState,
          monthPages: document.querySelectorAll(".month-page").length,
          paperWidth: document.body.dataset.paperWidth || "",
          error
        };
      })()`,
      returnByValue: true
    });
    const value = result.result?.value || {};

    if (/Print route unavailable/u.test(value.error || "")) {
      throw new Error(value.error.trim());
    }

    if (value.ready === "complete" && value.monthPages > 0 && value.paperWidth) {
      return;
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for print page to render.");
}

function connectCdp(webSocketUrl) {
  const url = new URL(webSocketUrl);
  const socket = net.connect(Number(url.port), url.hostname);
  const key = randomBytes(16).toString("base64");
  let buffer = Buffer.alloc(0);
  let handshakeComplete = false;
  let nextId = 1;
  const pending = new Map();

  socket.write([
    `GET ${url.pathname}${url.search} HTTP/1.1`,
    `Host: ${url.host}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "",
    ""
  ].join("\r\n"));

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    if (!handshakeComplete) {
      const headerEnd = buffer.indexOf("\r\n\r\n");

      if (headerEnd === -1) {
        return;
      }

      const header = buffer.slice(0, headerEnd).toString("utf8");

      if (!header.startsWith("HTTP/1.1 101")) {
        failPending(new Error(`WebSocket handshake failed:\n${header}`));
        socket.end();
        return;
      }

      handshakeComplete = true;
      buffer = buffer.slice(headerEnd + 4);
    }

    readFrames();
  });

  socket.on("error", failPending);
  socket.on("close", () => failPending(new Error("Chrome DevTools socket closed.")));

  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out connecting to Chrome DevTools websocket.")), 10000);
    const wait = setInterval(() => {
      if (handshakeComplete) {
        clearTimeout(timer);
        clearInterval(wait);
        resolvePromise({ send, close: () => socket.end() });
      }
    }, 20);
  });

  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    socket.write(encodeWebSocketText(JSON.stringify({ id, method, params })));

    return new Promise((resolvePromise, reject) => {
      pending.set(id, { resolve: resolvePromise, reject });
    });
  }

  function readFrames() {
    while (buffer.length >= 2) {
      const frame = decodeFrame(buffer);

      if (!frame) {
        return;
      }

      buffer = buffer.slice(frame.length);

      if (frame.opcode === 1) {
        const message = JSON.parse(frame.payload.toString("utf8"));

        if (message.id && pending.has(message.id)) {
          const deferred = pending.get(message.id);
          pending.delete(message.id);

          if (message.error) {
            deferred.reject(new Error(message.error.message || JSON.stringify(message.error)));
          } else {
            deferred.resolve(message.result || {});
          }
        }
      }

      if (frame.opcode === 8) {
        socket.end();
      }
    }
  }

  function failPending(error) {
    for (const deferred of pending.values()) {
      deferred.reject(error);
    }
    pending.clear();
  }
}

function encodeWebSocketText(text) {
  const payload = Buffer.from(text);
  const headerLength = payload.length < 126 ? 2 : payload.length <= 0xffff ? 4 : 10;
  const frame = Buffer.alloc(headerLength + 4 + payload.length);
  const mask = randomBytes(4);

  frame[0] = 0x81;

  if (payload.length < 126) {
    frame[1] = 0x80 | payload.length;
  } else if (payload.length <= 0xffff) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(payload.length, 2);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  mask.copy(frame, headerLength);

  for (let index = 0; index < payload.length; index += 1) {
    frame[headerLength + 4 + index] = payload[index] ^ mask[index % 4];
  }

  return frame;
}

function decodeFrame(buffer) {
  const second = buffer[1];
  let length = second & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < 4) {
      return null;
    }
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) {
      return null;
    }
    length = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  const masked = Boolean(second & 0x80);
  const maskLength = masked ? 4 : 0;
  const total = offset + maskLength + length;

  if (buffer.length < total) {
    return null;
  }

  const payload = Buffer.from(buffer.slice(offset + maskLength, total));

  if (masked) {
    const mask = buffer.slice(offset, offset + 4);

    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }

  return {
    opcode: buffer[0] & 0x0f,
    payload,
    length: total
  };
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
