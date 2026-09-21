# PDFSpacer

Insert writing space between existing PDF questions. Original content below each insertion point moves down; export the result as A4 pages or one long page. Processing and session storage stay in the browser.

## Run locally

Run `python3 -m http.server 8000` and open `http://localhost:8000`. There is no build step or package installation. The app uses version-pinned PDF.js and pdf-lib scripts from CDNs. Python's server uses `/guide.html`; production serves the clean `/guide` URL.

## Editing

- Choose a PDF or try the bundled sample. Select **Add space**, then click in a clear horizontal gap below a question.
- Select a spacer to edit its height, position and plain, ruled, squared or dot-grid style. Measurements show millimetres on exported A4 paper.
- Drag the body to move a spacer or its bottom handle to resize it. Pointer Events support mouse, pen and touch. On narrow screens, properties sit below the document.
- Duplicate and Delete are in the properties panel. Undo/Redo includes completed drags, resizes, property edits, imported layouts and Clear all spaces.
- Keyboard: Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z or Ctrl+Y redo; Delete removes a selected spacer; arrows move it, Shift+arrows move farther.
- A4 break guides use the export layout. **Export PDF → Preview** renders the actual output PDF before downloading.

## Saving and export

PDF bytes and the layout are saved locally in IndexedDB. Replacing a document writes both records in one transaction. Completed edits save their validated layout independently of rendering. A visible warning identifies failed autosave; Download layout provides a separate JSON copy. The one-time upgrade imports the previous editor's localStorage layout into IndexedDB.

**Project → Download layout** saves a JSON layout, not the original document. Keep both. Load layout verifies the PDF fingerprint and rejects invalid geometry without replacing existing edits. **Clear session** removes the stored PDF and layout from this browser.

Both export modes use the same vector pipeline. Source content is scaled to A4 width, then flows continuously across source pages. The PDF.js page transform accounts for rotation and crop origin. Pagination clips source slices using matching source and destination coordinates. Long pages use PDF 1.7 UserUnit for dimensions beyond the default 200-inch limit.

The output preserves original text and graphics. Scans stay images. Interactive forms, annotations, document outlines and clickable links are not carried into the reflowed PDF. Place insertion points in clear gaps: the tool does not detect question boundaries or edit the source words. A4 page boundaries can split content; check the export preview before printing. Very large documents remain constrained by browser memory and PDF reader capabilities.

## Files

- `index.html`, `styles.css`: upload-first workspace and responsive editor UI.
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

Tests cover small/non-A4 pagination, mixed widths, preserved source intervals, insertion coordinate mapping, long-document geometry, invalid imports, undo/redo and pattern continuity across page boundaries.

Browser sanity checks:

1. Open a multi-page PDF. Insert, resize, move, duplicate and delete spaces. Check every source page remains visible.
2. Edit a height, refresh and verify it restores. Check Undo/Redo and reject a negative height or a layout for a different PDF.
3. At 120% zoom, move a spacer 120 screen pixels; the output movement should be 100 points. One drag should undo in one step.
4. Check a 390px viewport: Fit must fit the page and touch controls must remain available.
5. Export A4 and long-page PDFs. Include small pages, rotated/cropped pages, mixed sizes, blank pages, a scanned page and an 18-page document. Inspect the first and last source content visually, not just extracted text.
6. Check Export → Preview and actual downloaded PDFs. Clear session and verify the landing page returns.

## Hosting and SEO

Production is the existing Vercel project, explicitly chosen by the owner, at `https://www.pdfspacer.com/`. No build command is required. `vercel.json` serves clean URLs, redirects `/demo` to `/guide`, and revalidates static assets. Vercel project domain settings permanently redirect the apex domain and `pdfspacer.vercel.app` to `www.pdfspacer.com` (308). `.vercelignore` excludes environment files, local project metadata, documentation and tests.

The homepage opens directly to the PDF workspace, with a file picker, drop area and sample. A compact help disclosure and the linked guide explain PDF spacing without a separate marketing page. Metadata, canonical tags, sitemap, Open Graph image and JSON-LD must use the same public host. Do not invent reviews, ratings or create duplicate pages for keyword variations.

After publishing, verify homepage/guide/sample routes and redirects. Use the `sc-domain:pdfspacer.com` Search Console property to monitor non-branded query impressions and clicks over comparable periods. Sitemap: `https://www.pdfspacer.com/sitemap.xml`. New content does not guarantee rankings.
