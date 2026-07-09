const DEFAULT_HOOKS = `// Register trusted, local calculation hooks here.
//
// registerCalculation({
//   id: "august-full-moon-plus-21",
//   label: "August moon anchor",
//   run({ findMoonPhase, addDays, setAnchor, setFact }) {
//     const fullMoon = findMoonPhase("full", 8);
//     const date = fullMoon && addDays(fullMoon, 21);
//
//     if (date) {
//       setAnchor("festivalStart", date);
//       setFact(date, "festival", true);
//     }
//   }
// });`;

export function defaultCalculationHooks() {
  return DEFAULT_HOOKS;
}

export function compileCalculationHooks(source) {
  const registrations = [];
  const registerCalculation = (definition) => {
    validateDefinition(definition, registrations);
    registrations.push(definition);
  };

  const code = String(source || "").trim();

  if (!code) {
    return [];
  }

  try {
    new Function("api", `"use strict"; const { registerCalculation } = api;\n${code}`)({ registerCalculation });
  } catch (error) {
    throw new Error(`Hooks could not be applied: ${error.message || String(error)}`);
  }

  return registrations.map((definition) => hookCalculation(definition));
}

function validateDefinition(definition, registrations) {
  if (!definition || typeof definition !== "object") {
    throw new Error("Each hook must register a calculation object.");
  }

  const id = String(definition.id || "").trim();

  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(id)) {
    throw new Error("Calculation ids must use letters, numbers, _, ., :, or - and cannot start with a number.");
  }

  if (registrations.some((item) => item.id === id)) {
    throw new Error(`Calculation id '${id}' is registered more than once.`);
  }

  if (typeof definition.run !== "function") {
    throw new Error(`Calculation '${id}' needs a run(context) function.`);
  }
}

function hookCalculation(definition) {
  return {
    id: String(definition.id).trim(),
    label: String(definition.label || definition.id).trim(),
    run(input) {
      const factsByDate = {};
      const anchors = {};
      const context = createHookContext(input, factsByDate, anchors);
      const returned = definition.run(context);

      if (returned && typeof returned === "object") {
        mergeFacts(factsByDate, returned.factsByDate);
        Object.assign(anchors, returned.anchors || {});
      }

      return { factsByDate, anchors };
    }
  };
}

function createHookContext(input, factsByDate, anchors) {
  return Object.freeze({
    year: Number(input.year),
    locale: String(input.settings?.locale || ""),
    timeZone: String(input.settings?.timeZone || ""),
    date: (month, day) => isoDate(input.year, month, day),
    addDays: (date, amount) => addDays(date, amount),
    findFirstFact: (name, value, month) => findFirstFact(input.factsByDate, name, value, month),
    findMoonPhase: (phase, month) => findFirstFact(input.factsByDate, "moonPhaseEvent", phase, month),
    setFact: (date, name, value = true) => setFact(factsByDate, date, name, value),
    setAnchor: (id, date) => setAnchor(anchors, id, date)
  });
}

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
    throw new Error("date(month, day) needs a real date in the current year.");
  }

  return date.toISOString().slice(0, 10);
}

function addDays(dateIso, amount) {
  const date = parseDate(dateIso);
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return date.toISOString().slice(0, 10);
}

function findFirstFact(factsByDate, name, value, month) {
  return Object.entries(factsByDate || {})
    .filter(([date, facts]) => (!month || Number(date.slice(5, 7)) === Number(month)) && String(facts?.[name]) === String(value))
    .map(([date]) => date)
    .sort()[0] || "";
}

function setFact(factsByDate, dateIso, name, value) {
  assertDate(dateIso);
  const factName = String(name || "").trim();

  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(factName)) {
    throw new Error("Fact names must be valid XML attribute names.");
  }

  factsByDate[dateIso] = { ...(factsByDate[dateIso] || {}), [factName]: value };
}

function setAnchor(anchors, id, dateIso) {
  const anchor = String(id || "").trim();

  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(anchor)) {
    throw new Error("Anchor ids must be valid XML attribute names.");
  }

  assertDate(dateIso);
  anchors[anchor] = dateIso;
}

function mergeFacts(target, source) {
  for (const [date, facts] of Object.entries(source || {})) {
    assertDate(date);
    target[date] = { ...(target[date] || {}), ...(facts || {}) };
  }
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Expected a YYYY-MM-DD date.");
  }

  return date;
}

function assertDate(value) {
  parseDate(String(value || ""));
}
