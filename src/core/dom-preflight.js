const TEXT_OVERFLOW_SELECTORS = [
  { selector: ".month-title h2", label: "month title" },
  { selector: ".month-title span", label: "month metadata" },
  { selector: ".day-names", label: "day labels" },
  { selector: ".page-footer", label: "footer text" }
];

export function measureTextOverflow(root) {
  const items = [];

  for (const target of root.querySelectorAll(TEXT_OVERFLOW_SELECTORS.map((item) => item.selector).join(","))) {
    if (!hasOverflow(target)) {
      continue;
    }

    const rule = TEXT_OVERFLOW_SELECTORS.find((item) => target.matches(item.selector));
    items.push({
      label: rule?.label || "text",
      context: overflowContext(target),
      text: compactText(target.textContent),
      width: target.scrollWidth - target.clientWidth,
      height: target.scrollHeight - target.clientHeight
    });
  }

  return items;
}

export function mergeOverflowPreflight(report, overflowItems) {
  const items = overflowItems || [];

  if (items.length === 0) {
    return {
      ...report,
      counts: {
        ...report.counts,
        textOverflows: 0
      }
    };
  }

  const issue = {
    level: "warning",
    title: `${items.length} text area${items.length === 1 ? "" : "s"} may overflow in print`,
    detail: items.slice(0, 10).map((item) => `${item.context}: ${item.label}`).join(", ")
  };

  return {
    ...report,
    ok: report.ok && issue.level !== "error",
    issues: [...report.issues, issue],
    counts: {
      ...report.counts,
      textOverflows: items.length
    }
  };
}

function hasOverflow(element) {
  const style = getComputedStyle(element);
  const clipsX = style.overflowX !== "visible";
  const clipsY = style.overflowY !== "visible";
  const widthOverflow = clipsX && element.scrollWidth > element.clientWidth + 1;
  const heightOverflow = clipsY && element.scrollHeight > element.clientHeight + 1;
  return widthOverflow || heightOverflow;
}

function overflowContext(element) {
  const day = element.closest("[data-date]");

  if (day?.dataset.date) {
    return day.dataset.date;
  }

  const page = element.closest(".month-page");
  return page?.getAttribute("aria-label") || "page";
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
}
