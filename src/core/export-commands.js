export function pdfExportCommands(options = {}) {
  const year = Number(options.year || new Date().getFullYear());
  const label = safeFilename(options.label || "physicalendar");
  const layout = options.layout || {};
  const printHtmlFile = options.printHtmlFile || `${label}-${year}-print.html`;
  const pdfFile = options.pdfFile || `artifacts/${label}-${year}.pdf`;
  const unit = layout.unit || "mm";
  const width = Number(layout.paperWidth || 210);
  const height = Number(layout.paperHeight || 297);

  return {
    printHtmlFile,
    pdfFile,
    pdfCommand: `npm run pdf -- --input ${shellQuote(printHtmlFile)} --output ${shellQuote(pdfFile)}`,
    verifyCommand: `npm run verify:pdf -- --input ${shellQuote(pdfFile)} --pages 12 --width ${formatNumber(width)} --height ${formatNumber(height)} --unit ${shellQuote(unit)}`
  };
}

export function exportPanelSummary(options = {}) {
  const layout = options.layout || {};
  const report = options.report || {};
  const counts = report.counts || {};
  const commands = options.commands || pdfExportCommands({
    year: options.year,
    label: options.label,
    layout
  });
  const unit = layout.unit || "mm";
  const margins = [layout.marginTop, layout.marginRight, layout.marginBottom, layout.marginLeft]
    .map((value) => formatNumber(Number(value || 0)))
    .join(" / ");
  const issueCount = Number(counts.issues ?? report.issues?.length ?? 0);

  return [
    { label: "Status", value: report.ok === false ? "Needs attention" : "Ready" },
    { label: "Pages", value: String(counts.pages || options.pages || 12) },
    { label: "Paper", value: `${formatNumber(Number(layout.paperWidth || 210))} x ${formatNumber(Number(layout.paperHeight || 297))} ${unit}` },
    { label: "Margins", value: `${margins} ${unit}` },
    { label: "Image ratio", value: String(layout.imageRatio || "4/3") },
    { label: "Time zone", value: options.timeZone || `GMT ${formatSignedNumber(Number(options.gmt || 0))}` },
    { label: "PDF", value: commands.pdfFile },
    { label: "Preflight", value: `${issueCount} issue${issueCount === 1 ? "" : "s"}` }
  ];
}

function shellQuote(value) {
  const text = String(value ?? "");

  if (/^[A-Za-z0-9_./:=@+-]+$/u.test(text)) {
    return text;
  }

  return `'${text.replace(/'/g, "'\\''")}'`;
}

function safeFilename(value) {
  const text = String(value || "physicalendar")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return text || "physicalendar";
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function formatSignedNumber(value) {
  const formatted = formatNumber(value);
  return value >= 0 ? `+${formatted}` : formatted;
}
