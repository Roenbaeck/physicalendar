import {
  CALENDAR_SOURCES,
  buildCalendarProject,
  compileCustomRule,
  createPreflightReport,
  customFactsCalculation,
  loadCalendarSource,
  parseCalendarXml,
  readCalendarSourceModel,
  readCalculationMetadata,
  serializeXml
} from "./core/calendar-engine.js";
import { renderPrintDocument } from "./core/print-renderer.js";
import {
  createProjectBundle,
  imageEntriesFromMonthImages,
  projectImageRefs,
  readProjectBundle
} from "./core/project-bundle.js";
import { applyLayoutTemplate, resolveLayout } from "./core/layout-templates.js";
import { measureTextOverflow, mergeOverflowPreflight } from "./core/dom-preflight.js";
import { parseIcsEvents, renderIcsCalendar } from "./core/calendar-ics.js";
import { exportPanelSummary, pdfExportCommands } from "./core/export-commands.js";

const results = document.querySelector("#testResults");
const checks = [];

run().catch((error) => {
  results.innerHTML = `<div class="test-case fail"><strong>Test runner failed</strong><span>${escapeHtml(error.stack || error.message)}</span></div>`;
});

async function run() {
  await checkSweden2027();
  await checkSwedenLeapDay2024();
  await checkStartingWeekdayLayout();
  await checkRepresentativeYearCompatibility();
  await checkEmptyXmlSnapshot();
  await checkLocaleFallbacks();
  await checkTimeZoneSettings();
  await checkCalendarSourceModel();
  await checkUnitedStates2027();
  await checkNorway2027();
  await checkCalculationPlugins();
  await checkCustomFactsCalculation();
  await checkSourceXmlEditing();
  await checkEnhancedEventMetadata();
  await checkSelectorMatchExpectations();
  await checkCustomRules();
  await checkIcsExport();
  await checkIcsImport();
  await checkPrintExport();
  await checkDomOverflowPreflight();
  await checkProjectBundle();
  await checkPdfExportCommands();
  renderResults();
}

async function checkSweden2027() {
  const project = await projectFor("sweden", 2027, "ISO", 1, 1);
  const report = createPreflightReport(project, {});

  assertEqual("Sweden 2027 has 365 generated days", generatedDayCount(project), 365);
  assertEqual("Sweden 2027 renders 12 pages", project.pages.length, 12);
  assertIncludes("Sweden New Year's Day", namesOn(project, "2027-01-01"), "Nyårsdagen");
  assertIncludes("Sweden Easter Sunday", namesOn(project, "2027-03-28"), "Påskdagen");
  assertIncludes("Sweden Midsummer Eve", namesOn(project, "2027-06-25"), "Midsommarafton");
  assertIncludes("Sweden winter solstice", namesOn(project, "2027-12-22"), "Vintersolstånd");
  assertEqual("Sweden 2027 selector errors", report.counts.selectorErrors, 0);
  assertEqual("Sweden 2027 unmatched rules only leap day", report.counts.unmatchedRules, 1);
}

async function checkSwedenLeapDay2024() {
  const project = await projectFor("sweden", 2024, "ISO", 1, 1);
  const report = createPreflightReport(project, {});

  assertEqual("Sweden 2024 has 366 generated days", generatedDayCount(project), 366);
  assertIncludes("Sweden leap day event", namesOn(project, "2024-02-29"), "Skottdagen");
  assertEqual("Sweden 2024 selector errors", report.counts.selectorErrors, 0);
}

async function checkStartingWeekdayLayout() {
  const mondayProject = await projectFor("sweden", 2027, "ISO", 1, 1);
  const sundayProject = await projectFor("sweden", 2027, "ISO", 7, 1);
  const mondayJan1 = renderableDay(mondayProject, "2027-01-01");
  const sundayJan1 = renderableDay(sundayProject, "2027-01-01");
  const html = renderPrintDocument(sundayProject, { year: 2027, weekNumbering: "ISO" }, {
    title: "Sunday Start Export",
    sourceLabel: "Sweden",
    monthImages: {},
    monthImageSettings: {},
    layout: resolveLayout()
  });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const jan1Cell = doc.querySelector("[data-date='2027-01-01']");

  assertEqual("Monday-start keeps ISO weekday", mondayJan1.weekday, 5);
  assertEqual("Monday-start display weekday follows Monday grid", mondayJan1.weekdayDisplay, 5);
  assertEqual("Monday-start exposes renderable year", mondayJan1.year, 2027);
  assertEqual("Monday-start exposes renderable day-of-year", mondayJan1.dayOfYear, 1);
  assertEqual("Monday-start exposes renderable leap-year flag", mondayJan1.isLeapYear, false);
  assertEqual("Monday-start exposes renderable weekend flag", mondayJan1.isWeekend, false);
  assertEqual("Sunday-start keeps ISO weekday", sundayJan1.weekday, 5);
  assertEqual("Sunday-start display weekday follows Sunday grid", sundayJan1.weekdayDisplay, 6);
  assertEqual("Sunday-start label begins with Sunday", sundayProject.pages[0].weekdayLabels[0].toLowerCase().startsWith("s"), true);
  assertIncludes("Sunday-start keeps XPath holiday match", namesOn(sundayProject, "2027-06-25"), "Midsommarafton");
  assertEqual("Printed day cell exposes ISO weekday", jan1Cell?.dataset.weekdayIso, "5");
  assertEqual("Printed day cell exposes display weekday", jan1Cell?.dataset.weekdayDisplay, "6");
}

async function checkRepresentativeYearCompatibility() {
  const cases = [
    { year: 1900, days: 365, leap: "0", easter: "1900-04-15", jan1Weekday: "1", jan1IsoWeek: "1", mar1Day: "60" },
    { year: 2000, days: 366, leap: "1", easter: "2000-04-23", jan1Weekday: "6", jan1IsoWeek: "52", mar1Day: "61" },
    { year: 2009, days: 365, leap: "0", easter: "2009-04-12", jan1Weekday: "4", jan1IsoWeek: "1", mar1Day: "60" },
    { year: 2024, days: 366, leap: "1", easter: "2024-03-31", jan1Weekday: "1", jan1IsoWeek: "1", mar1Day: "61" },
    { year: 2027, days: 365, leap: "0", easter: "2027-03-28", jan1Weekday: "5", jan1IsoWeek: "53", mar1Day: "60" },
    { year: 2099, days: 365, leap: "0", easter: "2099-04-12", jan1Weekday: "4", jan1IsoWeek: "1", mar1Day: "60" }
  ];

  for (const item of cases) {
    const project = await projectFor("empty", item.year, "ISO", 1, 0);
    const jan1 = dayNode(project, `${item.year}-01-01`);
    const jan2 = dayNode(project, `${item.year}-01-02`);
    const mar1 = dayNode(project, `${item.year}-03-01`);
    const easterDay = dayNode(project, item.easter);
    const moonEvents = project.factsDoc.querySelectorAll("day[moonPhaseEvent]");
    const sunEvents = project.factsDoc.querySelectorAll("day[sunEvent]");
    const serialized = new XMLSerializer().serializeToString(project.factsDoc);

    assertEqual(`Empty ${item.year} generated day count`, generatedDayCount(project), item.days);
    assertEqual(`Empty ${item.year} leap attribute`, project.factsDoc.querySelector("calendar > year")?.getAttribute("leap"), item.leap);
    assertEqual(`Empty ${item.year} January 1 year fact`, jan1?.getAttribute("year"), String(item.year));
    assertEqual(`Empty ${item.year} January 1 dayOfYear fact`, jan1?.getAttribute("dayOfYear"), "1");
    assertEqual(`Empty ${item.year} January 1 leap-year fact`, jan1?.getAttribute("isLeapYear"), item.leap === "1" ? "true" : "false");
    assertEqual(`Empty ${item.year} January 1 weekend fact`, jan1?.getAttribute("isWeekend"), item.jan1Weekday === "6" || item.jan1Weekday === "7" ? "true" : "false");
    assertEqual(`Empty ${item.year} January 2 weekend fact`, jan2?.getAttribute("isWeekend"), item.jan1Weekday === "5" || item.jan1Weekday === "6" ? "true" : "false");
    assertEqual(`Empty ${item.year} January 1 weekday`, jan1?.getAttribute("weekday"), item.jan1Weekday);
    assertEqual(`Empty ${item.year} January 1 ISO week`, jan1?.getAttribute("weekIso"), item.jan1IsoWeek);
    assertEqual(`Empty ${item.year} January 1 US week`, jan1?.getAttribute("weekUs"), "1");
    assertEqual(`Empty ${item.year} March 1 day-of-year`, mar1?.getAttribute("day"), item.mar1Day);
    assertEqual(`Empty ${item.year} Easter marker`, easterDay?.getAttribute("easter"), "true");
    assertEqual(`Empty ${item.year} has four seasonal sun events`, sunEvents.length, 4);
    assertEqual(`Empty ${item.year} has enough moon phase events`, moonEvents.length >= 45 && moonEvents.length <= 55, true);
    assertEqual(`Empty ${item.year} generated XML has calculations`, serialized.includes("<calculations><calculation id=\"gregorian-year\""), true);
    assertEqual(`Empty ${item.year} generated XML has 12 months`, project.factsDoc.querySelectorAll("calendar > year > month").length, 12);
    assertEqual(`Empty ${item.year} event selectors are empty`, project.eventResults.length, 0);
  }
}

