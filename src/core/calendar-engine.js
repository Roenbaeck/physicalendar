const XML_TYPE = "application/xml";
const DEG = Math.PI / 180;

export const CALENDAR_SOURCES = [
  { id: "sweden", label: "Sweden", path: "./src/data/calendars/sweden.xml", locale: "sv-SE" },
  { id: "norway", label: "Norway", path: "./src/data/calendars/norway.xml", locale: "nb-NO" },
  { id: "denmark", label: "Denmark", path: "./src/data/calendars/denmark.xml", locale: "da-DK" },
  { id: "finland", label: "Finland", path: "./src/data/calendars/finland.xml", locale: "fi-FI" },
  { id: "united-states", label: "United States", path: "./src/data/calendars/united-states.xml", locale: "en-US" },
  { id: "empty", label: "Empty", path: "./src/data/calendars/empty.xml", locale: "en-US" }
];

export const BUILT_IN_CALCULATIONS = [
  {
    id: "gregorian-year",
    label: "Gregorian year facts",
    run: gregorianYearCalculation
  },
  {
    id: "week-numbers",
    label: "ISO and US week numbers",
    run: weekNumberCalculation
  },
  {
    id: "easter",
    label: "Easter date",
    run: easterCalculation
  },
  {
    id: "moon-phases",
    label: "Moon phase transitions",
    run: moonPhaseCalculation
  },
  {
    id: "seasonal-sun",
    label: "Equinoxes and solstices",
    run: seasonalSunCalculation
  }
];

export function parseCalendarXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, XML_TYPE);
  const parserError = doc.querySelector("parsererror");

  if (parserError) {
    throw new Error(parserError.textContent.trim());
  }

  return doc;
}

export function readCalendarSourceModel(sourceDoc) {
  if (!sourceDoc?.documentElement) {
    throw new Error("Calendar source XML must be a parsed XML document.");
  }

  const root = sourceDoc.documentElement;

  if (!root || root.localName !== "calendar") {
    throw new Error("Calendar source XML must have a <calendar> root element.");
  }

  const yearNode = root.querySelector(":scope > year");

  if (!yearNode) {
    throw new Error("Calendar source XML is missing <year>.");
  }

  const locale = root.getAttribute("locale") || "";
  const months = readSourceMonths(yearNode);
  const weekdays = readSourceWeekdays(root);
  const eventRoot = root.querySelector(":scope > event");
  const eventDays = eventRoot ? Array.from(eventRoot.querySelectorAll(":scope > day")) : [];
  const eventRules = readSourceEventRules(eventRoot);

  return {
    id: root.getAttribute("id") || "",
    locale,
    doc: sourceDoc,
    root,
    yearNode,
    months,
    weekdays,
    eventRoot,
    eventDays,
    eventRules
  };
}

