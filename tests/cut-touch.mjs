// Run: python3 -m http.server 8000, then node tests/cut-touch.mjs [base URL].
import { chromium } from 'file:///Users/rishabhsai/code/pdfspacer/chatgpt/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts } = require('/Users/rishabhsai/code/pdfspacer/chatgpt/node_modules/pdf-lib/cjs/index.js');
const baseURL = process.argv[2] || 'http://127.0.0.1:8000';
const artifactDirectory = join(tmpdir(), 'pdfspacer-cut-touch');
await mkdir(artifactDirectory, { recursive: true });
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 3; i++) {
    const sheet = pdf.addPage([595.28, 841.89]);
    sheet.drawText(`Cut gesture check - page ${i}`, { x: 50, y: 785, size: 20, font });
    for (let row = 1; row <= 16; row++) {
        sheet.drawText(`Question ${row}. Leave room for your answer.`, { x: 50, y: 755 - row * 40, size: 12, font });
    }
}
const buffer = Buffer.from(await pdf.save());
let failures = 0;
async function check(name, assertion) {
    try {
        if (!await assertion()) throw new Error('assertion was false');
        console.log(`PASS ${name}`);
    } catch (error) {
        failures++;
        console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`);
    }
}
async function openPDF(page) {
    await page.goto(baseURL);
    await page.evaluate(() => {
        window.cutEvents = [];
        window.SpacerAnalytics = { enabled: false, track: (event, properties) => window.cutEvents.push({ event, ...properties }) };
    });
    await page.locator('#pdfInput').setInputFiles({ name: 'cut-check.pdf', mimeType: 'application/pdf', buffer });
    await page.waitForSelector('.pdf-page canvas');
    await page.waitForFunction(() => !document.querySelector('#cutBtn').disabled);
}
async function point(page, fraction, pageNumber = 1) {
    const box = await page.locator('.pdf-page').nth(pageNumber - 1).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height * fraction };
}
async function drag(page, start, end) {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();
}
async function selectedTool(page) {
    return await page.locator('#cutBtn').getAttribute('aria-pressed') === 'false'
        && await page.locator('#selectBtn').getAttribute('aria-pressed') === 'true';
}
const browser = await chromium.launch({ channel: 'chromium' });
try {
    const mouseContext = await browser.newContext({ viewport: { width: 1280, height: 1180 } });
    const mouse = await mouseContext.newPage();
    await openPDF(mouse);
    await mouse.locator('#cutBtn').click();
    await drag(mouse, await point(mouse, 0.30), await point(mouse, 0.45));
    await check('mouse drag creates exactly one cut', async () => {
        await mouse.waitForSelector('.cut-mark', { state: 'attached', timeout: 3000 });
        return await mouse.locator('.cut-mark').count() === 1;
    });
    await check('mouse cut returns to Select', () => selectedTool(mouse));
    await check('mouse cut stays selected and reports drag input and millimetres', async () => {
        const events = await mouse.evaluate(() => window.cutEvents.filter(event => event.event === 'section_cut'));
        return await mouse.locator('.cut-mark.selected').count() === 1 && events.length === 1 && events[0].input === 'drag' && events[0].mm === 45;
    });
    await check('cut guidance survives autosave completion', async () => {
        await mouse.waitForFunction(() => !window.pdfSpacer.saving);
        return await mouse.locator('#status').textContent() === 'Removed 45 mm. Select the dashed line to restore it.';
    });
    await drag(mouse, await point(mouse, 0.55), await point(mouse, 0.65));
    await check('second mouse drag creates no extra cut', async () => await mouse.locator('.cut-mark').count() === 1);
    await mouse.locator('#cutBtn').click();
    const click = await point(mouse, 0.70);
    await mouse.mouse.click(click.x, click.y);
    await check('mouse click without drag shows the existing hint', async () => await mouse.locator('#status').textContent() === 'Drag over the part of the page you want to remove');
    await mouse.keyboard.press('Escape');
    await check('Escape exits mouse Cut mode', () => selectedTool(mouse));
    await mouseContext.close();

    const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 820, height: 1180 } });
    const touch = await touchContext.newPage();
    await openPDF(touch);
    await touch.locator('#cutBtn').click();
    const session = await touchContext.newCDPSession(touch);
    const start = await point(touch, 0.70);
    const scrollBefore = await touch.locator('#viewerContainer').evaluate(element => element.scrollTop);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= 12; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y - step * 20 }] });
        await touch.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await check('touch scroll creates no cut or start marker', async () => await touch.locator('.cut-mark, .cut-start').count() === 0);
    await check('touch scroll moves the document viewport', async () => {
        await touch.waitForFunction(before => document.querySelector('#viewerContainer').scrollTop > before + 20, scrollBefore, { timeout: 3000 });
        return true;
    });
    // Let native scroll momentum settle, then return to the top for the two-tap check.
    await touch.waitForTimeout(500);
    await touch.locator('#viewerContainer').evaluate(element => { element.scrollTop = 0; });
    const first = await point(touch, 0.30);
    await touch.touchscreen.tap(first.x, first.y);
    await check('first touch tap places the start marker', async () => {
        await touch.waitForSelector('.cut-start', { state: 'attached', timeout: 3000 });
        return await touch.locator('.cut-start .spacer-label').textContent() === 'Tap where the removed part ends';
    });
    await touch.screenshot({ path: join(artifactDirectory, 'cut-start.png') });
    const second = await point(touch, 0.45);
    await touch.touchscreen.tap(second.x, second.y);
    await check('second touch tap creates exactly one cut', async () => {
        await touch.waitForSelector('.cut-mark', { state: 'attached', timeout: 3000 });
        return await touch.locator('.cut-mark').count() === 1 && await touch.locator('.cut-start').count() === 0;
    });
    await check('touch cut returns to Select', () => selectedTool(touch));
    await check('touch cut stays selected and reports tap input and millimetres', async () => {
        const events = await touch.evaluate(() => window.cutEvents.filter(event => event.event === 'section_cut'));
        return await touch.locator('.cut-mark.selected').count() === 1 && events.length === 1 && events[0].input === 'tap' && events[0].mm === 45;
    });

    await touch.locator('#cutBtn').click();
    const pending = await point(touch, 0.60);
    await touch.touchscreen.tap(pending.x, pending.y);
    await touch.keyboard.press('Escape');
    await check('Escape clears the pending tap and exits Cut mode', async () => await selectedTool(touch) && await touch.locator('.cut-start').count() === 0);
    await touch.locator('#cutBtn').click();
    await touch.touchscreen.tap(pending.x, pending.y);
    await touch.locator('#selectBtn').click();
    await check('changing tools clears the pending tap', async () => await touch.locator('.cut-start').count() === 0);

    await touch.locator('#cutBtn').click();
    await touch.touchscreen.tap(pending.x, pending.y);
    await touch.touchscreen.tap(pending.x, pending.y + 1);
    await check('tap interval under one millimetre creates no cut', async () => await touch.locator('.cut-mark').count() === 1 && await touch.locator('.cut-start').count() === 1);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pending] });
    for (let step = 1; step <= 12; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pending.x, y: pending.y - step * 20 }] });
        await touch.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.waitForTimeout(500);
    await check('scrolling between taps preserves the start and creates no cut', async () => await touch.locator('.cut-start').count() === 1 && await touch.locator('.cut-mark').count() === 1);
    await touch.locator('#viewerContainer').evaluate(element => { element.scrollTop = 0; });
    const otherPage = await point(touch, 0.15, 2);
    await touch.touchscreen.tap(otherPage.x, otherPage.y);
    await check('tapping another page replaces the pending start without cutting', async () => await touch.locator('.pdf-page').nth(0).locator('.cut-start').count() === 0 && await touch.locator('.pdf-page').nth(1).locator('.cut-start').count() === 1 && await touch.locator('.cut-mark').count() === 1);
    await touch.keyboard.press('Escape');

    await touch.locator('#cutBtn').click();
    const penStart = await point(touch, 0.70);
    const penEnd = await point(touch, 0.55);
    const penTap = async position => {
        await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', pointerType: 'pen', button: 'left', clickCount: 1, ...position });
        await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', pointerType: 'pen', button: 'left', clickCount: 1, ...position });
    };
    await penTap(penStart);
    await check('pen first tap places a start marker', async () => await touch.locator('.cut-start').count() === 1);
    await penTap(penEnd);
    await check('reverse-order pen taps commit one cut and return to Select', async () => {
        await touch.waitForFunction(() => document.querySelectorAll('.cut-mark').length === 2);
        return await selectedTool(touch) && await touch.locator('.cut-start').count() === 0;
    });
    await touchContext.close();
} catch (error) {
    failures++;
    console.log(`FAIL test setup or gesture: ${error.message}`);
} finally {
    await browser.close();
}
console.log(`${failures ? 'FAIL' : 'PASS'} cut gesture suite (${failures} failures); screenshot: ${join(artifactDirectory, 'cut-start.png')}`);
process.exitCode = failures ? 1 : 0;
