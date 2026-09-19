/* Both output modes draw the same layout with original PDF content. */
const SpacerExport = (() => {
    function pattern(page, item, height, lib) {
        const { rgb } = lib;
        const { spacer, factor, top, patternOffset } = item;
        if (spacer.style === 'plain') return;
        const pitch = (spacer.style === 'ruled' ? spacer.ruleSpacing : spacer.style === 'dot-grid' ? spacer.dotPitch : spacer.gridSize) * factor;
        const first = (Math.floor(patternOffset / pitch) + 1) * pitch - patternOffset;
        const color = rgb(0.76, 0.80, 0.82);
        if (spacer.style !== 'dot-grid') {
            for (let y = first; y < item.height; y += pitch) page.drawLine({ start: { x: 0, y: height - top - y }, end: { x: SpacerLayout.WIDTH, y: height - top - y }, thickness: 0.5, color });
            if (spacer.style === 'squared') {
                for (let x = pitch; x < SpacerLayout.WIDTH; x += pitch) page.drawLine({ start: { x, y: height - top }, end: { x, y: height - top - item.height }, thickness: 0.5, color });
            }
        } else {
            for (let y = first; y < item.height; y += pitch) {
                for (let x = pitch; x < SpacerLayout.WIDTH; x += pitch) page.drawCircle({ x, y: height - top - y, size: 0.6, color });
            }
        }
    }
    async function create(bytes, geometry, state, mode, progress = () => {}) {
        const lib = PDFLib;
        const source = await lib.PDFDocument.load(bytes);
        const output = await lib.PDFDocument.create();
        output.setTitle('PDF with writing space');
        output.setCreator('PDFSpacer');
        const layouts = SpacerLayout.paginate(SpacerLayout.document(geometry, state), mode);
        const embedded = new Map();
        for (const [index, layout] of layouts.entries()) {
            // PDF 1.7 UserUnit preserves physical dimensions beyond the default 200-inch limit.
            const unit = Math.max(1, layout.height / 14400);
            if (unit > 75000) throw new Error('This document exceeds the maximum PDF page size. Choose Paginated A4.');
            const page = output.addPage([layout.width / unit, layout.height / unit]);
            if (unit > 1) page.node.set(lib.PDFName.of('UserUnit'), lib.PDFNumber.of(unit));
            page.pushOperators(lib.pushGraphicsState(), lib.concatTransformationMatrix(1 / unit, 0, 0, 1 / unit, 0, 0));
            for (const item of layout.items) {
                if (item.type === 'spacer') {
                    pattern(page, item, layout.height, lib);
                    continue;
                }
                const geometryPage = geometry[item.pageNumber - 1];
                const sourcePage = source.getPage(item.pageNumber - 1);
                // A PDF page may be intentionally empty, with no content stream to embed.
                if (!sourcePage.node.Contents()) continue;
                if (!embedded.has(item.pageNumber)) {
                    const [left, bottom, right, top] = geometryPage.view;
                    embedded.set(item.pageNumber, await output.embedPage(sourcePage, { left, bottom, right, top }));
                }
                const [a, b, c, d, e, f] = geometryPage.transform;
                const [left, bottom] = geometryPage.view;
                const k = item.factor;
                page.pushOperators(lib.pushGraphicsState(),
                    lib.rectangle(0, layout.height - item.top - item.height, layout.width, item.height), lib.clip(), lib.endPath(),
                    lib.concatTransformationMatrix(k * a, -k * b, k * c, -k * d,
                        k * (a * left + c * bottom + e),
                        layout.height - item.top + k * item.sourceY - k * (b * left + d * bottom + f)));
                page.drawPage(embedded.get(item.pageNumber), { x: 0, y: 0 });
                page.pushOperators(lib.popGraphicsState());
            }
            page.pushOperators(lib.popGraphicsState());
            progress((index + 1) / layouts.length);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        return output.save();
    }
    return { create };
})();