async function checkEmptyXmlSnapshot() {
  const snapshot = await emptyXmlSnapshot();

  assertEqual("Empty 2027 generated XML length snapshot", snapshot.length, 100448);
  assertEqual("Empty 2027 generated XML checksum snapshot", snapshot.checksum, "f535bbd3");
  assertEqual("Empty 2027 generated XML day count snapshot", snapshot.dayCount, 365);
  assertEqual("Empty 2027 generated XML month count snapshot", snapshot.monthCount, 12);
  assertEqual("Empty 2027 calculation ids snapshot", snapshot.calculationIds, "gregorian-year,week-numbers,easter,moon-phases,seasonal-sun");
  assertEqual("Empty 2027 first day snapshot", compactDaySnapshot(snapshot.firstDay), "2027-01-01|5|53|1|290.0725|3");
  assertEqual("Empty 2027 Easter snapshot", compactDaySnapshot(snapshot.easter), "2027-03-28|7|12|14|253.1154|2");
  assertEqual("Empty 2027 Easter marker snapshot", snapshot.easter.easter, "true");
  assertEqual("Empty 2027 spring equinox snapshot", compactDaySnapshot(snapshot.springEquinox), "2027-03-20|6|11|12|154.1747|1");
  assertEqual("Empty 2027 spring equinox marker snapshot", snapshot.springEquinox.sunEvent, "springEquinox");
  assertEqual("Empty 2027 first full moon snapshot", compactDaySnapshot(snapshot.firstFullMoon), "2027-01-22|5|3|4|179.8267|2");
  assertEqual("Empty 2027 first full moon marker snapshot", snapshot.firstFullMoon.moonPhaseEvent, "full");
  assertEqual("Empty 2027 last day snapshot", compactDaySnapshot(snapshot.lastDay), "2027-12-31|5|52|53|40.1782|0");
}

async function emptyXmlSnapshot() {
  const project = await projectFor("empty", 2027, "ISO", 1, 0);
  const xml = serializeXml(project.factsDoc);
  const days = Array.from(project.factsDoc.querySelectorAll("calendar > year > month > day"));
  const attrObj = (node) => Object.fromEntries(Array.from(node.attributes).map((attr) => [attr.name, attr.value]));

  return {
    length: xml.length,
    checksum: xmlChecksum(xml),
    dayCount: days.length,
    monthCount: project.factsDoc.querySelectorAll("calendar > year > month").length,
    calculationIds: Array.from(project.factsDoc.querySelectorAll("calendar > calculations > calculation"))
      .map((node) => node.getAttribute("id"))
      .join(","),
    firstDay: attrObj(dayNode(project, "2027-01-01")),
    easter: attrObj(project.factsDoc.querySelector("day[easter='true']")),
    springEquinox: attrObj(project.factsDoc.querySelector("day[sunEvent='springEquinox']")),
    firstFullMoon: attrObj(project.factsDoc.querySelector("day[moonPhaseEvent='full']")),
    lastDay: attrObj(days[days.length - 1])
  };
}

async function checkLocaleFallbacks() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "empty");
  const doc = await loadCalendarSource(source.path);
  const project = buildCalendarProject(doc, {
    year: 2027,
    locale: "sv-SE",
    weekNumbering: "ISO",
    startingWeekday: 1,
    gmt: 1
  });

  assertEqual("Locale fallback localizes empty month name", project.pages[0].name, "januari");
  assertEqual("Locale fallback localizes weekday fact", dayNode(project, "2027-01-01")?.getAttribute("weekdayName"), "fredag");
  assertEqual("Locale fallback localizes weekday labels", project.pages[0].weekdayLabels.join(","), "måndag,tisdag,onsdag,torsdag,fredag,lördag,söndag");
}

async function checkTimeZoneSettings() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "empty");
  const doc = await loadCalendarSource(source.path);
  const project = buildCalendarProject(doc, {
    year: 2027,
    locale: "sv-SE",
    timeZone: "Europe/Stockholm",
    weekNumbering: "ISO",
    startingWeekday: 1,
    gmt: 0
  });
  const numericGmtProject = buildCalendarProject(doc, {
    year: 2027,
    locale: "sv-SE",
    weekNumbering: "ISO",
    startingWeekday: 1,
    gmt: 1
  });
  const invalidZoneProject = buildCalendarProject(doc, {
    year: 2027,
    locale: "sv-SE",
    timeZone: "Not/AZone",
    weekNumbering: "ISO",
    startingWeekday: 1,
    gmt: 1
  });

  assertEqual("Time zone writes canonical zone fact", dayNode(project, "2027-01-01")?.getAttribute("timeZone"), "Europe/Stockholm");
  assertEqual("Time zone writes winter GMT offset", dayNode(project, "2027-01-01")?.getAttribute("gmtOffset"), "1");
  assertEqual("Time zone writes summer GMT offset", dayNode(project, "2027-07-01")?.getAttribute("gmtOffset"), "2");
  assertEqual("Time zone offset changes summer moon angle", dayNode(project, "2027-07-01")?.getAttribute("moonAngle") === dayNode(numericGmtProject, "2027-07-01")?.getAttribute("moonAngle"), false);
  assertEqual("Invalid time zone falls back to numeric GMT angle", dayNode(invalidZoneProject, "2027-01-01")?.getAttribute("moonAngle"), dayNode(numericGmtProject, "2027-01-01")?.getAttribute("moonAngle"));
  assertEqual("Invalid time zone does not write zone fact", dayNode(invalidZoneProject, "2027-01-01")?.hasAttribute("timeZone"), false);
}

function compactDaySnapshot(day) {
  return [
    day.date,
    day.weekday,
    day.weekIso,
    day.weekUs,
    day.moonAngle,
    day.moonPhaseQuarter
  ].join("|");
}

