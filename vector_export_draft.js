
    async exportPDFVector(progressOverlay, options = {}) {
    const { PDFDocument, rgb } = PDFLib;

    // 1. Load source PDF
    const sourcePdfDoc = await PDFDocument.load(this.pdfData);
    // Copy all pages to the new document so we can embed them
    const pdfDoc = await PDFDocument.create();

    // We need to embed pages to draw them multiple times (visual slicing)
    // copyPages allows us to transfer pages from source to dest, but embedPage is what we need for drawing
    const sourcePages = await pdfDoc.embedPdf(sourcePdfDoc);

    const DPR = options.dpi || 2; // Not used for vector, but kept for interface compat if needed
    const A4_WIDTH = 595.276; // Standard A4 width in points
    const A4_HEIGHT = 841.890; // Standard A4 height in points

    // We will build a continuous "stream" of slices + spacers, then paginate them
    // Each slice is: { type: 'page-slice', pageIndex: number, y: number, height: number } 
    //             or { type: 'spacer', height: number, style: ... }

    const flowItems = [];

    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
        // Update progress
        const progress = (pageNum / this.totalPages) * 100;
        if (progressOverlay) progressOverlay.querySelector('.progress-fill').style.width = progress + '%';

        const pageButtonIndex = pageNum - 1; // 0-based index for access
        const page = sourcePages[pageButtonIndex];
        // Get original page dimensions from the embedded page
        // embeddedPage doesn't have getWidth/getHeight directly? It does: width/height properties
        const vw = page.width;
        const vh = page.height;

        // Get spacers for this page (stored in scale 1.0 coords)
        const pageSpacers = (this.spacers.get(pageNum) || []).sort((a, b) => a.y - b.y);

        let currentY = 0; // Top of the page (in our coordinate system, 0 = top)

        // Generate slices
        for (const spacer of pageSpacers) {
            if (spacer.y > currentY) {
                // Content segment
                const height = spacer.y - currentY;
                flowItems.push({
                    type: 'slice',
                    sourcePageIndex: pageButtonIndex,
                    sourceY: currentY, // Top-down offset in source page
                    width: vw,
                    height: height
                });
            }

            // Spacer segment
            flowItems.push({
                type: 'spacer',
                height: spacer.height,
                style: spacer.style,
                props: spacer // pass full spacer object for styling
            });

            currentY = spacer.y;
        }

        // Remaining content
        if (currentY < vh) {
            const height = vh - currentY;
            flowItems.push({
                type: 'slice',
                sourcePageIndex: pageButtonIndex,
                sourceY: currentY,
                width: vw,
                height: height
            });
        }
    }

    // Now paginate flowItems into A4 pages
    // We'll create pages as we go
    let currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    let currentYPos = A4_HEIGHT; // pdf-lib uses Y=0 at bottom. We'll fill from top (A4_HEIGHT) down.

    for (const item of flowItems) {
        // How much usage does this item need?
        const itemHeight = item.height;

        // If item doesn't fit on current page, we might need to split it or move to next page
        // Simple approach: if it fits, draw it. If not, split it across pages? 
        // Splitting spacers is easy. Splitting slices is harder but possible (just more clipping).

        let remainingHeight = itemHeight;
        let itemOffset = 0; // How much of the item we've drawn so far (from top of item)

        while (remainingHeight > 0) {
            const spaceOnPage = currentYPos; // Space remaining on this page

            if (spaceOnPage <= 0.1) {
                // Page full, new page
                currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
                currentYPos = A4_HEIGHT;
            }

            const chunkHeight = Math.min(remainingHeight, currentYPos);

            // Draw 'chunkHeight' of the item starting at 'itemOffset' (from item top)
            // The item chunk will be placed at currentYPos - chunkHeight (bottom Y)

            const drawY = currentYPos - chunkHeight;

            if (item.type === 'slice') {
                // Draw embedded page with clipping
                // Source page: sourcePages[item.sourcePageIndex]
                // We need to display the region: y=[item.sourceY + itemOffset] to [item.sourceY + itemOffset + chunkHeight]
                // The embedded page needs to be shifted so that this region lands at drawY.
                // 
                // PDF coordinates: (0,0) is bottom-left.
                // Source Page Height: H_src = item.sourcePage.height
                // Content at "Top Y" (from top) corresponds to "Bottom Y" = H_src - TopY
                // 
                // We want to show content starting at sourcetop = item.sourceY + itemOffset
                // This corresponds to source_y_bottom = H_src - (sourcetop + chunkHeight) -- wait
                // 
                // Let's think: 
                // We want to clip a rectangle on the destination page:
                // Rect: x=0, y=drawY, w=A4_WIDTH, h=chunkHeight
                // And draw the source page such that the desired slice lines up.
                // 
                // Source Top Edge (relative to source origin): H_src
                // We want the content at (TopOffset) to appear at (dest_Top)
                // dest_Top = drawY + chunkHeight
                // Content_Top = H_src - (item.sourceY + itemOffset)
                // 
                // Shift = dest_Top - Content_Top
                //       = (drawY + chunkHeight) - (H_src - item.sourceY - itemOffset)

                const page = sourcePages[item.sourcePageIndex];
                const hSrc = page.height;
                const wSrc = page.width;

                // Scale to fit width? 
                // If source width != A4_WIDTH, we should probably scale it?
                // For now, let's assume we fit-to-width or keep original scale.
                // Let's scale to fit A4 width like the raster version does.
                const scale = A4_WIDTH / wSrc;

                const srcTopY = item.sourceY + itemOffset;
                // In unscaled source coords, top of slice is srcTopY from top. 
                // Bottom of slice is srcTopY + (chunkHeight/scale) -- wait, chunkHeight is in DEST points

                // Let's work in DEST/Page coords which are unified by the scale.
                // We clip a region of height 'chunkHeight' on the new page.
                // We place the embedded page scaled by 'scale'.
                // Its top edge (H_src * scale) should be positioned relative to our clip window...
                // 
                // Visual Top of the source page should be at:
                // dest_Y_of_slice_top + (srcTopY * scale)
                // = (drawY + chunkHeight) + (srcTopY * scale) -> No, content is below top.
                // 
                // We want content at srcTopY to be at dest_slice_top.
                // If we place the page at logical (0, y_shift), 
                // The top of the page is at y_shift + (H_src * scale).
                // We want that top to be higher than our slice top by (srcTopY * scale).
                // So: y_shift + (H_src * scale) = (drawY + chunkHeight) + (srcTopY * scale)
                // y_shift = drawY + chunkHeight - (H_src * scale) + (srcTopY * scale) 
                //         = drawY + chunkHeight - (H_src - srcTopY) * scale

                const yShift = drawY + chunkHeight + (srcTopY * scale) - (hSrc * scale);

                currentPage.drawPage(page, {
                    x: 0,
                    y: yShift,
                    width: wSrc * scale,
                    height: hSrc * scale,
                    // We must clip to the chunk area!
                });

                // ISSUE: drawPage doesn't support clipping natively in the options object usually?
                // pdf-lib's drawPage does NOT have a 'clip' option.
                // We must modify the page's clipping path BEFORE drawing.
                // But drawPage appends operators. We need to prepend/append.

                // Actually, we can just use `currentPage.pushOperators`...
                // BUT `drawPage` helper is high level. 
                // We can use:
                // currentPage.moveTo(0, drawY);
                // currentPage.drawRectangle({ x: 0, y: drawY, width: A4_WIDTH, height: chunkHeight });
                // No, that draws a shape.

                // Correct approach for clipping in pdf-lib:
                // 1. Save graphics state (q)
                // 2. Define clip rect: x, y, w, h -> re/W/n
                // 3. Draw content
                // 4. Restore graphics state (Q)

                // Since drawPage adds to end of stream, we can just add the wrapper ops manually?
                // No, drawPage adds the "Do" operator. We need to wrap THAT.
                // But we can't easily wrap a specific drawPage call's output unless we handle the operators manually?
                // 
                // Actually, we can just:
                // 1. Add clip ops.
                // 2. Call drawPage.
                // 3. Add restore ops.
                // PROBABLY works because it's a stream.

                /*
                // Defines a clipping rect
                currentPage.drawRectangle({
                    x: 0, y: drawY, width: A4_WIDTH, height: chunkHeight,
                    borderWidth: 0,
                    color: undefined,
                    borderColor: undefined,
                }) // This just draws? No wait.
                 */

                // Let's use low-level operators for clipping
                const { drawRectangle, popGraphicsState, pushGraphicsState, clip, endPath } = PDFLib;

                // q
                // 0 drawY A4_WIDTH chunkHeight re W n
                // ... drawPage ...
                // Q

                // Helper to limit drawing area
                // Need to access internal operators? 
                // pdf-lib exposes operators via existing methods partially...
                // 
                // Workaround: We can't easily inject 'q' / 'Q' around `drawPage` because `drawPage` might do its own state management?
                // actually drawPage is simple usually.

                // Let's try to just change the clip path of the page context?
                // But clip paths are additive (intersection). 
                // So we must save/restore to reset it.
                // 
                // Maybe we can just:
                // pdfDoc.addPage...
                // perform clip
                // draw
                // ... but we need to draw multiple things on one page.
                // So we MUST use q/Q.

                // NOTE: This assumes pdf-lib exposes raw operators or we can construct them.
                // pdf-lib exposes `pdfDoc.context` etc.
                // 
                // Actually, `PDFPage` has a `pushOperators` method.
                // We can import the operators from PDFLib.
            }

            // ... (Spacer drawing logic) ...

            currentYPos -= chunkHeight;
            remainingHeight -= chunkHeight;
            itemOffset += chunkHeight;
        }
    }

    await pdfDoc.save();
}
