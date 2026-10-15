# Slice 4: PDF (table export and the project report)

Branch `feature/export-and-scale`. Slice 4 of 7. Builds on the export dialog of slice 3.

## What the user asked for

> "export pdf/csv file option and the option to pick certain ones to do"

CSV and picking were slice 3. This slice adds **PDF** in two places, as agreed ("both" = rows to CSV, plus a project report PDF):

1. **Any table export can be a PDF.** The export dialog gets a **Format** choice, CSV or PDF. The PDF is the same rows and the same chosen
   columns as a landscape A4 table, with a title, the date (UTC), the number of rows and page numbers.
2. **A project report.** On a project page, the ⋯ menu gets **Project report (PDF)**. A dialog offers sections to tick; the PDF is
   built from them: **Summary** (always), **Milestones**, **Tasks**, **Team**, **Costs** (only for people who may see money),
   **History** (admins and the project's manager). Nothing ticked but Summary still gives a one-page summary.

## Design

- Built **in the browser** with `jspdf` and `jspdf-autotable`, loaded only when someone presses Download (a separate chunk), so the app
  does not get heavier for everyone. No server change, no new endpoint; the report reads the same endpoints as the page, for the
  ticked sections only, so a person can never get data the screen would not show them.
- Both libraries were installed from npm at `jspdf@4.2.1`, `jspdf-autotable@5.0.8` (published months ago, `npm audit` clean).
- Text is written with the PDF's built-in Helvetica, which covers Western European text (accents, dashes, curly quotes, bullets,
  euro). Characters outside that set are replaced by `?` rather than printed as garbage; this is a documented limit (no CJK, Cyrillic,
  Arabic until a font is embedded).
- Files: `acme-<people|projects|tasks>-<date>.pdf` for tables; `acme-report-<project-name-as-a-slug>-<date>.pdf` for the report.
- The report's first page: project name, manager, dates, health with every reason, progress numbers, money only if visible. Each
  section then starts under its own heading; long tables continue on new pages with the heading row repeated; every page has
  "ACME Projects · <project> · page n of m" at the foot.
- The Content-Security-Policy (`script-src 'self'`, no `unsafe-eval`) must still hold: verified by running the production build behind
  the real CSP in a browser and generating both PDFs with zero violations.

## Out of scope

Custom fonts (non-Latin text), charts or the pulse bar inside the PDF, scheduled or emailed reports, PDF of the timeline, a PDF
for employees (they have no tables to export except their own tasks; unchanged).

## Tests

`pdf.ts`: a table PDF is a real PDF (`%PDF-` header, page count grows with rows, rows and title appear in the stream), unsupported
characters become `?`, formula-like text is plain text (not a risk in PDF), an empty table still has a page that says so. Report:
each section appears only when ticked, money lines absent when money is null, history absent for a non-manager, long task lists
paginate. Dialog: format switch changes the button and file extension, a failure shows a message. Menu: item appears for the right people,
dialog sections reflect permissions, only ticked sections are fetched. Browser: download both PDFs, read them back (header, page count, text),
axe on both dialogs; production build under the real CSP with no violations.