async function checkCalendarSourceModel() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "sweden");
  const sourceDoc = await loadCalendarSource(source.path);
  const model = readCalendarSourceModel(sourceDoc);
  const february = model.months.find((month) => month.index === 2);
  const sunday = model.weekdays.get(7);
  const firstEventRule = model.eventRules[0];
  const malformed = parseCalendarXml(`
    <calendar>
      <year>
        <month index="2">
          <day index="29"/>
        </month>
      </year>
    </calendar>
  `);

  assertEqual("Source model keeps parsed XML document", model.doc, sourceDoc);
  assertEqual("Source model has 12 months", model.months.length, 12);
  assertEqual("Source model preserves month names", model.months[0].name, "Januari");
  assertEqual("Source model includes leap day metadata", february.days.find((day) => day.index === 29).leap, "1");
  assertEqual("Source model includes weekday metadata", sunday.holiday, true);
  assertEqual("Source model exposes event rules", model.eventDays.length > 50, true);
  assertEqual("Source model exposes typed event rules", model.eventRules.length, model.eventDays.length);
  assertEqual("Source model event rule keeps source index", firstEventRule.index, 0);
  assertEqual("Source model event rule keeps XPath", firstEventRule.xpath, "/calendar/year/month[1]/day[1]");
  assertEqual("Source model event rule keeps source name", firstEventRule.name, "Nyårs\u00addagen");
  assertEqual("Source model event rule keeps source metadata", firstEventRule.attributes.flag, "true");
  assertEqual("Source model event rule keeps name nodes", firstEventRule.names[0].text, "Nyårs\u00addagen");
  assertThrows("Source model rejects unmarked February 29", () => readCalendarSourceModel(malformed), "February 29");
  assertThrows("Generation rejects malformed source models early", () => {
    buildCalendarProject(malformed, { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 });
  }, "February 29");
}

async function checkUnitedStates2027() {
  const project = await projectFor("united-states", 2027, "US", 7, -5);
  const report = createPreflightReport(project, {});

  assertEqual("US 2027 has 365 generated days", generatedDayCount(project), 365);
  assertIncludes("US Thanksgiving", namesOn(project, "2027-11-25"), "Thanksgiving Day");
  assertIncludes("US Memorial Day", namesOn(project, "2027-05-31"), "Memorial Day");
  assertIncludes("US Easter", namesOn(project, "2027-03-28"), "Easter Sunday");
  assertEqual("US 2027 selector errors", report.counts.selectorErrors, 0);
}

async function checkNorway2027() {
  const project = await projectFor("norway", 2027, "ISO", 1, 1);
  const report = createPreflightReport(project, {});

  assertEqual("Norway 2027 has 365 generated days", generatedDayCount(project), 365);
  assertIncludes("Norway constitution day", namesOn(project, "2027-05-17"), "Grunnlovsdagen");
  assertIncludes("Norway Easter Sunday", namesOn(project, "2027-03-28"), "Første Påskedag");
  assertEqual("Norway 2027 selector errors", report.counts.selectorErrors, 0);
}

async function checkCalculationPlugins() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "sweden");
  const sourceDoc = await loadCalendarSource(source.path);
  const doc = sourceDoc.cloneNode(true);
  const customEvent = doc.createElement("day");
  const customName = doc.createElement("name");

  customEvent.setAttribute("xpath", "/calendar/year/month/day[@customAnchor = 'true']");
  customName.textContent = "Custom Calculation Day";
  customEvent.appendChild(customName);
  doc.querySelector("calendar > event").appendChild(customEvent);

  const customCalculation = {
    id: "custom-anchor",
    label: "Custom anchor test",
    run({ year }) {
      return {
        factsByDate: {
          [`${year}-08-21`]: {
            customAnchor: true
          }
        },
        anchors: {
          customAnchor: `${year}-08-21`
        }
      };
    }
  };
  const project = buildCalendarProject(doc, { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 }, {
    calculations: [customCalculation]
  });
  const metadata = readCalculationMetadata(project.factsDoc);
  const calculations = metadata.map((calculation) => calculation.id);
  const customMeta = metadata.find((calculation) => calculation.id === "custom-anchor");

  assertIncludes("Calculation metadata includes gregorian", calculations, "gregorian-year");
  assertIncludes("Calculation metadata includes moon phases", calculations, "moon-phases");
  assertIncludes("Calculation metadata includes custom calculation", calculations, "custom-anchor");
  assertEqual("Custom calculation metadata counts dates", customMeta.dateCount, 1);
  assertEqual("Custom calculation metadata counts facts", customMeta.factCount, 1);
  assertEqual("Custom calculation metadata counts anchors", customMeta.anchorCount, 1);
  assertEqual("Custom calculation metadata exposes anchor", customMeta.anchors[0].id, "customAnchor");
  assertEqual("Custom calculation metadata serializes anchor child", project.factsDoc.querySelector("calculation[id='custom-anchor'] > anchor[id='customAnchor']")?.getAttribute("date"), "2027-08-21");
  assertEqual("Calculation anchor is serialized", project.factsDoc.querySelector("anchor[id='customAnchor']")?.getAttribute("date"), "2027-08-21");
  assertIncludes("Custom calculation fact is available to XPath events", namesOn(project, "2027-08-21"), "Custom Calculation Day");
  assertEqual("Project exposes calculation metadata", project.calculations.some((calculation) => calculation.id === "custom-anchor"), true);
}

