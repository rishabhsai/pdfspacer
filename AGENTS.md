# Repository Guidelines

## Project Structure & Module Organization
- `index.html` — main application UI; loads PDF.js and jsPDF from CDNs and `app.js`.
- `app.js` — core logic (`PDFAnswerSpacer` class), rendering, spacer tools, and export.
- `styles.css` — UI styles (buttons, layout, viewer, overlays).
- `demo.html` — lightweight landing/demo that links to `index.html`.
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
- Modes: `Paginated A4` (default) or `Single Long Page`.
- Options: Render Scale (1x/2x/3x) and Image Quality (0.6/0.8/0.9).
- Note: Continuous flow across source pages is enabled by default in Paginated mode; the explicit toggle was removed for simplicity.

## Coding Style & Naming Conventions
- JavaScript: ES6+, 4‑space indent, semicolons, camelCase for variables/functions, PascalCase for classes (`PDFAnswerSpacer`).
- CSS: kebab‑case class names (`.pdf-viewer`, `.spacer-label`), keep selectors shallow and reuse existing utility patterns (`.btn`, `.header`).
- HTML: semantic where practical; double‑quoted attributes. Keep scripts/styles linked as in `index.html` (no bundlers).
- Avoid adding frameworks or build tooling; prefer small, focused functions and DOM APIs.

Viewer/Rendering architecture
- Continuous scroll viewer: renders all pages stacked; `renderCurrentPage(options)` tokenizes to finalize only latest render, preserves scroll, and skips loader during interactive updates.
- Spacer interactions: click‑vs‑drag threshold (5px) avoids accidental drags; drag/resize coalesced via `requestAnimationFrame` and committed on mouseup.
- Page break preview: dashed overlays from A4 aspect; toggle in header.
- Placement guide: currently not exposed in UI.
- Context menu: edit, delete, duplicate.
- Last-used spacer preset remembered and applied to new spacers.
- Export pipelines: PDF.js rendering onto canvases; optional continuous-flow pagination (enabled by default in Paginated mode).

## Testing Guidelines
- No formal test suite yet. Favor manual flows and small, testable helpers.
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
- Handle user PDFs locally; do not transmit files or add network calls.
- Avoid eval/dynamic script injection; keep DOM interactions scoped.
