import {
  buildCalendarProject,
  customFactsCalculation,
  parseCalendarXml
} from "./core/calendar-engine.js";
import {
  dynamicPrintCss,
  renderPrintPages
} from "./core/print-renderer.js";
import { resolveLayout } from "./core/layout-templates.js";
import { readLocalProject } from "./core/project-storage.js";

const root = document.querySelector("#printRoot");

renderRoute();

async function renderRoute() {
  try {
    const params = new URLSearchParams(window.location.search);
    const projectSnapshot = await loadProjectSnapshot(params);

    if (!projectSnapshot) {
      throw new Error("No project source was provided and no local Physicalendar project has been saved yet.");
    }

    const settings = projectSnapshot.settings || {};
    const layout = resolveLayout(projectSnapshot.layout || {});
    const sourceDoc = parseCalendarXml(projectSnapshot.sourceXml || "");
    const calculations = Array.isArray(projectSnapshot.customFacts) && projectSnapshot.customFacts.length > 0
      ? [customFactsCalculation(projectSnapshot.customFacts)]
      : [];
    const project = buildCalendarProject(sourceDoc, settings, {
      customRules: projectSnapshot.customRules || [],
      calculations
    });

    document.title = `Physicalendar ${settings.year || ""} Print`.trim();
    writePaperDataset(layout);
    updatePrintStyle(layout);
    root.innerHTML = renderPrintPages(project, settings, {
      sourceId: projectSnapshot.sourceId || sourceIdFromLabel(projectSnapshot.sourceLabel),
      sourceLabel: projectSnapshot.sourceLabel || "Calendar",
      monthImages: projectSnapshot.monthImages || {},
      monthImageSettings: projectSnapshot.monthImageSettings || {},
      layout
    });

    document.body.classList.add("print-ready");
    await nextFrame();
    await nextFrame();
    layoutRouteImages(projectSnapshot.monthImageSettings || {});

    if (params.get("print") === "1") {
      window.addEventListener("beforeprint", () => {
        document.body.classList.add("print-ready");
        layoutRouteImages(projectSnapshot.monthImageSettings || {});
      }, { once: true });
      requestAnimationFrame(() => {
        document.body.classList.add("print-ready");
        layoutRouteImages(projectSnapshot.monthImageSettings || {});
        window.print();
      });
    }
  } catch (error) {
    root.innerHTML = `
      <div class="error">
        <strong>Print route unavailable</strong>
        <span>${escapeHtml(error.message || String(error))}</span>
        <a href="./index.html">Open the editor</a>
      </div>
    `;
  }
}

async function loadProjectSnapshot(params) {
  if (params.has("projectKey")) {
    const key = params.get("projectKey");
    const openerProjects = window.opener?.__physicalendarPrintProjects;

    if (key && openerProjects && openerProjects[key]) {
      const project = openerProjects[key];
      delete openerProjects[key];
      return project;
    }

    throw new Error("The print project could not be transferred from the editor window.");
  }

  if (params.has("project")) {
    const response = await fetch(params.get("project"));

    if (!response.ok) {
      throw new Error(`Could not load project JSON: ${response.status}`);
    }

    return response.json();
  }

  if (params.has("source")) {
    const sourceUrl = params.get("source");
    const response = await fetch(sourceUrl);

    if (!response.ok) {
      throw new Error(`Could not load source XML: ${response.status}`);
    }

    const sourceXml = await response.text();
    return {
      version: 4,
      sourceLabel: params.get("label") || sourceUrl.split("/").pop()?.replace(/\.xml$/i, "") || "Calendar",
      sourceXml,
      settings: settingsFromParams(params),
      layout: layoutFromParams(params),
      customRules: [],
      customFacts: [],
      monthImages: {},
      monthImageSettings: {}
    };
  }

  return readLocalProject();
}

function settingsFromParams(params) {
  return {
    year: numberParam(params, "year", new Date().getFullYear()),
    locale: params.get("locale") || "en-US",
    timeZone: params.get("timeZone") || "",
    weekNumbering: params.get("weekNumbering") || "ISO",
    startingWeekday: numberParam(params, "startingWeekday", 1),
    gmt: numberParam(params, "gmt", 0)
  };
}

function layoutFromParams(params) {
  return {
    templateId: params.get("template") || "classic",
    unit: params.get("unit") || "mm",
    paperWidth: numberParam(params, "paperWidth", 210),
    paperHeight: numberParam(params, "paperHeight", 297),
    marginTop: numberParam(params, "marginTop", 15),
    marginRight: numberParam(params, "marginRight", 10),
    marginBottom: numberParam(params, "marginBottom", 8),
    marginLeft: numberParam(params, "marginLeft", 10),
    imageRatio: params.get("imageRatio") || "4/3",
    infoText: params.get("infoText") || "Physicalendar print route"
  };
}

