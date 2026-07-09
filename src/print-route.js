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
      sourceLabel: projectSnapshot.sourceLabel || "Calendar",
      monthImages: projectSnapshot.monthImages || {},
      monthImageSettings: projectSnapshot.monthImageSettings || {},
      layout
    });

    if (params.get("print") === "1") {
      requestAnimationFrame(() => window.print());
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
  style.textContent = dynamicPrintCss(layout);
  document.head.appendChild(style);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
