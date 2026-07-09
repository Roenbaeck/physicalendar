import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));

if (!args.input) {
  console.error("Usage: node scripts/verify-pdf.mjs --input calendar.pdf [--pages 12] [--width 210 --height 297 --unit mm]");
  process.exit(1);
}

const inputPath = resolve(args.input);
const bytes = await readFile(inputPath);
const info = await stat(inputPath);
const head = bytes.slice(0, 5).toString("ascii");
const text = bytes.toString("latin1");
const pageCount = (text.match(/\/Type\s*\/Page\b/g) || []).length;
const objects = parseObjects(text);
const pages = findPageObjects(objects);

if (head !== "%PDF-") {
  throw new Error(`${inputPath} does not start with a PDF header.`);
}

if (!text.includes("%%EOF")) {
  throw new Error(`${inputPath} does not contain a PDF EOF marker.`);
}

if (info.size < 1000) {
  throw new Error(`${inputPath} is too small to be a useful PDF (${info.size} bytes).`);
}

if (args.pages !== null && pageCount !== args.pages) {
  throw new Error(`${inputPath} has ${pageCount} pages; expected ${args.pages}.`);
}

if (pages.length !== pageCount) {
  throw new Error(`${inputPath} has inconsistent page structure: regex count ${pageCount}, parsed page objects ${pages.length}.`);
}

if (args.width !== null || args.height !== null) {
  verifyPageSize({ inputPath, text, pages, expectedWidth: args.width, expectedHeight: args.height, unit: args.unit, tolerance: args.tolerance });
}

verifyPageContents({ inputPath, pages, objects });

console.log(`Verified ${inputPath}: ${pageCount} pages, ${info.size} bytes`);

function parseArgs(argv) {
  const parsed = {
    input: "",
    pages: null,
    width: null,
    height: null,
    unit: "pt",
    tolerance: 2
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      parsed.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--pages") {
      parsed.pages = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--width") {
      parsed.width = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--height") {
      parsed.height = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--unit") {
      parsed.unit = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--tolerance") {
      parsed.tolerance = Number(argv[index + 1]);
      index += 1;
    }
  }

  return parsed;
}

function parseObjects(text) {
  const objects = new Map();
  const pattern = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    objects.set(`${match[1]} ${match[2]}`, {
      id: Number(match[1]),
      generation: Number(match[2]),
      body: match[3]
    });
  }

  return objects;
}

function findPageObjects(objects) {
  return Array.from(objects.values()).filter((object) => /\/Type\s*\/Page\b/.test(object.body));
}

function verifyPageSize({ inputPath, text, pages, expectedWidth, expectedHeight, unit, tolerance }) {
  if (expectedWidth === null || expectedHeight === null) {
    throw new Error("--width and --height must be provided together.");
  }

  const expected = {
    width: toPoints(expectedWidth, unit),
    height: toPoints(expectedHeight, unit)
  };
  const pageBoxes = pages.map((page) => mediaBoxFrom(page.body)).filter(Boolean);
  const boxes = pageBoxes.length === pages.length ? pageBoxes : mediaBoxesFrom(text);

  if (boxes.length === 0) {
    throw new Error(`${inputPath} does not contain a readable PDF MediaBox.`);
  }

  for (const [index, box] of boxes.entries()) {
    const width = Math.abs(box.x2 - box.x1);
    const height = Math.abs(box.y2 - box.y1);
    const direct = closeTo(width, expected.width, tolerance) && closeTo(height, expected.height, tolerance);
    const rotated = closeTo(width, expected.height, tolerance) && closeTo(height, expected.width, tolerance);

    if (!direct && !rotated) {
      throw new Error(
        `${inputPath} page size ${index + 1} is ${width.toFixed(2)}x${height.toFixed(2)}pt; expected ${expected.width.toFixed(2)}x${expected.height.toFixed(2)}pt.`
      );
    }
  }
}

function verifyPageContents({ inputPath, pages, objects }) {
  pages.forEach((page, index) => {
    const refs = contentRefs(page.body);

    if (refs.length === 0) {
      throw new Error(`${inputPath} page ${index + 1} does not reference a content stream.`);
    }

    const streamBytes = refs.reduce((sum, ref) => sum + streamLength(objects.get(ref)?.body || ""), 0);

    if (streamBytes < 20) {
      throw new Error(`${inputPath} page ${index + 1} content streams look empty (${streamBytes} bytes).`);
    }
  });
}

function mediaBoxFrom(text) {
  return mediaBoxesFrom(text)[0] || null;
}

function mediaBoxesFrom(text) {
  const boxes = [];
  const pattern = /\/MediaBox\s*\[\s*([-.\d]+)\s+([-.\d]+)\s+([-.\d]+)\s+([-.\d]+)\s*\]/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    boxes.push({
      x1: Number(match[1]),
      y1: Number(match[2]),
      x2: Number(match[3]),
      y2: Number(match[4])
    });
  }

  return boxes;
}

function contentRefs(pageBody) {
  const direct = pageBody.match(/\/Contents\s+(\d+)\s+(\d+)\s+R/);

  if (direct) {
    return [`${direct[1]} ${direct[2]}`];
  }

  const array = pageBody.match(/\/Contents\s*\[([^\]]+)\]/);

  if (!array) {
    return [];
  }

  return Array.from(array[1].matchAll(/(\d+)\s+(\d+)\s+R/g)).map((match) => `${match[1]} ${match[2]}`);
}

function streamLength(body) {
  const stream = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
  return stream ? stream[1].trim().length : 0;
}

function toPoints(value, unit) {
  if (unit === "pt") {
    return value;
  }

  if (unit === "in") {
    return value * 72;
  }

  if (unit === "mm") {
    return value * 72 / 25.4;
  }

  if (unit === "cm") {
    return value * 72 / 2.54;
  }

  throw new Error(`Unsupported page-size unit: ${unit}`);
}

function closeTo(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}