function numberParam(params, name, fallback) {
  const value = Number(params.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function writePaperDataset(layout) {
  document.body.dataset.paperWidth = String(layout.paperWidth);
  document.body.dataset.paperHeight = String(layout.paperHeight);
  document.body.dataset.paperUnit = layout.unit || "mm";
}

function updatePrintStyle(layout) {
  const style = document.createElement("style");
  const unit = sanitizeUnitLocal(layout.unit);
  const width = `${numberCssLocal(layout.paperWidth)}${unit}`;
  const height = `${numberCssLocal(layout.paperHeight)}${unit}`;
  const padding = `${numberCssLocal(layout.marginTop)}${unit} ${numberCssLocal(layout.marginRight)}${unit} ${numberCssLocal(layout.marginBottom)}${unit} ${numberCssLocal(layout.marginLeft)}${unit}`;

  style.textContent = `${dynamicPrintCss(layout)}
    .print-route {
      background: #fff !important;
    }
    .print-route .print-document {
      display: block !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }
    .print-route .month-page {
      width: ${width} !important;
      max-height: calc(${height} - 0.5mm) !important;
      height: auto !important;
      min-height: 0 !important;
      padding: ${padding} !important;
      margin: 0 !important;
      border: 0 !important;
      box-shadow: none !important;
      overflow: hidden !important;
      aspect-ratio: ${numberCssLocal(layout.paperWidth)} / ${numberCssLocal(layout.paperHeight)} !important;
      break-after: auto !important;
      page-break-after: auto !important;
      break-before: auto !important;
      page-break-before: auto !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .print-route .month-divider {
      background: transparent !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100%;
      height: 100%;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      .print-route,
      .print-route .print-document,
      html, body, .print-document {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      .print-route .month-page {
        width: ${width} !important;
        max-height: calc(${height} - 0.5mm) !important;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        border: 0 !important;
        box-shadow: none !important;
        overflow: hidden !important;
        break-after: auto !important;
        page-break-after: auto !important;
        break-before: auto !important;
        page-break-before: auto !important;
      }
      .print-route .month-divider {
        background: transparent !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function layoutRouteImages(monthImageSettings) {
  for (const container of root.querySelectorAll(".month-image[data-image-month]")) {
    const month = container.dataset.imageMonth;
    const image = container.querySelector("img");
    const settings = monthImageSettings?.[month];
    const meta = settings?.meta || {};
    const sourceWidth = Number(meta.width);
    const sourceHeight = Number(meta.height);

    if (!image || !sourceWidth || !sourceHeight) {
      continue;
    }

    const containerWidth = Math.max(container.clientWidth, 1);
    const containerHeight = Math.max(container.clientHeight, 1);
    const fit = ["cover", "contain", "fill"].includes(settings.fit) ? settings.fit : "cover";
    const scale = Math.max(Number(settings.scale) || 100, 1) / 100;
    let renderWidth = containerWidth;
    let renderHeight = containerHeight;

    if (fit === "fill") {
      renderWidth = containerWidth * scale;
      renderHeight = containerHeight * scale;
    } else {
      const baseScale = fit === "contain"
        ? Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight)
        : Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight);

      renderWidth = sourceWidth * baseScale * scale;
      renderHeight = sourceHeight * baseScale * scale;
    }

    const overflowX = Math.max(0, renderWidth - containerWidth);
    const overflowY = Math.max(0, renderHeight - containerHeight);
    const positionX = clampPercent(settings.positionX);
    const positionY = clampPercent(settings.positionY);
    const left = -overflowX * (positionX / 100);
    const top = -overflowY * (positionY / 100);

    image.style.position = "absolute";
    image.style.left = `${left}px`;
    image.style.top = `${top}px`;
    image.style.width = `${renderWidth}px`;
    image.style.height = `${renderHeight}px`;
    image.style.maxWidth = "none";
    image.style.maxHeight = "none";
    image.style.objectFit = "fill";
    image.style.objectPosition = "50% 50%";
    image.style.transform = "none";
    image.style.transformOrigin = "50% 50%";
  }
}

function numberCssLocal(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.max(number, 0)) : "0";
}

function sanitizeUnitLocal(unit) {
  return ["mm", "in", "pt", "cm"].includes(unit) ? unit : "mm";
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
