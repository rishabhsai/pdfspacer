/* Shared geometry: source coordinates are PDF.js viewport units; output is A4 points. */
const SpacerLayout = (() => {
    const WIDTH = 595.275590551;
    const HEIGHT = 841.88976378;
    // PDF.js rounds page sizes, so an A4 source can overrun a sheet by a few microns; slivers below this are dropped rather than spilling onto a new sheet.
    const EPSILON = 0.05;
    const styles = ['plain', 'ruled', 'squared', 'dot-grid'];
    const number = (value, min, max, name) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
            throw new Error(`${name} must be between ${min} and ${max}.`);
        }
        return value;
    };
    function validate(input, geometry) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid spacer layout.');
        const result = {};
        const ids = new Set();
        for (const [key, list] of Object.entries(input)) {
            const page = Number(key);
            if (!Number.isInteger(page) || page < 1 || page > geometry.length || !Array.isArray(list)) {
                throw new Error('The layout contains an invalid page.');
            }
            result[page] = list.map(item => {
                if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('Invalid or duplicate spacer ID.');
                ids.add(item.id);
                if (!styles.includes(item.style)) throw new Error('Unknown paper style.');
                return {
                    id: item.id,
                    y: number(item.y, 0, geometry[page - 1].height, 'Position'),
                    height: number(item.height, 1, 10000, 'Height'),
                    style: item.style,
                    ruleSpacing: number(item.ruleSpacing ?? 20, 2, 100, 'Line spacing'),
                    dotPitch: number(item.dotPitch ?? 10, 2, 100, 'Dot spacing'),
                    gridSize: number(item.gridSize ?? 20, 2, 100, 'Grid spacing')
                };
            }).sort((a, b) => a.y - b.y);
        }
        return result;
    }
    function page(geometry, spacers = []) {
        const factor = WIDTH / geometry.width;
        const items = [];
        let sourceY = 0;
        let top = 0;
        for (const spacer of [...spacers].sort((a, b) => a.y - b.y)) {
            if (spacer.y > sourceY) {
                const height = (spacer.y - sourceY) * factor;
                items.push({ type: 'slice', sourceY, top, height, factor });
                top += height;
            }
            items.push({ type: 'spacer', spacer, top, height: spacer.height * factor, factor });
            top += spacer.height * factor;
            sourceY = spacer.y;
        }
        if (sourceY < geometry.height) {
            items.push({ type: 'slice', sourceY, top, height: (geometry.height - sourceY) * factor, factor });
            top += (geometry.height - sourceY) * factor;
        }
        return { items, height: top, factor };
    }
    function document(geometry, state) {
        let height = 0;
        const pages = geometry.map((size, index) => {
            const layout = page(size, state[index + 1]);
            const result = { ...layout, offset: height, pageNumber: index + 1 };
            height += layout.height;
            return result;
        });
        return { pages, height };
    }
    /* Appends one spacer to the foot of every page. `height` is output points; a full page is padded so it begins on a fresh A4 sheet. */
    function afterEveryPage(geometry, state, options) {
        const { id, style, ruleSpacing, dotPitch, gridSize } = options;
        const result = { ...state };
        let offset = 0;
        geometry.forEach((size, index) => {
            const number = index + 1;
            const layout = page(size, result[number]);
            const end = offset + layout.height;
            let height = options.height;
            if (options.fullPage) {
                const remainder = end % HEIGHT;
                const pad = remainder < EPSILON || HEIGHT - remainder < EPSILON ? 0 : HEIGHT - remainder;
                height = HEIGHT + pad;
            }
            const spacer = { id: id(), y: size.height, height: height / layout.factor, style, ruleSpacing, dotPitch, gridSize };
            result[number] = [...(result[number] || []), spacer];
            offset = end + height;
        });
        return result;
    }
    function sourceAt(layout, top) {
        const point = Math.max(0, Math.min(top, layout.height));
        for (const item of layout.items) {
            if (point <= item.top + item.height) {
                return item.type === 'spacer' ? item.spacer.y : item.sourceY + (point - item.top) / item.factor;
            }
        }
        return 0;
    }
    function paginate(layout, mode) {
        if (!['paginated', 'long'].includes(mode)) throw new Error('Choose an export layout.');
        const pageHeight = mode === 'long' ? layout.height : HEIGHT;
        const pages = [];
        for (const source of layout.pages) {
            for (const item of source.items) {
                let used = 0;
                while (used < item.height - EPSILON) {
                    const absolute = source.offset + item.top + used;
                    const index = Math.floor((absolute + EPSILON) / pageHeight);
                    const top = Math.max(0, absolute - index * pageHeight);
                    const height = Math.min(item.height - used, pageHeight - top);
                    if (height < EPSILON) break;
                    pages[index] ??= { width: WIDTH, height: pageHeight, items: [] };
                    pages[index].items.push({ ...item, pageNumber: source.pageNumber, top, height,
                        sourceY: item.type === 'slice' ? item.sourceY + used / item.factor : undefined,
                        patternOffset: used });
                    used += height;
                }
            }
        }
        return pages;
    }
    class History {
        constructor(state = {}) { this.current = state; this.past = []; this.future = []; }
        commit(state) {
            if (JSON.stringify(state) === JSON.stringify(this.current)) return false;
            this.past.push(this.current);
            if (this.past.length > 100) this.past.shift();
            this.current = state;
            this.future = [];
            return true;
        }
        undo() { if (this.past.length) { this.future.push(this.current); this.current = this.past.pop(); return true; } return false; }
        redo() { if (this.future.length) { this.past.push(this.current); this.current = this.future.pop(); return true; } return false; }
    }
    return { WIDTH, HEIGHT, validate, page, document, afterEveryPage, sourceAt, paginate, History };
})();
