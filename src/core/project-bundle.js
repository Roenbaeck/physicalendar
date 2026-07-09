const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ZIP_STORE = 0;

export async function createProjectBundle(projectData) {
  const entries = [
    textEntry("project.json", JSON.stringify(projectData.project, null, 2)),
    textEntry("calendars/source.xml", projectData.sourceXml),
    textEntry("generated/year-facts.xml", projectData.factsXml || ""),
    textEntry("generated/print.html", projectData.printHtml || ""),
    textEntry("generated/pdf-commands.txt", projectData.pdfCommands || "")
  ];

  if (projectData.pdf?.bytes) {
    entries.push({
      name: projectData.pdf.path || "generated/calendar.pdf",
      bytes: projectData.pdf.bytes
    });
  }

  for (const image of projectData.images || []) {
    entries.push({
      name: image.path,
      bytes: image.bytes
    });
  }

  entries.unshift(textEntry("manifest.json", JSON.stringify(createBundleManifest(projectData, entries), null, 2)));

  return createZip(entries);
}

export async function readProjectBundle(fileOrBuffer) {
  const buffer = fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer();
  const entries = readZip(buffer);
  const textEntries = new Map();
  const imageDataUrls = {};
  let pdfEntry = null;

  for (const entry of entries) {
    if (entry.name.endsWith(".json") || entry.name.endsWith(".xml") || entry.name.endsWith(".html") || entry.name.endsWith(".txt")) {
      textEntries.set(entry.name, decoder.decode(entry.bytes));
    }

    if (entry.name.startsWith("images/")) {
      const month = imageMonthFromPath(entry.name);
      const mimeType = mimeTypeFromPath(entry.name);

      if (month) {
        imageDataUrls[month] = `data:${mimeType};base64,${bytesToBase64(entry.bytes)}`;
      }
    }

    if (entry.name.endsWith(".pdf")) {
      pdfEntry = {
        path: entry.name,
        bytes: entry.bytes,
        size: entry.bytes.length,
        dataUrl: `data:application/pdf;base64,${bytesToBase64(entry.bytes)}`
      };
    }
  }

  const projectJson = textEntries.get("project.json");

  if (!projectJson) {
    throw new Error("Project bundle is missing project.json.");
  }

  const project = JSON.parse(projectJson);
  return {
    manifest: JSON.parse(textEntries.get("manifest.json") || "null"),
    project,
    sourceXml: textEntries.get("calendars/source.xml") || project.sourceXml || "",
    factsXml: textEntries.get("generated/year-facts.xml") || "",
    printHtml: textEntries.get("generated/print.html") || "",
    pdfCommands: textEntries.get("generated/pdf-commands.txt") || "",
    pdf: pdfEntry,
    monthImages: imageDataUrls
  };
}

function createBundleManifest(projectData, entries) {
  const project = projectData.project || {};
  const imageEntries = projectData.images || [];

  return {
    format: "physicalendar-project-bundle",
    version: 1,
    createdAt: project.savedAt || new Date().toISOString(),
    projectVersion: project.version || null,
    sourceLabel: project.sourceLabel || "",
    year: project.settings?.year || null,
    entryCount: entries.length + 1,
    imageCount: imageEntries.length,
    entries: [
      "manifest.json",
      ...entries.map((entry) => entry.name)
    ],
    generated: {
      sourceXml: Boolean(projectData.sourceXml),
      yearFactsXml: Boolean(projectData.factsXml),
      printHtml: Boolean(projectData.printHtml),
      pdfCommands: Boolean(projectData.pdfCommands),
      pdf: Boolean(projectData.pdf?.bytes)
    }
  };
}

export function imageEntriesFromMonthImages(monthImages) {
  const entries = [];

  for (const [month, dataUrl] of Object.entries(monthImages || {})) {
    const parsed = dataUrlToBytes(dataUrl);

    if (!parsed) {
      continue;
    }

    entries.push({
      month,
      path: `images/${String(month).padStart(2, "0")}.${extensionFromMimeType(parsed.mimeType)}`,
      bytes: parsed.bytes,
      mimeType: parsed.mimeType
    });
  }

  return entries;
}

export function projectImageRefs(imageEntries) {
  return Object.fromEntries(imageEntries.map((entry) => [entry.month, entry.path]));
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const bytes = entry.bytes;
    const crc = crc32(bytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const local = new DataView(localHeader.buffer);

    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, ZIP_STORE, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, bytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const central = new DataView(centralHeader.buffer);

    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, ZIP_STORE, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, bytes.length, true);
    central.setUint32(24, bytes.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + bytes.length;
  }

  const centralOffset = offset;
  const centralSize = totalLength(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function readZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocdOffset = findSignature(bytes, 0x06054b50, Math.max(0, bytes.length - 65557));

  if (eocdOffset < 0) {
    throw new Error("Could not find ZIP central directory.");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let cursor = view.getUint32(eocdOffset + 16, true);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory.");
    }

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));

    if (method !== ZIP_STORE) {
      throw new Error(`Unsupported ZIP compression method for ${name}.`);
    }

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({
      name,
      bytes: bytes.slice(dataOffset, dataOffset + compressedSize)
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function textEntry(name, text) {
  return {
    name,
    bytes: encoder.encode(text)
  };
}

function totalLength(parts) {
  return parts.reduce((sum, part) => sum + part.length, 0);
}

function findSignature(bytes, signature, start) {
  for (let index = bytes.length - 4; index >= start; index -= 1) {
    if (
      bytes[index] === (signature & 0xff) &&
      bytes[index + 1] === ((signature >> 8) & 0xff) &&
      bytes[index + 2] === ((signature >> 16) & 0xff) &&
      bytes[index + 3] === ((signature >> 24) & 0xff)
    ) {
      return index;
    }
  }

  return -1;
}

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function dataUrlToBytes(dataUrl) {
  const match = /^data:([^;,]+);base64,(.*)$/u.exec(dataUrl || "");

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    bytes: base64ToBytes(match[2])
  };
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 8192;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
}

function extensionFromMimeType(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

function mimeTypeFromPath(path) {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function imageMonthFromPath(path) {
  const match = /^images\/(\d{2})\./u.exec(path);
  return match ? String(Number(match[1])) : null;
}
