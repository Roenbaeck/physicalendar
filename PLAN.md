# Physicalendar Web App Plan

## Why This Exists

The old `Calrendar` project is a good seed for a modern app because it is not just a calendar renderer. Its strongest idea is a small calendar data system:

- Base calendars are XML files with month/day/name/weekday data.
- The selected year is generated from that source.
- Calculated facts are added to days, such as week numbers, Easter, moon phase changes, and equinoxes/solstices.
- Events then attach themselves to days using XPath selectors.
- A layout transform turns the enriched calendar into print-ready XSL-FO/PDF.

The new app should keep that mental model, but make the stages explicit, testable, inspectable, and pleasant to edit.

## What The Old Project Does

Important files:

- `Calrendar/source/Calrendar.vb`
  - WinForms shell.
  - Lets the user choose input calendar XML, year, GMT offset, ISO/US week numbering, starting weekday, layout, paper dimensions, margins, month images, and output type.
  - Runs the pipeline:
    1. `CreateYear.xslt`
    2. `CreateEvents.xslt`
    3. selected layout XSLT
    4. Apache FOP PDF export
- `Calrendar/source/transformations/CreateYear.xslt`
  - Generates all year/month/day nodes.
  - Adds leap-year, day-of-year, weekday, week number, moon phase transition, Easter, and sun phase attributes.
  - Embeds JavaScript algorithms for Easter, moon angle, and seasonal solar events.
- `Calrendar/source/transformations/CreateEvents.xslt`
  - Evaluates each event's `@xpath` against the generated year.
  - Copies event attributes such as `holiday` and `flag` onto matched day nodes.
  - Adds event names before ordinary name-day names.
- `Calrendar/source/layouts/ClassicLayout.xslt`
  - Converts the event-enriched year XML into XSL-FO.
  - Places month images, day grids, week numbers, flags, moon phase icons, and footer/info text.
- `Calrendar/source/calendars/*.xml`
  - Country calendar sources.
  - Sweden and Norway especially show the power of XPath-based relative rules, including Easter-like rules based on the first full moon marker after March 21.

## Product Shape

Build a local-first web app for creating physical photo calendars:

- The first screen is the editor/preview, not a marketing page.
- Users can pick or import a calendar source, choose a year and locale settings, add month images, pick a layout, preview pages, and export a PDF.
- Advanced users can inspect generated facts and edit XML/event rules directly.
- Non-advanced users get form controls for common rules, which compile into the same underlying event model.
- The app should work without accounts for the initial version.

## Recommended Stack

Use a TypeScript web app with a pure calendar engine package:

- UI: Vite + React + TypeScript.
- Styling: CSS modules or a small typed CSS setup; print styles are first-class.
- Calendar engine: framework-free TypeScript in `src/core`.
- XML parsing in the browser: `DOMParser`, `XMLSerializer`, and browser XPath through `document.evaluate`.
- PDF export:
  - MVP: browser print/export using CSS paged media.
  - Reliable export path: a small Node service or local CLI using headless Chromium to render the same print route to PDF.
- Persistence:
  - MVP: browser storage/IndexedDB for projects and uploaded image references.
  - Later: optional file-based project import/export as a zip containing source XML, settings, images, and generated PDF.

This keeps the app easy to run while leaving room for deterministic server-side or desktop-style PDF generation later.

## Core Architecture

Use a staged pipeline:

```text
Project settings
  + Calendar source XML
  + Built-in calculation plugins
  + User calculation plugins
        |
        v
Year facts document
        |
        v
Event selector pass
        |
        v
Renderable calendar model
        |
        v
Screen preview + print route + PDF export
```

### Stage 1: Parse Calendar Source

Keep XML as a supported source format.

The initial XML schema can remain close to Calrendar:

```xml
<calendar id="sweden" locale="sv-SE">
  <year>
    <month index="1">
      <name>Januari</name>
      <day index="1"/>
      <day index="2">
        <name>Svea</name>
      </day>
    </month>
  </year>
  <week>
    <day index="1"><name>mandag</name></day>
    <day index="7" holiday="true"><name>sondag</name></day>
  </week>
  <event>
    <day xpath="/calendar/year/month[1]/day[1]" holiday="true" flag="true">
      <name>Nyarsdagen</name>
    </day>
  </event>
</calendar>
```

Internally, convert parsed XML into a typed model, then serialize a generated XML facts document for XPath evaluation. This gives both type safety and compatibility with XPath.

### Stage 2: Generate Year Facts

Replace `CreateYear.xslt` with pure TypeScript functions.

Each generated day should have stable facts such as:

