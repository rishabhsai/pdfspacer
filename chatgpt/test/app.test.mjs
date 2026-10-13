import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import pdfLib from 'pdf-lib';

const root = new URL('../', import.meta.url);
const SAMPLE = fileURLToPath(new URL('../sample.pdf', root));
const APP_FRAME = 'pdfspacer';
// The MCP Apps default CSP, which ChatGPT applies when ui.csp lists no domains.
const APP_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none'";

let server;
let browser;
let origin;

async function hostBundle() {
    const result = await build({
        stdin: {
            contents: "export { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'; export { z } from 'zod';",
            resolveDir: fileURLToPath(root),
        },
        bundle: true,
        format: 'iife',
        globalName: 'McpHost',
        platform: 'browser',
        write: false,
    });
    return result.outputFiles[0].text;
}

async function startServer() {
    const { html } = await import('../dist/app-html.js');
    const routes = {
        '/host.html': { type: 'text/html', body: await readFile(new URL('test/host.html', root)) },
        '/host.js': { type: 'text/javascript', body: await hostBundle() },
        '/sample.pdf': { type: 'application/pdf', body: await readFile(SAMPLE) },
        '/app.html': { type: 'text/html', body: html, headers: { 'Content-Security-Policy': APP_CSP } },
    };
    const http = createServer((req, res) => {
        const route = routes[new URL(req.url, 'http://localhost').pathname];
        if (!route) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': route.type, ...route.headers }).end(route.body);
    });
    await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
    return http;
}

/** Opens the host and records console errors and every request the app frame makes. */
async function openHost(mode) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    const appRequests = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.frame().name() === APP_FRAME) appRequests.push(request.url()); });
    await page.goto(`${origin}/host.html?mode=${mode}`);
    await page.waitForFunction(() => window.host?.log.initialized);
    const frame = page.frame({ name: APP_FRAME });
    const verify = async () => {
        assert.deepEqual(errors, [], 'console errors');
        assert.deepEqual(appRequests, [`${origin}/app.html`], 'the app document is the only request from the app frame');
        await page.close();
    };
    return { page, frame, app: page.frameLocator(`iframe[name="${APP_FRAME}"]`), verify };
}

const hostLog = page => page.evaluate(() => structuredClone(window.host.log));
const spacerCount = frame => frame.locator('.spacer').count();
const statusShows = (app, text) => app.locator('#status', { hasText: text }).waitFor();

async function waitForDocument(app, name) {
    await app.locator('#documentName', { hasText: name }).waitFor();
    await app.locator('.pdf-page .content-slice').first().waitFor({ state: 'attached' });
}

async function addSpacer(app, frame) {
    const before = await spacerCount(frame);
    await app.locator('.pdf-page').first().click({ position: { x: 200, y: 300 } });
    await frame.waitForFunction(count => document.querySelectorAll('.spacer').length === count, before + 1);
}

async function totalHeight(bytes) {
    const doc = await pdfLib.PDFDocument.load(bytes);
    return doc.getPages().reduce((sum, page) => sum + page.getHeight(), 0);
}

before(async () => {
    server = await startServer();
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
});

after(async () => {
    await browser?.close();
    server?.close();
});

test('file entrypoint: reads the host PDF, saves the spaced PDF back and follows host changes', async () => {
    const { page, frame, app, verify } = await openHost('file');
    await waitForDocument(app, 'sample.pdf');
    let log = await hostLog(page);
    assert.equal(log.reads[0].uri, 'host-resource://sample');
    assert.equal(log.reads[0]._meta['openai/resource'].representation, 'blob');
    assert.equal(await app.locator('#saveToChatGptBtn').isVisible(), true);

    await addSpacer(app, frame);
    await app.locator('#saveToChatGptBtn').click();
    await statusShows(app, 'Saved to ChatGPT');
    log = await hostLog(page);
    const [saved] = log.writes;
    assert.equal(saved.uri, 'host-resource://sample');
    assert.equal(saved.ifMatch, 'v1');
    assert.deepEqual(saved.result, { outcome: 'saved', etag: 'v2' });
    const spaced = Buffer.from(saved.blob, 'base64');
    assert.equal(spaced.subarray(0, 5).toString(), '%PDF-');
    const [inputHeight, outputHeight] = await Promise.all([totalHeight(await readFile(SAMPLE)), totalHeight(spaced)]);
    assert.ok(outputHeight > inputHeight, `output ${outputHeight}pt is taller than input ${inputHeight}pt`);

    // The host echoes our own save as an update; the editor keeps its spacers.
    await page.evaluate(() => window.host.notifyUpdated());
    await page.waitForFunction(() => window.host.log.reads.length === 2);
    await page.waitForTimeout(500);
    assert.equal(await spacerCount(frame), 1);

    // A change made elsewhere reloads the file when nothing is unsaved.
    await page.evaluate(() => window.host.replaceFile(window.host.original));
    await statusShows(app, 'Showing the latest version from ChatGPT');
    assert.equal(await spacerCount(frame), 0);

    // With unsaved spacers the editor keeps them and says so.
    await addSpacer(app, frame);
    await page.evaluate(() => window.host.replaceFile(window.host.original));
    await statusShows(app, 'Your unsaved spaces are kept');
    assert.equal(await spacerCount(frame), 1);

    // Saving over the newer version conflicts and reloads it.
    await app.locator('#saveToChatGptBtn').click();
    await statusShows(app, 'so your spaces were not saved');
    assert.equal(await spacerCount(frame), 0);

    // A limit below the PDF size is reported without discarding the spacers.
    await page.evaluate(() => { window.host.file.maxBytes = 1000; });
    await addSpacer(app, frame);
    await app.locator('#saveToChatGptBtn').click();
    await statusShows(app, 'ChatGPT can save files up to 1 KB');
    assert.equal(await spacerCount(frame), 1);

    log = await hostLog(page);
    assert.deepEqual(log.writes.map(write => [write.ifMatch, write.result.outcome]), [['v1', 'saved'], ['v3', 'conflict'], ['v4', 'too-large']]);
    assert.deepEqual(log.subscriptions, [{ method: 'resources/subscribe', uri: 'host-resource://sample' }]);
    await verify();
});

test('global or thread entrypoint: choose a PDF in the app and download through the host', async () => {
    const { page, frame, app, verify } = await openHost('picked');
    await app.locator('#landing [data-choose-pdf]').waitFor();
    await app.locator('#pdfInput').setInputFiles(SAMPLE);
    await waitForDocument(app, 'sample.pdf');
    assert.equal(await app.locator('#saveToChatGptBtn').isHidden(), true);

    await addSpacer(app, frame);
    await app.locator('#exportPdfBtn').click();
    await app.locator('#exportConfirmBtn').click();
    await page.waitForFunction(() => window.host.log.downloads.length === 1);
    const log = await hostLog(page);
    assert.equal(log.reads.length, 0);
    assert.equal(log.writes.length, 0);
    const [{ resource }] = log.downloads[0].contents;
    assert.equal(resource.uri, 'file:///sample-spaced.pdf');
    assert.equal(resource.mimeType, 'application/pdf');
    assert.ok(await totalHeight(Buffer.from(resource.blob, 'base64')) > await totalHeight(await readFile(SAMPLE)));
    await verify();
});
