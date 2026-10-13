import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { OpenAIFileEntrypointInputSchema } from '@openai/mcp-extensions/server';
import { z } from 'zod';
import { html, iconDataUri } from '../dist/app-html.js';

const EDITOR_URI = 'ui://pdfspacer/editor';
const APP_MIME_TYPE = 'text/html;profile=mcp-app';

const tools = [
    {
        name: 'open_pdf_editor',
        description: 'Open the PDFSpacer editor to add blank, ruled, squared or dot-grid writing space between the questions of a PDF. If the user has a PDF in the thread, tell them to open it with PDFSpacer from the file viewer; otherwise they choose a PDF inside the editor.',
        inputSchema: z.object({}),
        entrypoints: [{ type: 'global' }, { type: 'thread' }],
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    {
        name: 'edit_pdf_file',
        description: 'Open a PDF from the thread in PDFSpacer to insert writing space. Saving replaces the file in ChatGPT with the spaced version.',
        inputSchema: OpenAIFileEntrypointInputSchema,
        entrypoints: [{ type: 'file', extensions: ['.pdf'] }],
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
];

const editorContent = {
    uri: EDITOR_URI,
    mimeType: APP_MIME_TYPE,
    text: html,
    _meta: {
        'openai/ui': { availableDisplayModes: ['fullscreen'], preferredDisplayMode: 'fullscreen' },
        // The app is fully inlined and never touches the network.
        ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false },
    },
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, MCP-Protocol-Version, MCP-Session-Id',
    'Access-Control-Expose-Headers': 'MCP-Protocol-Version, MCP-Session-Id',
};

function createServer() {
    const server = new McpServer({
        name: 'pdfspacer',
        title: 'PDFSpacer',
        version: '0.1.0',
        websiteUrl: 'https://www.pdfspacer.com',
        icons: [{ src: iconDataUri, mimeType: 'image/svg+xml', sizes: ['any'] }],
    });
    for (const tool of tools) {
        server.registerTool(tool.name, {
            title: 'PDFSpacer',
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
            _meta: { ui: { resourceUri: EDITOR_URI }, 'openai/ui': { entrypoints: tool.entrypoints } },
        }, () => ({ content: [], structuredContent: { opened: true } }));
    }
    server.registerResource('editor', EDITOR_URI, {
        title: 'PDFSpacer editor',
        description: 'Editor that inserts writing space into a PDF inside ChatGPT.',
        mimeType: APP_MIME_TYPE,
    }, () => ({ contents: [editorContent] }));
    return server;
}

const withCors = response => {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

/**
 * Stateless MCP over streamable HTTP: a fresh server and transport per request.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handle(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') {
        return withCors(Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }, { status: 405, headers: { Allow: 'POST, OPTIONS' } }));
    }
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
        await server.connect(transport);
        return withCors(await transport.handleRequest(request));
    } finally {
        await server.close();
    }
}

export { handle as GET, handle as POST, handle as DELETE, handle as OPTIONS };
