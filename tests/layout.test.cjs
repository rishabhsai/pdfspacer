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
test('a full blank page after every page lands on its own A4 sheet for any source size', () => {
    let counter = 0;
    const options = { id: () => `every-${counter++}`, style: 'ruled', ruleSpacing: 20, dotPitch: 10, gridSize: 20, fullPage: true, height: 0 };
    const letter = { width: 612, height: 792 };
    const a4 = { width: layout.WIDTH, height: layout.HEIGHT };
    const geometry = [letter, a4, letter];
    const state = layout.validate(layout.afterEveryPage(geometry, { 2: [{ ...spacer, y: 100 }] }, options), geometry);
    assert.equal(Object.values(state).flat().length, 4);
    const output = layout.paginate(layout.document(geometry, state), 'paginated');
    // Page 2 carries a spacer, so its content spans two sheets before its blank page.
    assert.equal(output.length, 7);
    for (const index of [1, 4, 6]) {
        assert.ok(output[index].items.every(item => item.type === 'spacer'), `sheet ${index + 1} should be blank`);
        near(output[index].items.reduce((sum, item) => sum + item.height, 0), layout.HEIGHT);
    }
    assert.ok(output[0].items.some(item => item.type === 'slice' && item.pageNumber === 1));
    assert.ok(output[2].items.some(item => item.type === 'slice' && item.pageNumber === 2));
    assert.ok(output[3].items.some(item => item.type === 'slice' && item.pageNumber === 2));
    assert.ok(output[5].items.some(item => item.type === 'slice' && item.pageNumber === 3));
});
test('a fixed height after every page converts output points to source units', () => {
    const geometry = [{ width: 300, height: 500 }];
    const state = layout.afterEveryPage(geometry, {}, { id: () => 'x', style: 'plain', ruleSpacing: 20, dotPitch: 10, gridSize: 20, fullPage: false, height: 200 });
    near(state[1][0].height * (layout.WIDTH / 300), 200);
    assert.equal(state[1][0].y, 500);
});
test('A4 sources rounded by PDF.js do not spill a sliver onto an extra sheet', () => {
    const rounded = { width: 595.2756, height: 841.8898 };
    const geometry = Array.from({ length: 30 }, () => rounded);
    assert.equal(layout.paginate(layout.document(geometry, {}), 'paginated').length, 30);
    let counter = 0;
    const options = { id: () => `every-${counter++}`, style: 'plain', ruleSpacing: 20, dotPitch: 10, gridSize: 20, fullPage: true, height: 0 };
    const state = layout.afterEveryPage(geometry, {}, options);
    const output = layout.paginate(layout.document(geometry, state), 'paginated');
    assert.equal(output.length, 60);
    for (let index = 1; index < 60; index += 2) assert.ok(output[index].items.every(item => item.type === 'spacer'), `sheet ${index + 1} should be blank`);
});
