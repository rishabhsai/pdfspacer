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

## Coding Style & Naming Conventions
- JavaScript: ES6+, 4‑space indent, semicolons, camelCase for variables/functions, PascalCase for classes (`PDFAnswerSpacer`).
- CSS: kebab‑case class names (`.pdf-viewer`, `.spacer-label`), keep selectors shallow and reuse existing utility patterns (`.btn`, `.header`).
- HTML: semantic where practical; double‑quoted attributes. Keep scripts/styles linked as in `index.html` (no bundlers).
- Avoid adding frameworks or build tooling; prefer small, focused functions and DOM APIs.

## Testing Guidelines
- No formal test suite yet. Favor manual flows and small, testable helpers.
- If introducing automated tests, place them under `tests/` and document how to run them in the PR. Keep tooling lightweight and optional.

## Commit & Pull Request Guidelines
- Commits: imperative mood and concise, similar to history (e.g., “Add squared paper style”, “Fix export scaling”). Use an optional body for rationale.
- PRs must include:
  - Clear description and motivation; link issues if applicable.
  - Screenshots/GIFs for UI changes (viewer, spacers, export results).
  - Any new commands or config changes and concise test steps.

## Security & Configuration Tips
- Libraries are version‑pinned via CDN; update versions deliberately and test large PDFs.
- Handle user PDFs locally; do not transmit files or add network calls.
- Avoid eval/dynamic script injection; keep DOM interactions scoped.