async function checkCustomFactsCalculation() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "empty");
  const doc = await loadCalendarSource(source.path);
  const eventRoot = doc.querySelector("calendar > event");

  eventRoot.appendChild(eventDay(doc, {
    xpath: "/calendar/year/month/day[@familyTrip = 'true']",
    name: "Family Trip"
  }));
  eventRoot.appendChild(eventDay(doc, {
    xpath: "/calendar/year/month/day[@tripCode = 'AUGUST']",
    name: "Trip Code Match"
  }));
  eventRoot.appendChild(eventDay(doc, {
    rule: "anchor('tripStart') + 3d",
    name: "Anchor Rule Match"
  }));
  eventRoot.appendChild(eventDay(doc, {
    xpath: "/calendar/year/month/day[@augustFullMoonPlus21 = 'true']",
    name: "Calculated Moon Fact"
  }));
  eventRoot.appendChild(eventDay(doc, {
    xpath: "/calendar/year/month/day[@preEasterMarker = 'true']",
    name: "Calculated Easter Fact"
  }));
  eventRoot.appendChild(eventDay(doc, {
    xpath: "/calendar/year/month/day[@firstMonday = 'true']",
    name: "Calculated Weekday Fact"
  }));

  const project = buildCalendarProject(doc, { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 }, {
    calculations: [
      customFactsCalculation([
        { month: 8, day: 21, fact: "familyTrip", value: "true", anchor: "tripStart" },
        { month: 8, day: 22, fact: "tripCode", value: "AUGUST" },
        { type: "moon-phase-offset", month: 8, phase: "full", offset: 21, fact: "augustFullMoonPlus21", value: "true", anchor: "moonFactAnchor" },
        { type: "easter-offset", offset: -2, fact: "preEasterMarker", value: "true" },
        { type: "nth-weekday", month: 9, weekday: 1, nth: 1, fact: "firstMonday", value: "true" }
      ])
    ],
    customRules: [
      {
        id: "anchor-offset",
        name: "Friendly Anchor Offset",
        type: "anchor-offset",
        anchor: "tripStart",
        offset: 2,
        expectedMatches: 1
      }
    ]
  });
  const calculations = readCalculationMetadata(project.factsDoc).map((calculation) => calculation.id);
  const anchorRule = project.eventResults.find((result) => result.ruleId === "anchor-offset");

  assertIncludes("Custom facts calculation metadata", calculations, "custom-facts");
  assertEqual("Custom fact is written before XPath", dayNode(project, "2027-08-21")?.getAttribute("familyTrip"), "true");
  assertEqual("Custom text fact is written", dayNode(project, "2027-08-22")?.getAttribute("tripCode"), "AUGUST");
  assertEqual("Calculated moon custom fact is written", dayNode(project, "2027-09-07")?.getAttribute("augustFullMoonPlus21"), "true");
  assertEqual("Calculated Easter custom fact is written", dayNode(project, "2027-03-26")?.getAttribute("preEasterMarker"), "true");
  assertEqual("Calculated weekday custom fact is written", dayNode(project, "2027-09-06")?.getAttribute("firstMonday"), "true");
  assertEqual("Custom fact anchor is serialized", project.factsDoc.querySelector("anchor[id='tripStart']")?.getAttribute("date"), "2027-08-21");
  assertEqual("Calculated fact anchor is serialized", project.factsDoc.querySelector("anchor[id='moonFactAnchor']")?.getAttribute("date"), "2027-09-07");
  assertEqual("Friendly anchor rule XPath", compileCustomRule({ type: "anchor-offset", anchor: "tripStart", offset: 2 }), "/calendar/year/month/day[@date = /calendar/calculations/anchor[@id = 'tripStart']/@date]/following::day[2]");
  assertEqual("Friendly anchor rule expectation is recorded", anchorRule.expectations.expected, 1);
  assertIncludes("Custom fact XPath event appears", namesOn(project, "2027-08-21"), "Family Trip");
  assertIncludes("Custom text fact XPath event appears", namesOn(project, "2027-08-22"), "Trip Code Match");
  assertIncludes("Calculated moon fact XPath event appears", namesOn(project, "2027-09-07"), "Calculated Moon Fact");
  assertIncludes("Calculated Easter fact XPath event appears", namesOn(project, "2027-03-26"), "Calculated Easter Fact");
  assertIncludes("Calculated weekday fact XPath event appears", namesOn(project, "2027-09-06"), "Calculated Weekday Fact");
  assertIncludes("Friendly anchor offset event appears", namesOn(project, "2027-08-23"), "Friendly Anchor Offset");
  assertIncludes("XML anchor offset event appears", namesOn(project, "2027-08-24"), "Anchor Rule Match");
  assertThrows("Custom facts reject invalid XML attribute names", () => {
    customFactsCalculation([{ month: 8, day: 21, fact: "not a name", value: "true" }]).run({ year: 2027 });
  }, "Invalid custom fact name");
  assertThrows("Custom anchor rules reject invalid names", () => {
    compileCustomRule({ type: "anchor-offset", anchor: "not a name", offset: 0 });
  }, "Invalid anchor name");
}

async function checkSourceXmlEditing() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "sweden");
  const sourceDoc = await loadCalendarSource(source.path);
  const xml = new XMLSerializer().serializeToString(sourceDoc).replace(
    "</event>",
    `<day xpath="/calendar/year/month[8]/day[21]" flag="true"><name>Edited XML Day</name></day></event>`
  );
  const editedDoc = parseCalendarXml(xml);
  const project = buildCalendarProject(editedDoc, { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 });
  const editedResult = project.eventResults.find((result) => result.name === "Edited XML Day");

  assertIncludes("Edited XML event appears on target date", namesOn(project, "2027-08-21"), "Edited XML Day");
  assertEqual("Edited XML event has one match", editedResult.matches.length, 1);
  assertEqual("Edited XML event match date", editedResult.matches[0], "2027-08-21");
  assertEqual("Edited XML event result links to parsed source rule", project.sourceModel.eventRules[editedResult.sourceIndex].name, "Edited XML Day");
}

async function checkEnhancedEventMetadata() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "empty");
  const sourceDoc = await loadCalendarSource(source.path);
  const eventRoot = sourceDoc.querySelector("calendar > event");

  eventRoot.appendChild(eventDay(sourceDoc, {
    xpath: "/calendar/year/month[8]/day[21]",
    name: "Low Priority",
    category: "note",
    source: "fixture",
    priority: "1",
    className: "quiet-event",
    lang: "en"
  }));
  eventRoot.appendChild(eventDay(sourceDoc, {
    xpath: "/calendar/year/month[8]/day[21]",
    name: "Long\u00adEvent",
    category: "note",
    source: "fixture",
    priority: "5",
    lang: "en"
  }));
  eventRoot.appendChild(eventDay(sourceDoc, {
    xpath: "/calendar/year/month[8]/day[21]",
    name: "Holiday Priority",
    holiday: "true",
    flag: "true",
    category: "holiday",
    source: "fixture",
    priority: "10",
    className: "major-event",
    lang: "sv"
  }));

  const project = buildCalendarProject(sourceDoc, { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 });
  const generatedNames = Array.from(project.factsDoc.querySelectorAll("day[date='2027-08-21'] > name")).map((node) => node.textContent);
  const day = renderableDay(project, "2027-08-21");
  const html = renderPrintDocument(project, { year: 2027, weekNumbering: "ISO" }, {
    title: "Event Metadata",
    sourceLabel: "Empty",
    monthImages: {},
    layout: resolveLayout()
  });

  assertEqual("Event priority puts holiday first in generated XML", generatedNames[0], "Holiday Priority");
  assertEqual("Event priority keeps middle priority second", generatedNames[1], "Long\u00adEvent");
  assertEqual("Event priority keeps lower priority third", generatedNames[2], "Low Priority");
  assertEqual("Generated XML preserves soft hyphen", generatedNames[1].includes("\u00ad"), true);
  assertEqual("Renderable day exposes three event records", day.events.length, 3);
  assertEqual("Renderable event preserves category", day.events[0].category, "holiday");
  assertEqual("Renderable event preserves source", day.events[0].source, "fixture");
  assertEqual("Renderable event preserves priority", day.events[0].priority, 10);
  assertEqual("Renderable event preserves class", day.events[0].className, "major-event");
  assertEqual("Renderable event preserves language", day.events[0].lang, "sv");
  assertEqual("Renderable event preserves flag", day.events[0].flag, true);
  assertEqual("Renderable name preserves soft hyphen", day.names[1].text.includes("\u00ad"), true);
  assertEqual("Print HTML includes event class", html.includes("major-event"), true);
  assertEqual("Print HTML includes category class", html.includes("event-category-holiday"), true);
  assertEqual("Print HTML includes language attribute", html.includes("lang=\"sv\""), true);
  assertEqual("Print HTML preserves soft hyphen", html.includes("Long\u00adEvent"), true);
}

