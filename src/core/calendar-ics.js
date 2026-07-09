export function renderIcsCalendar(project, options = {}) {
  const calendarName = options.name || `Physicalendar ${project.pages[0]?.year || ""}`.trim();
  const dtstamp = options.dtstamp || "20000101T000000Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Physicalendar//Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`
  ];

  for (const item of eventEntries(project)) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(item.uid)}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dateValue(item.date)}`,
      `DTEND;VALUE=DATE:${dateValue(addDays(item.date, 1))}`,
      `SUMMARY:${escapeIcsText(item.summary)}`,
      "TRANSP:TRANSPARENT"
    );

    if (item.categories.length > 0) {
      lines.push(`CATEGORIES:${item.categories.map(escapeIcsText).join(",")}`);
    }

    if (item.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(item.description)}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function parseIcsEvents(text) {
  const lines = unfoldIcsLines(String(text || ""));
  const events = [];
  let current = null;

  for (const line of lines) {
    const separator = line.indexOf(":");

    if (separator === -1) {
      continue;
    }

    const property = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const key = property.split(";")[0].toUpperCase();

    if (key === "BEGIN" && value.toUpperCase() === "VEVENT") {
      current = {};
      continue;
    }

    if (key === "END" && value.toUpperCase() === "VEVENT") {
      events.push(...expandParsedEvent(current));
      current = null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (key === "SUMMARY") {
      current.summary = unescapeIcsText(value);
    } else if (key === "DTSTART") {
      current.start = parseIcsDate(value);
    } else if (key === "DTEND") {
      current.end = parseIcsDate(value);
    }
  }

  return events;
}

function eventEntries(project) {
  return project.pages
    .flatMap((page) => page.weeks)
    .flatMap((week) => week.days)
    .filter((day) => !day.isOutsideMonth)
    .flatMap((day) => {
      return day.events.map((event, index) => {
        const categories = [
          event.category,
          event.holiday ? "holiday" : "",
          event.flag ? "flag" : ""
        ].filter(Boolean);

        return {
          date: day.date,
          summary: event.text,
          uid: `${day.date}-${index}-${slug(event.text)}@physicalendar.local`,
          categories: Array.from(new Set(categories)),
          description: event.source ? `Source: ${event.source}` : ""
        };
      });
    });
}

function unfoldIcsLines(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded = [];

  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

function expandParsedEvent(event) {
  if (!event?.start) {
    return [];
  }

  const summary = event.summary || "Imported event";
  const end = event.end && event.end > event.start ? event.end : addDays(event.start, 1);
  const dates = [];

  for (let date = event.start; date < end; date = addDays(date, 1)) {
    const [year, month, day] = date.split("-").map(Number);
    dates.push({ summary, date, year, month, day });
  }

  return dates;
}

function parseIcsDate(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})/);

  if (!match) {
    return "";
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function unescapeIcsText(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function addDays(dateIso, amount) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dateValue(dateIso) {
  return dateIso.replace(/-/g, "");
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\u00ad/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldIcsLine(line) {
  if (line.length <= 75) {
    return line;
  }

  const chunks = [];
  let rest = line;

  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = rest.slice(75);
  }

  chunks.push(rest);
  return chunks.join("\r\n ");
}

function slug(value) {
  return String(value || "event")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "event";
}
