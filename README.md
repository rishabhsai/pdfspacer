# PDFSpacer

Insert writing space between existing PDF questions. Original content below each insertion point moves down; export the result as A4 or US Letter sheets, or one long page. Processing and session storage stay in the browser.

## Run locally

Run `python3 -m http.server 8000` and open `http://localhost:8000`. There is no build step or package installation. The app uses version-pinned PDF.js and pdf-lib scripts from CDNs. Python's server uses `/guide.html`; production serves the clean `/guide` URL.

## Editing

- Choose a PDF or try the bundled sample. Select **Add space**, then click in a clear horizontal gap below a question.
- Select a spacer to edit its height, position and plain, ruled, squared or dot-grid style. Measurements show millimetres on the selected export paper.
- Drag the body to move a spacer or its bottom handle to resize it. Pointer Events support mouse, pen and touch. On narrow screens, properties sit below the document.
- Duplicate and Delete are in the properties panel. Undo/Redo includes completed drags, resizes, property edits, imported layouts and Clear all spaces.
- Keyboard: Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z or Ctrl+Y redo; Delete removes a selected spacer; arrows move it, Shift+arrows move farther.
- Page break guides use the export layout. **Export PDF → Preview** renders the actual output PDF before downloading.

## Saving and export

PDF bytes, layout and selected paper size are saved locally in IndexedDB. Replacing a document writes all three records in one transaction. Completed edits save their validated layout independently of rendering. A visible warning identifies failed autosave; Download layout provides a separate JSON copy. The one-time upgrade imports the previous editor's localStorage layout into IndexedDB.

**Project → Download layout** saves a JSON layout, not the original document. Keep both. Load layout verifies the PDF fingerprint and rejects invalid geometry without replacing existing edits. **Clear session** removes the stored PDF, layout and paper setting from this browser.

**Export PDF → Paper** offers A4 and US Letter (8.5 × 11 inches, 612 × 792 points). A newly opened PDF uses Letter when its first page is within 2% of Letter's aspect ratio; other PDFs use A4. Older saved sessions default to A4. Changing paper updates page breaks, measurements and Every page sizing immediately, and persists after reload. Paper changes are not part of Undo/Redo. Existing spacers keep their source coordinates, so their printed millimetre heights change slightly when paper width changes.

Both export modes use the same vector pipeline. Source content is scaled to the selected paper width, then flows continuously across source pages. The PDF.js page transform accounts for rotation and crop origin. Pagination clips source slices using matching source and destination coordinates. Long pages use PDF 1.7 UserUnit for dimensions beyond the default 200-inch limit.

The output preserves original text and graphics. Scans stay images. Interactive forms, annotations, document outlines and clickable links are not carried into the reflowed PDF. Place insertion points in clear gaps: the tool does not detect question boundaries or edit the source words. Sheet boundaries can split content; check the export preview before printing. Very large documents remain constrained by browser memory and PDF reader capabilities.

## Files

- `index.html`, `styles.css`: upload-first workspace, landing content and responsive editor UI.
- `guide.html`, `add-answer-space-to-past-papers.html`, `add-space-to-pdf-for-notes.html`, `pdf-homework-spacer.html`, `pages.css`: static guide pages served at clean URLs in production.
- `images/`: product screenshots used on the landing and guide pages.
- `app.js`: file lifecycle, editing controls, canvas rendering and export preview.
- `layout.js`: validated spacer model, source/destination geometry, pagination and undo history.
- `export.js`: a single pdf-lib exporter for both output modes.
- `storage.js`: serialized IndexedDB transactions.
- `guide.html`, `sample.pdf`: usage guide and locally processed sample worksheet.

Source canvases are cached by page at the current zoom, with six cache entries. Pages rasterize near the viewport. Spacer edits rebuild only the changed page's segments; unaffected page elements remain in place. Stale asynchronous renders cannot replace the current document or layout.

## Verification

Run the optional, dependency-free geometry regression checks with:

```sh
node --test tests/layout.test.cjs
```

Tests cover small/non-A4 pagination, mixed widths, preserved source intervals, insertion coordinate mapping, long-document geometry, invalid imports, undo/redo, pattern continuity across page boundaries, cut bounds, overlapping cuts, and writing space after cuts.

The optional browser regression uses Playwright and pdf-lib from the existing ChatGPT development dependencies, with no dependencies added to the site:

```sh
python3 -m http.server 8000
node tests/paper-size.mjs http://127.0.0.1:8000
```

By default the script reads dependencies from `/Users/rishabhsai/code/pdfspacer/chatgpt/node_modules`; set `PDFSPACER_NODE_MODULES` to use another installation. It generates a three-page Letter PDF, checks detection, both exported paper sizes, preview and session persistence. Screenshots and downloaded PDFs go to a temporary directory printed by the script.

Browser sanity checks:

1. Open a multi-page PDF. Insert, resize, move, duplicate and delete spaces. Check every source page remains visible.
2. Edit a height, refresh and verify it restores. Check Undo/Redo and reject a negative height or a layout for a different PDF.
3. At 120% zoom, move a spacer 120 screen pixels; the output movement should be 100 points. One drag should undo in one step.
4. Check a 390px viewport: Fit must fit the page and touch controls must remain available.
5. Export A4, US Letter and long-page PDFs. Include small pages, rotated/cropped pages, mixed sizes, blank pages, a scanned page and an 18-page document. Inspect the first and last source content visually, not just extracted text.
6. Check Export → Preview and actual downloaded PDFs. Clear session and verify the landing page returns.

## Hosting and SEO

Production is the existing Vercel project, explicitly chosen by the owner, at `https://www.pdfspacer.com/`. No build command is required. `vercel.json` serves clean URLs, redirects `/demo` to `/guide`, and revalidates static assets. Vercel project domain settings permanently redirect the apex domain and `pdfspacer.vercel.app` to `www.pdfspacer.com` (308). `.vercelignore` excludes environment files, local project metadata, documentation and tests.

The homepage opens directly to the PDF workspace, with a file picker, drop area and sample. A compact help disclosure and the linked guide explain PDF spacing without a separate marketing page. Metadata, canonical tags, sitemap, Open Graph image and JSON-LD must use the same public host. Do not invent reviews, ratings or create duplicate pages for keyword variations.

After publishing, verify homepage/guide/sample routes and redirects. Use the `sc-domain:pdfspacer.com` Search Console property to monitor non-branded query impressions and clicks over comparable periods. Sitemap: `https://www.pdfspacer.com/sitemap.xml`. New content does not guarantee rankings.