async function checkSelectorMatchExpectations() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "empty");
  const sourceDoc = await loadCalendarSource(source.path);
  const eventRoot = sourceDoc.querySelector("calendar > event");

  eventRoot.appendChild(eventDay(sourceDoc, {
    xpath: "/calendar/year/month[1]/day[@weekday = 1]",
    name: "Exact Mismatch",
    expectedMatches: "1"
  }));
  eventRoot.appendChild(eventDay(sourceDoc, {
    xpath: "/calendar/year/month[2]/day[@index = 31]",
    name: "Minimum Mismatch",
    minMatches: "1"
  }));
  eventRoot.appendChild(eventDay(sourceDoc, {
    xpath: "/calendar/year/month/day[@weekday = 7]",
    name: "Maximum Mismatch",
    maxMatches: "12"
  }));
  eventRoot.appendChild(eventDay(sourceDoc, {
    xpath: "/calendar/year/month[1]/name",
    name: "Non Day Target"
  }));
  eventRoot.appendChild(eventDay(sourceDoc, {
    xpath: "/calendar/year/month[8]/day[21]",
    name: "Exact Match",
    expectedMatches: "1"
  }));

  const project = buildCalendarProject(sourceDoc, { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 });
  const report = createPreflightReport(project, {}, {}, resolveLayout());
  const expected = project.eventResults.find((result) => result.name === "Exact Mismatch");
  const min = project.eventResults.find((result) => result.name === "Minimum Mismatch");
  const max = project.eventResults.find((result) => result.name === "Maximum Mismatch");
  const nonDay = project.eventResults.find((result) => result.name === "Non Day Target");
  const exact = project.eventResults.find((result) => result.name === "Exact Match");
  const unexpectedIssue = report.issues.find((issue) => issue.title.includes("unexpected number"));
  const invalidTargetIssue = report.issues.find((issue) => issue.title.includes("non-day XML nodes"));

  assertEqual("Selector exact expectation is recorded", expected.expectations.expected, 1);
  assertEqual("Selector exact expectation mismatch count", expected.matches.length, 4);
  assertEqual("Selector min expectation is recorded", min.expectations.min, 1);
  assertEqual("Selector max expectation is recorded", max.expectations.max, 12);
  assertEqual("Selector validation counts selected non-day nodes", nonDay.selectedNodes, 1);
  assertEqual("Selector validation records invalid non-day target", nonDay.invalidTargets[0], "<name>");
  assertEqual("Selector validation does not apply non-day matches", nonDay.matches.length, 0);
  assertEqual("Selector matching exact expectation is not warned", exact.matches.length, 1);
  assertEqual("Preflight counts unexpected selector matches", report.counts.unexpectedMatchRules, 3);
  assertEqual("Preflight counts invalid selector targets", report.counts.invalidSelectorTargets, 1);
  assertEqual("Preflight invalid selector warning exists", Boolean(invalidTargetIssue), true);
  assertEqual("Preflight invalid selector warning names rule", invalidTargetIssue.detail.includes("Non Day Target"), true);
  assertEqual("Preflight unexpected selector warning exists", Boolean(unexpectedIssue), true);
  assertEqual("Preflight warning names exact mismatch", unexpectedIssue.detail.includes("Exact Mismatch"), true);
  assertEqual("Preflight warning names max mismatch", unexpectedIssue.detail.includes("Maximum Mismatch"), true);
}

async function checkCustomRules() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "sweden");
  const doc = await loadCalendarSource(source.path);
  const eventRoot = doc.querySelector("calendar > event");
  const customRules = [
    {
      id: "fixed-test",
      name: "Fixed Test Day",
      type: "fixed-date",
      month: 8,
      day: 15,
      holiday: true,
      flag: true,
      category: "personal",
      source: "rule-builder",
      priority: 9,
      className: "family-event",
      lang: "en",
      expectedMatches: 1
    },
    {
      id: "moon-test",
      name: "Three Weeks After August Full Moon",
      type: "moon-phase-offset",
      month: 8,
      phase: "full",
      offset: 21
    },
    {
      id: "easter-test",
      name: "Two Days Before Easter",
      type: "easter-offset",
      offset: -2
    },
    {
      id: "range-test",
      name: "Friday In Late June",
      type: "range-weekday",
      month: 6,
      day: 19,
      endDay: 25,
      weekday: 5,
      maxMatches: 0
    }
  ];

  eventRoot.appendChild(eventDay(doc, {
    rule: "fixedDate(8, 15)",
    name: "XML Rule Fixed Day"
  }));
  eventRoot.appendChild(eventDay(doc, {
    rule: "date('2027-08-15')",
    name: "XML Rule ISO Day"
  }));
  eventRoot.appendChild(eventDay(doc, {
    rule: "nthWeekday(6, 5, 4)",
    name: "XML Rule Nth Weekday"
  }));
  eventRoot.appendChild(eventDay(doc, {
    rule: "lastWeekday(6, 5)",
    name: "XML Rule Last Weekday"
  }));
  eventRoot.appendChild(eventDay(doc, {
    rule: "weekdayInRange(6, 19, 25, 5)",
    name: "XML Rule Range Weekday"
  }));
  eventRoot.appendChild(eventDay(doc, {
    rule: "firstMoonPhaseAfter(8, 'full') + 21d",
    name: "XML Rule Moon Day"
  }));
  eventRoot.appendChild(eventDay(doc, {
    rule: "easter - 2d",
    name: "XML Rule Easter Day"
  }));
  eventRoot.appendChild(eventDay(doc, {
    rule: "notARealRule()",
    name: "Unsupported XML Rule"
  }));

  const project = buildCalendarProject(doc, { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 }, { customRules });
  const report = createPreflightReport(project, {}, {}, resolveLayout());
  const fixedRule = project.eventResults.find((result) => result.ruleId === "fixed-test");
  const moonRule = project.eventResults.find((result) => result.ruleId === "moon-test");
  const easterRule = project.eventResults.find((result) => result.ruleId === "easter-test");
  const rangeRule = project.eventResults.find((result) => result.ruleId === "range-test");
  const xmlFixedRule = project.eventResults.find((result) => result.name === "XML Rule Fixed Day");
  const xmlIsoRule = project.eventResults.find((result) => result.name === "XML Rule ISO Day");
  const xmlNthRule = project.eventResults.find((result) => result.name === "XML Rule Nth Weekday");
  const xmlLastRule = project.eventResults.find((result) => result.name === "XML Rule Last Weekday");
  const xmlRangeRule = project.eventResults.find((result) => result.name === "XML Rule Range Weekday");
  const xmlMoonRule = project.eventResults.find((result) => result.name === "XML Rule Moon Day");
  const xmlEasterRule = project.eventResults.find((result) => result.name === "XML Rule Easter Day");
  const unsupportedRule = project.eventResults.find((result) => result.name === "Unsupported XML Rule");
  const fixedDay = renderableDay(project, "2027-08-15");
  const fixedEvent = fixedDay.events.find((event) => event.ruleId === "fixed-test");
  const fixedPrintHtml = renderPrintDocument(project, { year: 2027, weekNumbering: "ISO" }, {
    title: "Custom Rule Metadata",
    sourceLabel: "Sweden",
    monthImages: {},
    layout: resolveLayout()
  });

  assertEqual("Custom fixed-date XPath", compileCustomRule(customRules[0]), "/calendar/year/month[8]/day[15]");
  assertEqual("Custom range weekday XPath", compileCustomRule(customRules[3]), "/calendar/year/month[6]/day[@index >= 19 and @index <= 25 and @weekday = 5]");
  assertEqual("Custom fixed-date expectation is recorded", fixedRule.expectations.expected, 1);
  assertEqual("Custom range expectation is recorded", rangeRule.expectations.max, 0);
  assertEqual("Custom expectation mismatch reaches preflight", report.counts.unexpectedMatchRules, 1);
  assertIncludes("Custom fixed-date event", namesOn(project, "2027-08-15"), "Fixed Test Day");
  assertEqual("Custom fixed-date match", fixedRule.matches[0], "2027-08-15");
  assertEqual("Custom fixed-date metadata category", fixedEvent.category, "personal");
  assertEqual("Custom fixed-date metadata source", fixedEvent.source, "rule-builder");
  assertEqual("Custom fixed-date metadata priority", fixedEvent.priority, 9);
  assertEqual("Custom fixed-date metadata class", fixedEvent.className, "family-event");
  assertEqual("Custom fixed-date metadata language", fixedEvent.lang, "en");
  assertEqual("Custom fixed-date metadata flag", fixedEvent.flag, true);
  assertEqual("Custom fixed-date print category", fixedPrintHtml.includes("event-category-personal"), true);
  assertEqual("Custom fixed-date print class", fixedPrintHtml.includes("family-event"), true);
  assertEqual("Custom fixed-date print language", fixedPrintHtml.includes("lang=\"en\""), true);
  assertEqual("Custom moon rule has one match", moonRule.matches.length, 1);
  assertIncludes("Custom Easter offset event", namesOn(project, "2027-03-26"), "Two Days Before Easter");
  assertEqual("Custom Easter offset match", easterRule.matches[0], "2027-03-26");
  assertIncludes("Custom range weekday event", namesOn(project, "2027-06-25"), "Friday In Late June");
  assertEqual("Custom range weekday match", rangeRule.matches[0], "2027-06-25");
  assertEqual("XML fixedDate syntax matches fixed-date", xmlFixedRule.matches[0], fixedRule.matches[0]);
  assertEqual("XML date syntax matches fixed ISO date", xmlIsoRule.matches[0], "2027-08-15");
  assertEqual("XML nthWeekday syntax matches expected Friday", xmlNthRule.matches[0], "2027-06-25");
  assertEqual("XML lastWeekday syntax matches last Friday", xmlLastRule.matches[0], "2027-06-25");
  assertEqual("XML weekdayInRange syntax matches range rule", xmlRangeRule.matches[0], rangeRule.matches[0]);
  assertIncludes("XML fixedDate event appears", namesOn(project, "2027-08-15"), "XML Rule Fixed Day");
  assertIncludes("XML weekdayInRange event appears", namesOn(project, "2027-06-25"), "XML Rule Range Weekday");
  assertEqual("XML rule moon syntax matches custom rule", xmlMoonRule.matches[0], moonRule.matches[0]);
  assertIncludes("XML rule moon event appears", namesOn(project, xmlMoonRule.matches[0]), "XML Rule Moon Day");
  assertEqual("XML rule Easter syntax matches offset", xmlEasterRule.matches[0], "2027-03-26");
  assertIncludes("XML rule Easter event appears", namesOn(project, "2027-03-26"), "XML Rule Easter Day");
  assertEqual("Unsupported XML rule reports an error", unsupportedRule.error.includes("Unsupported rule syntax"), true);
}

