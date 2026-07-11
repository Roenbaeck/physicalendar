# physicalendar
Web app to make physical photo calendars.

## Try It Online

- Live app: https://roenbaeck.github.io/physicalendar/

## Current Prototype

This repository now contains a no-build browser prototype that implements the first slice of `PLAN.md`:

- loads legacy XML calendar sources
- parses XML into a source model for months, weekdays, and event rules before generating facts and applying XPath
- includes an Empty fixture for generated XML and calculation compatibility checks
- generates stable year/day facts in the browser through an explicit calculation plugin pipeline, including `year`, `dayOfYear`, `weekdayIso`, `weekdayDisplay`, `isLeapYear`, and `isWeekend`
- supports explicit locale and IANA time zone settings for fallback names and lunar calculations, with numeric GMT fallback
- keeps XPath weekday matching stable while using the selected starting weekday only for page layout
- runs the original XPath event selectors
- includes built-in calendar sources for Sweden, Norway, Denmark, Finland, Netherlands, United States, and an Empty fixture
- preserves event metadata such as category, source, priority, class, and language in the renderable model
- preserves soft hyphen hints in rendered calendar names for print hyphenation
- lets advanced users edit the source XML and event XPath rules directly
- uses collapsible side panels so dense authoring and export tools can be folded out of the way
- renders a month-by-month print preview with persisted zoom controls
- supports month image assignment through local browser storage, drag/drop, fit controls, crop scale, and focal positioning
- exposes rule-match results and a click-to-inspect day report with events, source names, and generated facts
- validates XPath selectors that match non-day XML nodes and reports those targets in preflight and rule results
- shows the calculation plugins that contributed generated facts, including per-plugin fact counts and generated anchors
- lets users add fixed-date or calculated generated facts and anchors before XPath event rules run
- offers print layout controls for paper size, margins, image ratio, optional month titles, month title size, and weekday label size
- warns about missing images, image ratio mismatches, low-resolution images, crowded days, text overflow, and selector issues
- supports selector match expectations with `expectedMatches`, `minMatches`, and `maxMatches` in XML and custom rules
- includes layout template packs for classic, gallery, and compact calendar pages
- saves/restores the current full project from local browser storage
- saves/loads project JSON files containing source XML, settings, layout, image controls, and month images
- exports the current source XML and generated facts XML for inspection
- exports generated events as an all-day `.ics` calendar
- includes an editable rule builder for custom events that compiles friendly rule types, including anchor offsets, into XPath with live matched-date previews and event metadata fields
- exports a standalone print HTML file containing the generated month pages and print CSS
- includes a dedicated `print.html` route that renders the locally saved project with the same print renderer
- shows deterministic local PDF and verification commands plus paper, margin, image-ratio, time-zone, and preflight export summaries
- renders standalone print HTML to PDF through local headless Chrome/Chromium
- saves/loads `.zip` project bundles with `project.json`, source XML, generated facts XML, standalone print HTML, deterministic PDF commands, optional generated PDF, and image files

Run it with:

```sh
npm run dev
```

Then open <http://localhost:5173>.

Static syntax checks:

```sh
npm run check
```

Static deployment build:

```sh
npm run build
```

This writes a dependency-free `dist/` folder containing the browser app, XML fixtures, styles, and regression pages. Serve that folder from any static host.

To preview the deployment artifact locally:

```sh
npm run dev -- dist
```

Browser regression checks:

```text
http://localhost:5173/tests.html
```

The regression page currently covers Sweden, Norway, United States, and Empty XML fixtures, including representative generated-year checks for 1900, 2000, 2009, 2024, 2027, and 2099.

The print button uses the browser's print dialog, so "Save as PDF" is available from the system print sheet. The generated print CSS follows the current layout settings. The toolbar's print-route button saves the current project locally and opens `print.html`, which renders the same project without the editor UI. The route can also render a static source directly, for example `print.html?source=./src/data/calendars/sweden.xml&year=2027&locale=sv-SE&timeZone=Europe/Stockholm&label=Sweden`, or a saved project JSON through `print.html?project=physicalendar-2027-project.json`. The standalone print HTML export produces a document that can be reopened and printed separately.

For deterministic local PDF export, render the print route directly:

```sh
npm run pdf -- --route "print.html?source=./src/data/calendars/sweden.xml&year=2027&locale=sv-SE&label=Sweden" --output artifacts/physicalendar-2027.pdf
npm run verify:pdf -- --input artifacts/physicalendar-2027.pdf --pages 12 --width 210 --height 297 --unit mm
```

Or first download a standalone print HTML file from the app, then run:

```sh
npm run pdf -- --input physicalendar-2027-print.html --output artifacts/physicalendar-2027.pdf
npm run verify:pdf -- --input artifacts/physicalendar-2027.pdf --pages 12 --width 210 --height 297 --unit mm
```

Set `CHROME_PATH` if Chrome/Chromium is installed somewhere unusual.

End-to-end PDF smoke test:

```sh
npm run pdf:smoke
```

This renders `print-fixtures.html` through headless Chrome and verifies the result is a non-empty 12-page A4 PDF.

Visual print snapshots for the built-in templates:

```sh
npm run snapshots -- --outdir artifacts/print-snapshots
npm run snapshots:verify
```

Or capture and verify them in one pass:

```sh
npm run snapshots:smoke
```

The toolbar includes source, year, locale, time zone, week numbering, starting weekday, GMT fallback offset, XML import, and all-day `.ics` import. The custom rule builder currently supports fixed dates, exact ISO dates, nth weekdays, last weekdays, weekdays inside a date range, offsets from Easter, offsets from seasonal sun events, offsets from moon phases, and offsets from generated anchors. It shows the compiled XPath, live matched dates, and expected/min/max match warnings before saving. Custom rules can add holiday/flag markers plus category, source, priority, class, and language metadata; they can be added, edited, removed, persisted locally, and included in saved project JSON and bundles. Imported `.ics` events become exact-date custom rules tagged with their source file. Custom generated facts can mark fixed dates, nth weekdays, last weekdays, Easter offsets, seasonal sun offsets, and moon-phase offsets with XML attributes and anchors before event selectors run. The Source XML panel edits the underlying XML directly, so hand-authored XPath event rules can use all generated calculation facts, including `fixedDate(8, 15)`, `date('2027-08-15')`, `nthWeekday(6, 5, 4)`, `lastWeekday(6, 5)`, `weekdayInRange(6, 19, 25, 5)`, `firstMoonPhaseAfter(8, 'full') + 21d`, and `anchor('tripStart') + 3d` rule syntax.

Advanced XML event rules may include `expectedMatches`, `minMatches`, or `maxMatches` attributes. Preflight warns when a selector matches outside those bounds, which helps catch rules that accidentally target too many or too few days.

Project bundles are stored without compression so they can be written and read in the browser without dependencies. A bundle contains the core project artifacts, plus `generated/calendar.pdf` when a finished PDF has been attached:

```text
manifest.json
project.json
calendars/source.xml
generated/year-facts.xml
generated/print.html
generated/pdf-commands.txt
generated/calendar.pdf
images/01.png
```

## Acknowledgements

Flags courtesy of https://flagpedia.net.