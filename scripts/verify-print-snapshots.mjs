import { inflateSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const inputDir = resolve(args.inputDir || "artifacts/print-snapshots");
const templates = args.templates.length > 0 ? args.templates : ["classic", "gallery", "compact"];

for (const template of templates) {
  const inputPath = resolve(inputDir, `${template}.png`);
  const info = await stat(inputPath);
  const png = decodePng(await readFile(inputPath));

  if (info.size < args.minBytes) {
    throw new Error(`${inputPath} is too small for a useful visual snapshot (${info.size} bytes).`);
  }

  if (png.width !== args.width || png.height !== args.height) {
    throw new Error(`${inputPath} is ${png.width}x${png.height}; expected ${args.width}x${args.height}.`);
  }

  if (png.nonWhitePixels < args.minNonWhitePixels) {
    throw new Error(`${inputPath} looks blank: only ${png.nonWhitePixels} non-white pixels.`);
  }

  if (png.sampledColors < args.minSampledColors) {
    throw new Error(`${inputPath} has too little visual variation: ${png.sampledColors} sampled colors.`);
  }

  console.log(`Verified ${inputPath}: ${png.width}x${png.height}, ${info.size} bytes, ${png.nonWhitePixels} non-white pixels`);
}

function parseArgs(argv) {
  const parsed = {
    height: 1800,
    inputDir: "",
    minBytes: 10000,
    minNonWhitePixels: 10000,
    minSampledColors: 10,
    templates: [],
    width: 1280
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--indir") {
      parsed.inputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--template") {
      parsed.templates.push(argv[index + 1]);
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

    if (arg === "--min-bytes") {
      parsed.minBytes = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--min-non-white-pixels") {
      parsed.minNonWhitePixels = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--min-sampled-colors") {
      parsed.minSampledColors = Number(argv[index + 1]);
      index += 1;
    }
  }

  return parsed;
}

function decodePng(bytes) {
  assertPngSignature(bytes);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.slice(offset + 4, offset + 8).toString("ascii");
    const data = bytes.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    }

    if (type === "IDAT") {
      idat.push(data);
    }

    if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error(`Unsupported PNG format: bit depth ${bitDepth}, interlace ${interlace}.`);
  }

  const bytesPerPixel = pixelStride(colorType);
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * stride);
  let sourceOffset = 0;
  let targetOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    unfilterScanline({
      bytesPerPixel,
      filter,
      output: pixels,
      previousOffset: targetOffset - stride,
      scanline: inflated.subarray(sourceOffset, sourceOffset + stride),
      targetOffset,
      width: stride
    });
    sourceOffset += stride;
    targetOffset += stride;
  }

  return {
    width,
    height,
    ...analyzePixels(pixels, width, height, bytesPerPixel, colorType)
  };
}

function assertPngSignature(bytes) {
  const signature = "89504e470d0a1a0a";

  if (bytes.slice(0, 8).toString("hex") !== signature) {
    throw new Error("Snapshot is not a PNG file.");
  }
}

function pixelStride(colorType) {
  if (colorType === 2) {
    return 3;
  }

  if (colorType === 6) {
    return 4;
  }

  throw new Error(`Unsupported PNG color type: ${colorType}.`);
}

function unfilterScanline({ bytesPerPixel, filter, output, previousOffset, scanline, targetOffset, width }) {
  for (let index = 0; index < width; index += 1) {
    const raw = scanline[index];
    const left = index >= bytesPerPixel ? output[targetOffset + index - bytesPerPixel] : 0;
    const up = previousOffset >= 0 ? output[previousOffset + index] : 0;
    const upLeft = previousOffset >= 0 && index >= bytesPerPixel ? output[previousOffset + index - bytesPerPixel] : 0;
    let value = raw;

    if (filter === 1) {
      value += left;
    } else if (filter === 2) {
      value += up;
    } else if (filter === 3) {
      value += Math.floor((left + up) / 2);
    } else if (filter === 4) {
      value += paeth(left, up, upLeft);
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}.`);
    }

    output[targetOffset + index] = value & 255;
  }
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  if (upDistance <= upLeftDistance) {
    return up;
  }

  return upLeft;
}

function analyzePixels(pixels, width, height, bytesPerPixel, colorType) {
  let nonWhitePixels = 0;
  const sampledColors = new Set();

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * bytesPerPixel;
    const alpha = colorType === 6 ? pixels[offset + 3] : 255;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];

    if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
      nonWhitePixels += 1;
    }

    if (pixel % 997 === 0) {
      sampledColors.add(`${red},${green},${blue},${alpha}`);
    }
  }

  return {
    nonWhitePixels,
    sampledColors: sampledColors.size
  };
}
