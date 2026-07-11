import {
  CALENDAR_SOURCES,
  buildCalendarProject,
  compileCustomRule,
  createPreflightReport,
  customFactsCalculation,
  loadCalendarSource,
  parseCalendarXml,
  serializeXml
} from "./core/calendar-engine.js";
import {
  dynamicPrintCss,
  renderPrintDocument,
  renderPrintPages
} from "./core/print-renderer.js";
import {
  createProjectBundle,
  imageEntriesFromMonthImages,
  projectImageRefs,
  readProjectBundle
} from "./core/project-bundle.js";
import {
  DEFAULT_LAYOUT,
  LAYOUT_TEMPLATES,
  applyLayoutTemplate,
  resolveLayout
} from "./core/layout-templates.js";
import {
  clearLocalProject as clearStoredLocalProject,
  readLocalProject,
  writeLocalProject
} from "./core/project-storage.js";
import {
  measureTextOverflow,
  mergeOverflowPreflight
} from "./core/dom-preflight.js";
import { parseIcsEvents, renderIcsCalendar } from "./core/calendar-ics.js";
import { exportPanelSummary, pdfExportCommands } from "./core/export-commands.js";
import { compileCalculationHooks, defaultCalculationHooks } from "./core/calculation-hooks.js";

const state = {
  sourceDoc: null,
  project: null,
  sourceLabel: "Sweden",
  monthImages: loadStoredImages(),
  monthImageSettings: loadStoredImageSettings(),
  layout: loadStoredLayout(),
  previewZoom: loadStoredPreviewZoom(),
  previewMonth: 1,
  customRules: loadStoredCustomRules(),
  customFacts: loadStoredCustomFacts(),
  hookSource: loadStoredCalculationHooks(),
  hookCalculations: [],
  bundlePdf: null,
  editingRuleId: null
};
const PANEL_COLLAPSE_KEY = "physicalendar.panelCollapsed";

const elements = {
  app: document.querySelector("#app"),
  simpleSourceSelect: document.querySelector("#simpleSourceSelect"),
  simpleYearInput: document.querySelector("#simpleYearInput"),
  simplePaperPresetInput: document.querySelector("#simplePaperPresetInput"),
  previewMonthInput: document.querySelector("#previewMonthInput"),
  simpleImageButton: document.querySelector("#simpleImageButton"),
  quickImageInput: document.querySelector("#quickImageInput"),
  simpleAdvancedButton: document.querySelector("#simpleAdvancedButton"),
  simplePrintButton: document.querySelector("#simplePrintButton"),
  prevPageButton: document.querySelector("#prevPageButton"),
  nextPageButton: document.querySelector("#nextPageButton"),
  advancedCloseButton: document.querySelector("#advancedCloseButton"),
  sourceSelect: document.querySelector("#sourceSelect"),
  yearInput: document.querySelector("#yearInput"),
  localeInput: document.querySelector("#localeInput"),
  timeZoneInput: document.querySelector("#timeZoneInput"),
  weekSelect: document.querySelector("#weekSelect"),
  startDaySelect: document.querySelector("#startDaySelect"),
  gmtInput: document.querySelector("#gmtInput"),
  sourceImport: document.querySelector("#sourceImport"),
  icsImport: document.querySelector("#icsImport"),
  printButton: document.querySelector("#printButton"),
  exportSourceXmlButton: document.querySelector("#exportSourceXmlButton"),
  exportFactsButton: document.querySelector("#exportFactsButton"),
  exportIcsButton: document.querySelector("#exportIcsButton"),
  exportPrintHtmlButton: document.querySelector("#exportPrintHtmlButton"),
  openPrintRouteButton: document.querySelector("#openPrintRouteButton"),
  saveLocalProjectButton: document.querySelector("#saveLocalProjectButton"),
  restoreLocalProjectButton: document.querySelector("#restoreLocalProjectButton"),
  clearLocalProjectButton: document.querySelector("#clearLocalProjectButton"),
  exportProjectButton: document.querySelector("#exportProjectButton"),
  exportBundleButton: document.querySelector("#exportBundleButton"),
  downloadBundlePdfButton: document.querySelector("#downloadBundlePdfButton"),
  bundlePdfInput: document.querySelector("#bundlePdfInput"),
  projectImport: document.querySelector("#projectImport"),
  bundleImport: document.querySelector("#bundleImport"),
  templateInput: document.querySelector("#templateInput"),
  unitInput: document.querySelector("#unitInput"),
  paperWidthInput: document.querySelector("#paperWidthInput"),
  paperHeightInput: document.querySelector("#paperHeightInput"),
  marginTopInput: document.querySelector("#marginTopInput"),
  marginRightInput: document.querySelector("#marginRightInput"),
  marginBottomInput: document.querySelector("#marginBottomInput"),
  marginLeftInput: document.querySelector("#marginLeftInput"),
  imageRatioInput: document.querySelector("#imageRatioInput"),
  titleSizeInput: document.querySelector("#titleSizeInput"),
  weekdaySizeInput: document.querySelector("#weekdaySizeInput"),
  showMonthTitleInput: document.querySelector("#showMonthTitleInput"),
  infoTextInput: document.querySelector("#infoTextInput"),
  ruleForm: document.querySelector("#ruleForm"),
  ruleNameInput: document.querySelector("#ruleNameInput"),
  ruleTypeInput: document.querySelector("#ruleTypeInput"),
  ruleMonthInput: document.querySelector("#ruleMonthInput"),
  ruleDateInput: document.querySelector("#ruleDateInput"),
  ruleDayInput: document.querySelector("#ruleDayInput"),
  ruleEndDayInput: document.querySelector("#ruleEndDayInput"),
  ruleWeekdayInput: document.querySelector("#ruleWeekdayInput"),
  ruleNthInput: document.querySelector("#ruleNthInput"),
  ruleOffsetInput: document.querySelector("#ruleOffsetInput"),
  ruleAnchorInput: document.querySelector("#ruleAnchorInput"),
  ruleSunEventInput: document.querySelector("#ruleSunEventInput"),
  ruleMoonPhaseInput: document.querySelector("#ruleMoonPhaseInput"),
  ruleHolidayInput: document.querySelector("#ruleHolidayInput"),
  ruleFlagInput: document.querySelector("#ruleFlagInput"),
  ruleCategoryInput: document.querySelector("#ruleCategoryInput"),
  ruleSourceInput: document.querySelector("#ruleSourceInput"),
  rulePriorityInput: document.querySelector("#rulePriorityInput"),
  ruleClassInput: document.querySelector("#ruleClassInput"),
  ruleLangInput: document.querySelector("#ruleLangInput"),
  ruleExpectedInput: document.querySelector("#ruleExpectedInput"),
  ruleMinInput: document.querySelector("#ruleMinInput"),
  ruleMaxInput: document.querySelector("#ruleMaxInput"),
  saveRuleButton: document.querySelector("#saveRuleButton"),
  cancelRuleEditButton: document.querySelector("#cancelRuleEditButton"),
  rulePreview: document.querySelector("#rulePreview"),
  sourceXmlInput: document.querySelector("#sourceXmlInput"),
  applySourceXmlButton: document.querySelector("#applySourceXmlButton"),
  resetSourceXmlButton: document.querySelector("#resetSourceXmlButton"),
  sourceXmlStatus: document.querySelector("#sourceXmlStatus"),
  hooksInput: document.querySelector("#hooksInput"),
  applyHooksButton: document.querySelector("#applyHooksButton"),
  resetHooksButton: document.querySelector("#resetHooksButton"),
  hooksStatus: document.querySelector("#hooksStatus"),
  localProjectStatus: document.querySelector("#localProjectStatus"),
  previewZoomInput: document.querySelector("#previewZoomInput"),
  previewZoomOutput: document.querySelector("#previewZoomOutput"),
  customRulesPanel: document.querySelector("#customRulesPanel"),
  factForm: document.querySelector("#factForm"),
  factNameInput: document.querySelector("#factNameInput"),
  factTypeInput: document.querySelector("#factTypeInput"),
  factMonthInput: document.querySelector("#factMonthInput"),
  factDayInput: document.querySelector("#factDayInput"),
  factWeekdayInput: document.querySelector("#factWeekdayInput"),
  factNthInput: document.querySelector("#factNthInput"),
  factOffsetInput: document.querySelector("#factOffsetInput"),
  factSunEventInput: document.querySelector("#factSunEventInput"),
  factMoonPhaseInput: document.querySelector("#factMoonPhaseInput"),
  factValueInput: document.querySelector("#factValueInput"),
  factAnchorInput: document.querySelector("#factAnchorInput"),
  customFactsPanel: document.querySelector("#customFactsPanel"),
  imageInputs: document.querySelector("#imageInputs"),
  preflightPanel: document.querySelector("#preflightPanel"),
  printHtmlNameOutput: document.querySelector("#printHtmlNameOutput"),
  exportSummary: document.querySelector("#exportSummary"),
  pdfCommandOutput: document.querySelector("#pdfCommandOutput"),
  pdfVerifyCommandOutput: document.querySelector("#pdfVerifyCommandOutput"),
  eventResults: document.querySelector("#eventResults"),
  calculationResults: document.querySelector("#calculationResults"),
  factsPanel: document.querySelector("#factsPanel"),
  preview: document.querySelector("#preview")
};

init();

async function init() {
  const sourceOptions = CALENDAR_SOURCES.map((source) => {
    return `<option value="${source.path}">${escapeHtml(source.label)}</option>`;
  }).join("");
  elements.sourceSelect.innerHTML = sourceOptions;
  elements.simpleSourceSelect.innerHTML = sourceOptions;
  elements.simpleSourceSelect.value = elements.sourceSelect.value;
  elements.templateInput.innerHTML = LAYOUT_TEMPLATES.map((template) => {
    return `<option value="${escapeHtml(template.id)}">${escapeHtml(template.label)}</option>`;
  }).join("");

  writeLayoutControls(state.layout);
  writePreviewZoom(state.previewZoom);
  writeCalculationHooks();
  applyCalculationHooks({ quiet: true });
  renderImageInputs();
  renderCustomRules();
  renderCustomFacts();
  updateLocalProjectStatus();
  updateBundlePdfButton();
  setupCollapsiblePanels();
  bindEvents();
  await loadAndRender();
}

