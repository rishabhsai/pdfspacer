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
test('filling the sheet runs to the next A4 boundary, or adds a sheet when little room is left', () => {
    let counter = 0;
    const options = { id: () => `fill-${counter++}`, style: 'ruled', ruleSpacing: 20, dotPitch: 10, gridSize: 20, fill: true, height: 0 };
    const slide = { width: 720, height: 405 };
    const a4 = { width: layout.WIDTH, height: layout.HEIGHT };
    const geometry = [slide, slide, a4];
    const state = layout.afterEveryPage(geometry, {}, options);
    const output = layout.paginate(layout.document(geometry, state), 'paginated');
    assert.equal(output.length, 4);
    near(output[0].items.reduce((sum, item) => sum + item.height, 0), layout.HEIGHT);
    assert.ok(output[0].items.some(item => item.type === 'spacer') && output[0].items.some(item => item.type === 'slice'));
    assert.ok(output[1].items.some(item => item.type === 'slice' && item.pageNumber === 2));
    assert.ok(output[3].items.every(item => item.type === 'spacer'), 'an A4 page gets a whole extra sheet');
});
test('cuts close the source gap in both exports and never appear on output sheets', () => {
    const cut = { id: 'cut', y: 100, height: 120, style: 'cut' };
    const state = layout.validate({ 1: [cut] }, [page]);
    const result = layout.page(page, state[1]);
    near(result.height / result.factor, 380);
    assert.equal(result.items[1].type, 'cut');
    assert.equal(result.items[1].height, 0);
    near(layout.sourceAt(result, 150 * result.factor), 270);
    for (const mode of ['paginated', 'long']) {
        const slices = layout.paginate(layout.document([page], state), mode).flatMap(sheet => sheet.items);
        assert.ok(slices.every(item => item.type === 'slice'));
        near(slices.reduce((sum, item) => sum + item.height / item.factor, 0), 380);
        assert.ok(slices.every(item => item.sourceY + item.height / item.factor <= 100.00001 || item.sourceY >= 220));
    }
});
test('overlapping cuts and a spacer inside a cut do not restore removed source content', () => {
    const entries = [
        { id: 'cut-1', y: 100, height: 150, style: 'cut' },
        { ...spacer, y: 120, height: 40 },
        { id: 'cut-2', y: 200, height: 100, style: 'cut' }
    ];
    const result = layout.page(page, layout.validate({ 1: entries }, [page])[1]);
    near(result.height / result.factor, 340);
    const space = result.items.find(item => item.type === 'spacer');
    near(space.top / result.factor, 100);
    near(result.items.at(-1).sourceY, 300);
    near(layout.sourceAt(result, 150 * result.factor), 310);
});
test('cuts validate source boundaries, including whole-page cuts', () => {
    const cut = { id: 'cut', y: 0, height: page.height, style: 'cut' };
    const state = layout.validate({ 1: [cut] }, [page]);
    assert.equal(layout.page(page, state[1]).height, 0);
    assert.ok(Number.isFinite(layout.sourceAt(layout.page(page, state[1]), 0)));
    for (const patch of [{ y: 1 }, { height: 0.5 }, { height: Infinity }, { height: NaN }, { y: -1 }]) {
        assert.throws(() => layout.validate({ 1: [{ ...cut, ...patch }] }, [page]));
    }
});
test('fill after every page accounts for cuts before sizing the writing space', () => {
    const geometry = [{ width: layout.WIDTH, height: layout.HEIGHT }];
    const cut = { id: 'cut', y: 100, height: 200, style: 'cut' };
    const state = layout.afterEveryPage(geometry, { 1: [cut] }, { id: () => 'fill', style: 'plain', fill: true });
    near(state[1][1].height, 200);
    const output = layout.paginate(layout.document(geometry, state), 'paginated');
    assert.equal(output.length, 1);
    near(output[0].items.reduce((sum, item) => sum + item.height, 0), layout.HEIGHT);
});

test('Letter sources paginate at their original size without spill', () => {
    const geometry = Array.from({ length: 3 }, () => ({ width: 612, height: 792 }));
    const document = layout.document(geometry, {}, 'letter');
    assert.equal(document.paper, 'letter');
    near(document.width, 612);
    near(document.height, 792);
    const sheets = layout.paginate(document, 'paginated');
    assert.equal(sheets.length, 3);
    sheets.forEach((sheet, index) => {
        near(sheet.width, 612);
        near(sheet.height, 792);
        assert.equal(sheet.items.length, 1);
        near(sheet.items[0].factor, 1);
        near(sheet.items[0].height, 792);
        assert.equal(sheet.items[0].pageNumber, index + 1);
    });
    const long = layout.paginate(document, 'long');
    assert.equal(long.length, 1);
    near(long[0].width, 612);
    near(long[0].height, 3 * 792);
});
test('full blank pages land on their own Letter sheets, including mixed sources and existing space', () => {
    let counter = 0;
    const geometry = [{ width: 612, height: 792 }, { width: 300, height: 400 }, { width: 612, height: 792 }];
    const state = layout.afterEveryPage(geometry, { 3: [spacer] }, {
        id: () => `letter-${counter++}`, style: 'plain', fullPage: true, paper: 'letter'
    });
    const sheets = layout.paginate(layout.document(geometry, state, 'letter'), 'paginated');
    assert.equal(sheets.length, 8);
    for (const index of [1, 4, 7]) {
        near(sheets[index].width, 612);
        near(sheets[index].height, 792);
        assert.ok(sheets[index].items.every(item => item.type === 'spacer'));
        near(sheets[index].items.reduce((sum, item) => sum + item.height, 0), 792);
    }
});
test('Letter fill and fixed heights use the selected sheet dimensions', () => {
    const geometry = [{ width: 720, height: 405 }];
    const options = { id: () => 'letter-fill', style: 'plain', paper: 'letter' };
    const state = layout.afterEveryPage(geometry, {}, { ...options, fill: true });
    const sheets = layout.paginate(layout.document(geometry, state, 'letter'), 'paginated');
    assert.equal(sheets.length, 1);
    near(sheets[0].items.reduce((sum, item) => sum + item.height, 0), 792);
    const fixed = layout.afterEveryPage(geometry, {}, { ...options, height: 200 });
    near(fixed[1][0].height * 612 / 720, 200);
});
test('unknown paper keys are rejected at layout boundaries', () => {
    for (const paper of ['legal', '', 'constructor', '__proto__', null]) {
        assert.throws(() => layout.document([page], {}, paper), /Unknown paper size\./);
        assert.throws(() => layout.page(page, [], paper), /Unknown paper size\./);
        assert.throws(() => layout.afterEveryPage([], {}, { paper }), /Unknown paper size\./);
    }
});