async function checkIcsExport() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "sweden");
  const doc = await loadCalendarSource(source.path);
  const eventRoot = doc.querySelector("calendar > event");

  eventRoot.appendChild(eventDay(doc, {
    xpath: "/calendar/year/month[8]/day[21]",
    name: "Comma, Semicolon; Event",
    category: "fixture",
    source: "ics-test"
  }));

  const project = buildCalendarProject(doc, { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 });
  const ics = renderIcsCalendar(project, { name: "Sweden 2027", dtstamp: "20270101T000000Z" });

  assertEqual("ICS export starts with calendar", ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0"), true);
  assertIncludes("ICS export contains calendar name", ics, "X-WR-CALNAME:Sweden 2027");
  assertIncludes("ICS export includes New Year's Day", ics, "SUMMARY:Nyårsdagen");
  assertIncludes("ICS export includes all-day start", ics, "DTSTART;VALUE=DATE:20270101");
  assertIncludes("ICS export includes all-day end", ics, "DTEND;VALUE=DATE:20270102");
  assertIncludes("ICS export escapes commas and semicolons", ics, "SUMMARY:Comma\\, Semicolon\\; Event");
  assertIncludes("ICS export includes categories", ics, "CATEGORIES:fixture");
  assertIncludes("ICS export includes source description", ics, "DESCRIPTION:Source: ics-test");
  assertEqual("ICS export ends with calendar", ics.endsWith("END:VCALENDAR\r\n"), true);
}

async function checkIcsImport() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "sweden");
  const doc = await loadCalendarSource(source.path);
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:one",
    "DTSTART;VALUE=DATE:20270821",
    "SUMMARY:Imported\\, Event",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:two",
    "DTSTART;VALUE=DATE:20270822",
    "DTEND;VALUE=DATE:20270824",
    "SUMMARY:Two day",
    " folded trip",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  const events = parseIcsEvents(ics);
  const customRules = events.map((event, index) => {
    return {
      id: `ics-${index}`,
      name: event.summary,
      type: "fixed-iso-date",
      date: event.date,
      category: "ics",
      source: "fixture.ics",
      expectedMatches: 1
    };
  });
  const project = buildCalendarProject(doc, { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 }, { customRules });
  const wrongYearProject = buildCalendarProject(doc, { year: 2028, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 }, { customRules: [customRules[0]] });
  const importedEvent = renderableDay(project, "2027-08-21").events.find((event) => event.text === "Imported, Event");

  assertEqual("ICS import parses all-day events", events.length, 3);
  assertEqual("ICS import unescapes summary", events[0].summary, "Imported, Event");
  assertEqual("ICS import expands exclusive DTEND", events[2].date, "2027-08-23");
  assertEqual("ICS import unfolds lines", events[1].summary, "Two dayfolded trip");
  assertEqual("ICS exact-date XPath", compileCustomRule(customRules[0]), "/calendar/year[name = '2027']/month[@index = 8]/day[@index = 21]");
  assertIncludes("ICS imported event appears", namesOn(project, "2027-08-21"), "Imported, Event");
  assertIncludes("ICS imported multi-day event appears", namesOn(project, "2027-08-23"), "Two dayfolded trip");
  assertEqual("ICS imported event keeps category", importedEvent.category, "ics");
  assertEqual("ICS imported event keeps source", importedEvent.source, "fixture.ics");
  assertEqual("ICS exact-date rule does not recur in another year", wrongYearProject.eventResults.find((result) => result.ruleId === "ics-0").matches.length, 0);
}

