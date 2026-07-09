export function renderPrintPages(project, settings, options) {
  const { sourceLabel, monthImages, monthImageSettings, layout, interactive = false } = options;
  const source = { label: sourceLabel || "Calendar" };
  return project.pages.map((page) => renderMonthPage(page, settings, source, monthImages, monthImageSettings || {}, layout, { interactive })).join("");
}

export function renderMonthPage(page, settings, source, monthImages, monthImageSettings, layout, options = {}) {
  const image = monthImages[page.month];
  const imageStyle = imageStyleAttribute(monthImageSettings[page.month]);
  const weekdayHeader = [
    `<div class="week-number" title="Week numbers">#</div>`,
    ...page.weekdayLabels.map((label) => `<div class="weekday">${escapeHtml(shortenWeekday(label))}</div>`)
  ].join("");
  const weeks = page.weeks.map((week) => {
    const days = week.days.map((day) => renderDayCell(day)).join("");
    return `<div class="week-number">${week.weekNumber}</div>${days}`;
  }).join("");
  const title = layout.showMonthTitle === false
    ? `<header class="month-title month-title-hidden"><span>${page.year} · ${escapeHtml(settings.weekNumbering)} · ${escapeHtml(source?.label || "")}</span></header>`
    : `<header class="month-title"><h2>${escapeHtml(page.name)}</h2><span>${page.year} · ${escapeHtml(settings.weekNumbering)} · ${escapeHtml(source?.label || "")}</span></header>`;

  return `
    <article class="month-page template-${escapeHtml(safeClass(layout.templateId || "classic"))}" style="${pageStyle(layout)}" aria-label="${escapeHtml(page.name)} ${page.year}">
      ${title}
      <div class="month-image" style="aspect-ratio: ${escapeHtml(ratioToCss(layout.imageRatio))}">${image ? `<img src="${image}" alt="" style="${imageStyle}">` : "<span>Month photo</span>"}${options.interactive ? `<button class="image-add-button" type="button" data-add-image-month="${page.month}" aria-label="Add photo for ${escapeHtml(page.name)}">+</button>` : ""}</div>
      <div class="calendar-grid">${weekdayHeader}${weeks}</div>
      <footer class="page-footer">${escapeHtml(layout.infoText)}</footer>
    </article>
  `;
}

export function renderPrintDocument(project, settings, options) {
  const layout = options.layout;
  const pages = renderPrintPages(project, settings, options);
  const styles = renderStandalonePrintCss(layout);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.title || "Physicalendar print export")}</title>
    <style>${styles}</style>
  </head>
  <body data-paper-width="${escapeHtml(layout.paperWidth)}" data-paper-height="${escapeHtml(layout.paperHeight)}" data-paper-unit="${escapeHtml(layout.unit)}">
    <main class="print-document">${pages}</main>
  </body>
