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
- **PDF Viewer**: Page-by-page navigation with zoom controls (fit, zoom in/out)
- **Add Space Tool**: Click-to-place spacers with visual preview
- **Properties Panel**: Edit spacer height, position, style, and spacing properties
- **Thumbnails Sidebar**: Quick navigation between pages
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
1. Click "Export PDF" to generate a new PDF with all spacers
2. The export process shows progress and handles page breaks automatically
3. The output PDF maintains original content quality while adding spaces

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
├── index.html          # Main application interface
├── styles.css          # Application styling
├── app.js             # Core application logic
└── README.md          # This documentation
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

## Future Enhancements

- Batch processing for multiple PDFs
- More spacer styles (graph paper, music staff, etc.)
- Undo/redo functionality
- Collaborative editing features
- Cloud storage integration

## Support

This is a standalone web application that runs entirely in the browser. No server setup or installation required - just open `index.html` in your browser and start adding answer spaces to your PDFs!
