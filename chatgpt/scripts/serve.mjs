import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { handle } from '../api/mcp.js';

/** @param {import('node:http').IncomingMessage} req */
function toRequest(req) {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    return new Request(new URL(req.url, `http://${req.headers.host}`), {
        method: req.method,
        headers,
        ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
    });
}

/** @param {import('node:http').ServerResponse} res @param {Response} response */
async function send(res, response) {
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) await pipeline(Readable.fromWeb(response.body), res);
    else res.end();
}

/** Serves the MCP handler at /api/mcp, like the Vercel function. */
export function listen(port = 0, host = '127.0.0.1') {
    const server = createServer(async (req, res) => {
        try {
            if (new URL(req.url, 'http://localhost').pathname !== '/api/mcp') {
                res.writeHead(404).end('Not found');
                return;
            }
            await send(res, await handle(toRequest(req)));
        } catch (error) {
            console.error(error);
            if (res.headersSent) res.destroy();
            else res.writeHead(500).end('Internal error');
        }
    });
    return new Promise(resolve => server.listen(port, host, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const server = await listen(Number(process.env.PORT ?? 3000));
    console.log(`PDFSpacer MCP server on http://127.0.0.1:${server.address().port}/api/mcp`);
}