</html>`;
}

export function dynamicPrintCss(layout) {
  const unit = sanitizeUnit(layout.unit);
  return `
    @page {
      size: ${numberCss(layout.paperWidth)}${unit} ${numberCss(layout.paperHeight)}${unit};
      margin: 0;
    }

    @media print {
      .month-page {
        width: ${numberCss(layout.paperWidth)}${unit};
        height: ${numberCss(layout.paperHeight)}${unit};
        min-height: ${numberCss(layout.paperHeight)}${unit};
        padding: ${numberCss(layout.marginTop)}${unit} ${numberCss(layout.marginRight)}${unit} ${numberCss(layout.marginBottom)}${unit} ${numberCss(layout.marginLeft)}${unit};
      }
    }
  `;
}

function renderStandalonePrintCss(layout) {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1e2329;
      background: #fff;
      font: 14px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .print-document {
      display: block;
    }
    .month-page {
      width: ${numberCss(layout.paperWidth)}${sanitizeUnit(layout.unit)};
      min-height: ${numberCss(layout.paperHeight)}${sanitizeUnit(layout.unit)};
      margin: 0 auto;
      padding: ${numberCss(layout.marginTop)}${sanitizeUnit(layout.unit)} ${numberCss(layout.marginRight)}${sanitizeUnit(layout.unit)} ${numberCss(layout.marginBottom)}${sanitizeUnit(layout.unit)} ${numberCss(layout.marginLeft)}${sanitizeUnit(layout.unit)};
      background: #fff;
      page-break-after: always;
      break-after: page;
      ${layoutVariables(layout)}
    }
    .month-title {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 12px;
      font-family: var(--calendar-title-font);
    }
    .month-title h2 {
      margin: 0;
      font-size: var(--calendar-title-size);
      line-height: 1;
    }
    .month-title span,
    .page-footer {
      color: #68727d;
      font-size: 13px;
    }
    .month-title-hidden {
      justify-content: flex-end;
      margin-bottom: 6px;
      min-height: 13px;
    }
    .month-image {
      display: grid;
      place-items: center;
      margin-bottom: 14px;
      border: 1px solid #cfd7df;
      background: var(--calendar-image-bg);
      color: #68727d;
      overflow: hidden;
    }
    .month-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .calendar-grid {
      display: grid;
      grid-template-columns: 34px repeat(7, minmax(0, 1fr));
      border-top: 1px solid #1e2329;
      border-left: 1px solid #1e2329;
    }
    .weekday,
    .week-number,
    .day-cell {
      min-width: 0;
      border-right: 1px solid #1e2329;
      border-bottom: 1px solid #1e2329;
    }
    .weekday,
    .week-number {
      display: grid;
      place-items: center;
      min-height: 28px;
      color: #68727d;
      font-family: Georgia, "Times New Roman", serif;
      font-size: var(--calendar-weekday-size);
    }
    .day-cell {
      position: relative;
      display: block;
      min-height: var(--calendar-day-min-height);
      padding: 5px;
      background: #fff;
      text-align: left;
      overflow: hidden;
      appearance: none;
      border-top: 0;
      border-left: 0;
      font: inherit;
    }
    .day-cell.outside {
      background: #f0f0ee;
      color: #9aa2aa;
    }
    .day-cell.holiday .day-number,
    .day-cell.holiday .event-name.holiday-name {
      color: var(--calendar-accent);
    }
    .day-number {
      font-weight: 700;
      font-size: 18px;
    }
    .day-names {
      display: grid;
      gap: 1px;
      margin-top: 3px;
      max-height: 42px;
      overflow: hidden;
      text-align: right;
      font-size: 9px;
      line-height: 1.1;
      overflow-wrap: anywhere;
      hyphens: auto;
    }
    .event-name {
      font-weight: 650;
    }
    .markers {
      position: absolute;
      right: 5px;
      bottom: 4px;
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .flag-marker {
      color: var(--calendar-accent);
      font-size: 13px;
    }
    .moon-marker {
      width: 11px;
      height: 11px;
      border: 1px solid #1e2329;
      border-radius: 999px;
      background: #fff;
    }
    .moon-marker.phase-1 {
      background: linear-gradient(90deg, #1e2329 50%, #fff 50%);
    }
    .moon-marker.phase-2 {
      background: #1e2329;
    }
    .moon-marker.phase-3 {
      background: linear-gradient(90deg, #fff 50%, #1e2329 50%);
    }
    .page-footer {
      margin-top: 10px;
      text-align: right;
      font-size: 11px;
    }
    ${dynamicPrintCss(layout)}
  `;
}

