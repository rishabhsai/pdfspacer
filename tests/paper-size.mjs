import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const modules = process.env.PDFSPACER_NODE_MODULES || '/Users/rishabhsai/code/pdfspacer/chatgpt/node_modules';
const { chromium } = await import(pathToFileURL(join(modules, 'playwright/index.mjs')).href);
const require = createRequire(import.meta.url);
const { PDFDocument } = require(join(modules, 'pdf-lib/cjs/index.js'));
const origin = process.argv[2] || 'http://127.0.0.1:8000';
const artifacts = await mkdtemp(join(tmpdir(), 'pdfspacer-paper-'));
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(30000);

async function check(label, run) {
    try {
        await run();
        console.log(`PASS ${label}`);
    } catch (error) {
        console.error(`FAIL ${label}: ${error.message}`);
        throw error;
    }
}
async function saved() {
    await page.waitForFunction(() => window.pdfSpacer?.pdfDocument && !window.pdfSpacer.saving && !window.pdfSpacer.unsaved);
}
async function download(name) {
    const pending = page.waitForEvent('download');
    await page.locator('#exportConfirmBtn').click();
    const file = await pending;
    const path = join(artifacts, name);
    await file.saveAs(path);
    if (await page.locator('#purposeSkipBtn').isVisible()) await page.locator('#purposeSkipBtn').click();
    await page.locator('#shareDoneBtn').click();
    return PDFDocument.load(await readFile(path));
}
function dimensions(pdf, width, height) {
    assert.ok(pdf.getPageCount() > 0, 'export contains pages');
    pdf.getPages().forEach((sheet, index) => {
        assert.ok(Math.abs(sheet.getWidth() - width) < 0.01, `page ${index + 1} width ${sheet.getWidth()}`);
        assert.ok(Math.abs(sheet.getHeight() - height) < 0.01, `page ${index + 1} height ${sheet.getHeight()}`);
    });
}

try {
    const source = await PDFDocument.create();
    for (let number = 1; number <= 3; number++) {
        const sheet = source.addPage([612, 792]);
        sheet.drawText(`Letter source page ${number}`, { x: 40, y: 740, size: 18 });
        sheet.drawText('Content near the bottom of the original page.', { x: 40, y: 40, size: 12 });
    }
    await page.goto(origin);
    await page.locator('#pdfInput').setInputFiles({ name: 'letter-source.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await source.save()) });
    await saved();
    await check('three-page Letter source is detected automatically', async () => {
        assert.equal(await page.locator('#paperSelect').inputValue(), 'letter');
        assert.equal(await page.locator('.pdf-page').count(), 3);
        assert.equal(await page.evaluate(() => window.pdfSpacer.layout.pages[0].factor), 1);
    });
    await check('Letter selection persists after reload', async () => {
        await page.reload();
        await saved();
        assert.equal(await page.locator('#paperSelect').inputValue(), 'letter');
    });
    await page.locator('.pdf-page').first().click({ position: { x: 150, y: 150 } });
    await check('adding a spacer keeps source coordinates', async () => {
        await page.locator('.spacer').waitFor();
        assert.equal(await page.locator('.spacer').count(), 1);
    });
    const state = await page.evaluate(() => JSON.stringify(window.pdfSpacer.history.current));
    await page.locator('#exportPdfBtn').click();
    await page.screenshot({ path: join(artifacts, 'letter-export.png') });
    await check('paginated Letter download has four 612 x 792 pt sheets', async () => {
        const pdf = await download('letter-spaced.pdf');
        dimensions(pdf, 612, 792);
        assert.equal(pdf.getPageCount(), 4);
    });
    await page.locator('#exportPdfBtn').click();
    await page.locator('#paperSelect').selectOption('a4');
    await check('switching to A4 updates the editor without changing spacers', async () => {
        assert.equal(await page.evaluate(() => JSON.stringify(window.pdfSpacer.history.current)), state);
        assert.ok(await page.locator('.page-break').count() > 0);
        assert.ok((await page.locator('.page-break').allTextContents()).every(text => text.startsWith('A4 page ')));
        assert.ok((await page.locator('#exportDialog [data-paper-label]').textContent()).includes('A4'));
    });
    await check('A4 preview uses the selected paper', async () => {
        await page.locator('#previewBtn').click();
        await page.waitForFunction(() => window.pdfSpacer.previewDocument && !window.pdfSpacer.exporting);
        const size = await page.evaluate(async () => {
            const first = await window.pdfSpacer.previewDocument.getPage(1);
            const viewport = first.getViewport({ scale: 1 });
            return { width: viewport.width, height: viewport.height };
        });
        assert.ok(Math.abs(size.width - 595.28) < 0.01);
        assert.ok(Math.abs(size.height - 841.89) < 0.01);
        await page.locator('#closePreviewBtn').click();
    });
    await check('paginated A4 download has three 595.28 x 841.89 pt sheets', async () => {
        const pdf = await download('a4-spaced.pdf');
        dimensions(pdf, 595.28, 841.89);
        assert.equal(pdf.getPageCount(), 3);
    });
    await check('A4 override and spacer persist after reload', async () => {
        await saved();
        await page.reload();
        await saved();
        assert.equal(await page.locator('#paperSelect').inputValue(), 'a4');
        assert.equal(await page.evaluate(() => JSON.stringify(window.pdfSpacer.history.current)), state);
    });
    await check('mobile export dialog fits and exposes both paper options', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#exportPdfBtn').click();
        const box = await page.locator('#paperSelect').boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= 390);
        await page.locator('#paperSelect').selectOption('letter');
        assert.equal(await page.locator('#paperSelect').inputValue(), 'letter');
        await page.screenshot({ path: join(artifacts, 'letter-export-mobile.png') });
        await page.locator('#exportCancelBtn').click();
        await saved();
    });
    await check('older sessions without a paper record restore as A4', async () => {
        await page.evaluate(() => window.pdfSpacer.storage.transaction(store => store.delete('paper'), 'readwrite'));
        await page.reload();
        await saved();
        assert.equal(await page.locator('#paperSelect').inputValue(), 'a4');
    });
    await check('browser reports no runtime errors', async () => assert.deepEqual(errors, []));
} catch (error) {
    process.exitCode = 1;
    console.error(error.stack);
} finally {
    console.log(`Artifacts: ${artifacts}`);
    await browser.close();
}
