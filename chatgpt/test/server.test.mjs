import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIUiResourceMetadataSchema, OpenAIUiToolMetadataSchema } from '@openai/mcp-extensions/server';
import { listen } from '../scripts/serve.mjs';

const VERCEL_RESPONSE_LIMIT = 4.5 * 1024 * 1024;
let server;
let endpoint;
let nextId = 1;

async function post(body) {
    return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify(body),
    });
}

async function rpc(method, params = {}) {
    const response = await post({ jsonrpc: '2.0', id: nextId++, method, params });
    assert.equal(response.status, 200);
    const text = await response.text();
    const message = JSON.parse(text);
    assert.equal(message.error, undefined, JSON.stringify(message.error));
    return { result: message.result, bytes: Buffer.byteLength(text) };
}

before(async () => {
    server = await listen();
    endpoint = `http://127.0.0.1:${server.address().port}/api/mcp`;
});

after(() => server.close());

test('initialize identifies the pdfspacer server with an SVG icon', async () => {
    const { result } = await rpc('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'pdfspacer-test', version: '1.0.0' },
    });
    assert.equal(result.serverInfo.name, 'pdfspacer');
    assert.match(result.serverInfo.icons[0].src, /^data:image\/svg\+xml,/);
    assert.ok(result.capabilities.tools);
    assert.ok(result.capabilities.resources);
});

test('tools/list exposes both entrypoint tools on the editor resource', async () => {
    const { result } = await rpc('tools/list');
    const tools = Object.fromEntries(result.tools.map(tool => [tool.name, tool]));
    assert.deepEqual(Object.keys(tools).sort(), ['edit_pdf_file', 'open_pdf_editor']);

    const open = tools.open_pdf_editor;
    assert.deepEqual(open._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }]);
    assert.deepEqual(open.annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    assert.equal(open.inputSchema.type, 'object');
    assert.deepEqual(open.inputSchema.properties, {});

    const edit = tools.edit_pdf_file;
    assert.deepEqual(edit._meta['openai/ui'].entrypoints, [{ type: 'file', extensions: ['.pdf'] }]);
    assert.deepEqual(edit.annotations, { readOnlyHint: false, destructiveHint: true, openWorldHint: false });
    assert.deepEqual(edit.inputSchema.required, ['file']);
    assert.deepEqual(edit.inputSchema.properties.file.required, ['name', 'resourceUri']);

    for (const tool of result.tools) {
        assert.equal(tool._meta.ui.resourceUri, 'ui://pdfspacer/editor');
        assert.ok(OpenAIUiToolMetadataSchema.safeParse(tool._meta['openai/ui']).success, tool.name);
        assert.ok(tool.description.length > 40, tool.name);
    }
});

test('resources/read returns the self-contained app HTML with fullscreen display metadata', async () => {
    const { result, bytes } = await rpc('resources/read', { uri: 'ui://pdfspacer/editor' });
    const [content] = result.contents;
    assert.equal(content.uri, 'ui://pdfspacer/editor');
    assert.equal(content.mimeType, 'text/html;profile=mcp-app');
    assert.match(content.text, /^<!DOCTYPE html>/);
    assert.match(content.text, /id="saveToChatGptBtn"/);
    assert.doesNotMatch(content.text, /<script[^>]*\ssrc=/i);
    assert.doesNotMatch(content.text, /<link[^>]*\shref=/i);
    assert.deepEqual(content._meta['openai/ui'], { availableDisplayModes: ['fullscreen'], preferredDisplayMode: 'fullscreen' });
    assert.ok(OpenAIUiResourceMetadataSchema.safeParse(content._meta['openai/ui']).success);
    assert.deepEqual(content._meta.ui, { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false });
    assert.ok(bytes < VERCEL_RESPONSE_LIMIT, `resources/read response is ${bytes} bytes`);
    console.log(`# resources/read response: ${bytes} bytes; app HTML: ${Buffer.byteLength(content.text)} bytes`);
});

test('resources/list advertises the editor resource', async () => {
    const { result } = await rpc('resources/list');
    assert.deepEqual(result.resources.map(resource => [resource.uri, resource.mimeType]), [['ui://pdfspacer/editor', 'text/html;profile=mcp-app']]);
});

test('both tools accept their entrypoint arguments and leave the work to the UI', async () => {
    const calls = [
        ['open_pdf_editor', {}],
        ['edit_pdf_file', { file: { name: 'worksheet.pdf', resourceUri: 'host-resource://worksheet' } }],
    ];
    for (const [name, args] of calls) {
        const { result } = await rpc('tools/call', { name, arguments: args });
        assert.equal(result.isError, undefined, name);
        assert.deepEqual(result.content, []);
        assert.deepEqual(result.structuredContent, { opened: true });
    }
});

test('edit_pdf_file rejects input without a file', async () => {
    const { result } = await rpc('tools/call', { name: 'edit_pdf_file', arguments: {} });
    assert.equal(result.isError, true);
});

test('only POST reaches the stateless transport', async () => {
    const get = await fetch(endpoint, { headers: { Accept: 'text/event-stream' } });
    assert.equal(get.status, 405);
    const preflight = await fetch(endpoint, { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
    const notification = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(notification.status, 202);
});