function bindEvents() {
  elements.sourceSelect.addEventListener("change", () => {
    elements.simpleSourceSelect.value = elements.sourceSelect.value;
    loadAndRender();
  });
  elements.simpleSourceSelect.addEventListener("change", () => {
    elements.sourceSelect.value = elements.simpleSourceSelect.value;
    loadAndRender();
  });
  elements.simpleYearInput.addEventListener("input", () => {
    elements.yearInput.value = elements.simpleYearInput.value;
    renderProject();
  });
  elements.simpleYearInput.addEventListener("change", () => {
    elements.yearInput.value = elements.simpleYearInput.value;
    renderProject();
  });
  elements.simplePaperPresetInput.addEventListener("change", applyPaperPreset);
  elements.previewMonthInput.addEventListener("change", () => {
    state.previewMonth = Number(elements.previewMonthInput.value || 1);
    renderPreview(state.project, readSettings());
  });
  elements.simpleImageButton.addEventListener("click", () => elements.quickImageInput.click());
  elements.quickImageInput.addEventListener("change", addQuickMonthImage);
  elements.simpleAdvancedButton.addEventListener("click", () => setAppView("advanced"));
  elements.advancedCloseButton.addEventListener("click", () => setAppView("simple"));
  elements.prevPageButton.addEventListener("click", () => flipPage(-1));
  elements.nextPageButton.addEventListener("click", () => flipPage(1));
  elements.simplePrintButton.addEventListener("click", openPrintRoute);
  elements.sourceImport.addEventListener("change", importSourceXml);
  elements.icsImport.addEventListener("change", importIcs);
  elements.saveLocalProjectButton.addEventListener("click", saveLocalProject);
  elements.restoreLocalProjectButton.addEventListener("click", restoreLocalProject);
  elements.clearLocalProjectButton.addEventListener("click", clearLocalProject);
  elements.exportProjectButton.addEventListener("click", exportProject);
  elements.exportBundleButton.addEventListener("click", exportBundle);
  elements.downloadBundlePdfButton.addEventListener("click", downloadBundlePdf);
  elements.bundlePdfInput.addEventListener("change", attachBundlePdf);
  elements.projectImport.addEventListener("change", importProject);
  elements.bundleImport.addEventListener("change", importBundle);
  elements.ruleForm.addEventListener("submit", addCustomRule);
  elements.factForm.addEventListener("submit", addCustomFact);
  elements.factTypeInput.addEventListener("change", updateFactFormVisibility);
  elements.ruleTypeInput.addEventListener("change", updateRuleFormVisibility);
  for (const input of ruleInputs()) {
    input.addEventListener("input", updateRulePreview);
    input.addEventListener("change", updateRulePreview);
  }
  elements.cancelRuleEditButton.addEventListener("click", cancelRuleEdit);
  elements.applySourceXmlButton.addEventListener("click", applySourceXml);
  elements.resetSourceXmlButton.addEventListener("click", resetSourceXml);
  elements.applyHooksButton.addEventListener("click", applyCalculationHooks);
  elements.resetHooksButton.addEventListener("click", resetCalculationHooks);
  elements.previewZoomInput.addEventListener("input", updatePreviewZoom);
  elements.previewZoomInput.addEventListener("change", updatePreviewZoom);
  elements.templateInput.addEventListener("change", () => {
    state.layout = applyLayoutTemplate(state.layout, elements.templateInput.value);
    writeLayoutControls(state.layout);
    storeLayout(state.layout);
    renderProject();
  });

  for (const input of [elements.yearInput, elements.localeInput, elements.timeZoneInput, elements.weekSelect, elements.startDaySelect, elements.gmtInput]) {
    input.addEventListener("input", renderProject);
    input.addEventListener("change", renderProject);
  }

  for (const eventName of ["input", "change"]) {
    elements.yearInput.addEventListener(eventName, () => {
      elements.simpleYearInput.value = elements.yearInput.value;
    });
  }

  for (const input of layoutInputs()) {
    input.addEventListener("input", () => {
      state.layout = readLayoutSettings();
      storeLayout(state.layout);
      renderProject();
    });
    input.addEventListener("change", () => {
      state.layout = readLayoutSettings();
      storeLayout(state.layout);
      renderProject();
    });
  }

  elements.printButton.addEventListener("click", openPrintRoute);
  elements.exportSourceXmlButton.addEventListener("click", exportSourceXml);
  elements.exportFactsButton.addEventListener("click", exportGeneratedFacts);
  elements.exportIcsButton.addEventListener("click", exportIcs);
  elements.exportPrintHtmlButton.addEventListener("click", exportPrintHtml);
  elements.openPrintRouteButton.addEventListener("click", openPrintRoute);
  updateRuleFormVisibility();
  updateFactFormVisibility();
}

async function loadAndRender() {
  try {
    setLoading("Loading calendar source...");
    state.sourceDoc = await loadCalendarSource(elements.sourceSelect.value);
    state.sourceLabel = elements.sourceSelect.options[elements.sourceSelect.selectedIndex]?.textContent || "Calendar";
    elements.localeInput.value = selectedSourceLocale() || sourceDocumentLocale(state.sourceDoc) || "en-US";
    elements.timeZoneInput.value = defaultTimeZoneForLocale(elements.localeInput.value);
    writeSourceEditor();
    renderProject();
  } catch (error) {
    showError(error);
  }
}

async function importSourceXml() {
  const file = elements.sourceImport.files?.[0];

  if (!file) {
    return;
  }

  try {
    state.sourceDoc = parseCalendarXml(await file.text());
    state.sourceLabel = file.name.replace(/\.xml$/i, "");
    elements.localeInput.value = sourceDocumentLocale(state.sourceDoc) || elements.localeInput.value || "en-US";
    elements.timeZoneInput.value ||= defaultTimeZoneForLocale(elements.localeInput.value);
    writeSourceEditor();
    renderProject();
  } catch (error) {
    showError(error);
  }
}

async function importIcs() {
  const file = elements.icsImport.files?.[0];

  if (!file) {
    return;
  }

  try {
    const settings = readSettings();
    const events = parseIcsEvents(await file.text());
    const importedEvents = events.filter((event) => event.year === settings.year);

    if (importedEvents.length === 0) {
      updateLocalProjectStatus(`No all-day ICS events found for ${settings.year}.`, "warning");
      elements.icsImport.value = "";
      return;
    }

    const source = file.name || "import.ics";
    const importedRules = importedEvents.map((event, index) => {
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : `ics-${Date.now()}-${index}`,
        name: event.summary || "Imported event",
        type: "fixed-iso-date",
        date: event.date,
        category: "ics",
        source,
        expectedMatches: 1
      };
    });

    state.customRules.push(...importedRules);
    storeCustomRules(state.customRules);
    renderCustomRules();
    renderProject();
    updateLocalProjectStatus(`Imported ${importedRules.length} ICS event${importedRules.length === 1 ? "" : "s"} for ${settings.year}.`, "ok");
  } catch (error) {
    updateLocalProjectStatus(`Could not import ICS: ${error.message || error}`, "error");
  } finally {
    elements.icsImport.value = "";
  }
}

function writeSourceEditor() {
  if (!state.sourceDoc) {
    elements.sourceXmlInput.value = "";
    elements.sourceXmlStatus.textContent = "";
    return;
  }

  elements.sourceXmlInput.value = serializeXml(state.sourceDoc);
  setSourceStatus(`Loaded ${state.sourceLabel}.`, "ok");
}

function applySourceXml() {
  try {
    const doc = parseCalendarXml(elements.sourceXmlInput.value);
    const eventCount = doc.querySelectorAll("calendar > event > day").length;

    state.sourceDoc = doc;
    state.sourceLabel = `${state.sourceLabel || "Calendar"} (edited)`;
    elements.localeInput.value = sourceDocumentLocale(doc) || elements.localeInput.value || "en-US";
    setSourceStatus(`Applied XML with ${eventCount} event rules.`, "ok");
    renderProject();
  } catch (error) {
    setSourceStatus(error.message || String(error), "error");
  }
}

async function resetSourceXml() {
  await loadAndRender();
}

function setSourceStatus(message, level) {
  elements.sourceXmlStatus.textContent = message;
  elements.sourceXmlStatus.dataset.level = level;
}

function writeCalculationHooks() {
  elements.hooksInput.value = state.hookSource;
}

function applyCalculationHooks(options = {}) {
  try {
    const source = elements.hooksInput.value;

    state.hookCalculations = compileCalculationHooks(source);
    state.hookSource = source;
    storeCalculationHooks(source);
    elements.hooksStatus.textContent = state.hookCalculations.length === 0
      ? "No custom hooks are active."
      : `${state.hookCalculations.length} custom calculation hook${state.hookCalculations.length === 1 ? "" : "s"} applied.`;
    elements.hooksStatus.dataset.level = "ok";
    if (!options.quiet) {
      renderProject();
    }
  } catch (error) {
    elements.hooksStatus.textContent = error.message || String(error);
    elements.hooksStatus.dataset.level = "error";
  }
}

function resetCalculationHooks() {
  state.hookSource = defaultCalculationHooks();
  writeCalculationHooks();
  applyCalculationHooks();
}