export async function loadCalendarSource(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status}`);
  }

  return parseCalendarXml(await response.text());
}

export function buildCalendarProject(sourceDoc, settings, options = {}) {
  const sourceModel = readCalendarSourceModel(sourceDoc);
  const factsDoc = generateYearDocument(sourceModel, settings, options);
  const eventResults = applyEventSelectors(sourceModel, factsDoc, options.customRules || []);
  const pages = buildRenderablePages(factsDoc, settings);
  const calculations = readCalculationMetadata(factsDoc);
  return { sourceDoc, sourceModel, factsDoc, eventResults, pages, calculations };
}

export function generateYearDocument(source, settings, options = {}) {
  const sourceModel = ensureCalendarSourceModel(source);
  const year = Number(settings.year);
  const startDay = Number(settings.startingWeekday || 1);
  const weekNumbering = settings.weekNumbering || "ISO";
  const gmt = Number(settings.gmt || 0);
  const locale = normalizeLocale(settings.locale || sourceModel.locale);
  const out = document.implementation.createDocument("", "calendar");
  const calendar = out.documentElement;
  const yearNode = out.createElement("year");
  const calculations = [...BUILT_IN_CALCULATIONS, ...(options.calculations || [])];
  const calculationResults = runCalculations(calculations, { sourceDoc: sourceModel.doc, sourceModel, settings, year, gmt });
  const calculationMeta = out.createElement("calculations");
  const leap = Boolean(factFor(calculationResults, isoDate(year, 1, 1), "isLeapYear"));

  yearNode.setAttribute("leap", leap ? "1" : "0");
  appendTextElement(out, yearNode, "name", String(year));
  calendar.appendChild(calculationMeta);
  calendar.appendChild(yearNode);

  let dayOfYear = 0;

  for (const calculation of calculationResults.meta) {
    const node = out.createElement("calculation");
    node.setAttribute("id", calculation.id);
    node.setAttribute("label", calculation.label);
    node.setAttribute("dates", String(calculation.dateCount));
    node.setAttribute("facts", String(calculation.factCount));
    node.setAttribute("anchors", String(calculation.anchorCount));

    for (const anchor of calculation.anchors) {
      const anchorNode = out.createElement("anchor");
      anchorNode.setAttribute("id", anchor.id);
      anchorNode.setAttribute("date", anchor.date);
      node.appendChild(anchorNode);
    }

    calculationMeta.appendChild(node);
  }

  for (const [id, date] of Object.entries(calculationResults.anchors)) {
    const node = out.createElement("anchor");
    node.setAttribute("id", id);
    node.setAttribute("date", date);
    calculationMeta.appendChild(node);
  }

  for (const sourceMonth of sourceModel.months) {
    const month = sourceMonth.index;
    const monthNode = out.createElement("month");
    const monthName = sourceMonth.name || monthNameFallback(month, locale);
    const firstWeekday = weekdayIso(year, month, 1);

    copyAttributes(sourceMonth.node, monthNode);
    monthNode.setAttribute("startingWeekday", String(displayWeekday(firstWeekday, startDay)));
    appendTextElement(out, monthNode, "name", monthName);
    yearNode.appendChild(monthNode);

    for (const sourceDay of sourceMonth.days) {
      if (sourceDay.leap && sourceDay.leap !== (leap ? "1" : "0")) {
        continue;
      }

      const index = sourceDay.index;
      dayOfYear += 1;

      const date = new Date(Date.UTC(year, month - 1, index));
      const dateIso = isoDate(year, month, index);
      const iso = weekdayIso(year, month, index);
      const dayFacts = calculationResults.factsByDate[dateIso] || {};
      const weekIso = Number(dayFacts.weekIso || isoWeekNumber(date));
      const weekUs = Number(dayFacts.weekUs || usWeekNumber(date));
      const selectedWeek = weekNumbering === "US" ? weekUs : weekIso;
      const dayNode = out.createElement("day");
      const weekdayMeta = sourceModel.weekdays.get(iso);

      dayNode.setAttribute("month", String(month));
      dayNode.setAttribute("index", String(index));
      dayNode.setAttribute("day", String(dayOfYear));
      dayNode.setAttribute("year", String(year));
      dayNode.setAttribute("dayOfYear", String(dayOfYear));
      dayNode.setAttribute("date", dateIso);
      dayNode.setAttribute("weekday", String(iso));
      dayNode.setAttribute("weekdayIso", String(iso));
      dayNode.setAttribute("weekdayDisplay", String(displayWeekday(iso, startDay)));
      dayNode.setAttribute("weekdayName", weekdayMeta?.name || weekdayNameFallback(iso, locale));
      dayNode.setAttribute("week", String(selectedWeek));
      dayNode.setAttribute("weekIso", String(weekIso));
      dayNode.setAttribute("weekUs", String(weekUs));
      dayNode.setAttribute("isLeapYear", leap ? "true" : "false");
      dayNode.setAttribute("isWeekend", iso >= 6 ? "true" : "false");
      applyFacts(dayNode, dayFacts);

      if (weekdayMeta?.holiday) {
        dayNode.setAttribute("holiday", "true");
      }

      copyAttributes(sourceDay.node, dayNode);

      for (const sourceName of sourceDay.names) {
        const generatedName = out.createElement("name");

        if (dayNode.getAttribute("holiday") === "true") {
          generatedName.setAttribute("holidayName", "true");
        }

        copyAttributes(sourceName.node, generatedName);
        generatedName.textContent = sourceName.text;
        dayNode.appendChild(generatedName);
      }

      monthNode.appendChild(dayNode);
    }
  }

  return out;
}

export function applyEventSelectors(source, factsDoc, customRules = []) {
  const sourceModel = ensureCalendarSourceModel(source);
  const sourceRuleCount = sourceModel.eventRules?.length || 0;
  const results = [];
  const eventRules = [
    ...(sourceModel.eventRules || sourceModel.eventDays.map((node, index) => eventRuleFromEventDay(node, index))),
    ...customRules.map((rule, index) => {
      return eventRuleFromEventDay(customRuleToEventDay(factsDoc, rule), sourceRuleCount + index, "custom");
    })
  ];

  for (const [eventIndex, eventRule] of eventRules.entries()) {
    const eventDay = eventRule.node;
    const { xpath, error: ruleError } = resolveEventXPath(eventDay);
    const result = {
      xpath,
      name: eventRule.name,
      source: eventRule.source,
      ruleId: eventRule.ruleId,
      expectations: eventRule.expectations,
      sourceIndex: eventRule.index,
      selectedNodes: 0,
      invalidTargets: [],
      matches: [],
      error: null
    };

    if (ruleError) {
      result.error = ruleError;
      results.push(result);
      continue;
    }

    if (!xpath) {
      result.error = "Missing xpath";
      results.push(result);
      continue;
    }

    try {
      const snapshot = factsDoc.evaluate(xpath, factsDoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

      for (let index = 0; index < snapshot.snapshotLength; index += 1) {
        const target = snapshot.snapshotItem(index);

        result.selectedNodes += 1;

        if (!target || target.nodeType !== Node.ELEMENT_NODE || target.localName !== "day") {
          result.invalidTargets.push(describeXPathTarget(target));
          continue;
        }

        copyEventAttributes(eventDay, target);
        prependEventNames(factsDoc, target, eventDay, eventIndex);
        result.matches.push(target.getAttribute("date"));
      }
    } catch (error) {
      result.error = error.message;
    }

    results.push(result);
  }

  return results;
}

function resolveEventXPath(eventDay) {
  const xpath = eventDay.getAttribute("xpath");

  if (xpath) {
    return { xpath, error: null };
  }

  const rule = eventDay.getAttribute("rule");

  if (!rule) {
    return { xpath: "", error: null };
  }

  try {
    return { xpath: compileXmlRule(rule), error: null };
  } catch (error) {
    return { xpath: "", error: error.message };
  }
}

export function buildRenderablePages(factsDoc, settings) {
  const months = Array.from(factsDoc.querySelectorAll("calendar > year > month"));
  const year = Number(settings.year);
  const locale = normalizeLocale(settings.locale);
  const pages = [];

  for (const monthNode of months) {
    const month = numberAttr(monthNode, "index");
    const days = Array.from(monthNode.querySelectorAll(":scope > day")).map(readDayNode);
    const first = days[0];
    const last = days[days.length - 1];
    const cells = [];

    if (!first || !last) {
      continue;
    }

    for (let count = first.weekdayDisplay - 1; count > 0; count -= 1) {
      cells.push(outsideDay(year, month, 1 - count, settings));
    }

    cells.push(...days);

    for (let next = 1; cells.length % 7 !== 0; next += 1) {
      cells.push(outsideDay(year, month, days.length + next, settings));
    }

    const weeks = [];
    for (let index = 0; index < cells.length; index += 7) {
      const weekDays = cells.slice(index, index + 7);
      const currentDay = weekDays.find((day) => !day.isOutsideMonth) || weekDays[0];
      weeks.push({ weekNumber: currentDay.weekNumber, days: weekDays });
    }

    pages.push({
      month,
      name: monthNode.querySelector(":scope > name")?.textContent || monthNameFallback(month, locale),
      year,
      weekdayLabels: weekdayLabels(settings.startingWeekday || 1, days, locale),
      weeks
    });
  }

  return pages;
}

export function serializeXml(doc) {
  return new XMLSerializer().serializeToString(doc);
}

export function readCalculationMetadata(factsDoc) {
  return Array.from(factsDoc.querySelectorAll("calendar > calculations > calculation")).map((node) => ({
    id: node.getAttribute("id") || "",
    label: node.getAttribute("label") || "",
    dateCount: Number(node.getAttribute("dates") || 0),
    factCount: Number(node.getAttribute("facts") || 0),
    anchorCount: Number(node.getAttribute("anchors") || 0),
    anchors: Array.from(node.children)
      .filter((child) => child.localName === "anchor")
      .map((child) => ({
        id: child.getAttribute("id") || "",
        date: child.getAttribute("date") || ""
      }))
  }));
}

export function customFactsCalculation(entries = []) {
  return {
    id: "custom-facts",
    label: "Custom generated facts",
    run(input) {
      const factsByDate = {};
      const anchors = {};
      const year = Number(input.year);

      for (const entry of entries) {
        const factName = String(entry.fact || "").trim();
        const anchor = String(entry.anchor || "").trim();
        const date = customFactDate(entry, input, anchors);

        if (!date) {
          continue;
        }

        if (factName) {
          assertXmlAttributeName(factName, "custom fact");
          factsByDate[date] = {
            ...(factsByDate[date] || {}),
            [factName]: parseCustomFactValue(entry.value)
          };
        }

        if (anchor) {
          assertXmlAttributeName(anchor, "custom anchor");
          anchors[anchor] = date;
        }
      }

      return { factsByDate, anchors };
    }
  };
}

function runCalculations(calculations, input) {
  const factsByDate = {};
  const anchors = {};
  const meta = [];

  for (const calculation of calculations) {
    const result = calculation.run({ ...input, factsByDate, anchors }) || {};
    const resultFacts = result.factsByDate || {};
    const resultAnchors = result.anchors || {};

    mergeFacts(factsByDate, resultFacts);
    Object.assign(anchors, resultAnchors);
    meta.push({
      id: calculation.id,
      label: calculation.label,
      dateCount: Object.keys(resultFacts).length,
      factCount: countFacts(resultFacts),
      anchorCount: Object.keys(resultAnchors).length,
      anchors: Object.entries(resultAnchors)
        .map(([id, date]) => ({ id, date }))
        .sort((left, right) => left.id.localeCompare(right.id))
    });
  }

  return { factsByDate, anchors, meta };
}

function countFacts(factsByDate) {
  return Object.values(factsByDate || {}).reduce((total, facts) => {
    return total + Object.keys(facts || {}).length;
  }, 0);
}

function customFactDate(entry, input, localAnchors) {
  const type = entry.type || "fixed-date";
  const year = Number(input.year);

  if (type === "fixed-date") {
    return isoDate(year, positiveInt(entry.month, 1), positiveInt(entry.day, 1));
  }

  if (type === "nth-weekday") {
    const days = sourceDateEntries(input.sourceModel || input.sourceDoc, year)
      .filter((day) => day.month === positiveInt(entry.month, 1) && day.weekdayIso === positiveInt(entry.weekday, 1));
    return days[positiveInt(entry.nth, 1) - 1]?.dateIso || "";
  }

  if (type === "last-weekday") {
    const days = sourceDateEntries(input.sourceModel || input.sourceDoc, year)
      .filter((day) => day.month === positiveInt(entry.month, 1) && day.weekdayIso === positiveInt(entry.weekday, 1));
    return days[days.length - 1]?.dateIso || "";
  }

  if (type === "easter-offset") {
    return offsetFactDate(findFactDate(input.factsByDate, "easter", "true"), integer(entry.offset, 0));
  }

  if (type === "sun-event-offset") {
    return offsetFactDate(findFactDate(input.factsByDate, "sunEvent", safeToken(entry.event, "summerSolstice")), integer(entry.offset, 0));
  }

  if (type === "moon-phase-offset") {
    const month = positiveInt(entry.month, 1);
    const date = Object.entries(input.factsByDate || {})
      .filter(([dateIso, facts]) => Number(dateIso.slice(5, 7)) === month && facts.moonPhaseEvent === safeToken(entry.phase, "full"))
      .map(([dateIso]) => dateIso)
      .sort()[0] || "";
    return offsetFactDate(date, integer(entry.offset, 0));
  }

  if (type === "anchor-offset") {
    const lookupAnchors = { ...(input.anchors || {}), ...(localAnchors || {}) };
    return offsetFactDate(lookupAnchors[safeAnchorId(entry.baseAnchor)], integer(entry.offset, 0));
  }

  return "";
}

function findFactDate(factsByDate, factName, expectedValue) {
  return Object.entries(factsByDate || {})
    .filter(([, facts]) => String(facts[factName]) === expectedValue)
    .map(([dateIso]) => dateIso)
    .sort()[0] || "";
}

function offsetFactDate(dateIso, offset) {
  if (!dateIso) {
    return "";
  }

  return addDaysIso(dateIso, offset);
}

function mergeFacts(target, source) {
  for (const [date, facts] of Object.entries(source)) {
    target[date] = {
      ...(target[date] || {}),
      ...facts
    };
  }
}

function applyFacts(node, facts) {
  for (const [name, value] of Object.entries(facts || {})) {
    if (value === null || value === undefined || value === false) {
      continue;
    }

    node.setAttribute(name, value === true ? "true" : String(value));
  }
}

function factFor(calculationResults, date, factName) {
  return calculationResults.factsByDate[date]?.[factName];
}

function gregorianYearCalculation({ sourceDoc, year, settings }) {
  const factsByDate = {};
  const leap = isLeapYear(year);
  let dayOfYear = 0;

  for (const item of sourceDateEntries(sourceDoc, year)) {
    dayOfYear += 1;
    factsByDate[item.dateIso] = {
      year,
      month: item.month,
      index: item.day,
      dayOfYear,
      isLeapYear: leap,
      weekdayIso: item.weekdayIso,
      weekdayDisplay: displayWeekday(item.weekdayIso, Number(settings.startingWeekday || 1))
    };
  }

  return { factsByDate };
}

function weekNumberCalculation({ sourceDoc, year }) {
  const factsByDate = {};

  for (const item of sourceDateEntries(sourceDoc, year)) {
    const date = new Date(Date.UTC(year, item.month - 1, item.day));
    factsByDate[item.dateIso] = {
      weekIso: isoWeekNumber(date),
      weekUs: usWeekNumber(date)
    };
  }

  return { factsByDate };
}

function easterCalculation({ year }) {
  const [month, day] = easter(year).split("-").map(Number);
  const dateIso = isoDate(year, month, day);

  return {
    factsByDate: {
      [dateIso]: {
        easter: true
      }
    },
    anchors: {
      easter: dateIso
    }
  };
}

function moonPhaseCalculation(input) {
  const { sourceDoc, year, gmt } = input;
  const factsByDate = {};
  const timeZone = normalizedTimeZone(input.settings?.timeZone);

  for (const item of sourceDateEntries(sourceDoc, year)) {
    const anteGmt = resolveGmtOffset(input, item.month, item.day, 0, 0, 0);
    const noonGmt = resolveGmtOffset(input, item.month, item.day, 12, 0, 0);
    const postGmt = resolveGmtOffset(input, item.month, item.day, 23, 59, 59);
    const anteMoonPhase = Math.floor(moonAngle(year, item.month, item.day, 0, 0, 0, anteGmt) / 90) % 4;
    const postMoonPhase = Math.floor(moonAngle(year, item.month, item.day, 23, 59, 59, postGmt) / 90) % 4;
    const facts = {
      moonAngle: moonAngle(year, item.month, item.day, 12, 0, 0, noonGmt).toFixed(4),
      moonPhaseQuarter: postMoonPhase
    };

    if (timeZone) {
      facts.gmtOffset = formatOffsetHours(noonGmt);
      facts.timeZone = timeZone;
    }

    if (anteMoonPhase !== postMoonPhase) {
      facts.moonPhase = postMoonPhase;
      facts.moonPhaseEvent = moonPhaseName(postMoonPhase);
    }

    factsByDate[item.dateIso] = facts;
  }

  return { factsByDate };
}

function seasonalSunCalculation({ year }) {
  const factsByDate = {};
  const events = seasonalSunEvents(year);

  for (const [dateKey, sunPhase] of events) {
    const [month, day] = dateKey.split("-").map(Number);
    factsByDate[isoDate(year, month, day)] = {
      sunPhase: sunPhase.index,
      sunEvent: sunPhase.name
    };
  }

  return { factsByDate };
}

function sourceDateEntries(source, year) {
  const sourceModel = ensureCalendarSourceModel(source);
  const leap = isLeapYear(year);
  const entries = [];

  for (const sourceMonth of sourceModel.months) {
    const month = sourceMonth.index;

    for (const sourceDay of sourceMonth.days) {
      if (sourceDay.leap && sourceDay.leap !== (leap ? "1" : "0")) {
        continue;
      }

      const day = sourceDay.index;
      entries.push({
        month,
        day,
        dateIso: isoDate(year, month, day),
        weekdayIso: weekdayIso(year, month, day)
      });
    }
  }

  return entries;
}

export function compileCustomRule(rule) {
  const type = rule.type || "fixed-date";

  if (type === "fixed-date") {
    return `/calendar/year/month[${positiveInt(rule.month, 1)}]/day[${positiveInt(rule.day, 1)}]`;
  }

  if (type === "fixed-iso-date") {
    const { year, month, day } = safeIsoDateParts(rule.date);
    return `/calendar/year[name = '${year}']/month[@index = ${month}]/day[@index = ${day}]`;
  }

  if (type === "nth-weekday") {
    return `/calendar/year/month[${positiveInt(rule.month, 1)}]/day[@weekday = ${positiveInt(rule.weekday, 1)}][${positiveInt(rule.nth, 1)}]`;
  }

  if (type === "last-weekday") {
    return `/calendar/year/month[${positiveInt(rule.month, 1)}]/day[@weekday = ${positiveInt(rule.weekday, 1)}][position() = last()]`;
  }

  if (type === "range-weekday") {
    const month = positiveInt(rule.month, 1);
    const startDay = positiveInt(rule.day, 1);
    const endDay = positiveInt(rule.endDay, startDay);
    const weekday = positiveInt(rule.weekday, 1);
    return `/calendar/year/month[${month}]/day[@index >= ${startDay} and @index <= ${endDay} and @weekday = ${weekday}]`;
  }

  if (type === "easter-offset") {
    return offsetXPath("/calendar/year/month/day[@easter = 'true']", integer(rule.offset, 0));
  }

  if (type === "sun-event-offset") {
    const event = safeToken(rule.event, "summerSolstice");
    return offsetXPath(`/calendar/year/month/day[@sunEvent = '${event}']`, integer(rule.offset, 0));
  }

  if (type === "moon-phase-offset") {
    const phase = safeToken(rule.phase, "full");
    const month = positiveInt(rule.month, 1);
    return offsetXPath(`(/calendar/year/month[@index = ${month}]/day[@moonPhaseEvent = '${phase}'])[1]`, integer(rule.offset, 0));
  }

  if (type === "anchor-offset") {
    const anchor = safeAnchorId(rule.anchor);
    return offsetXPath(anchorXPath(anchor), integer(rule.offset, 0));
  }

  throw new Error(`Unknown custom rule type: ${type}`);
}

function compileXmlRule(rule) {
  const { base, offset } = parseRuleOffset(String(rule || "").trim());
  let xpath = "";
  let match = base.match(/^fixedDate\(\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$/);

  if (match) {
    xpath = `/calendar/year/month[${positiveInt(match[1], 1)}]/day[${positiveInt(match[2], 1)}]`;
    return offsetXPath(xpath, offset);
  }

  match = base.match(/^date\(\s*['"](\d{4}-\d{2}-\d{2})['"]\s*\)$/);

  if (match) {
    const { year, month, day } = safeIsoDateParts(match[1]);
    xpath = `/calendar/year[name = '${year}']/month[@index = ${month}]/day[@index = ${day}]`;
    return offsetXPath(xpath, offset);
  }

  match = base.match(/^nthWeekday\(\s*(\d{1,2})\s*,\s*(\d)\s*,\s*(\d)\s*\)$/);

  if (match) {
    xpath = `/calendar/year/month[${positiveInt(match[1], 1)}]/day[@weekday = ${positiveInt(match[2], 1)}][${positiveInt(match[3], 1)}]`;
    return offsetXPath(xpath, offset);
  }

  match = base.match(/^lastWeekday\(\s*(\d{1,2})\s*,\s*(\d)\s*\)$/);

  if (match) {
    xpath = `/calendar/year/month[${positiveInt(match[1], 1)}]/day[@weekday = ${positiveInt(match[2], 1)}][position() = last()]`;
    return offsetXPath(xpath, offset);
  }

  match = base.match(/^weekdayInRange\(\s*(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(\d)\s*\)$/);

  if (match) {
    const month = positiveInt(match[1], 1);
    const startDay = positiveInt(match[2], 1);
    const endDay = positiveInt(match[3], startDay);
    const weekday = positiveInt(match[4], 1);
    xpath = `/calendar/year/month[${month}]/day[@index >= ${startDay} and @index <= ${endDay} and @weekday = ${weekday}]`;
    return offsetXPath(xpath, offset);
  }

  match = base.match(/^firstMoonPhaseAfter\(\s*(\d{1,2})\s*,\s*['"]([A-Za-z]+)['"]\s*\)$/);

  if (match) {
    const month = positiveInt(match[1], 1);
    const phase = safeToken(match[2], "full");
    xpath = `(/calendar/year/month[@index = ${month}]/day[@moonPhaseEvent = '${phase}'])[1]`;
    return offsetXPath(xpath, offset);
  }

  match = base.match(/^sunEvent\(\s*['"]([A-Za-z]+)['"]\s*\)$/);

  if (match) {
    const event = safeToken(match[1], "summerSolstice");
    xpath = `/calendar/year/month/day[@sunEvent = '${event}']`;
    return offsetXPath(xpath, offset);
  }

  if (base === "easter") {
    return offsetXPath("/calendar/year/month/day[@easter = 'true']", offset);
  }

  match = base.match(/^anchor\(\s*['"]([A-Za-z_][A-Za-z0-9_.:-]*)['"]\s*\)$/);

  if (match) {
    return offsetXPath(anchorXPath(safeAnchorId(match[1])), offset);
  }

  throw new Error(`Unsupported rule syntax: ${rule}`);
}

export function createPreflightReport(project, monthImages = {}, imageSettings = {}, layout = {}) {
  const issues = [];
  const unmatched = project.eventResults.filter((result) => !result.error && result.matches.length === 0);
  const selectorErrors = project.eventResults.filter((result) => result.error);
  const invalidSelectorTargets = project.eventResults.filter((result) => !result.error && result.invalidTargets?.length > 0);
  const unexpectedMatches = project.eventResults.filter((result) => !result.error && !matchesExpectation(result));
  const missingImages = project.pages
    .filter((page) => !monthImages[page.month])
    .map((page) => page.name);
  const imageAspectWarnings = [];
  const lowResolutionImages = [];
  const crowdedDays = project.pages
    .flatMap((page) => page.weeks)
    .flatMap((week) => week.days)
    .filter((day) => !day.isOutsideMonth && day.names.length > 4);
  const targetRatio = ratioNumber(layout.imageRatio || "4/3");
  const requiredImageSize = requiredImagePixels(layout, targetRatio);

  for (const page of project.pages) {
    if (!monthImages[page.month]) {
      continue;
    }

    const meta = imageSettings[page.month]?.meta;

    if (!meta?.width || !meta?.height) {
      continue;
    }

    const imageRatio = meta.width / meta.height;

    if (Math.abs(imageRatio - targetRatio) / targetRatio > 0.12) {
      imageAspectWarnings.push(`${page.name} (${meta.width}x${meta.height})`);
    }

    if (meta.width < requiredImageSize.width || meta.height < requiredImageSize.height) {
      lowResolutionImages.push(`${page.name} (${meta.width}x${meta.height})`);
    }
  }

  for (const result of selectorErrors) {
    issues.push({
      level: "error",
      title: `Selector failed: ${result.name || "Unnamed rule"}`,
      detail: result.error
    });
  }

  if (unmatched.length > 0) {
    issues.push({
      level: "warning",
      title: `${unmatched.length} event rule${unmatched.length === 1 ? "" : "s"} matched no days`,
      detail: unmatched.slice(0, 8).map((result) => result.name || result.xpath).join(", ")
    });
  }

  if (invalidSelectorTargets.length > 0) {
    issues.push({
      level: "warning",
      title: `${invalidSelectorTargets.length} event rule${invalidSelectorTargets.length === 1 ? "" : "s"} matched non-day XML nodes`,
      detail: invalidSelectorTargets.slice(0, 8).map((result) => {
        return `${result.name || result.xpath}: ${result.invalidTargets.slice(0, 3).join(", ")}`;
      }).join("; ")
    });
  }

  if (unexpectedMatches.length > 0) {
    issues.push({
      level: "warning",
      title: `${unexpectedMatches.length} event rule${unexpectedMatches.length === 1 ? "" : "s"} matched an unexpected number of days`,
      detail: unexpectedMatches.slice(0, 8).map((result) => {
        return `${result.name || result.xpath}: ${result.matches.length} match${result.matches.length === 1 ? "" : "es"}${expectationLabel(result.expectations)}`;
      }).join(", ")
    });
  }

  if (missingImages.length > 0) {
    issues.push({
      level: "warning",
      title: `${missingImages.length} month image${missingImages.length === 1 ? "" : "s"} missing`,
      detail: missingImages.join(", ")
    });
  }

  if (imageAspectWarnings.length > 0) {
    issues.push({
      level: "info",
      title: `${imageAspectWarnings.length} image${imageAspectWarnings.length === 1 ? "" : "s"} differ from the selected image ratio`,
      detail: imageAspectWarnings.slice(0, 10).join(", ")
    });
  }

  if (lowResolutionImages.length > 0) {
    issues.push({
      level: "warning",
      title: `${lowResolutionImages.length} image${lowResolutionImages.length === 1 ? "" : "s"} may print below 150 DPI`,
      detail: lowResolutionImages.slice(0, 10).join(", ")
    });
  }

  if (crowdedDays.length > 0) {
    issues.push({
      level: "info",
      title: `${crowdedDays.length} day cell${crowdedDays.length === 1 ? "" : "s"} contain more than four labels`,
      detail: crowdedDays.slice(0, 10).map((day) => day.date).join(", ")
    });
  }

  return {
    ok: issues.every((issue) => issue.level !== "error"),
    issues,
    counts: {
      pages: project.pages.length,
      dayCells: project.pages.flatMap((page) => page.weeks).flatMap((week) => week.days).length,
      eventRules: project.eventResults.length,
      matchedRules: project.eventResults.filter((result) => result.matches.length > 0).length,
      unmatchedRules: unmatched.length,
      unexpectedMatchRules: unexpectedMatches.length,
      selectorErrors: selectorErrors.length,
      invalidSelectorTargets: invalidSelectorTargets.length,
      missingImages: missingImages.length,
      imageAspectWarnings: imageAspectWarnings.length,
      lowResolutionImages: lowResolutionImages.length
    }
  };
}

function readMatchExpectations(eventDay) {
  return {
    expected: nullablePositiveInteger(eventDay.getAttribute("expectedMatches")),
    min: nullablePositiveInteger(eventDay.getAttribute("minMatches")),
    max: nullablePositiveInteger(eventDay.getAttribute("maxMatches"))
  };
}

function matchesExpectation(result) {
  const count = result.matches.length;
  const expectations = result.expectations || {};

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

function expectationLabel(expectations = {}) {
  const parts = [];

  if (expectations.expected !== null && expectations.expected !== undefined) {
    parts.push(`expected ${expectations.expected}`);
  }

  if (expectations.min !== null && expectations.min !== undefined) {
    parts.push(`min ${expectations.min}`);
  }

  if (expectations.max !== null && expectations.max !== undefined) {
    parts.push(`max ${expectations.max}`);
  }

  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function ensureCalendarSourceModel(source) {
  return source?.months && source?.weekdays && source?.doc ? source : readCalendarSourceModel(source);
}

function readSourceMonths(yearNode) {
  const months = [];
  const seenMonths = new Set();

  for (const monthNode of yearNode.querySelectorAll(":scope > month")) {
    const index = requiredIntegerAttribute(monthNode, "index", "month");

    if (index < 1 || index > 12) {
      throw new Error(`Calendar source month index must be 1-12; received ${index}.`);
    }

    if (seenMonths.has(index)) {
      throw new Error(`Calendar source contains duplicate month ${index}.`);
    }

    seenMonths.add(index);
    months.push({
      index,
      name: monthNode.querySelector(":scope > name")?.textContent || "",
      node: monthNode,
      attributes: attributesAsObject(monthNode),
      days: readSourceDays(monthNode, index)
    });
  }

  if (months.length === 0) {
    throw new Error("Calendar source XML must contain at least one <month>.");
  }

  return months.sort((left, right) => left.index - right.index);
}

function readSourceDays(monthNode, month) {
  const days = [];
  const seenDays = new Set();
  const maxDay = daysInSourceMonth(month);

  for (const dayNode of monthNode.querySelectorAll(":scope > day")) {
    const index = requiredIntegerAttribute(dayNode, "index", `month ${month} day`);

    if (index < 1 || index > maxDay) {
      throw new Error(`Calendar source month ${month} has invalid day index ${index}.`);
    }

    if (month === 2 && index === 29 && dayNode.getAttribute("leap") !== "1") {
      throw new Error("Calendar source February 29 must use leap=\"1\" so non-leap years can omit it.");
    }

    if (seenDays.has(index)) {
      throw new Error(`Calendar source month ${month} contains duplicate day ${index}.`);
    }

    seenDays.add(index);
    days.push({
      index,
      leap: dayNode.getAttribute("leap") || "",
      node: dayNode,
      attributes: attributesAsObject(dayNode),
      names: Array.from(dayNode.querySelectorAll(":scope > name")).map((nameNode) => ({
        text: nameNode.textContent || "",
        node: nameNode,
        attributes: attributesAsObject(nameNode)
      }))
    });
  }

  if (days.length === 0) {
    throw new Error(`Calendar source month ${month} must contain at least one <day>.`);
  }

  return days.sort((left, right) => left.index - right.index);
}

function readSourceWeekdays(root) {
  const weekdays = new Map();

  for (const day of root.querySelectorAll(":scope > week > day")) {
    const index = requiredIntegerAttribute(day, "index", "weekday");

    if (index < 1 || index > 7) {
      throw new Error(`Calendar source weekday index must be 1-7; received ${index}.`);
    }

    if (weekdays.has(index)) {
      throw new Error(`Calendar source contains duplicate weekday ${index}.`);
    }

    weekdays.set(index, {
      index,
      name: day.querySelector(":scope > name")?.textContent || "",
      holiday: day.getAttribute("holiday") === "true",
      node: day,
      attributes: attributesAsObject(day)
    });
  }

  return weekdays;
}

function readSourceEventRules(eventRoot) {
  if (!eventRoot) {
    return [];
  }

  return Array.from(eventRoot.querySelectorAll(":scope > day")).map(eventRuleFromEventDay);
}

function eventRuleFromEventDay(eventDay, index = 0, fallbackSource = "source") {
  const names = Array.from(eventDay.querySelectorAll(":scope > name")).map((nameNode) => ({
    text: nameNode.textContent || "",
    attributes: attributesAsObject(nameNode),
    node: nameNode
  }));

  return {
    index,
    node: eventDay,
    xpath: eventDay.getAttribute("xpath") || "",
    rule: eventDay.getAttribute("rule") || "",
    id: eventDay.getAttribute("id") || "",
    ruleId: eventDay.getAttribute("data-rule-id") || eventDay.getAttribute("id") || null,
    source: eventDay.getAttribute("data-source") || fallbackSource,
    name: names.map((name) => name.text.trim()).filter(Boolean).join(", "),
    names,
    attributes: attributesAsObject(eventDay),
    expectations: readMatchExpectations(eventDay)
  };
}

function requiredIntegerAttribute(node, name, label) {
  const raw = node.getAttribute(name);
  const value = Number(raw);

  if (!raw || !Number.isInteger(value)) {
    throw new Error(`Calendar source ${label} is missing a numeric ${name} attribute.`);
  }

  return value;
}

function assertXmlAttributeName(name, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name)) {
    throw new Error(`Invalid ${label} name: ${name}`);
  }
}

function parseCustomFactValue(value) {
  const text = String(value ?? "").trim();

  if (text === "" || text === "true") {
    return true;
  }

  if (text === "false") {
    return false;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    return Number(text);
  }

  return text;
}

function daysInSourceMonth(month) {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function readDayNode(node) {
  const names = Array.from(node.querySelectorAll(":scope > name")).map(readNameNode);
  const events = names
    .filter((name) => name.event)
    .map((name) => ({
      text: name.text,
      holiday: name.holiday,
      flag: name.flag,
      category: name.category,
      source: name.source,
      priority: name.priority,
      className: name.className,
      lang: name.lang,
      ruleId: name.ruleId
    }));

  return {
    date: node.getAttribute("date"),
    year: numberAttr(node, "year"),
    dayNumber: numberAttr(node, "index"),
    month: numberAttr(node, "month"),
    dayOfYear: numberAttr(node, "dayOfYear") || numberAttr(node, "day"),
    weekday: numberAttr(node, "weekday"),
    weekdayDisplay: numberAttr(node, "weekdayDisplay"),
    weekdayName: node.getAttribute("weekdayName"),
    weekNumber: numberAttr(node, "week"),
    weekIso: numberAttr(node, "weekIso"),
    weekUs: numberAttr(node, "weekUs"),
    isOutsideMonth: false,
    isLeapYear: node.getAttribute("isLeapYear") === "true",
    isWeekend: node.getAttribute("isWeekend") === "true",
    isHoliday: node.getAttribute("holiday") === "true",
    hasFlag: node.getAttribute("flag") === "true",
    moonPhase: node.hasAttribute("moonPhase") ? numberAttr(node, "moonPhase") : null,
    sunEvent: node.getAttribute("sunEvent"),
    easter: node.getAttribute("easter") === "true",
    names,
    events,
    facts: attributesAsObject(node)
  };
}

function readNameNode(nameNode) {
  return {
    text: nameNode.textContent || "",
    event: nameNode.getAttribute("event") === "true",
    holiday: nameNode.getAttribute("holidayName") === "true",
    flag: nameNode.getAttribute("flag") === "true",
    category: nameNode.getAttribute("category") || "",
    source: nameNode.getAttribute("source") || "",
    priority: Number(nameNode.getAttribute("priority") || 0),
    className: nameNode.getAttribute("class") || "",
    lang: nameNode.getAttribute("lang") || nameNode.getAttribute("xml:lang") || "",
    ruleId: nameNode.getAttribute("ruleId") || ""
  };
}

function customRuleToEventDay(doc, rule) {
  const day = doc.createElement("day");
  const name = doc.createElement("name");

  day.setAttribute("xpath", compileCustomRule(rule));
  day.setAttribute("data-source", "custom");

  if (rule.id) {
    day.setAttribute("data-rule-id", String(rule.id));
  }

  if (rule.holiday) {
    day.setAttribute("holiday", "true");
  }

  if (rule.flag) {
    day.setAttribute("flag", "true");
  }

  for (const [attr, value] of Object.entries({
    category: rule.category,
    source: rule.source,
    priority: rule.priority,
    class: rule.className,
    lang: rule.lang
  })) {
    if (value !== undefined && value !== null && value !== "") {
      day.setAttribute(attr, String(value));
    }
  }

  for (const attr of ["expectedMatches", "minMatches", "maxMatches"]) {
    if (rule[attr] !== undefined && rule[attr] !== null && rule[attr] !== "") {
      day.setAttribute(attr, String(rule[attr]));
    }
  }

  name.textContent = rule.name || "Custom event";
  day.appendChild(name);
  return day;
}

function offsetXPath(baseXPath, offset) {
  if (offset === 0) {
    return baseXPath;
  }

  if (offset > 0) {
    return `${baseXPath}/following::day[${offset}]`;
  }

  return `${baseXPath}/preceding::day[${Math.abs(offset)}]`;
}

function anchorXPath(anchor) {
  return `/calendar/year/month/day[@date = /calendar/calculations/anchor[@id = '${anchor}']/@date]`;
}

function parseRuleOffset(rule) {
  const match = rule.match(/^(.*?)(?:\s*([+-])\s*(\d+)d)?$/);
  const sign = match?.[2] === "-" ? -1 : 1;
  const amount = match?.[3] ? Number(match[3]) : 0;

  return {
    base: (match?.[1] || "").trim(),
    offset: sign * amount
  };
}

function positiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function integer(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

function nullablePositiveInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeToken(value, fallback) {
  const token = String(value || fallback);
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(token) ? token : fallback;
}

function safeAnchorId(value) {
  const token = String(value || "").trim();

  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(token)) {
    throw new Error(`Invalid anchor name: ${value}`);
  }

  return token;
}

function safeIsoDateParts(value) {
  const date = String(value || "").trim();
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid ISO date: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function ratioNumber(value) {
  const [width, height] = String(value || "4/3").split("/").map(Number);
  return (width > 0 && height > 0) ? width / height : 4 / 3;
}

function requiredImagePixels(layout, ratio) {
  const unit = layout.unit || "mm";
  const paperWidth = Number(layout.paperWidth || 210);
  const marginLeft = Number(layout.marginLeft || 0);
  const marginRight = Number(layout.marginRight || 0);
  const imageWidth = Math.max(1, paperWidth - marginLeft - marginRight);
  const widthInches = toInches(imageWidth, unit);
  const heightInches = widthInches / ratio;

  return {
    width: Math.ceil(widthInches * 150),
    height: Math.ceil(heightInches * 150)
  };
}

function toInches(value, unit) {
  if (unit === "in") {
    return value;
  }

  if (unit === "cm") {
    return value / 2.54;
  }

  if (unit === "pt") {
    return value / 72;
  }

  return value / 25.4;
}

function outsideDay(year, month, day, settings) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const displayMonth = date.getUTCMonth() + 1;
  const displayDay = date.getUTCDate();
  const iso = jsDayToIso(date.getUTCDay());
  const locale = normalizeLocale(settings.locale);
  return {
    date: isoDate(date.getUTCFullYear(), displayMonth, displayDay),
    year: date.getUTCFullYear(),
    dayNumber: displayDay,
    month: displayMonth,
    dayOfYear: 0,
    weekday: iso,
    weekdayDisplay: displayWeekday(iso, Number(settings.startingWeekday || 1)),
    weekdayName: weekdayNameFallback(iso, locale),
    weekNumber: settings.weekNumbering === "US" ? usWeekNumber(date) : isoWeekNumber(date),
    weekIso: isoWeekNumber(date),
    weekUs: usWeekNumber(date),
    isOutsideMonth: true,
    isLeapYear: isLeapYear(date.getUTCFullYear()),
    isWeekend: iso >= 6,
    isHoliday: iso === 7,
    hasFlag: false,
    moonPhase: null,
    sunEvent: null,
    easter: false,
    names: [],
    events: [],
    facts: {}
  };
}

function prependEventNames(doc, target, eventDay, eventIndex) {
  const names = Array.from(eventDay.querySelectorAll(":scope > name"));
  const eventNames = names.map((sourceName, index) => {
    const nameNode = doc.createElement("name");

    copyEventNameAttributes(eventDay, sourceName, nameNode);
    nameNode.setAttribute("event", "true");
    nameNode.setAttribute("sequence", String(eventIndex));
    nameNode.setAttribute("order", String(index));
    nameNode.textContent = sourceName.textContent || "";
    return nameNode;
  }).sort(compareEventNameNodes);

  for (const nameNode of eventNames) {
    target.insertBefore(nameNode, firstOrdinaryName(target));
  }

  sortEventNames(target);
}

function copyEventNameAttributes(eventDay, sourceName, targetName) {
  const copyNames = ["category", "source", "priority", "class"];

  for (const attrName of copyNames) {
    const value = sourceName.getAttribute(attrName) || eventDay.getAttribute(attrName);

    if (value) {
      targetName.setAttribute(attrName, value);
    }
  }

  const lang = sourceName.getAttribute("lang") || sourceName.getAttribute("xml:lang") || eventDay.getAttribute("lang") || eventDay.getAttribute("xml:lang");

  if (lang) {
    targetName.setAttribute("lang", lang);
  }

  if (eventDay.getAttribute("holiday") === "true" || sourceName.getAttribute("holiday") === "true") {
    targetName.setAttribute("holidayName", "true");
  }

  if (eventDay.getAttribute("flag") === "true" || sourceName.getAttribute("flag") === "true") {
    targetName.setAttribute("flag", "true");
  }

  const ruleId = eventDay.getAttribute("data-rule-id");

  if (ruleId) {
    targetName.setAttribute("ruleId", ruleId);
  }
}

function firstOrdinaryName(dayNode) {
  return Array.from(dayNode.childNodes).find((node) => {
    return node.nodeType === Node.ELEMENT_NODE && node.localName === "name" && node.getAttribute("event") !== "true";
  }) || null;
}

function sortEventNames(dayNode) {
  const eventNames = Array.from(dayNode.querySelectorAll(":scope > name[event='true']")).sort(compareEventNameNodes);
  const ordinary = firstOrdinaryName(dayNode);

  for (const nameNode of eventNames) {
    dayNode.insertBefore(nameNode, ordinary);
  }
}

function compareEventNameNodes(left, right) {
  const priorityDiff = Number(right.getAttribute("priority") || 0) - Number(left.getAttribute("priority") || 0);

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const holidayDiff = Number(right.getAttribute("holidayName") === "true") - Number(left.getAttribute("holidayName") === "true");

  if (holidayDiff !== 0) {
    return holidayDiff;
  }

  const sequenceDiff = Number(left.getAttribute("sequence") || 0) - Number(right.getAttribute("sequence") || 0);

  if (sequenceDiff !== 0) {
    return sequenceDiff;
  }

  return Number(left.getAttribute("order") || 0) - Number(right.getAttribute("order") || 0);
}

function copyEventAttributes(source, target) {
  for (const attr of source.attributes) {
    if (attr.name !== "xpath") {
      target.setAttribute(attr.name, attr.value);
    }
  }
}

function describeXPathTarget(target) {
  if (!target) {
    return "empty target";
  }

  if (target.nodeType === Node.ELEMENT_NODE) {
    const date = target.getAttribute("date");
    const index = target.getAttribute("index");
    const suffix = date ? `[@date='${date}']` : (index ? `[@index='${index}']` : "");
    return `<${target.localName}${suffix}>`;
  }

  if (target.nodeType === Node.ATTRIBUTE_NODE) {
    return `@${target.name}`;
  }

  if (target.nodeType === Node.TEXT_NODE) {
    return "text()";
  }

  return `nodeType ${target.nodeType}`;
}

function copyAttributes(source, target) {
  for (const attr of source.attributes) {
    target.setAttribute(attr.name, attr.value);
  }
}

function attributesAsObject(node) {
  const facts = {};

  for (const attr of node.attributes) {
    facts[attr.name] = attr.value;
  }

  return facts;
}

function appendTextElement(doc, parent, name, text) {
  const element = doc.createElement(name);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function numberAttr(node, name) {
  return Number(node.getAttribute(name));
}

function isLeapYear(year) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function weekdayIso(year, month, day) {
  return jsDayToIso(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
}

function jsDayToIso(day) {
  return day === 0 ? 7 : day;
}

function displayWeekday(isoWeekday, startingWeekday) {
  return ((isoWeekday - startingWeekday + 7) % 7) + 1;
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysIso(dateIso, amount) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function isoWeekNumber(date) {
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = jsDayToIso(temp.getUTCDay());
  temp.setUTCDate(temp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp - yearStart) / 86400000 + 1) / 7);
}

function usWeekNumber(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diff = Math.floor((date - start) / 86400000);
  return Math.floor((diff + start.getUTCDay()) / 7) + 1;
}

function weekdayLabels(startingWeekday, days, locale = "en-US") {
  const byIso = new Map(days.map((day) => [day.weekday, day.weekdayName]));
  const labels = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const iso = ((Number(startingWeekday) - 1 + offset) % 7) + 1;
    labels.push(byIso.get(iso) || weekdayNameFallback(iso, locale));
  }

  return labels;
}

function weekdayNameFallback(index, locale = "en-US") {
  const safeLocale = normalizeLocale(locale);

  try {
    return new Intl.DateTimeFormat(safeLocale, { weekday: "long", timeZone: "UTC" })
      .format(new Date(Date.UTC(2020, 0, 5 + index)));
  } catch {
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index - 1];
  }
}

function monthNameFallback(index, locale = "en-US") {
  const safeLocale = normalizeLocale(locale);

  try {
    return new Intl.DateTimeFormat(safeLocale, { month: "long", timeZone: "UTC" })
      .format(new Date(Date.UTC(2020, index - 1, 1)));
  } catch {
    return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
    ][index - 1];
  }
}

function normalizeLocale(locale) {
  const value = String(locale || "").trim() || "en-US";

  try {
    return Intl.getCanonicalLocales(value)[0] || "en-US";
  } catch {
    return "en-US";
  }
}

function normalizedTimeZone(timeZone) {
  const value = String(timeZone || "").trim();

  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

function resolveGmtOffset(input, month, day, hour, minute, second) {
  const timeZone = normalizedTimeZone(input.settings?.timeZone);

  if (!timeZone) {
    return Number(input.gmt || 0);
  }

  return timeZoneOffsetHours(timeZone, Number(input.year), month, day, hour, minute, second, Number(input.gmt || 0));
}

function timeZoneOffsetHours(timeZone, year, month, day, hour, minute, second, fallback) {
  try {
    const utc = Date.UTC(year, month - 1, day, hour, minute, second);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(new Date(utc));
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const localAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    return (localAsUtc - utc) / 3600000;
  } catch {
    return fallback;
  }
}

function formatOffsetHours(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function moonPhaseName(phase) {
  return ["new", "firstQuarter", "full", "lastQuarter"][phase] || "";
}

function easter(year) {
  const c = Math.floor(year / 100);
  const n = year - 19 * Math.floor(year / 19);
  const k = Math.floor((c - 17) / 25);
  let i = c - Math.floor(c / 4) - Math.floor((c - k) / 3) + 19 * n + 15;
  i = i - 30 * Math.floor(i / 30);
  i = i - Math.floor(i / 28) * (1 - Math.floor(i / 28) * Math.floor(29 / (i + 1)) * Math.floor((21 - n) / 11));
  let j = year + Math.floor(year / 4) + i + 2 - c + Math.floor(c / 4);
  j = j - 7 * Math.floor(j / 7);
  const l = i - j;
  const month = 3 + Math.floor((l + 40) / 44);
  const day = l + 28 - 31 * Math.floor(month / 4);
  return `${month}-${day}`;
}

function moonAngle(year, month, day, hour, minute, second, gmt) {
  let y = year < 2000 ? year + 1900 : year;
  let m = month;
  const d = day;
  const zone = -gmt;

  if (m <= 2) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const c = Math.floor(365.25 * y);
  const j = 1720994.5 + Math.floor(30.6001 * (m + 1)) + b + c + d;
  const td = (j - 2451545) / 36525;
  const dd = ((((second + 63) / 60 + minute) / 60 + hour + zone) / 24);
  const t = td + dd / 36525;

  let moon = 218.316 + 481267.8809 * t;
  moon += 6.2888 * Math.cos((477198.868 * t + 44.963) * DEG);
  moon += 1.274 * Math.cos((413335.35 * t + 10.74) * DEG);
  moon += 0.6583 * Math.cos((890534.22 * t + 145.7) * DEG);
  moon += 0.2136 * Math.cos((954397.74 * t + 179.93) * DEG);
  moon += 0.1851 * Math.cos((35999.05 * t + 87.53) * DEG);
  moon += 0.1144 * Math.cos((966404 * t + 276.5) * DEG);
  moon += 0.0588 * Math.cos((63863.5 * t + 124.2) * DEG);
  moon += 0.0571 * Math.cos((377336.3 * t + 13.2) * DEG);
  moon += 0.0533 * Math.cos((1367733.1 * t + 280.7) * DEG);
  moon += 0.0458 * Math.cos((854535.2 * t + 148.2) * DEG);
  moon += 0.0409 * Math.cos((441199.8 * t + 47.4) * DEG);
  moon += 0.0347 * Math.cos((445267.1 * t + 27.9) * DEG);
  moon += 0.0304 * Math.cos((513197.9 * t + 222.5) * DEG);
  moon += 0.0154 * Math.cos((75870 * t + 41) * DEG);
  moon += 0.0125 * Math.cos((1443603 * t + 52) * DEG);
  moon += 0.011 * Math.cos((489205 * t + 142) * DEG);
  moon += 0.0107 * Math.cos((1303870 * t + 246) * DEG);
  moon += 0.01 * Math.cos((1431597 * t + 315) * DEG);
  moon += 0.0085 * Math.cos((826671 * t + 111) * DEG);
  moon += 0.0079 * Math.cos((449334 * t + 188) * DEG);
  moon += 0.0068 * Math.cos((926533 * t + 323) * DEG);
  moon += 0.0052 * Math.cos((31932 * t + 107) * DEG);
  moon += 0.005 * Math.cos((481266 * t + 205) * DEG);
  moon += 0.004 * Math.cos((1331734 * t + 283) * DEG);
  moon += 0.004 * Math.cos((1844932 * t + 56) * DEG);
  moon += 0.004 * Math.cos((133 * t + 29) * DEG);
  moon += 0.0038 * Math.cos((1781068 * t + 21) * DEG);
  moon += 0.0037 * Math.cos((541062 * t + 259) * DEG);
  moon += 0.0028 * Math.cos((1934 * t + 145) * DEG);
  moon += 0.0027 * Math.cos((918399 * t + 182) * DEG);
  moon += 0.0026 * Math.cos((1379739 * t + 17) * DEG);
  moon += 0.0024 * Math.cos((99863 * t + 122) * DEG);
  moon += 0.0023 * Math.cos((922466 * t + 163) * DEG);
  moon += 0.0022 * Math.cos((818536 * t + 151) * DEG);
  moon += 0.0021 * Math.cos((990397 * t + 357) * DEG);
  moon += 0.0021 * Math.cos((71998 * t + 85) * DEG);
  moon += 0.0021 * Math.cos((341337 * t + 16) * DEG);
  moon += 0.0018 * Math.cos((401329 * t + 274) * DEG);
  moon += 0.0016 * Math.cos((1856938 * t + 152) * DEG);
  moon += 0.0012 * Math.cos((1267871 * t + 249) * DEG);
  moon += 0.0011 * Math.cos((1920802 * t + 186) * DEG);
  moon += 0.0009 * Math.cos((858602 * t + 129) * DEG);
  moon += 0.0008 * Math.cos((1403732 * t + 98) * DEG);
  moon += 0.0007 * Math.cos((790672 * t + 114) * DEG);
  moon += 0.0007 * Math.cos((405201 * t + 50) * DEG);
  moon += 0.0007 * Math.cos((485333 * t + 186) * DEG);
  moon += 0.0007 * Math.cos((27864 * t + 127) * DEG);
  moon += 0.0006 * Math.cos((111869 * t + 38) * DEG);
  moon += 0.0006 * Math.cos((2258267 * t + 156) * DEG);
  moon += 0.0005 * Math.cos((1908795 * t + 90) * DEG);
  moon += 0.0005 * Math.cos((1745069 * t + 24) * DEG);
  moon += 0.0005 * Math.cos((509131 * t + 242) * DEG);
  moon += 0.0004 * Math.cos((39871 * t + 223) * DEG);
  moon += 0.0004 * Math.cos((12006 * t + 187) * DEG);
  moon += 0.0003 * Math.cos((958465 * t + 340) * DEG);
  moon += 0.0003 * Math.cos((381404 * t + 354) * DEG);
  moon += 0.0003 * Math.cos((349472 * t + 337) * DEG);
  moon += 0.0003 * Math.cos((1808933 * t + 58) * DEG);
  moon += 0.0003 * Math.cos((549197 * t + 220) * DEG);
  moon += 0.0003 * Math.cos((4067 * t + 70) * DEG);
  moon += 0.0003 * Math.cos((2322131 * t + 191) * DEG);
  moon = normalizeDegrees(moon);

  let sun = 280.4659 + 36000.7695 * t;
  sun += 1.9147 * Math.cos((35999.05 * t + 267.52) * DEG);
  sun -= 0.0048 * t * Math.cos((35999.05 * t + 267.52) * DEG);
  sun += 0.02 * Math.cos((71998.1 * t + 265.1) * DEG);
  sun += 0.002 * Math.cos((32964 * t + 158) * DEG);
  sun += 0.0018 * Math.cos((19 * t + 159) * DEG);
  sun += 0.0018 * Math.cos((445267 * t + 208) * DEG);
  sun += 0.0015 * Math.cos((45038 * t + 254) * DEG);
  sun += 0.0013 * Math.cos((22519 * t + 352) * DEG);
  sun += 0.0007 * Math.cos((65929 * t + 45) * DEG);
  sun += 0.0007 * Math.cos((3035 * t + 110) * DEG);
  sun += 0.0007 * Math.cos((9038 * t + 64) * DEG);
  sun += 0.0006 * Math.cos((33718 * t + 316) * DEG);
  sun += 0.0005 * Math.cos((155 * t + 118) * DEG);
  sun += 0.0005 * Math.cos((2281 * t + 221) * DEG);
  sun += 0.0004 * Math.cos((29930 * t + 48) * DEG);
  sun += 0.0004 * Math.cos((31557 * t + 161) * DEG);
  sun = normalizeDegrees(sun);

  return moon - sun > 0 ? moon - sun : moon + 360 - sun;
}

function seasonalSunEvents(year) {
  return new Map([
    [`3-${caldat(march(year))}`, { index: 0, name: "springEquinox" }],
    [`6-${caldat(june(year))}`, { index: 1, name: "summerSolstice" }],
    [`9-${caldat(september(year))}`, { index: 2, name: "autumnEquinox" }],
    [`12-${caldat(december(year))}`, { index: 3, name: "winterSolstice" }]
  ]);
}

function normalizeDegrees(value) {
  const wrapped = value / 360;
  return (wrapped - Math.floor(wrapped) + 1 - Math.floor(wrapped - Math.floor(wrapped) + 1)) * 360;
}

function periodicS(t) {
  let x = 485 * Math.cos(DEG * (324.96 + 1934.136 * t));
  x += 203 * Math.cos(DEG * (337.23 + 32964.467 * t));
  x += 199 * Math.cos(DEG * (342.08 + 20.186 * t));
  x += 182 * Math.cos(DEG * (27.85 + 445267.112 * t));
  x += 156 * Math.cos(DEG * (73.14 + 45036.886 * t));
  x += 136 * Math.cos(DEG * (171.52 + 22518.443 * t));
  x += 77 * Math.cos(DEG * (222.54 + 65928.934 * t));
  x += 74 * Math.cos(DEG * (296.72 + 3034.906 * t));
  x += 70 * Math.cos(DEG * (243.58 + 9037.513 * t));
  x += 58 * Math.cos(DEG * (119.81 + 33718.147 * t));
  x += 52 * Math.cos(DEG * (297.17 + 150.678 * t));
  x += 50 * Math.cos(DEG * (21.02 + 2281.226 * t));
  x += 45 * Math.cos(DEG * (247.54 + 29929.562 * t));
  x += 44 * Math.cos(DEG * (325.15 + 31555.956 * t));
  x += 29 * Math.cos(DEG * (60.93 + 4443.417 * t));
  x += 18 * Math.cos(DEG * (155.12 + 67555.328 * t));
  x += 17 * Math.cos(DEG * (288.79 + 4562.452 * t));
  x += 16 * Math.cos(DEG * (198.04 + 62894.029 * t));
  x += 14 * Math.cos(DEG * (199.76 + 31436.921 * t));
  x += 12 * Math.cos(DEG * (95.39 + 14577.848 * t));
  x += 12 * Math.cos(DEG * (287.11 + 31931.756 * t));
  x += 12 * Math.cos(DEG * (320.81 + 34777.259 * t));
  x += 9 * Math.cos(DEG * (227.73 + 1222.114 * t));
  x += 8 * Math.cos(DEG * (15.45 + 16859.074 * t));
  return x;
}

function march(year) {
  const y = (year - 2000) / 1000;
  const jde0 = 2451623.80984 + (365242.37404 + (0.05169 - (0.00411 - 0.00057 * y) * y) * y) * y;
  return adjustedJde(jde0, year);
}

function june(year) {
  const y = (year - 2000) / 1000;
  const jde0 = 2451716.56767 + (365241.62603 + (0.00325 - (0.00888 - 0.0003 * y) * y) * y) * y;
  return adjustedJde(jde0, year);
}

function september(year) {
  const y = (year - 2000) / 1000;
  const jde0 = 2451810.21715 + (365242.01767 + (0.11575 - (0.00337 - 0.00078 * y) * y) * y) * y;
  return adjustedJde(jde0, year);
}

function december(year) {
  const y = (year - 2000) / 1000;
  const jde0 = 2451900.05952 + (365242.74049 + (0.06223 - (0.00823 - 0.00032 * y) * y) * y) * y;
  return adjustedJde(jde0, year);
}

function adjustedJde(jde0, year) {
  const t = (jde0 - 2451545) / 36525;
  const w = DEG * (35999.373 * t - 2.47);
  const dl = 1 + 0.0334 * Math.cos(w) + 0.0007 * Math.cos(2 * w);
  return jde0 + 0.00001 * periodicS(t) / dl - (66 + (year - 2000)) / 86400;
}

function caldat(jd) {
  const jd0 = Math.floor(jd + 0.5);
  const b = Math.floor((jd0 - 1867216.25) / 36524.25);
  const c = jd0 + b - Math.floor(b / 4) + 1525;
  const d = Math.floor((c - 122.1) / 365.25);
  const e = 365 * d + Math.floor(d / 4);
  const f = Math.floor((c - e) / 30.6001);
  return Math.floor(c - e + 0.5) - Math.floor(30.6001 * f);
}
