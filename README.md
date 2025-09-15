# PDF Answer Spacer

A powerful web application that allows you to add adjustable blank "answer spaces" between existing content in PDF documents without covering any original text. The app intelligently reflows pages by slicing at insertion points and pushing content below downward, handling page breaks automatically.

## Features

### Core Functionality
- **Slice & Shift Reflow**: Click anywhere on a page to insert a spacer that pushes all content below it down
- **Automatic Page Breaks**: Content that overflows to new pages is handled seamlessly
- **Multiple Spacers**: Add multiple spacers per page with cumulative offset calculations
- **Quality Preservation**: Maintains original PDF text and vector quality without rasterization

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
3. Pick Render Scale (1x/2x/3x) and Image Quality
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

## Deploying to Vercel

You can deploy this static site without a build step.

- Option A — via Git:
  - Push this repo to GitHub/GitLab/Bitbucket.
  - In Vercel, create a New Project and import the repo.
  - Framework Preset: "Other". Build and Output: leave empty (no build).
  - Root Directory: repo root. Hit Deploy.

- Option B — via CLI:
  - Install Vercel CLI: `npm i -g vercel`
  - From the repo root: `vercel` (follow prompts) then `vercel --prod` for production.

Included `vercel.json` sets long cache headers for static assets and clean URLs.

## Getting Indexed by Google

1. Use a stable domain (Vercel domain or custom domain) and update:
   - `index.html` `<link rel="canonical" href="https://your-domain.example/">`
   - `robots.txt` Sitemap URL
   - `sitemap.xml` `<loc>` entries
2. Verify your site in Google Search Console:
   - Add property for your domain.
   - Verify via DNS TXT (recommended) or HTML tag.
3. Submit `sitemap.xml` in Search Console.
4. Request Indexing for the homepage (URL Inspection tool).
5. Keep pages crawlable: `robots.txt` allows `/` (already set). Avoid password walls.
6. Optimize basics:
   - Unique `<title>` and meta description (already present).
   - Open Graph tags (present) and JSON‑LD (added).
   - Fast load: CDN libs, caching (via `vercel.json`).
7. Optional: add `demo.html` links back to `/` and relevant anchor text.

After deployment, replace all `your-domain.example` placeholders with your actual domain, redeploy, then re-submit the sitemap.