function setAppView(view) {
  elements.app.dataset.view = view === "advanced" ? "advanced" : "simple";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function applyPaperPreset() {
  const preset = elements.simplePaperPresetInput.value;
  const presets = {
    a4: { unit: "mm", paperWidth: 210, paperHeight: 297, marginTop: 8, marginRight: 5, marginBottom: 4, marginLeft: 5 },
    a3: { unit: "mm", paperWidth: 297, paperHeight: 420, marginTop: 10, marginRight: 7, marginBottom: 5, marginLeft: 7 },
    letter: { unit: "in", paperWidth: 8.5, paperHeight: 11, marginTop: 0.3, marginRight: 0.2, marginBottom: 0.15, marginLeft: 0.2 }
  };

  if (!presets[preset]) {
    return;
  }

  state.layout = { ...state.layout, ...presets[preset] };
  writeLayoutControls(state.layout);
  storeLayout(state.layout);
  renderProject();
}

async function addQuickMonthImage() {
  const file = elements.quickImageInput.files?.[0];

  if (file) {
    await setMonthImage(state.previewMonth, file);
  }

  elements.quickImageInput.value = "";
}

function renderProject() {
  if (!state.sourceDoc) {
    return;
  }

  try {
    const settings = readSettings();
    state.layout = readLayoutSettings();
    const layout = resolveLayout(state.layout);
    updatePrintLayoutStyle(layout);
    state.project = buildCalendarProject(state.sourceDoc, settings, {
      customRules: state.customRules,
      calculations: [...customFactCalculations(), ...state.hookCalculations]
    });
    renderMonthPicker(state.project);
    renderPreview(state.project, settings);
    renderEventResults(state.project.eventResults);
    renderCalculations(state.project.calculations);
    updateRulePreview();
    const report = mergeOverflowPreflight(
      createPreflightReport(state.project, state.monthImages, state.monthImageSettings, layout),
      measureTextOverflow(elements.preview)
    );
    renderExportCommands(settings, layout, report);
    renderPreflight(report);
  } catch (error) {
    showError(error);
  }
}

function readSettings() {
  return {
    year: Number(elements.yearInput.value),
    locale: elements.localeInput.value.trim() || "en-US",
    timeZone: elements.timeZoneInput.value.trim() || "",
    weekNumbering: elements.weekSelect.value,
    startingWeekday: Number(elements.startDaySelect.value),
    gmt: Number(elements.gmtInput.value)
  };
}

function readLayoutSettings() {
  return {
    templateId: elements.templateInput.value,
    unit: elements.unitInput.value,
    paperWidth: Number(elements.paperWidthInput.value || 210),
    paperHeight: Number(elements.paperHeightInput.value || 297),
    marginTop: Number(elements.marginTopInput.value || 15),
    marginRight: Number(elements.marginRightInput.value || 10),
    marginBottom: Number(elements.marginBottomInput.value || 8),
    marginLeft: Number(elements.marginLeftInput.value || 10),
    imageRatio: elements.imageRatioInput.value,
    showMonthTitle: elements.showMonthTitleInput.checked,
    infoText: elements.infoTextInput.value || "Physicalendar preview",
    style: {
      ...(state.layout.style || {}),
      titleSize: Number(elements.titleSizeInput.value || 28),
      weekdaySize: Number(elements.weekdaySizeInput.value || 12)
    }
  };
}

function writeLayoutControls(layout) {
  const resolved = resolveLayout(layout);

  elements.templateInput.value = resolved.templateId;
  elements.unitInput.value = resolved.unit;
  elements.paperWidthInput.value = resolved.paperWidth;
  elements.paperHeightInput.value = resolved.paperHeight;
  elements.marginTopInput.value = resolved.marginTop;
  elements.marginRightInput.value = resolved.marginRight;
  elements.marginBottomInput.value = resolved.marginBottom;
  elements.marginLeftInput.value = resolved.marginLeft;
  elements.imageRatioInput.value = resolved.imageRatio;
  elements.titleSizeInput.value = resolved.style.titleSize;
  elements.weekdaySizeInput.value = resolved.style.weekdaySize;
  elements.showMonthTitleInput.checked = resolved.showMonthTitle !== false;
  elements.infoTextInput.value = resolved.infoText;
  elements.simplePaperPresetInput.value = paperPresetFor(resolved);
}

function layoutInputs() {
  return [
    elements.unitInput,
    elements.paperWidthInput,
    elements.paperHeightInput,
    elements.marginTopInput,
    elements.marginRightInput,
    elements.marginBottomInput,
    elements.marginLeftInput,
    elements.imageRatioInput,
    elements.titleSizeInput,
    elements.weekdaySizeInput,
    elements.showMonthTitleInput,
    elements.infoTextInput
  ];
}

function ruleInputs() {
  return [
    elements.ruleNameInput,
    elements.ruleTypeInput,
    elements.ruleMonthInput,
    elements.ruleDateInput,
    elements.ruleDayInput,
    elements.ruleEndDayInput,
    elements.ruleWeekdayInput,
    elements.ruleNthInput,
    elements.ruleOffsetInput,
    elements.ruleAnchorInput,
    elements.ruleSunEventInput,
    elements.ruleMoonPhaseInput,
    elements.ruleHolidayInput,
    elements.ruleFlagInput,
    elements.ruleCategoryInput,
    elements.ruleSourceInput,
    elements.rulePriorityInput,
    elements.ruleClassInput,
    elements.ruleLangInput,
    elements.ruleExpectedInput,
    elements.ruleMinInput,
    elements.ruleMaxInput
  ];
}

function renderPreview(project, settings) {
  const page = project.pages.find((item) => item.month === state.previewMonth) || project.pages[0];
  const previewProject = { ...project, pages: page ? [page] : [] };

  elements.preview.innerHTML = renderPrintPages(previewProject, settings, {
    sourceLabel: state.sourceLabel,
    sourceId: sourceIdFromPath(elements.sourceSelect.value),
    monthImages: state.monthImages,
    monthImageSettings: state.monthImageSettings,
    layout: resolveLayout(state.layout),
    interactive: true
  });

  applyPreviewZoom();

  for (const dayCell of elements.preview.querySelectorAll("[data-date]")) {
    dayCell.addEventListener("click", () => {
      elements.factsPanel.innerHTML = renderDayInspector(project, dayCell.dataset.date);
    });
  }

  for (const button of elements.preview.querySelectorAll("[data-add-image-month]")) {
    button.addEventListener("click", () => {
      state.previewMonth = Number(button.dataset.addImageMonth || state.previewMonth);
      elements.previewMonthInput.value = String(state.previewMonth);
      elements.quickImageInput.click();
    });
  }

  layoutPreviewImages();
  bindPreviewImagePan();
  fitDayNameTypography();
}

function layoutPreviewImages() {
  for (const container of elements.preview.querySelectorAll(".month-image[data-image-month]")) {
    const month = container.dataset.imageMonth;
    const image = container.querySelector("img");

    if (!month || !image) {
      continue;
    }

    applyPreviewImageLayout(container, image, month);
  }
}

function applyPreviewImageLayout(container, image, month) {
  const settings = imageSettingsFor(month);
  const meta = settings.meta || {};
  const sourceWidth = Number(meta.width);
  const sourceHeight = Number(meta.height);

  if (!sourceWidth || !sourceHeight) {
    return;
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

function fitDayNameTypography() {
  requestAnimationFrame(() => {
    for (const page of elements.preview.querySelectorAll(".month-page")) {
      const labels = Array.from(page.querySelectorAll(".day-names")).filter((label) => {
        return label.textContent && label.textContent.trim().length > 0;
      });

      if (!labels.length) {
        continue;
      }

      let low = 6;
      let high = 10;
      let best = 6;

      for (let i = 0; i < 10; i += 1) {
        const mid = (low + high) / 2;
        page.style.setProperty("--adaptive-day-name-size", `${mid}px`);

        const overflow = labels.some((label) => {
          return label.scrollHeight > label.clientHeight + 0.5 || label.scrollWidth > label.clientWidth + 0.5;
        });

        if (overflow) {
          high = mid;
        } else {
          best = mid;
          low = mid;
        }
      }

      page.style.setProperty("--adaptive-day-name-size", `${best.toFixed(2)}px`);
    }
  });
}

function bindPreviewImagePan() {
  const month = String(state.previewMonth);
  const container = elements.preview.querySelector(".month-image");
  const image = container?.querySelector("img");

  if (!container || !image) {
    return;
  }

  image.style.cursor = "grab";
  image.draggable = false;
  container.style.touchAction = "none";

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startPosX = 50;
  let startPosY = 50;

  const endDrag = () => {
    if (!dragging) {
      return;
    }

    dragging = false;
    image.style.cursor = "grab";
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
    storeImageSettings(state.monthImageSettings);

    const xInput = elements.imageInputs.querySelector(`[data-image-x="${month}"]`);
    const yInput = elements.imageInputs.querySelector(`[data-image-y="${month}"]`);
    const settings = imageSettingsFor(month);

    if (xInput) {
      xInput.value = String(Math.round(settings.positionX));
    }

    if (yInput) {
      yInput.value = String(Math.round(settings.positionY));
    }
  };

  const applyDragPosition = (clientX, clientY) => {
    if (!dragging) {
      return;
    }

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const deltaX = ((clientX - startX) / width) * 100;
    const deltaY = ((clientY - startY) / height) * 100;
    const nextX = clampPercent(startPosX - deltaX);
    const nextY = clampPercent(startPosY - deltaY);
    const settings = imageSettingsFor(month);

    settings.positionX = nextX;
    settings.positionY = nextY;
    state.monthImageSettings[month] = settings;
    applyPreviewImageLayout(container, image, month);
  };

  const beginDrag = (clientX, clientY) => {
    const settings = imageSettingsFor(month);

    if (settings.fit !== "cover") {
      settings.fit = "cover";
    }

    state.monthImageSettings[month] = settings;
    applyPreviewImageLayout(container, image, month);

    dragging = true;
    startX = clientX;
    startY = clientY;
    startPosX = Number(settings.positionX) || 50;
    startPosY = Number(settings.positionY) || 50;
    image.style.cursor = "grabbing";
  };

  const onMouseMove = (event) => {
    applyDragPosition(event.clientX, event.clientY);
  };

  const onMouseUp = () => {
    endDrag();
  };

  const onTouchMove = (event) => {
    const touch = event.touches?.[0];

    if (!touch) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    applyDragPosition(touch.clientX, touch.clientY);
  };

  const onTouchEnd = () => {
    endDrag();
  };

  container.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    beginDrag(event.clientX, event.clientY);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  container.addEventListener("touchstart", (event) => {
    const touch = event.touches?.[0];

    if (!touch) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    beginDrag(touch.clientX, touch.clientY);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
  }, { passive: false });
}

function renderMonthPicker(project) {
  const pages = project?.pages || [];

  if (!pages.some((page) => page.month === state.previewMonth)) {
    state.previewMonth = pages[0]?.month || 1;
  }

  elements.previewMonthInput.innerHTML = pages.map((page) => {
    return `<option value="${page.month}">${escapeHtml(page.name)}</option>`;
  }).join("");
  elements.previewMonthInput.value = String(state.previewMonth);
  updatePageNavButtons();
}

function updatePageNavButtons() {
  const pages = state.project?.pages || [];
  const idx = pages.findIndex((p) => p.month === state.previewMonth);
  elements.prevPageButton.disabled = idx <= 0;
  elements.nextPageButton.disabled = idx < 0 || idx >= pages.length - 1;
}

let _flipLock = false;

function flipPage(direction) {
  const pages = state.project?.pages || [];
  const idx = pages.findIndex((p) => p.month === state.previewMonth);
  const next = idx + direction;
  if (next < 0 || next >= pages.length || _flipLock) return;

  _flipLock = true;
  const exitClass = direction > 0 ? "flip-exit-left" : "flip-exit-right";
  const enterClass = direction > 0 ? "flip-enter-right" : "flip-enter-left";

  elements.preview.classList.add(exitClass);

  setTimeout(() => {
    elements.preview.classList.remove(exitClass);
    state.previewMonth = pages[next].month;
    elements.previewMonthInput.value = String(state.previewMonth);
    renderPreview(state.project, readSettings());
    updatePageNavButtons();
    elements.preview.classList.add(enterClass);

    setTimeout(() => {
      elements.preview.classList.remove(enterClass);
      _flipLock = false;
    }, 400);
  }, 360);
}

function updatePreviewZoom() {
  state.previewZoom = Number(elements.previewZoomInput.value || 100);
  storePreviewZoom(state.previewZoom);
  writePreviewZoom(state.previewZoom);
  applyPreviewZoom();
}

function writePreviewZoom(value) {
  const zoom = clampPreviewZoom(value);

  elements.previewZoomInput.value = String(zoom);
  elements.previewZoomOutput.textContent = `${zoom}%`;
  applyPreviewZoom();
}

function applyPreviewZoom() {
  const zoom = clampPreviewZoom(state.previewZoom);

  elements.preview.style.setProperty("--preview-zoom", zoom / 100);
}

function setupCollapsiblePanels() {
  const collapsed = readCollapsedPanels();

  for (const section of document.querySelectorAll(".side-panel .panel-section")) {
    const heading = section.querySelector(":scope > h2");

    if (!heading || heading.querySelector("button")) {
      continue;
    }

    const title = heading.textContent.trim();
    const id = panelId(title);
    const button = document.createElement("button");

    section.id ||= `panel-${id}`;
    button.type = "button";
    button.className = "panel-toggle";
    button.setAttribute("aria-controls", section.id);
    button.innerHTML = `<span>${escapeHtml(title)}</span><span class="panel-toggle-icon" aria-hidden="true"></span>`;
    heading.textContent = "";
    heading.appendChild(button);

    for (const child of Array.from(section.children)) {
      if (child !== heading) {
        child.dataset.panelContent = id;
      }
    }

    setPanelCollapsed(section, button, Boolean(collapsed[id]));
    button.addEventListener("click", () => {
      const nextCollapsed = !section.classList.contains("is-collapsed");

      setPanelCollapsed(section, button, nextCollapsed);
      writeCollapsedPanels({
        ...readCollapsedPanels(),
        [id]: nextCollapsed
      });
    });
  }
}

function setPanelCollapsed(section, button, collapsed) {
  section.classList.toggle("is-collapsed", collapsed);
  button.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function readCollapsedPanels() {
  try {
    return JSON.parse(localStorage.getItem(PANEL_COLLAPSE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCollapsedPanels(value) {
  localStorage.setItem(PANEL_COLLAPSE_KEY, JSON.stringify(value));
}

function panelId(title) {
  return safeFilename(title || "panel");
}

function renderPreflight(report) {
  const status = report.ok ? "Ready for preview" : "Needs attention";
  const issueCards = report.issues.length === 0
    ? `<div class="preflight-item ok"><strong>${status}</strong><span>No preflight warnings.</span></div>`
    : report.issues.map((issue) => {
      return `
        <div class="preflight-item ${escapeHtml(issue.level)}">
          <strong>${escapeHtml(issue.title)}</strong>
          <span>${escapeHtml(stripSoftHyphens(issue.detail || ""))}</span>
        </div>
      `;
    }).join("");

  elements.preflightPanel.innerHTML = `
    <div class="preflight-summary">
      <strong>${escapeHtml(status)}</strong>
      <span>${report.counts.pages} pages · ${report.counts.eventRules} rules · ${state.customRules.length} custom · ${state.customFacts.length} facts · ${report.counts.missingImages} missing images</span>
    </div>
    ${issueCards}
  `;
}

function renderExportCommands(settings, layout, report) {
  const commands = pdfExportCommands({
    year: settings.year,
    label: state.sourceLabel || "physicalendar",
    layout
  });
  const summaryRows = exportPanelSummary({
    year: settings.year,
    label: state.sourceLabel || "physicalendar",
    timeZone: settings.timeZone,
    gmt: settings.gmt,
    layout,
    report,
    commands
  });

  elements.exportSummary.innerHTML = summaryRows.map((row) => `
    <div>
      <dt>${escapeHtml(row.label)}</dt>
      <dd>${escapeHtml(row.value)}</dd>
    </div>
  `).join("");
  elements.printHtmlNameOutput.value = commands.printHtmlFile;
  elements.pdfCommandOutput.value = commands.pdfCommand;
  elements.pdfVerifyCommandOutput.value = commands.verifyCommand;
}

function renderEventResults(results) {
  const unmatched = results.filter((result) => result.error || result.matches.length === 0 || hasUnexpectedMatchCount(result));
  const summary = `
    <div class="event-result">
      <strong>${results.length} rules evaluated</strong>
      <span>${results.length - unmatched.length} matched · ${unmatched.length} need attention</span>
    </div>
  `;

  elements.eventResults.innerHTML = summary + results.slice(0, 80).map((result) => {
    const warning = hasUnexpectedMatchCount(result) ? ` · expected ${matchExpectationText(result.expectations)}` : "";
    const invalidTargets = result.invalidTargets?.length ? ` · non-day: ${result.invalidTargets.slice(0, 3).join(", ")}` : "";
    const matches = result.error ? result.error : `${result.matches.join(", ") || "No day matches"}${warning}${invalidTargets}`;
    const source = result.source === "custom" ? "Custom" : "Source";
    return `
      <div class="event-result">
        <strong>${escapeHtml(stripSoftHyphens(result.name || "Unnamed rule"))}</strong>
        <span>${escapeHtml(source)} · ${escapeHtml(matches)}</span>
      </div>
    `;
  }).join("");
}

function hasUnexpectedMatchCount(result) {
  const count = result.matches.length;
  const expectations = result.expectations || {};

  if (expectations.expected !== null && expectations.expected !== undefined && count !== expectations.expected) {
    return true;
  }

  if (expectations.min !== null && expectations.min !== undefined && count < expectations.min) {
    return true;
  }

  if (expectations.max !== null && expectations.max !== undefined && count > expectations.max) {
    return true;
  }

  return false;
}

function matchExpectationText(expectations = {}) {
  const parts = [];

  if (expectations.expected !== null && expectations.expected !== undefined) {
    parts.push(String(expectations.expected));
  }

  if (expectations.min !== null && expectations.min !== undefined) {
    parts.push(`min ${expectations.min}`);
  }

  if (expectations.max !== null && expectations.max !== undefined) {
    parts.push(`max ${expectations.max}`);
  }

  return parts.join(", ");
}

function ruleMetadataText(rule = {}) {
  return [
    rule.category ? `category ${rule.category}` : "",
    rule.source ? `source ${rule.source}` : "",
    rule.priority !== null && rule.priority !== undefined && rule.priority !== "" ? `priority ${rule.priority}` : "",
    rule.className ? `class ${rule.className}` : "",
    rule.lang ? `lang ${rule.lang}` : "",
    rule.holiday ? "holiday" : "",
    rule.flag ? "flag" : ""
  ].filter(Boolean).join(", ");
}

function ruleExpectations(rule = {}) {
  return {
    expected: optionalNumberValue(rule.expectedMatches),
    min: optionalNumberValue(rule.minMatches),
    max: optionalNumberValue(rule.maxMatches)
  };
}

function matchesExpectationCount(count, expectations = {}) {
  if (expectations.expected !== null && expectations.expected !== undefined && count !== expectations.expected) {
    return false;
  }

  if (expectations.min !== null && expectations.min !== undefined && count < expectations.min) {
    return false;
  }

  if (expectations.max !== null && expectations.max !== undefined && count > expectations.max) {
    return false;
  }

  return true;
}

function optionalNumberInput(input) {
  return optionalNumberValue(input.value);
}

function optionalNumberValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function renderCalculations(calculations) {
  elements.calculationResults.innerHTML = calculations.map((calculation) => {
    const anchors = (calculation.anchors || []).map((anchor) => {
      return `<span class="calculation-anchor">${escapeHtml(anchor.id)} → ${escapeHtml(anchor.date)}</span>`;
    }).join("");

    return `
      <div class="calculation-result">
        <strong>${escapeHtml(calculation.label || calculation.id)}</strong>
        <span>${escapeHtml(calculation.id)} · ${calculation.dateCount} dates · ${calculation.factCount} facts · ${calculation.anchorCount} anchors</span>
        ${anchors ? `<div class="calculation-anchors">${anchors}</div>` : ""}
      </div>
    `;
  }).join("");
}

function addCustomRule(event) {
  event.preventDefault();

  const rule = readRuleForm();

  if (state.editingRuleId) {
    state.customRules = state.customRules.map((item) => {
      return item.id === state.editingRuleId ? { ...rule, id: state.editingRuleId } : item;
    });
    state.editingRuleId = null;
  } else {
    state.customRules.push(rule);
  }

  storeCustomRules(state.customRules);
  resetRuleForm();
  renderCustomRules();
  renderProject();
}

function readRuleForm() {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `rule-${Date.now()}`,
    name: elements.ruleNameInput.value.trim() || "Custom event",
    type: elements.ruleTypeInput.value,
    month: Number(elements.ruleMonthInput.value),
    date: elements.ruleDateInput.value,
    day: Number(elements.ruleDayInput.value),
    endDay: Number(elements.ruleEndDayInput.value),
    weekday: Number(elements.ruleWeekdayInput.value),
    nth: Number(elements.ruleNthInput.value),
    offset: Number(elements.ruleOffsetInput.value),
    anchor: elements.ruleAnchorInput.value.trim(),
    event: elements.ruleSunEventInput.value,
    phase: elements.ruleMoonPhaseInput.value,
    holiday: elements.ruleHolidayInput.checked,
    flag: elements.ruleFlagInput.checked,
    category: elements.ruleCategoryInput.value.trim(),
    source: elements.ruleSourceInput.value.trim(),
    priority: optionalNumberInput(elements.rulePriorityInput),
    className: elements.ruleClassInput.value.trim(),
    lang: elements.ruleLangInput.value.trim(),
    expectedMatches: optionalNumberInput(elements.ruleExpectedInput),
    minMatches: optionalNumberInput(elements.ruleMinInput),
    maxMatches: optionalNumberInput(elements.ruleMaxInput)
  };
}

function renderCustomRules() {
  updateRuleFormMode();

  if (state.customRules.length === 0) {
    elements.customRulesPanel.innerHTML = `<div class="custom-rule empty">No custom rules yet.</div>`;
    return;
  }

  elements.customRulesPanel.innerHTML = state.customRules.map((rule) => {
    let xpath = "";

    try {
      xpath = compileCustomRule(rule);
    } catch (error) {
      xpath = error.message;
    }

    const expectation = matchExpectationText(ruleExpectations(rule));
    const metadata = ruleMetadataText(rule);
    const details = [rule.type, metadata, expectation ? `expected ${expectation}` : "", xpath].filter(Boolean).join(" · ");

    return `
      <div class="custom-rule ${state.editingRuleId === rule.id ? "editing" : ""}">
        <div>
          <strong>${escapeHtml(rule.name)}</strong>
          <span>${escapeHtml(details)}</span>
        </div>
        <div class="custom-rule-actions">
          <button type="button" data-edit-rule="${escapeHtml(rule.id)}" aria-label="Edit ${escapeHtml(rule.name)}">Edit</button>
          <button type="button" data-remove-rule="${escapeHtml(rule.id)}" aria-label="Remove ${escapeHtml(rule.name)}">×</button>
        </div>
      </div>
    `;
  }).join("");

  for (const button of elements.customRulesPanel.querySelectorAll("[data-edit-rule]")) {
    button.addEventListener("click", () => {
      const rule = state.customRules.find((item) => item.id === button.dataset.editRule);

      if (!rule) {
        return;
      }

      state.editingRuleId = rule.id;
      writeRuleForm(rule);
      updateRuleFormVisibility();
      updateRuleFormMode();
      renderCustomRules();
    });
  }

  for (const button of elements.customRulesPanel.querySelectorAll("[data-remove-rule]")) {
    button.addEventListener("click", () => {
      state.customRules = state.customRules.filter((rule) => rule.id !== button.dataset.removeRule);

      if (state.editingRuleId === button.dataset.removeRule) {
        state.editingRuleId = null;
        resetRuleForm();
      }

      storeCustomRules(state.customRules);
      renderCustomRules();
      renderProject();
    });
  }
}

function addCustomFact(event) {
  event.preventDefault();

  const fact = {
    id: crypto.randomUUID ? crypto.randomUUID() : `fact-${Date.now()}`,
    fact: elements.factNameInput.value.trim(),
    type: elements.factTypeInput.value,
    month: Number(elements.factMonthInput.value),
    day: Number(elements.factDayInput.value),
    weekday: Number(elements.factWeekdayInput.value),
    nth: Number(elements.factNthInput.value),
    offset: Number(elements.factOffsetInput.value),
    event: elements.factSunEventInput.value,
    phase: elements.factMoonPhaseInput.value,
    value: elements.factValueInput.value.trim() || "true",
    anchor: elements.factAnchorInput.value.trim()
  };

  if (!fact.fact && !fact.anchor) {
    return;
  }

  state.customFacts.push(fact);
  storeCustomFacts(state.customFacts);
  resetFactForm();
  renderCustomFacts();
  renderProject();
}

function renderCustomFacts() {
  if (state.customFacts.length === 0) {
    elements.customFactsPanel.innerHTML = `<div class="custom-rule empty">No custom generated facts yet.</div>`;
    return;
  }

  elements.customFactsPanel.innerHTML = state.customFacts.map((fact) => {
    const parts = [
      factDateSummary(fact),
      fact.fact ? `${fact.fact}=${fact.value || "true"}` : "",
      fact.anchor ? `anchor ${fact.anchor}` : ""
    ].filter(Boolean);

    return `
      <div class="custom-rule">
        <div>
          <strong>${escapeHtml(fact.fact || fact.anchor)}</strong>
          <span>${escapeHtml(parts.join(" · "))}</span>
        </div>
        <div class="custom-rule-actions">
          <button type="button" data-remove-fact="${escapeHtml(fact.id)}" aria-label="Remove ${escapeHtml(fact.fact || fact.anchor)}">×</button>
        </div>
      </div>
    `;
  }).join("");

  for (const button of elements.customFactsPanel.querySelectorAll("[data-remove-fact]")) {
    button.addEventListener("click", () => {
      state.customFacts = state.customFacts.filter((fact) => fact.id !== button.dataset.removeFact);
      storeCustomFacts(state.customFacts);
      renderCustomFacts();
      renderProject();
    });
  }
}

function resetFactForm() {
  elements.factNameInput.value = "customFact";
  elements.factTypeInput.value = "fixed-date";
  elements.factMonthInput.value = "1";
  elements.factDayInput.value = "1";
  elements.factWeekdayInput.value = "1";
  elements.factNthInput.value = "1";
  elements.factOffsetInput.value = "0";
  elements.factSunEventInput.value = "springEquinox";
  elements.factMoonPhaseInput.value = "full";
  elements.factValueInput.value = "true";
  elements.factAnchorInput.value = "";
  updateFactFormVisibility();
}

function updateFactFormVisibility() {
  const type = elements.factTypeInput.value;
  const show = {
    month: ["fixed-date", "nth-weekday", "last-weekday", "moon-phase-offset"].includes(type),
    day: type === "fixed-date",
    weekday: ["nth-weekday", "last-weekday"].includes(type),
    nth: type === "nth-weekday",
    offset: ["easter-offset", "sun-event-offset", "moon-phase-offset"].includes(type),
    sun: type === "sun-event-offset",
    moon: type === "moon-phase-offset"
  };

  setRuleFieldVisible(elements.factMonthInput, show.month);
  setRuleFieldVisible(elements.factDayInput, show.day);
  setRuleFieldVisible(elements.factWeekdayInput, show.weekday);
  setRuleFieldVisible(elements.factNthInput, show.nth);
  setRuleFieldVisible(elements.factOffsetInput, show.offset);
  setRuleFieldVisible(elements.factSunEventInput, show.sun);
  setRuleFieldVisible(elements.factMoonPhaseInput, show.moon);
}

function factDateSummary(fact) {
  const type = fact.type || "fixed-date";

  if (type === "fixed-date") {
    return `${monthNameShort(fact.month)} ${fact.day}`;
  }

  if (type === "nth-weekday") {
    return `${ordinal(fact.nth || 1)} ${weekdayNameShort(fact.weekday || 1)} in ${monthNameShort(fact.month)}`;
  }

  if (type === "last-weekday") {
    return `last ${weekdayNameShort(fact.weekday || 1)} in ${monthNameShort(fact.month)}`;
  }

  if (type === "easter-offset") {
    return offsetSummary("Easter", fact.offset);
  }

  if (type === "sun-event-offset") {
    return offsetSummary(sunEventLabel(fact.event), fact.offset);
  }

  if (type === "moon-phase-offset") {
    return offsetSummary(`first ${moonPhaseLabel(fact.phase)} in ${monthNameShort(fact.month)}`, fact.offset);
  }

  return type;
}

function offsetSummary(label, offset = 0) {
  const days = Number(offset || 0);

  if (days === 0) {
    return label;
  }

  return `${label} ${days > 0 ? "+" : ""}${days}d`;
}

function ordinal(value) {
  const number = Number(value || 1);
  return `${number}${number === 1 ? "st" : number === 2 ? "nd" : number === 3 ? "rd" : "th"}`;
}

function weekdayNameShort(index) {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Number(index || 1) - 1] || "Mon";
}

function sunEventLabel(value) {
  return {
    springEquinox: "spring equinox",
    summerSolstice: "summer solstice",
    autumnEquinox: "autumn equinox",
    winterSolstice: "winter solstice"
  }[value] || value || "sun event";
}

function moonPhaseLabel(value) {
  return {
    new: "new moon",
    firstQuarter: "first quarter",
    full: "full moon",
    lastQuarter: "last quarter"
  }[value] || value || "moon phase";
}

function customFactCalculations() {
  return state.customFacts.length > 0 ? [customFactsCalculation(state.customFacts)] : [];
}

function writeRuleForm(rule) {
  elements.ruleNameInput.value = rule.name || "Custom day";
  elements.ruleTypeInput.value = rule.type || "fixed-date";
  elements.ruleMonthInput.value = String(rule.month || 1);
  elements.ruleDateInput.value = rule.date || `${readSettings().year}-01-01`;
  elements.ruleDayInput.value = String(rule.day || 1);
  elements.ruleEndDayInput.value = String(rule.endDay || 7);
  elements.ruleWeekdayInput.value = String(rule.weekday || 1);
  elements.ruleNthInput.value = String(rule.nth || 1);
  elements.ruleOffsetInput.value = String(rule.offset || 0);
  elements.ruleAnchorInput.value = rule.anchor || "tripStart";
  elements.ruleSunEventInput.value = rule.event || "springEquinox";
  elements.ruleMoonPhaseInput.value = rule.phase || "new";
  elements.ruleHolidayInput.checked = Boolean(rule.holiday);
  elements.ruleFlagInput.checked = Boolean(rule.flag);
  elements.ruleCategoryInput.value = rule.category || "";
  elements.ruleSourceInput.value = rule.source || "";
  elements.rulePriorityInput.value = rule.priority ?? "";
  elements.ruleClassInput.value = rule.className || "";
  elements.ruleLangInput.value = rule.lang || "";
  elements.ruleExpectedInput.value = rule.expectedMatches ?? "";
  elements.ruleMinInput.value = rule.minMatches ?? "";
  elements.ruleMaxInput.value = rule.maxMatches ?? "";
}

function resetRuleForm() {
  writeRuleForm({
    name: "Custom day",
    type: "fixed-date",
    month: 1,
    date: `${readSettings().year}-01-01`,
    day: 1,
    endDay: 7,
    weekday: 1,
    nth: 1,
    offset: 0,
    anchor: "tripStart",
    event: "springEquinox",
    phase: "new",
    holiday: false,
    flag: false,
    category: "",
    source: "",
    priority: "",
    className: "",
    lang: "",
    expectedMatches: "",
    minMatches: "",
    maxMatches: ""
  });
  updateRuleFormVisibility();
  updateRuleFormMode();
}

function cancelRuleEdit() {
  state.editingRuleId = null;
  resetRuleForm();
  renderCustomRules();
}

function updateRuleFormMode() {
  const editing = Boolean(state.editingRuleId);

  elements.saveRuleButton.textContent = editing ? "Update rule" : "Add rule";
  elements.cancelRuleEditButton.hidden = !editing;
}

function updateRuleFormVisibility() {
  const type = elements.ruleTypeInput.value;
  const show = {
    date: type === "fixed-iso-date",
    month: ["fixed-date", "nth-weekday", "last-weekday", "moon-phase-offset", "range-weekday"].includes(type),
    day: ["fixed-date", "range-weekday"].includes(type),
    endDay: type === "range-weekday",
    weekday: ["nth-weekday", "last-weekday", "range-weekday"].includes(type),
    nth: type === "nth-weekday",
    offset: ["easter-offset", "sun-event-offset", "moon-phase-offset", "anchor-offset"].includes(type),
    anchor: type === "anchor-offset",
    sun: type === "sun-event-offset",
    moon: type === "moon-phase-offset"
  };

  setRuleFieldVisible(elements.ruleMonthInput, show.month);
  setRuleFieldVisible(elements.ruleDateInput, show.date);
  setRuleFieldVisible(elements.ruleDayInput, show.day);
  setRuleFieldVisible(elements.ruleEndDayInput, show.endDay);
  setRuleFieldVisible(elements.ruleWeekdayInput, show.weekday);
  setRuleFieldVisible(elements.ruleNthInput, show.nth);
  setRuleFieldVisible(elements.ruleOffsetInput, show.offset);
  setRuleFieldVisible(elements.ruleAnchorInput, show.anchor);
  setRuleFieldVisible(elements.ruleSunEventInput, show.sun);
  setRuleFieldVisible(elements.ruleMoonPhaseInput, show.moon);
  updateRulePreview();
}

function setRuleFieldVisible(input, visible) {
  input.closest("label").hidden = !visible;
}

function updateRulePreview() {
  if (!elements.rulePreview) {
    return;
  }

  if (!state.project) {
    elements.rulePreview.className = "rule-preview";
    elements.rulePreview.textContent = "Rule preview will appear after a calendar source loads.";
    return;
  }

  try {
    const rule = readRuleForm();
    const xpath = compileCustomRule(rule);
    const matches = evaluateDayXPath(state.project.factsDoc, xpath);
    const expectations = ruleExpectations(rule);
    const expectation = matchExpectationText(expectations);
    const expectationWarning = expectation && !matchesExpectationCount(matches.length, expectations);
    const shownMatches = matches.slice(0, 12).join(", ") || "No matches";
    const overflow = matches.length > 12 ? `, +${matches.length - 12} more` : "";
    const expectationText = expectation ? `Expected ${expectation}. ` : "";

    elements.rulePreview.className = `rule-preview ${matches.length === 0 || expectationWarning ? "warning" : "ok"}`;
    elements.rulePreview.innerHTML = `
      <strong>${matches.length} match${matches.length === 1 ? "" : "es"}</strong>
      <span>${escapeHtml(expectationText)}${escapeHtml(shownMatches)}${escapeHtml(overflow)}</span>
      <code>${escapeHtml(xpath)}</code>
    `;
  } catch (error) {
    elements.rulePreview.className = "rule-preview error";
    elements.rulePreview.innerHTML = `
      <strong>Rule error</strong>
      <span>${escapeHtml(error.message || String(error))}</span>
    `;
  }
}

function evaluateDayXPath(doc, xpath) {
  const snapshot = doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  const matches = [];

  for (let index = 0; index < snapshot.snapshotLength; index += 1) {
    const item = snapshot.snapshotItem(index);

    if (item?.nodeType === Node.ELEMENT_NODE && item.localName === "day") {
      matches.push(item.getAttribute("date") || "");
    }
  }

  return matches.filter(Boolean);
}

function renderImageInputs() {
  const rows = [];

  for (let month = 1; month <= 12; month += 1) {
    const settings = imageSettingsFor(month);
    const meta = settings.meta;
    const summary = meta?.width && meta?.height ? `${meta.width}x${meta.height}` : "Drop image";
    const hasImage = Boolean(state.monthImages[month]);

    rows.push(`
      <div class="image-row ${hasImage ? "has-image" : ""}" data-image-row="${month}">
        <span class="image-month">${month}</span>
        <label class="image-drop">
          <strong>${hasImage ? escapeHtml(settings.name || `Month ${month}`) : "Drop image"}</strong>
          <small>${escapeHtml(summary)}</small>
          <input type="file" accept="image/*" data-month="${month}" aria-label="Month ${month} image">
        </label>
        <select data-image-fit="${month}" aria-label="Month ${month} image fit">
          <option value="cover" ${settings.fit === "cover" ? "selected" : ""}>Cover</option>
          <option value="contain" ${settings.fit === "contain" ? "selected" : ""}>Contain</option>
          <option value="fill" ${settings.fit === "fill" ? "selected" : ""}>Fill</option>
        </select>
        <input type="number" min="0" max="100" data-image-x="${month}" value="${Number(settings.positionX)}" aria-label="Month ${month} image horizontal position">
        <input type="number" min="0" max="100" data-image-y="${month}" value="${Number(settings.positionY)}" aria-label="Month ${month} image vertical position">
        <input type="number" min="100" max="250" data-image-scale="${month}" value="${Number(settings.scale)}" aria-label="Month ${month} image scale percent">
        <button type="button" data-clear-month="${month}" title="Clear image" aria-label="Clear month ${month} image">×</button>
      </div>
    `);
  }

  elements.imageInputs.innerHTML = rows.join("");

  for (const input of elements.imageInputs.querySelectorAll("input[type='file']")) {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];

      if (!file) {
        return;
      }

      await setMonthImage(input.dataset.month, file);
    });
  }

  for (const row of elements.imageInputs.querySelectorAll("[data-image-row]")) {
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", async (event) => {
      event.preventDefault();
      row.classList.remove("drag-over");

      const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith("image/"));

      if (file) {
        await setMonthImage(row.dataset.imageRow, file);
      }
    });
  }

  for (const input of elements.imageInputs.querySelectorAll("[data-image-fit], [data-image-x], [data-image-y], [data-image-scale]")) {
    input.addEventListener("input", () => updateImageSetting(input));
    input.addEventListener("change", () => updateImageSetting(input));
  }

  for (const button of elements.imageInputs.querySelectorAll("[data-clear-month]")) {
    button.addEventListener("click", () => {
      delete state.monthImages[button.dataset.clearMonth];
      delete state.monthImageSettings[button.dataset.clearMonth];
      storeImages(state.monthImages);
      storeImageSettings(state.monthImageSettings);
      renderImageInputs();
      renderProject();
    });
  }
}

