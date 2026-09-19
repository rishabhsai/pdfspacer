# PDF Answer Spacer

A powerful web application that allows you to add adjustable blank "answer spaces" between existing content in PDF documents without covering any original text. The app intelligently reflows pages by slicing at insertion points and pushing content below downward, handling page breaks automatically.

## Features

### Core Functionality
- **Slice & Shift Reflow**: Click anywhere on a page to insert a spacer that pushes all content below it down
- **Automatic Page Breaks**: Content that overflows to new pages is handled seamlessly
- **Multiple Spacers**: Add multiple spacers per page with cumulative offset calculations
- **Quality Preservation**: A4 export uses original text and vectors where possible, with an image fallback; long-page export is image-based.

### Spacer Styles
- **Plain**: Clean white space
- **Ruled**: Horizontal lines with adjustable spacing (10-50px)
- **Dot Grid**: Adjustable dot pitch grid pattern (5-30px)

### User Interface
- **PDF Viewer**: Continuous scroll viewer with zoom controls (fit, zoom in/out)
- **Add Space Tool**: Click-to-place spacers with visual preview
- **Properties Panel**: Edit spacer height, position, style, and spacing properties; clear Duplicate/Delete buttons
- **Keyboard Shortcuts**: Arrow keys to nudge spacers, Delete to remove

### Project Management
- **Autosave**: Automatically saves your layout locally
- **Export/Import**: Save and load project files for later editing
- **PDF Export**: Generate print-ready PDFs with inserted spaces

## How to Use

### Getting Started
1. Open `index.html` in a modern web browser
2. Click "Load PDF" to select your PDF file
3. Wait for the PDF to load and display

### Adding Spacers
1. Click the "📏" (Add Space) tool in the sidebar
2. Click anywhere on the PDF page where you want to insert space
3. A spacer will be created at that position, pushing content below it down

### Editing Spacers
1. Click on any spacer to select it (it will highlight in red)
2. Use the Properties Panel to adjust:
   - **Style**: Plain, Ruled, or Dot Grid
   - **Height**: Adjust the spacer height (20-500px)
   - **Position**: Move the spacer up or down
   - **Spacing/Pitch**: Adjust line spacing or dot density
3. Drag spacers to reposition them
4. Use the resize handle (red circle) to adjust height visually
5. Right-click spacers for context menu options

### Keyboard Shortcuts
- **Arrow Keys**: Nudge selected spacer up/down by 5px
- **Delete/Backspace**: Remove selected spacer

### Project Management
- **Save Project**: Export your spacer layout as a JSON file
- **Load Project**: Import a previously saved layout
- **Clear All**: Remove all spacers (with confirmation)

### Exporting
1. Click "Export PDF" to open the export dialog
2. Choose a layout: "Paginated A4" or "Single Long Page"
3. Quality is selected automatically for the chosen layout.
4. Export runs with progress. Paginated export continues content across source pages by default (no forced new page)

## Technical Details

### Architecture
- **Frontend**: Pure HTML5, CSS3, and JavaScript (ES6+)
- **PDF Processing**: PDF.js for rendering and manipulation
- **PDF Generation**: jsPDF for export functionality
- **Storage**: LocalStorage for autosave, JSON files for project export

### Browser Compatibility
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

### Performance
- Optimized for PDFs up to 30 pages
- Smooth interaction with real-time preview
- Efficient memory usage with canvas-based rendering

## File Structure
```
answer-blocks/
├── index.html     # Main application interface
├── styles.css     # Application styling
├── app.js         # Core application logic
├── demo.html      # Simple landing linking to the app
├── AGENTS.md      # Repo agent guidance and conventions
└── README.md      # This documentation
```

## Core Algorithm

The application implements a sophisticated reflow system:

1. **Content Segmentation**: Divides each page into segments based on spacer positions
2. **Offset Calculation**: Calculates cumulative offsets for all spacers on a page
3. **Page Overflow Detection**: Determines when content exceeds page boundaries
4. **Automatic Page Splitting**: Creates new pages when content overflows
5. **Precise Rendering**: Maintains exact positioning and quality in exports

## Limitations

- Maximum recommended PDF size: 30 pages
- Spacer height range: 20-500 pixels
- Browser memory limitations for very large PDFs
- Export quality depends on original PDF resolution

## Suggested Tools and Enhancements

- Undo/redo for spacer edits (Ctrl/Cmd+Z, Shift+Z)
- Snap-to-grid toggle with adjustable grid size
- Quick spacer presets (Small/Medium/Large heights)
- Lock spacer to prevent accidental changes
- Duplicate spacer to next page(s) with same offset
- Nudge increments via modifier keys (1/5/10px)
- Ruler overlay with guides and snapping
- Multi-select spacers for bulk move/delete
- Alignment helpers (distribute vertical spacing)

## Support

This is a standalone web application that runs entirely in the browser. No server setup or installation required - just open `index.html` in your browser and start adding answer spaces to your PDFs!

## Hosting and search visibility

The public site currently resolves to `https://www.pdfspacer.com/`. Keep canonical tags,
Open Graph URLs, JSON-LD, `robots.txt` and `sitemap.xml` consistent with that host.
The homepage targets adding space to PDFs; `/guide` explains the workflow and use cases.
The former `/demo` duplicates the guide and now redirects there.

Use Cloudflare Pages for new deployments unless another provider is explicitly requested.
No build step is needed. Preserve the public domain and clean `/guide` URL when migrating;
Cloudflare Pages serves matching HTML files at extensionless URLs. Configure permanent
redirects from the apex domain and any old hosting domain to the chosen canonical host.
The existing `vercel.json` maintains the current host until migration: clean URLs, a
permanent redirect from the public Vercel alias, and `/demo` → `/guide`. Its static assets
revalidate because their filenames are not content hashed. Do not give changing `app.js`,
`styles.css` or `og.png` a year-long immutable browser cache. The stylesheet URL
includes a version query to bypass copies cached under the previous immutable policy.

After publishing:

1. Check that `/` and `/guide` return 200, `/og.png` is available, and missing pages return 404.
2. Check that apex and legacy URLs redirect to the matching canonical page, without loops.
3. Submit `https://www.pdfspacer.com/sitemap.xml` in the `pdfspacer.com` Search Console property.
4. Inspect the two canonical pages, run a live test, then request indexing once.
5. Compare non-branded query impressions, clicks and positions over comparable periods.
   Track phrases such as “add space to pdf”, “add blank space to pdf”, “add space between
   questions in pdf”, and worksheet answer-space searches. Small samples can vary widely.

The app schema describes real features and the free price; it does not invent ratings or
reviews. Structured data alone does not guarantee a Google rich result or higher rankings.
Keep FAQs useful to readers and avoid creating near-identical pages for keyword variations.

For local review, run `python3 -m http.server 8000`, then visit `/index.html` and `/guide.html`.
Python's simple server does not implement production clean URLs or hosting redirects.
Check the entry page on desktop and a narrow mobile viewport, follow guide anchors, then
load a multi-page PDF, insert and resize a spacer, and export A4 and long-page PDFs.