async function checkPrintExport() {
  const project = await projectFor("sweden", 2027, "ISO", 1, 1);
  const layout = {
    unit: "mm",
    paperWidth: 210,
    paperHeight: 297,
    marginTop: 15,
    marginRight: 10,
    marginBottom: 8,
    marginLeft: 10,
    imageRatio: "4/3",
    infoText: "Regression print export",
    style: {
      titleSize: 31,
      weekdaySize: 14
    }
  };
  const html = renderPrintDocument(project, { year: 2027, weekNumbering: "ISO" }, {
    title: "Regression Export",
    sourceLabel: "Sweden",
    monthImages: {
      1: "data:image/png;base64,iVBORw0KGgo="
    },
    monthImageSettings: {
      1: { fit: "contain", positionX: 20, positionY: 80, scale: 135 }
    },
    layout
  });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const preflight = createPreflightReport(project, {
    1: "data:image/png;base64,iVBORw0KGgo="
  }, {
    1: { meta: { width: 400, height: 400 } }
  }, layout);

  assertEqual("Print export has 12 pages", doc.querySelectorAll(".month-page").length, 12);
  assertEqual("Print export title", doc.title, "Regression Export");
  assertEqual("Print export records paper width", doc.body.dataset.paperWidth, "210");
  assertEqual("Print export records paper unit", doc.body.dataset.paperUnit, "mm");
  assertEqual("Print export contains page CSS", html.includes("size: 210mm 297mm"), true);
  assertEqual("Print export contains footer text", html.includes("Regression print export"), true);
  assertEqual("Print export includes month title by default", doc.querySelector(".month-title h2")?.textContent, "Januari");
  assertEqual("Print export contains event text", normalizeName(html).includes("Nyårsdagen"), true);
  assertEqual("Print export preserves source soft hyphen", html.includes("Nyårs\u00addagen"), true);
  assertEqual("Print export applies title size", html.includes("--calendar-title-size: 31px"), true);
  assertEqual("Print export applies weekday size", html.includes("--calendar-weekday-size: 14px"), true);
  assertEqual("Print export applies image fit", html.includes("object-fit: contain"), true);
  assertEqual("Print export applies image position", html.includes("object-position: 20% 80%"), true);
  assertEqual("Print export applies image scale", html.includes("transform: scale(1.35)"), true);
  assertEqual("Print export applies image transform origin", html.includes("transform-origin: 20% 80%"), true);
  assertEqual("Preflight reports image aspect mismatch", preflight.counts.imageAspectWarnings, 1);
  assertEqual("Preflight reports low image resolution", preflight.counts.lowResolutionImages, 1);

  const hiddenTitleHtml = renderPrintDocument(project, { year: 2027, weekNumbering: "ISO" }, {
    title: "No Month Title Export",
    sourceLabel: "Sweden",
    monthImages: {},
    layout: {
      ...layout,
      showMonthTitle: false
    }
  });
  const hiddenTitleDoc = new DOMParser().parseFromString(hiddenTitleHtml, "text/html");

  assertEqual("Print export can hide month title heading", hiddenTitleDoc.querySelector(".month-title h2"), null);
  assertEqual("Print export marks hidden month title header", hiddenTitleDoc.querySelectorAll(".month-title-hidden").length, 12);
  assertEqual("Print export keeps hidden-title page label", hiddenTitleDoc.querySelector(".month-page")?.getAttribute("aria-label"), "Januari 2027");

  const galleryLayout = applyLayoutTemplate(layout, "gallery");
  const galleryHtml = renderPrintDocument(project, { year: 2027, weekNumbering: "ISO" }, {
    title: "Gallery Export",
    sourceLabel: "Sweden",
    monthImages: {},
    layout: galleryLayout
  });

  assertEqual("Print export applies template class", galleryHtml.includes("template-gallery"), true);
  assertEqual("Print export applies template accent", galleryHtml.includes("--calendar-accent: #8f3d49"), true);
  assertEqual("Resolved compact template keeps id", resolveLayout({ templateId: "compact" }).templateId, "compact");
  assertEqual("Resolved layout shows month title by default", resolveLayout({}).showMonthTitle, true);
  assertEqual("Resolved layout can hide month title", resolveLayout({ showMonthTitle: false }).showMonthTitle, false);
  assertEqual("Resolved layout has weekday size", resolveLayout({ style: { weekdaySize: 15 } }).style.weekdaySize, 15);
}

async function checkDomOverflowPreflight() {
  const container = document.createElement("div");

  container.style.cssText = "position:absolute;left:-10000px;top:0;width:160px;background:white;";
  container.innerHTML = `
    <article class="month-page" aria-label="Overflow Month 2027">
      <button class="day-cell" type="button" data-date="2027-08-21" style="width:42px;height:30px;overflow:hidden;display:block;">
        <span class="day-names" style="display:block;width:40px;height:12px;overflow:hidden;white-space:nowrap;">
          VeryLongUnbreakableCalendarEventNameThatCannotFit
        </span>
      </button>
    </article>
  `;
  document.body.appendChild(container);

  const overflows = measureTextOverflow(container);
  const merged = mergeOverflowPreflight({
    ok: true,
    issues: [],
    counts: {
      pages: 1,
      dayCells: 1,
      eventRules: 0,
      matchedRules: 0,
      unmatchedRules: 0,
      selectorErrors: 0,
      missingImages: 0,
      imageAspectWarnings: 0,
      lowResolutionImages: 0
    }
  }, overflows);

  container.remove();

  assertEqual("DOM preflight detects text overflow", overflows.length, 1);
  assertEqual("DOM preflight reports overflow date", overflows[0].context, "2027-08-21");
  assertEqual("Merged preflight counts text overflows", merged.counts.textOverflows, 1);
  assertEqual("Merged preflight adds overflow warning", merged.issues[0].title.includes("may overflow in print"), true);
}

async function checkProjectBundle() {
  const source = CALENDAR_SOURCES.find((item) => item.id === "sweden");
  const doc = await loadCalendarSource(source.path);
  const project = buildCalendarProject(doc, { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 });
  const monthImages = {
    1: "data:image/png;base64,iVBORw0KGgo="
  };
  const imageEntries = imageEntriesFromMonthImages(monthImages);
  const pdfBytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  const bundleProject = {
    version: 2,
    sourceLabel: "Sweden",
    settings: { year: 2027, weekNumbering: "ISO", startingWeekday: 1, gmt: 1 },
    layout: {
      unit: "mm",
      paperWidth: 210,
      paperHeight: 297,
      marginTop: 15,
      marginRight: 10,
      marginBottom: 8,
      marginLeft: 10,
      imageRatio: "4/3",
      infoText: "Bundle test"
    },
    customRules: [],
    customFacts: [
      { id: "trip", month: 8, day: 21, fact: "familyTrip", value: "true", anchor: "tripStart" }
    ],
    monthImageSettings: {
      1: { fit: "contain", positionX: 20, positionY: 80, scale: 140, meta: { width: 1200, height: 900 } }
    },
    monthImageRefs: projectImageRefs(imageEntries),
    generatedPdf: {
      name: "sweden-2027.pdf",
      path: "generated/calendar.pdf",
      size: pdfBytes.length
    }
  };
  const zipBlob = await createProjectBundle({
    project: bundleProject,
    sourceXml: new XMLSerializer().serializeToString(doc),
    factsXml: new XMLSerializer().serializeToString(project.factsDoc),
    printHtml: renderPrintDocument(project, { year: 2027, weekNumbering: "ISO" }, {
      title: "Bundle Print",
      sourceLabel: "Sweden",
      monthImages,
      monthImageSettings: bundleProject.monthImageSettings,
      layout: bundleProject.layout
    }),
    pdfCommands: [
      "# Physicalendar deterministic PDF export",
      "npm run pdf -- --input generated/print.html --output artifacts/sweden-2027.pdf",
      "npm run verify:pdf -- --input artifacts/sweden-2027.pdf --pages 12 --width 210 --height 297 --unit mm",
      ""
    ].join("\n"),
    pdf: {
      path: "generated/calendar.pdf",
      bytes: pdfBytes
    },
    images: imageEntries
  });
  const bundle = await readProjectBundle(zipBlob);

  assertEqual("Bundle MIME type", zipBlob.type, "application/zip");
  assertEqual("Bundle restores manifest format", bundle.manifest.format, "physicalendar-project-bundle");
  assertEqual("Bundle manifest records source label", bundle.manifest.sourceLabel, "Sweden");
  assertEqual("Bundle manifest records year", bundle.manifest.year, 2027);
  assertEqual("Bundle manifest records image count", bundle.manifest.imageCount, 1);
  assertEqual("Bundle manifest lists itself", bundle.manifest.entries.includes("manifest.json"), true);
  assertEqual("Bundle manifest lists print HTML", bundle.manifest.entries.includes("generated/print.html"), true);
  assertEqual("Bundle manifest lists PDF commands", bundle.manifest.entries.includes("generated/pdf-commands.txt"), true);
  assertEqual("Bundle manifest lists PDF artifact", bundle.manifest.entries.includes("generated/calendar.pdf"), true);
  assertEqual("Bundle manifest marks generated facts", bundle.manifest.generated.yearFactsXml, true);
  assertEqual("Bundle manifest marks PDF commands", bundle.manifest.generated.pdfCommands, true);
  assertEqual("Bundle manifest marks PDF artifact", bundle.manifest.generated.pdf, true);
  assertEqual("Bundle preserves source label", bundle.project.sourceLabel, "Sweden");
  assertEqual("Bundle restores source XML", bundle.sourceXml.includes("<calendar"), true);
  assertEqual("Bundle restores facts XML", bundle.factsXml.includes("2027-01-01"), true);
  assertEqual("Bundle restores print HTML", bundle.printHtml.includes("<title>Bundle Print</title>"), true);
  assertEqual("Bundle restores PDF command artifact", bundle.pdfCommands.includes("npm run pdf -- --input generated/print.html"), true);
  assertEqual("Bundle restores PDF verify artifact", bundle.pdfCommands.includes("npm run verify:pdf -- --input artifacts/sweden-2027.pdf --pages 12"), true);
  assertEqual("Bundle restores PDF artifact path", bundle.pdf.path, "generated/calendar.pdf");
  assertEqual("Bundle restores PDF artifact size", bundle.pdf.size, pdfBytes.length);
  assertEqual("Bundle restores PDF artifact data URL", bundle.pdf.dataUrl.startsWith("data:application/pdf;base64,"), true);
  assertEqual("Bundle preserves PDF metadata", bundle.project.generatedPdf.name, "sweden-2027.pdf");
  assertEqual("Bundle print HTML contains page markup", bundle.printHtml.includes("month-page"), true);
  assertEqual("Bundle restores image", bundle.monthImages[1].startsWith("data:image/png;base64,"), true);
  assertEqual("Bundle preserves image fit", bundle.project.monthImageSettings[1].fit, "contain");
  assertEqual("Bundle preserves image scale", bundle.project.monthImageSettings[1].scale, 140);
  assertEqual("Bundle preserves image metadata", bundle.project.monthImageSettings[1].meta.width, 1200);
  assertEqual("Bundle preserves custom facts", bundle.project.customFacts[0].fact, "familyTrip");
}