async function setMonthImage(month, file) {
  const image = await readImageFile(file);

  state.monthImages[month] = image.dataUrl;
  state.monthImageSettings[month] = {
    fit: "cover",
    positionX: 50,
    positionY: 50,
    scale: 100,
    name: file.name,
    meta: {
      width: image.width,
      height: image.height,
      type: file.type || "image/*"
    }
  };
  storeImages(state.monthImages);
  storeImageSettings(state.monthImageSettings);
  renderImageInputs();
  renderProject();
}

function updateImageSetting(input) {
  const month = input.dataset.imageFit || input.dataset.imageX || input.dataset.imageY;
  const settings = imageSettingsFor(month);

  if (input.dataset.imageFit) {
    settings.fit = input.value;
  }

  if (input.dataset.imageX) {
    settings.positionX = Number(input.value);
  }

  if (input.dataset.imageY) {
    settings.positionY = Number(input.value);
  }

  if (input.dataset.imageScale) {
    settings.scale = Number(input.value);
  }

  state.monthImageSettings[month] = settings;
  storeImageSettings(state.monthImageSettings);
  renderProject();
}

function imageSettingsFor(month) {
  return {
    fit: "cover",
    positionX: 50,
    positionY: 50,
    scale: 100,
    ...(state.monthImageSettings[month] || {})
  };
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function findDay(project, date) {
  return project.pages
    .flatMap((page) => page.weeks)
    .flatMap((week) => week.days)
    .find((item) => item.date === date && !item.isOutsideMonth) || null;
}

function renderDayInspector(project, date) {
  const day = findDay(project, date);

  if (!day) {
    return `<div class="day-inspector-empty">No generated facts for this day.</div>`;
  }

  const sourceNames = day.names.filter((name) => !name.event);
  const generatedFacts = Object.entries(day.facts)
    .filter(([key]) => !["date", "year", "month", "index", "weekdayName"].includes(key))
    .sort(([left], [right]) => left.localeCompare(right));
  const summaryItems = [
    ["Weekday", day.weekdayName],
    ["Week", `${day.weekNumber} (${readSettings().weekNumbering})`],
    ["Day of year", day.dayOfYear],
    ["Holiday", day.isHoliday ? "yes" : "no"],
    ["Flag day", day.hasFlag ? "yes" : "no"],
    ["Moon phase", day.moonPhase === null ? "" : String(day.moonPhase)],
    ["Sun event", day.sunEvent || ""],
    ["Easter", day.easter ? "yes" : ""]
  ].filter(([, value]) => value !== "");

  return `
    <section class="day-inspector">
      <header>
        <strong>${escapeHtml(day.date)}</strong>
        <span>${escapeHtml(day.weekdayName || "")}</span>
      </header>
      ${renderInspectorList("Summary", summaryItems)}
      ${renderInspectorEvents(day.events)}
      ${renderInspectorNames(sourceNames)}
      ${renderInspectorList("Generated facts", generatedFacts)}
    </section>
  `;
}

function renderInspectorEvents(events) {
  if (events.length === 0) {
    return renderInspectorList("Events", [["Events", "none"]]);
  }

  return `
    <section class="day-inspector-section">
      <h3>Events</h3>
      <ul class="day-inspector-events">
        ${events.map((event) => `
          <li>
            <strong>${escapeHtml(event.text)}</strong>
            <span>${escapeHtml([
              event.category,
              event.source ? `source ${event.source}` : "",
              event.ruleId ? `rule ${event.ruleId}` : "",
              event.holiday ? "holiday" : "",
              event.flag ? "flag" : ""
            ].filter(Boolean).join(" · ") || "event")}</span>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function renderInspectorNames(names) {
  if (names.length === 0) {
    return renderInspectorList("Source names", [["Source names", "none"]]);
  }

  return `
    <section class="day-inspector-section">
      <h3>Source names</h3>
      <ul class="day-inspector-names">
        ${names.map((name) => `
          <li>
            <span>${escapeHtml(stripSoftHyphens(name.text))}</span>
            ${name.lang ? `<small>${escapeHtml(name.lang)}</small>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function renderInspectorList(title, items) {
  return `
    <section class="day-inspector-section">
      <h3>${escapeHtml(title)}</h3>
      <dl>
        ${items.map(([key, value]) => `
          <div>
            <dt>${escapeHtml(key)}</dt>
            <dd>${escapeHtml(String(value))}</dd>
          </div>
        `).join("")}
      </dl>
    </section>
  `;
}

function setLoading(message) {
  elements.preview.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function showError(error) {
  elements.preview.innerHTML = `<div class="error">${escapeHtml(error.message || String(error))}</div>`;
}

function exportGeneratedFacts() {
  if (!state.project) {
    return;
  }

  const blob = new Blob([serializeXml(state.project.factsDoc)], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `physicalendar-${readSettings().year}-facts.xml`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportSourceXml() {
  if (!state.sourceDoc) {
    return;
  }

  const label = safeFilename(state.sourceLabel || "calendar");
  downloadText(`${label}-source.xml`, serializeXml(state.sourceDoc), "application/xml");
}

function exportIcs() {
  if (!state.project) {
    return;
  }

  const settings = readSettings();
  const label = safeFilename(state.sourceLabel || "calendar");
  const ics = renderIcsCalendar(state.project, {
    name: `${state.sourceLabel || "Physicalendar"} ${settings.year}`
  });

  downloadText(`${label}-${settings.year}-events.ics`, ics, "text/calendar");
}

function exportPrintHtml() {
  if (!state.project) {
    return;
  }

  const html = currentPrintHtml();

  downloadText(`physicalendar-${readSettings().year}-print.html`, html, "text/html");
}

function openPrintRoute() {
  if (!state.sourceDoc) {
    return;
  }

  try {
    const project = createProjectSnapshot({ includeImages: true });

    writeLocalProject(project);
    updateLocalProjectStatus(`Saved print route project ${formatSavedAt(project.savedAt)}.`, "ok");
    window.open("./print.html", "_blank", "noopener");
  } catch (error) {
    updateLocalProjectStatus(`Could not open print route: ${error.message || String(error)}`, "error");
  }
}

function currentPrintHtml() {
  const settings = readSettings();

  return renderPrintDocument(state.project, settings, {
    title: `Physicalendar ${settings.year}`,
    sourceLabel: state.sourceLabel,
    monthImages: state.monthImages,
    monthImageSettings: state.monthImageSettings,
    layout: resolveLayout(state.layout)
  });
}

function exportProject() {
  if (!state.sourceDoc) {
    return;
  }

  const project = createProjectSnapshot({ includeImages: true });

  downloadText(`physicalendar-${project.settings.year}-project.json`, JSON.stringify(project, null, 2), "application/json");
}

async function exportBundle() {
  if (!state.sourceDoc || !state.project) {
    return;
  }

  const imageEntries = imageEntriesFromMonthImages(state.monthImages);
  const settings = readSettings();
  const project = {
    version: 5,
    savedAt: new Date().toISOString(),
    sourceLabel: state.sourceLabel,
    settings,
    layout: resolveLayout(state.layout),
    customRules: state.customRules,
    customFacts: state.customFacts,
    calculationHooks: state.hookSource,
    monthImageSettings: state.monthImageSettings,
    monthImageRefs: projectImageRefs(imageEntries),
    generatedPdf: state.bundlePdf ? {
      name: state.bundlePdf.name,
      path: "generated/calendar.pdf",
      size: state.bundlePdf.size
    } : null
  };
  const bundle = await createProjectBundle({
    project,
    sourceXml: serializeXml(state.sourceDoc),
    factsXml: serializeXml(state.project.factsDoc),
    printHtml: currentPrintHtml(),
    pdfCommands: currentPdfCommandsText(settings, project.layout),
    pdf: state.bundlePdf ? {
      path: "generated/calendar.pdf",
      bytes: state.bundlePdf.bytes
    } : null,
    images: imageEntries
  });

  downloadBlob(`physicalendar-${settings.year}-project.zip`, bundle);
}

async function attachBundlePdf() {
  const file = elements.bundlePdfInput.files?.[0];

  if (!file) {
    return;
  }

  try {
    if (file.type && file.type !== "application/pdf") {
      throw new Error("Attach a PDF file.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    if (!looksLikePdf(bytes)) {
      throw new Error("The selected file does not look like a PDF.");
    }

    state.bundlePdf = {
      name: file.name || `physicalendar-${readSettings().year}.pdf`,
      size: bytes.length,
      bytes
    };
    updateBundlePdfButton();
    updateLocalProjectStatus(`Attached PDF ${state.bundlePdf.name} (${formatFileSize(state.bundlePdf.size)}). It will be included in the next bundle export.`, "ok");
  } catch (error) {
    state.bundlePdf = null;
    updateBundlePdfButton();
    updateLocalProjectStatus(`Could not attach PDF: ${error.message || String(error)}`, "error");
  } finally {
    elements.bundlePdfInput.value = "";
  }
}

function downloadBundlePdf() {
  if (!state.bundlePdf?.bytes) {
    updateLocalProjectStatus("No bundled PDF is available.", "warning");
    return;
  }

  downloadBlob(state.bundlePdf.name || `physicalendar-${readSettings().year}.pdf`, new Blob([state.bundlePdf.bytes], { type: "application/pdf" }));
}

async function importProject() {
  const file = elements.projectImport.files?.[0];

  if (!file) {
    return;
  }

  try {
    const project = JSON.parse(await file.text());

    applyProjectSnapshot(project, {
      fallbackLabel: file.name.replace(/\.json$/i, "")
    });
  } catch (error) {
    showError(error);
  }
}

async function importBundle() {
  const file = elements.bundleImport.files?.[0];

  if (!file) {
    return;
  }

  try {
    const bundle = await readProjectBundle(file);
    const project = bundle.project;

    applyProjectSnapshot(project, {
      sourceXml: bundle.sourceXml,
      monthImages: bundle.monthImages || project.monthImages || {},
      pdf: bundle.pdf,
      fallbackLabel: file.name.replace(/\.zip$/i, "")
    });
    updateLocalProjectStatus(bundle.pdf
      ? `Loaded bundle with PDF ${bundle.pdf.path} (${formatFileSize(bundle.pdf.size)}).`
      : "Loaded bundle.",
      "ok");
  } catch (error) {
    showError(error);
  }
}

function createProjectSnapshot(options = {}) {
  const settings = readSettings();
  const layout = resolveLayout(state.layout);
  const project = {
    version: 5,
    savedAt: new Date().toISOString(),
    sourceLabel: state.sourceLabel,
    sourceXml: serializeXml(state.sourceDoc),
    settings,
    layout,
    exports: currentExportMetadata(settings, layout),
    customRules: state.customRules,
    customFacts: state.customFacts,
    calculationHooks: state.hookSource,
    monthImageSettings: state.monthImageSettings
  };

  if (options.includeImages) {
    project.monthImages = state.monthImages;
  }

  return project;
}

function currentExportMetadata(settings = readSettings(), layout = resolveLayout(state.layout)) {
  return pdfExportCommands({
    year: settings.year,
    label: state.sourceLabel || "physicalendar",
    layout
  });
}

function currentPdfCommandsText(settings = readSettings(), layout = resolveLayout(state.layout)) {
  const commands = currentExportMetadata(settings, layout);
  const bundleCommands = pdfExportCommands({
    year: settings.year,
    label: state.sourceLabel || "physicalendar",
    layout,
    printHtmlFile: "generated/print.html",
    pdfFile: commands.pdfFile
  });

  return [
    "# Physicalendar deterministic PDF export",
    bundleCommands.pdfCommand,
    bundleCommands.verifyCommand,
    ""
  ].join("\n");
}

function applyProjectSnapshot(project, options = {}) {
  const sourceXml = options.sourceXml || project.sourceXml;

  if (!sourceXml || !project.settings) {
    throw new Error("This does not look like a Physicalendar project file.");
  }

  state.sourceDoc = parseCalendarXml(sourceXml);
  state.sourceLabel = project.sourceLabel || options.fallbackLabel || "Calendar";
  state.monthImages = options.monthImages || project.monthImages || {};
  state.monthImageSettings = project.monthImageSettings || {};
  state.layout = resolveLayout(project.layout || {});
  state.customRules = Array.isArray(project.customRules) ? project.customRules : [];
  state.customFacts = Array.isArray(project.customFacts) ? project.customFacts : [];
  state.hookSource = typeof project.calculationHooks === "string" ? project.calculationHooks : defaultCalculationHooks();
  state.bundlePdf = options.pdf?.bytes ? {
    name: project.generatedPdf?.name || options.pdf.path.split("/").pop() || `physicalendar-${project.settings.year}.pdf`,
    size: options.pdf.size,
    bytes: options.pdf.bytes
  } : null;
  writeSettings(project.settings);
  writeLayoutControls(state.layout);
  writeSourceEditor();
  writeCalculationHooks();
  applyCalculationHooks({ quiet: true });
  storeImages(state.monthImages);
  storeImageSettings(state.monthImageSettings);
  storeLayout(state.layout);
  storeCustomRules(state.customRules);
  storeCustomFacts(state.customFacts);
  renderImageInputs();
  renderCustomRules();
  renderCustomFacts();
  updateBundlePdfButton();
  renderProject();
}

function saveLocalProject() {
  if (!state.sourceDoc) {
    return;
  }

  try {
    const project = createProjectSnapshot({ includeImages: true });

    writeLocalProject(project);
    updateLocalProjectStatus(`Saved locally ${formatSavedAt(project.savedAt)}.`, "ok");
  } catch (error) {
    updateLocalProjectStatus(`Could not save locally: ${error.message || String(error)}`, "error");
  }
}

function restoreLocalProject() {
  try {
    const project = readLocalProject();

    if (!project) {
      updateLocalProjectStatus("No local project saved.", "warning");
      return;
    }

    applyProjectSnapshot(project, { fallbackLabel: "Local project" });
    updateLocalProjectStatus(`Restored local project ${formatSavedAt(project.savedAt)}.`, "ok");
  } catch (error) {
    updateLocalProjectStatus(`Could not restore local project: ${error.message || String(error)}`, "error");
  }
}

function clearLocalProject() {
  clearStoredLocalProject();
  updateLocalProjectStatus("Local project cleared.", "warning");
}

function updateLocalProjectStatus(message, level = "ok") {
  if (message) {
    elements.localProjectStatus.textContent = message;
    elements.localProjectStatus.dataset.level = level;
    return;
  }

  try {
    const project = readLocalProject();

    if (!project) {
      elements.localProjectStatus.textContent = "No local project saved.";
      elements.localProjectStatus.dataset.level = "warning";
      return;
    }

    elements.localProjectStatus.textContent = `Local project saved ${formatSavedAt(project.savedAt)}.`;
    elements.localProjectStatus.dataset.level = "ok";
  } catch {
    elements.localProjectStatus.textContent = "Local project data needs attention.";
    elements.localProjectStatus.dataset.level = "error";
  }
}

function updateBundlePdfButton() {
  const hasPdf = Boolean(state.bundlePdf?.bytes);

  elements.downloadBundlePdfButton.disabled = !hasPdf;
  elements.downloadBundlePdfButton.title = hasPdf
    ? `Download ${state.bundlePdf.name} (${formatFileSize(state.bundlePdf.size)})`
    : "No PDF has been attached or loaded from a bundle";
}

function looksLikePdf(bytes) {
  return bytes?.[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function formatFileSize(size) {
  const bytes = Number(size || 0);

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

function formatSavedAt(value) {
  if (!value) {
    return "";
  }

  return `at ${new Date(value).toLocaleString()}`;
}

function selectedSourceLocale() {
  return CALENDAR_SOURCES.find((source) => source.path === elements.sourceSelect.value)?.locale || "";
}

function sourceDocumentLocale(doc) {
  return doc?.documentElement?.getAttribute("locale") || "";
}

function defaultTimeZoneForLocale(locale) {
  const language = String(locale || "").toLowerCase();
  const defaults = {
    "sv-se": "Europe/Stockholm",
    "nb-no": "Europe/Oslo",
    "nn-no": "Europe/Oslo",
    "en-us": "America/New_York",
    "en-gb": "Europe/London",
    "de-de": "Europe/Berlin",
    "fr-fr": "Europe/Paris"
  };

  return defaults[language] || "UTC";
}

function loadStoredImages() {
  try {
    return JSON.parse(localStorage.getItem("physicalendar.images") || "{}");
  } catch {
    return {};
  }
}

function storeImages(images) {
  localStorage.setItem("physicalendar.images", JSON.stringify(images));
}

function loadStoredImageSettings() {
  try {
    return JSON.parse(localStorage.getItem("physicalendar.imageSettings") || "{}");
  } catch {
    return {};
  }
}

function storeImageSettings(settings) {
  localStorage.setItem("physicalendar.imageSettings", JSON.stringify(settings));
}

function defaultLayout() {
  return resolveLayout(DEFAULT_LAYOUT);
}

function loadStoredLayout() {
  try {
    const stored = JSON.parse(localStorage.getItem("physicalendar.layout") || "{}");
    // Migrate old default margins to new smaller defaults
    if (stored.unit === "mm" || !stored.unit) {
      if (stored.marginTop === 15) stored.marginTop = 8;
      if (stored.marginRight === 10) stored.marginRight = 5;
      if (stored.marginBottom === 8) stored.marginBottom = 4;
      if (stored.marginLeft === 10) stored.marginLeft = 5;
    }
    return resolveLayout(stored);
  } catch {
    return defaultLayout();
  }
}

function storeLayout(layout) {
  localStorage.setItem("physicalendar.layout", JSON.stringify(resolveLayout(layout)));
}

function loadStoredPreviewZoom() {
  return clampPreviewZoom(localStorage.getItem("physicalendar.previewZoom") || 100);
}

function storePreviewZoom(zoom) {
  localStorage.setItem("physicalendar.previewZoom", String(clampPreviewZoom(zoom)));
}

function clampPreviewZoom(value) {
  const zoom = Math.trunc(Number(value));

  if (!Number.isFinite(zoom)) {
    return 100;
  }

  return Math.min(130, Math.max(50, zoom));
}

function loadStoredCustomRules() {
  try {
    return JSON.parse(localStorage.getItem("physicalendar.customRules") || "[]");
  } catch {
    return [];
  }
}

function storeCustomRules(rules) {
  localStorage.setItem("physicalendar.customRules", JSON.stringify(rules));
}

function loadStoredCustomFacts() {
  try {
    return JSON.parse(localStorage.getItem("physicalendar.customFacts") || "[]");
  } catch {
    return [];
  }
}

function loadStoredCalculationHooks() {
  return localStorage.getItem("physicalendar.calculationHooks") ?? defaultCalculationHooks();
}

function storeCalculationHooks(source) {
  localStorage.setItem("physicalendar.calculationHooks", String(source || ""));
}

function storeCustomFacts(facts) {
  localStorage.setItem("physicalendar.customFacts", JSON.stringify(facts));
}

function writeSettings(settings) {
  elements.yearInput.value = settings.year || 2027;
  elements.simpleYearInput.value = elements.yearInput.value;
  elements.localeInput.value = settings.locale || sourceDocumentLocale(state.sourceDoc) || selectedSourceLocale() || "en-US";
  elements.timeZoneInput.value = settings.timeZone || defaultTimeZoneForLocale(elements.localeInput.value);
  elements.weekSelect.value = settings.weekNumbering || "ISO";
  elements.startDaySelect.value = settings.startingWeekday || 1;
  elements.gmtInput.value = settings.gmt ?? 1;
}

function paperPresetFor(layout) {
  if (layout.unit === "mm" && Number(layout.paperWidth) === 210 && Number(layout.paperHeight) === 297) {
    return "a4";
  }

  if (layout.unit === "mm" && Number(layout.paperWidth) === 297 && Number(layout.paperHeight) === 420) {
    return "a3";
  }

  if (layout.unit === "in" && Number(layout.paperWidth) === 8.5 && Number(layout.paperHeight) === 11) {
    return "letter";
  }

  return "custom";
}

function updatePrintLayoutStyle(layout) {
  let style = document.querySelector("#dynamicPrintStyle");

  if (!style) {
    style = document.createElement("style");
    style.id = "dynamicPrintStyle";
    document.head.appendChild(style);
  }

  style.textContent = dynamicPrintCss(layout);
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value) {
  return String(value || "calendar")
    .replace(/\.[^.]+$/u, "")
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase() || "calendar";
}

function monthNameShort(month) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1] || "Month";
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const image = new Image();

      image.addEventListener("load", () => {
        resolve({
          dataUrl: reader.result,
          width: image.naturalWidth,
          height: image.naturalHeight
        });
      });
      image.addEventListener("error", () => reject(new Error(`Could not read image dimensions for ${file.name}.`)));
      image.src = reader.result;
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function stripSoftHyphens(value) {
  return value.replace(/\u00ad/g, "");
}

function sourceIdFromPath(path) {
  const match = CALENDAR_SOURCES.find((s) => s.path === path);
  return match ? match.id : "";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
