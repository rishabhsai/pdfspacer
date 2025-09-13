Answer Blocks — PDF Reflow Spacer

A minimal browser app to upload a PDF, preview pages with zoom, insert full‑width “answer spaces” that reflow content (no overlays), and export a new flattened PDF that preserves the original vectors/text while inserting blank, ruled, or dot‑grid spacers. Autosaves to localStorage and supports Import/Export of a project (.json).

Quick start
- Prereqs: Node 18+ and pnpm 8+
- Install: `pnpm i`
- Dev server: `pnpm dev`
- Build: `pnpm build`

Key features
- Upload multi‑page PDFs (pdf.js viewer).
- Zoom controls and fit‑to‑width.
- Add “Answer Spaces” by clicking a page, then adjust height and style (Plain, Ruled, Dot).
- Optional “Reflow mode” preview that slices the canvas visually so nothing is covered.
- Export uses pdf-lib’s page embedding + bounding boxes to slice & shift without rasterizing original content.
- Autosave to localStorage; Export/Import project JSON (stores layout + embedded PDF bytes).

How reflow export works (slice & shift)
1) Convert click Y from viewer pixels to PDF points.
2) For each page, sort spacers by Y and build segments: top slice, spacer, next slice, ...
3) Use `PDFDocument.embedPage(page, { left, bottom, right, top })` to crop each slice.
4) Draw slices and spacers to a new document, splitting across pages as needed for overflow.
5) Ruled/dot spacers are rendered with vector lines/circles; output remains selectable and crisp.

Limitations in this first cut
- Reflow preview is simplified for performance; export is authoritative.
- Suggest Blocks is heuristic and may need tuning per PDF.

Project structure
- React + Vite + TypeScript
- State: Zustand
- Viewer: pdf.js (mozilla/pdfjs-dist)
- Export: pdf-lib
- Styles: Tailwind CSS

License
- MIT (see LICENSE if present) or your project’s default.