- `date`: ISO date, for example `2027-08-21`.
- `year`, `month`, `index`: calendar coordinates.
- `dayOfYear`.
- `weekdayIso`: Monday = 1 through Sunday = 7.
- `weekdayDisplay`: adjusted by selected starting weekday.
- `weekdayName`.
- `weekIso` and `weekUs`.
- `isLeapYear`.
- `isWeekend` or inherited weekday holiday metadata.
- `moonAngle`.
- `moonPhaseQuarter`: old compatible value `0..3`.
- `moonPhaseEvent`: optional `new`, `firstQuarter`, `full`, `lastQuarter`.
- `easter`: true on Easter Sunday.
- `sunEvent`: optional `springEquinox`, `summerSolstice`, `autumnEquinox`, `winterSolstice`.

For legacy selector compatibility, also emit old-style XML attributes where useful:

- `day`: old day-of-year attribute.
- `weekday`: ISO weekday alias for event rules.
- `week`: selected week number.
- `moonPhase`: old quarter value `0..3` when a phase transition occurs.
- `sunPhase`: old seasonal value `0..3`.

Use `weekdayDisplay` only for layout positioning. This fixes the old coupling where changing the calendar's starting weekday could also change event-rule behavior.

Important: calculations should materialize their results onto days before XPath event selectors run. That preserves rules like "three weeks after the first full moon in August" without requiring custom XPath functions.

Example selector after facts are generated:

```xpath
(/calendar/year/month[@index = 8]/day[@moonPhaseEvent = 'full'])[1]/following::day[21]
```

### Stage 3: Calculation Plugins

Make calculations pluggable, but keep the first version simple.

Define a calculation plugin interface:

```ts
export interface CalendarCalculation {
  id: string;
  label: string;
  run(input: CalculationInput): CalculationResult;
}
```

The result can attach facts to dates and optionally create named anchors:

```ts
type CalculationResult = {
  factsByDate: Record<string, Record<string, string | number | boolean>>;
  anchors?: Record<string, string>;
};
```

Built-in plugins for version 1:

- Gregorian year generation.
- ISO and US week numbers.
- Easter, ported from the old Oudin algorithm and cross-tested.
- Moon phase calculations, ported from the old Meeus-based script and tested against legacy output.
- Equinoxes and solstices, ported from the old script.

Later plugin ideas:

- Time zone aware solar/lunar events.
- Named holiday packs.
- User-defined formulas.
- External data imports.
- ICS import/export.

### Stage 4: Event Selectors

Keep `@xpath` support because it is expressive and already proven by the old calendars.

Improve it in three ways:

1. Validate selectors before rendering.
2. Show selector results in an inspector, including matched dates and unmatched rules.
3. Add a friendlier rule builder that compiles to XPath or directly to selector operations.

The event model should support:

- Multiple events per day.
- Event attributes: `holiday`, `flag`, `category`, `source`, `priority`, `class`.
- Names with optional language and soft-hyphen support.
- Event ordering rules, so holidays can appear before name days.
- Warning when one selector matches zero days or unexpectedly many days.

Example enhanced XML:

```xml
<event>
  <day
    id="midsummer-eve"
    xpath="/calendar/year/month[6]/day[@index &gt;= 19 and @index &lt;= 25 and @weekday = 5]"
    category="observance">
    <name>Midsommarafton</name>
  </day>
</event>
```

Optional friendlier syntax:

```xml
<event>
  <day rule="firstMoonPhaseAfter(8, 'full') + 21d">
    <name>Example event</name>
  </day>
</event>
```

The rule syntax should be sugar. The durable interchange format remains generated facts plus selectors.

### Stage 5: Renderable Model

After events are applied, produce a JSON model optimized for UI/rendering:

```ts
type CalendarProject = {
  settings: CalendarSettings;
  pages: CalendarPage[];
};

type CalendarPage = {
  month: number;
  image?: ProjectImage;
  weeks: CalendarWeek[];
};

type CalendarDay = {
  date: string;
  dayNumber: number;
  weekday: number;
  weekNumber: number;
  isOutsideMonth: boolean;
  isHoliday: boolean;
  names: CalendarName[];
  events: CalendarEvent[];
  facts: Record<string, unknown>;
};
```

Keep the generated XML available for advanced inspection and regression tests, but render the UI from typed JSON.

## Print And Layout

The app should treat print as a primary output, not an afterthought.

First layout: recreate `ClassicLayout` in modern HTML/CSS:

- One page per month.
- Optional month title.
- Month photo at the top.
- Calendar grid below.
- Week numbers at the left.
- Info text on the right edge.
- Holiday coloring.
- Flag markers.
- Moon phase markers.
- Footer with year.
- Configurable paper size, unit, margins, month title size, weekday label size, and image ratio.

Use CSS physical units:

```css
@page {
  size: 210mm 297mm;
  margin: 0;
}
```

