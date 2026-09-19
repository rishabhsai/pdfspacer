const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const layout = vm.runInNewContext(fs.readFileSync('layout.js', 'utf8') + '; SpacerLayout');
const page = { width: 300, height: 500 };
const spacer = { id: 'space-1', y: 150, height: 100, style: 'ruled' };
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.00001, `${a} != ${b}`);

test('small pages retain their full source height across A4 boundaries', () => {
    const output = layout.paginate(layout.document([page], {}), 'paginated');
    assert.equal(output.length, 2);
    const slices = output.flatMap(page => page.items);
    near(slices.reduce((sum, slice) => sum + slice.height / slice.factor, 0), 500);
    near(slices[1].sourceY, slices[0].height / slices[0].factor);
});
test('mixed page widths and multiple insertions conserve every source interval', () => {
    const geometry = [page, { width: 842, height: 595 }];
    const state = layout.validate({ 1: [spacer, { ...spacer, id: 'second', y: 400 }], 2: [{ ...spacer, id: 'third' }] }, geometry);
    const output = layout.paginate(layout.document(geometry, state), 'paginated');
    for (let number = 1; number <= 2; number++) {
        const slices = output.flatMap(page => page.items).filter(item => item.type === 'slice' && item.pageNumber === number);
        let position = 0;
        for (const slice of slices) { near(slice.sourceY, position); position += slice.height / slice.factor; }
        near(position, geometry[number - 1].height);
    }
});
test('clicks inside added space resolve to its source insertion point', () => {
    const result = layout.page(page, [spacer]);
    near(layout.sourceAt(result, 200 * result.factor), 150);
    near(layout.sourceAt(result, 300 * result.factor), 200);
});
test('single long output includes all 18 pages and added space', () => {
    const geometry = Array.from({ length: 18 }, () => ({ width: layout.WIDTH, height: layout.HEIGHT }));
    const result = layout.paginate(layout.document(geometry, { 1: [spacer] }), 'long');
    assert.equal(result.length, 1);
    near(result[0].height, 18 * layout.HEIGHT + 100);
    near(result[0].items.at(-1).top + result[0].items.at(-1).height, result[0].height);
});
test('invalid imports are rejected without mutating the valid layout', () => {
    const original = { 1: [spacer] };
    for (const patch of [{ height: -1 }, { height: NaN }, { y: 501 }, { style: '<script>' }, { gridSize: 0 }]) {
        assert.throws(() => layout.validate({ 1: [{ ...spacer, ...patch }] }, [page]));
    }
    assert.throws(() => layout.validate({ 2: [spacer] }, [page]));
    assert.throws(() => layout.validate({ 1: [spacer, spacer] }, [page]));
    assert.equal(original[1][0].height, 100);
});
test('undo restores a completed edit and a new edit invalidates redo', () => {
    const history = new layout.History({});
    history.commit({ 1: [spacer] });
    history.commit({ 1: [{ ...spacer, height: 180 }] });
    assert.ok(history.undo());
    assert.equal(history.current[1][0].height, 100);
    assert.ok(history.redo());
    assert.equal(history.current[1][0].height, 180);
    history.undo(); history.commit({});
    assert.equal(history.redo(), false);
});
test('a spacer spanning an A4 boundary keeps its pattern phase', () => {
    const geometry = [{ width: layout.WIDTH, height: layout.HEIGHT }];
    const result = layout.paginate(layout.document(geometry, { 1: [{ ...spacer, y: 800, height: 100 }] }), 'paginated');
    const spaces = result.flatMap(page => page.items).filter(item => item.type === 'spacer');
    assert.equal(spaces.length, 2);
    near(spaces[1].patternOffset, spaces[0].height);
    near(spaces.reduce((sum, item) => sum + item.height, 0), 100);
});