function renderDayCell(day) {
  const classes = ["day-cell"];

  if (day.isOutsideMonth) {
    classes.push("outside");
  }

  if (day.isHoliday) {
    classes.push("holiday");
  }

  const visibleNames = day.names.slice(0, 4).map((name) => {
    const className = ["day-name"];
    const attributes = [];

    if (name.event) {
      className.push("event-name");
    }

    if (name.holiday) {
      className.push("holiday-name");
    }

    if (name.category) {
      className.push(`event-category-${safeClass(name.category)}`);
      attributes.push(`data-category="${escapeHtml(name.category)}"`);
    }

    if (name.className) {
      className.push(...String(name.className).split(/\s+/u).filter(Boolean).map(safeClass));
    }

    if (name.lang) {
      attributes.push(`lang="${escapeHtml(name.lang)}"`);
    }

    return `<span class="${className.join(" ")}" ${attributes.join(" ")}>${escapeHtml(name.text)}</span>`;
  }).join("");
  const markerParts = [];

  if (day.hasFlag) {
    markerParts.push(`<span class="flag-marker" title="Flag day">◆</span>`);
  }

  if (day.moonPhase !== null) {
    markerParts.push(`<span class="moon-marker phase-${day.moonPhase}" title="Moon phase ${day.moonPhase}"></span>`);
  }

  return `
    <button class="${classes.join(" ")}" type="button" data-date="${escapeHtml(day.date)}" data-weekday-iso="${escapeHtml(day.weekday)}" data-weekday-display="${escapeHtml(day.weekdayDisplay)}">
      <span class="day-number">${day.dayNumber}</span>
      <span class="day-names">${visibleNames}</span>
      <span class="markers">${markerParts.join("")}</span>
    </button>
  `;
}

export function pageStyle(layout) {
  return [
    `aspect-ratio: ${numberCss(layout.paperWidth)} / ${numberCss(layout.paperHeight)}`,
    `padding: ${previewPadding(layout)}`,
    layoutVariables(layout)
  ].join("; ");
}

export function ratioToCss(value) {
  const [width, height] = String(value || "4/3").split("/").map(Number);
  return `${width || 4} / ${height || 3}`;
}

function imageStyleAttribute(settings = {}) {
  const fit = ["cover", "contain", "fill"].includes(settings.fit) ? settings.fit : "cover";
  const positionX = percentCss(settings.positionX, 50);
  const positionY = percentCss(settings.positionY, 50);
  const scale = percentCss(settings.scale, 100, 100, 250) / 100;

  return escapeHtml(`object-fit: ${fit}; object-position: ${positionX}% ${positionY}%; transform: scale(${scale}); transform-origin: ${positionX}% ${positionY}%;`);
}

function previewPadding(layout) {
  const width = Math.max(Number(layout.paperWidth) || 210, 1);
  const scale = 100 / width;
  const top = Math.max(8, layout.marginTop * scale);
  const right = Math.max(8, layout.marginRight * scale);
  const bottom = Math.max(8, layout.marginBottom * scale);
  const left = Math.max(8, layout.marginLeft * scale);
  return `${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px`;
}

function layoutVariables(layout) {
  const style = layout.style || {};

  return [
    `--calendar-accent: ${colorCss(style.accent, "#176b5b")}`,
    `--calendar-image-bg: ${colorCss(style.imageBackground, "#ece7dd")}`,
    `--calendar-title-font: ${fontCss(style.titleFont, "Georgia, Times New Roman, serif")}`,
    `--calendar-title-size: ${numberCss(style.titleSize || 28)}px`,
    `--calendar-weekday-size: ${numberCss(style.weekdaySize || 12)}px`,
    `--calendar-day-min-height: ${numberCss(style.dayMinHeight || 72)}px`
  ].join("; ");
}

function sanitizeUnit(unit) {
  return ["mm", "in", "pt", "cm"].includes(unit) ? unit : "mm";
}

function numberCss(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.max(number, 0)) : "0";
}

function percentCss(value, fallback, min = 0, max = 100) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function colorCss(value, fallback) {
  const color = String(value || fallback);
  return /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;
}

function fontCss(value, fallback) {
  const font = String(value || fallback);
  return /^[A-Za-z0-9\s",.-]+$/u.test(font) ? font : fallback;
}

function safeClass(value) {
  return String(value || "classic").replace(/[^a-z0-9_-]/giu, "");
}

function stripSoftHyphens(value) {
  return String(value || "").replace(/\u00ad/g, "");
}

function shortenWeekday(label) {
  return stripSoftHyphens(label).slice(0, 3);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