Rendering strategy:

- Interactive preview uses the same components as print.
- Print route uses fixed page boxes and print CSS.
- Export uses the print route, so screen preview and PDF output cannot drift too far apart.
- Add preflight checks for missing images, image aspect ratio mismatch, low image resolution, overflowing text, and unmatched selectors.

## UI Plan

Main screens/panels:

- Project toolbar: source, year, locale/time zone, week numbering, starting weekday, layout, export.
- Page preview: month pages at print aspect ratio with zoom.
- Month image panel: drag/drop images, crop/fit controls, per-month assignment.
- Calendar source panel: choose built-in source or import XML.
- Event/rule panel: list event rules, selector status, matched dates.
- Facts inspector: click a day and see generated facts, events, and source names.
- Export panel: PDF settings, paper size, margins, preflight results.

The MVP can start with a single editor screen and collapsible side panels.

## Data And Files

Suggested structure:

```text
src/
  app/
    components/
    routes/
    styles/
  core/
    calendar/
    calculations/
    events/
    xml/
    render-model/
  data/
    calendars/
    images/
  test/
    fixtures/
```

Import the old XML calendars as fixtures first. Because `/Calrendar` is ignored by `.gitignore`, copy normalized source calendars into `src/data/calendars` only when the new app needs tracked examples.

Project export format:

```text
physicalendar-project.zip
  project.json
  calendars/source.xml
  images/01.jpg
  images/02.jpg
  generated/year-facts.xml
```

## Compatibility Strategy

Do not try to run the old XSLT in production. Use it as a reference.

Compatibility targets:

- Same day counts and leap-day behavior.
- Same ISO/US week numbering for representative years.
- Same Easter dates as legacy output.
- Same moon phase event days for representative years.
- Same equinox/solstice day markers for representative years.
- Same XPath event matches for Sweden, Norway, and United States fixtures.

Useful tests:

- Generate old-style facts for years 1900, 2000, 2009, 2024, 2027, and 2099.
- Verify event selectors match known holiday dates.
- Snapshot generated XML for a small `Empty.xml` fixture.
- Visual regression snapshots of print pages.
- PDF smoke test that checks page count, physical page size, and non-empty output.

## Implementation Phases

### Phase 1: Engine Spike

- Scaffold TypeScript app and test setup.
- Implement typed calendar source model.
- Parse existing XML source files.
- Generate a year facts document.
- Port leap year, weekday, ISO/US week, Easter, moon phase, and sun event calculations.
- Evaluate existing `@xpath` event selectors against generated facts.
- Add tests against Sweden, Norway, and United States samples.

### Phase 2: First Usable Web App

- Build the editor shell.
- Add calendar source/year/week/start-day settings.
- Render a simple monthly grid preview.
- Add event/facts inspector.
- Add basic XML import/export.
- Add local project persistence.

### Phase 3: Print Calendar MVP

- Recreate Classic layout in HTML/CSS.
- Add month image assignment.
- Add paper size, unit, margin, and image ratio controls.
- Add print route.
- Add browser print/PDF export.
- Add preflight warnings.

### Phase 4: Better Authoring

- Add event rule editor.
- Add selector validation and matched-date previews.
- Add a friendly rule builder for common patterns:
  - fixed date
  - nth weekday in month
  - last weekday in month
  - offset from Easter
  - offset from calculated moon/sun event
  - range plus weekday
- Compile friendly rules into the same event pipeline.

### Phase 5: Robust PDF And Sharing

- Add deterministic PDF export through a local/headless renderer if browser export is not enough.
- Add project zip import/export.
- Add template/layout packs.
- Add optional server deployment path.
- Add visual regression tests for core templates.

## Open Design Decisions

- Whether the app should stay fully browser-only or include a small local/server export process for best PDF reliability.
- Whether XML remains the primary editable format forever, or whether JSON/YAML project files become the main user-facing format with XML kept as an import/export format.
- How much custom rule syntax to add before XPath becomes enough.
- Whether calculation plugins should be user-authored code, declarative formulas, or curated built-ins only.
- Whether print quality requires professional PDF features beyond Chromium's output.

## Near-Term Recommendation

Start with the engine and compatibility tests. Once the new TypeScript pipeline can parse the old calendar XML, generate facts, and reproduce event matches, the rest of the web app becomes a UI and print-layout problem rather than a calendar-correctness problem.

The first milestone should be:

1. Load `Sweden.xml`.
2. Generate year facts for a selected year.
3. Run the existing XPath events.
4. Show a plain month grid with the correct holidays, flags, moon markers, and name days.
5. Prove the dates with tests.

That milestone preserves the soul of Calrendar while giving the new app a clean modern foundation.
