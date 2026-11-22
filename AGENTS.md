# Repository Guidelines

## Project Structure & Module Organization
- `index.html` — main application UI; loads PDF.js and jsPDF from CDNs and `app.js`.
- `app.js` — core logic (`PDFAnswerSpacer` class), rendering, spacer tools, and export.
- `styles.css` — UI styles (buttons, layout, viewer, overlays).
- `guide.html` plus `add-answer-space-to-past-papers.html`, `add-lines-to-pdf-worksheet.html`, `add-space-to-pdf-for-notes.html`, `pdf-homework-spacer.html`, `insert-blank-page-after-every-page-pdf.html`, `add-lines-to-pdf-slides-for-notes.html` — static SEO/guide pages sharing `pages.css`; served at clean URLs (no `.html`) by `vercel.json`. Add new pages to `sitemap.xml` with a `lastmod`.
- `it.html`, `es.html`, `zh.html`, `it/spazio-pdf-appunti.html`, `es/espacio-pdf-apuntes.html`, `zh/pdf-biji-kongbai.html` — Italian, Spanish and Simplified Chinese landing and notes pages, linked with `hreflang` from the English homepage and notes page. The editor itself stays in English; these pages describe it and link to `/`.
- `privacy.html`, `terms.html`: privacy policy and terms of use for the site and the ChatGPT plugin, served at `/privacy` and `/terms`; linked from the homepage footer and listed in `sitemap.xml`.
- `analytics.js` — cookieless PostHog wrapper loaded by every page; inert until `KEY` is set. `SpacerAnalytics.track(event, props)` is the only entry point; `app.js` calls it via `this.track`. Events: `pdf_opened`, `spacer_added`, `section_cut`, `every_page_added`, `slides_hint`, `pdf_exported`, `share_clicked`, `export_purpose`, `feedback`.
- `images/` — real product screenshots (WebP) used by the landing and guide pages.
- `demo.html` — legacy redirect to the guide.
- `README.md` — usage overview and notes.

Keep the app zero‑dependency and browser‑only. If you refactor, preserve a CDN‑friendly structure without a build step.

## Build, Test, and Development Commands
- Run locally (no build):
  - `python3 -m http.server 8000` then open `http://localhost:8000/index.html`.
  - Or open files directly: `index.html` or `demo.html` in a browser.
- Manual sanity checks:
  - Load a multi‑page PDF, add/resize spacers, navigate pages, export, and verify spacing in the output PDF.

Export
- Open Export dialog from `Export PDF`.
- Modes: `Paginated sheets` (default) or `Single long page`; both use the selected paper width.
- The Export dialog's Paper selector offers A4 and US Letter (612 × 792 pt, 8.5 × 11 in). New PDFs use Letter when the first page's aspect ratio is within 2% of Letter, otherwise A4. The setting persists in IndexedDB; older sessions default to A4. Paper changes update the editor immediately and are not undoable.
- `SpacerLayout.PAPERS` defines sheet dimensions; document layouts carry `paper`, `width`, `height` (sheet height), and `contentHeight` (total flow height). Spacer coordinates stay in source units across paper changes.
- Note: Continuous flow across source pages is enabled by default in Paginated mode; the explicit toggle was removed for simplicity.

## Coding Style & Naming Conventions
- JavaScript: ES6+, 4‑space indent, semicolons, camelCase for variables/functions, PascalCase for classes (`PDFAnswerSpacer`).
- CSS: kebab‑case class names (`.pdf-viewer`, `.spacer-label`), keep selectors shallow and reuse existing utility patterns (`.btn`, `.header`).
- HTML: semantic where practical; double‑quoted attributes. Keep scripts/styles linked as in `index.html` (no bundlers).
- Avoid adding frameworks or build tooling; prefer small, focused functions and DOM APIs.

Viewer/Rendering architecture
- Continuous scroll viewer: renders all pages stacked; `renderCurrentPage(options)` tokenizes to finalize only latest render, preserves scroll, and skips loader during interactive updates.
- Cut tool: drag a full-width band to hide it and close the gap; the per-page list stores `{ id, y, height, style: 'cut' }` in source units. A zero-height cut mark selects the band for Restore. Exports crop the original vector content, so hidden text stays in the file and can still be extracted; this is not redaction.
- Spacer interactions: click‑vs‑drag threshold (5px) avoids accidental drags; drag/resize coalesced via `requestAnimationFrame` and committed on mouseup.
- Page break preview: dashed overlays from the selected paper dimensions; toggle in header.
- Placement guide: currently not exposed in UI.
- Context menu: edit, delete, duplicate.
- Last-used spacer preset remembered and applied to new spacers.
- `Every page` toolbar button opens a dialog that appends one spacer to the foot of every page (`SpacerLayout.afterEveryPage`); the full-page option pads to the next selected-paper boundary so each blank page is its own sheet; the fill option runs to the end of the current sheet (or adds a whole sheet when under 40 mm is left). The same button and dialog exist in `chatgpt/app/index.html`. On the main site, PDFs with a landscape majority show a sidebar hint that opens this dialog with fill and ruled lines selected; adding a spacer hides it, and “Not now” remembers dismissal in `localStorage.pdfSpacerSlidesHintDismissed`.
- Export adds a small clickable "Made with pdfspacer.com" line to the last sheet unless the Export dialog checkbox is cleared (`SpacerExport.create(..., { credit })`). After a download the `#sharePrompt` dialog offers Copy link / Share; on the first and tenth export (`localStorage.pdfSpacerExports`) it first shows only the `PURPOSES` chips plus Skip (`export_purpose` event, `purpose: 'skipped'` for Skip), then an optional one-line wish (`feedback` event with `type: 'wish'`) and the share buttons (`#shareSection`, driven by the `PURPOSE_STEPS` table); the chips never appear when analytics is off; and `#feedbackDialog` (opened from any `[data-feedback]` link) sends a `feedback` event, or opens a prefilled GitHub issue when analytics is off. New element ids are bound with null checks because `chatgpt/app/index.html` does not have them.
- Export pipelines: PDF.js rendering onto canvases; optional continuous-flow pagination (enabled by default in Paginated mode).

## Testing Guidelines
- Run layout regression checks with `node --test tests/layout.test.cjs`; verify editor gestures and PDF exports in a browser.
- If introducing automated tests, place them under `tests/` and document how to run them in the PR. Keep tooling lightweight and optional.

## Commit & Pull Request Guidelines
- Commits: imperative mood and concise, similar to history (e.g., “Add squared paper style”, “Fix export scaling”). Use an optional body for rationale.
- PRs must include:
  - Clear description and motivation; link issues if applicable.
  - Screenshots/GIFs for UI changes (viewer, spacers, export results).
  - Any new commands or config changes and concise test steps.

SEO & Branding
- Title and meta tags added in `index.html` (AddSpacePDF). Update responsibly; keep copy concise and keyword‑relevant.

Known toggles and UX
- Page Breaks toggle in header.
- Export settings controlled in modal dialog.
- Loader is hidden by default until a PDF is chosen.


## Security & Configuration Tips
- Libraries are version‑pinned via CDN; update versions deliberately and test large PDFs.
- Handle user PDFs locally; do not transmit files. The only permitted network calls are the pinned CDN libraries and the cookieless analytics events in `analytics.js`; keep `privacy.html` in step with them.
- Avoid eval/dynamic script injection; keep DOM interactions scoped.