async function checkPdfExportCommands() {
  const commands = pdfExportCommands({
    year: 2027,
    label: "Sweden",
    timeZone: "Europe/Stockholm",
    layout: {
      unit: "mm",
      paperWidth: 210,
      paperHeight: 297
    }
  });
  const quoted = pdfExportCommands({
    year: 2027,
    label: "My Calendar",
    layout: {
      unit: "in",
      paperWidth: 8.5,
      paperHeight: 11
    }
  });

  assertEqual("PDF command print HTML filename", commands.printHtmlFile, "sweden-2027-print.html");
  assertEqual("PDF command output filename", commands.pdfFile, "artifacts/sweden-2027.pdf");
  assertEqual("PDF command uses print HTML input", commands.pdfCommand, "npm run pdf -- --input sweden-2027-print.html --output artifacts/sweden-2027.pdf");
  assertEqual("PDF verify command uses A4 settings", commands.verifyCommand, "npm run verify:pdf -- --input artifacts/sweden-2027.pdf --pages 12 --width 210 --height 297 --unit mm");
  assertEqual("PDF command sanitizes labels", quoted.printHtmlFile, "my-calendar-2027-print.html");
  assertEqual("PDF verify command preserves non-mm unit", quoted.verifyCommand.includes("--width 8.5 --height 11 --unit in"), true);

  const summary = exportPanelSummary({
    year: 2027,
    label: "Sweden",
    layout: {
      unit: "mm",
      paperWidth: 210,
      paperHeight: 297,
      marginTop: 15,
      marginRight: 10,
      marginBottom: 8,
      marginLeft: 10,
      imageRatio: "4/3"
    },
    report: {
      ok: true,
      issues: [{ level: "warning" }, { level: "info" }],
      counts: { pages: 12 }
    },
    commands
  });
  const summaryByLabel = Object.fromEntries(summary.map((row) => [row.label, row.value]));

  assertEqual("Export summary shows status", summaryByLabel.Status, "Ready");
  assertEqual("Export summary shows pages", summaryByLabel.Pages, "12");
  assertEqual("Export summary shows paper", summaryByLabel.Paper, "210 x 297 mm");
  assertEqual("Export summary shows margins", summaryByLabel.Margins, "15 / 10 / 8 / 10 mm");
  assertEqual("Export summary shows time zone", summaryByLabel["Time zone"], "Europe/Stockholm");
  assertEqual("Export summary shows preflight issue count", summaryByLabel.Preflight, "2 issues");
}

async function projectFor(sourceId, year, weekNumbering, startingWeekday, gmt) {
  const source = CALENDAR_SOURCES.find((item) => item.id === sourceId);

  if (!source) {
    throw new Error(`Unknown source ${sourceId}`);
  }

  const doc = await loadCalendarSource(source.path);
  return buildCalendarProject(doc, { year, weekNumbering, startingWeekday, gmt });
}

function generatedDayCount(project) {
  return project.factsDoc.querySelectorAll("calendar > year > month > day").length;
}

function xmlChecksum(value) {
  let checksum = 0;

  for (let index = 0; index < value.length; index += 1) {
    checksum = ((checksum * 31) + value.charCodeAt(index)) >>> 0;
  }

  return checksum.toString(16).padStart(8, "0");
}

function namesOn(project, date) {
  const day = Array.from(project.factsDoc.querySelectorAll(`day[date="${date}"] name`))
    .map((node) => normalizeName(node.textContent));
  return day;
}

function dayNode(project, date) {
  return project.factsDoc.querySelector(`day[date="${date}"]`);
}

function renderableDay(project, date) {
  return project.pages
    .flatMap((page) => page.weeks)
    .flatMap((week) => week.days)
    .find((day) => day.date === date && !day.isOutsideMonth);
}

function eventDay(doc, options) {
  const day = doc.createElement("day");
  const name = doc.createElement("name");

  if (options.xpath) {
    day.setAttribute("xpath", options.xpath);
  }

  if (options.rule) {
    day.setAttribute("rule", options.rule);
  }

  for (const [key, value] of Object.entries({
    holiday: options.holiday,
    flag: options.flag,
    category: options.category,
    source: options.source,
    priority: options.priority,
    class: options.className,
    lang: options.lang,
    expectedMatches: options.expectedMatches,
    minMatches: options.minMatches,
    maxMatches: options.maxMatches
  })) {
    if (value) {
      day.setAttribute(key, value);
    }
  }

  name.textContent = options.name;
  day.appendChild(name);
  return day;
}

function assertEqual(name, actual, expected) {
  checks.push({
    name,
    pass: Object.is(actual, expected),
    detail: `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
  });
}

function assertIncludes(name, actual, expected) {
  checks.push({
    name,
    pass: actual.includes(expected),
    detail: `expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`
  });
}

function assertThrows(name, action, expectedMessage) {
  try {
    action();
    checks.push({
      name,
      pass: false,
      detail: `expected an error containing ${JSON.stringify(expectedMessage)}`
    });
  } catch (error) {
    checks.push({
      name,
      pass: String(error.message || error).includes(expectedMessage),
      detail: `expected error containing ${JSON.stringify(expectedMessage)}, received ${JSON.stringify(error.message || String(error))}`
    });
  }
}

function renderResults() {
  const passed = checks.filter((check) => check.pass).length;
  const failed = checks.length - passed;

  document.title = failed === 0 ? "Physicalendar Tests Passed" : "Physicalendar Tests Failed";
  results.innerHTML = `
    <div class="test-summary ${failed === 0 ? "pass" : "fail"}">
      <strong>${passed}/${checks.length} checks passed</strong>
      <span>${failed === 0 ? "All regression checks are green." : `${failed} checks need attention.`}</span>
    </div>
    ${checks.map((check) => `
      <div class="test-case ${check.pass ? "pass" : "fail"}">
        <strong>${escapeHtml(check.name)}</strong>
        <span>${escapeHtml(check.pass ? "ok" : check.detail)}</span>
      </div>
    `).join("")}
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeName(value) {
  return String(value || "").replace(/\u00ad/g, "");
}
