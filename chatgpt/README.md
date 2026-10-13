# PDFSpacer for ChatGPT

This directory is the PDFSpacer ChatGPT plugin: an MCP server plus an MCP App (the editor iframe). It is deployed separately from the main site, as its own Vercel project with root directory `chatgpt`.

The PDF never reaches the server. The server returns tool metadata and one self-contained HTML document. The editor reads the PDF from ChatGPT (or from a file the user picks), edits it in the iframe, and writes the result back to ChatGPT. The app makes no network requests, and its resource declares an empty CSP domain list.

## How it works

| Tool | Entrypoints | What the editor does |
|---|---|---|
| `open_pdf_editor` | global (sidebar), thread (tab) | Shows a **Choose PDF** panel. The user picks a file inside the iframe. **Export PDF** downloads the result. |
| `edit_pdf_file` | file, `.pdf` | Reads the opened file with `resources/read` (`representation: "blob"`). **Save to ChatGPT** replaces it with `openai/resources/write` (`ifMatch` set to the last etag). **Export PDF** downloads a copy. |

Both tools use the UI resource `ui://pdfspacer/editor`, which opens fullscreen. The file entrypoint works only in the ChatGPT desktop app.

Save outcomes:

- `saved`: the editor stores the new etag. Your spacers stay editable.
- `conflict`: the file changed in ChatGPT. The editor reloads the latest version and your spacers are not saved.
- `too-large`: the editor shows the host's byte limit. Use **Export PDF** instead.

The editor subscribes to the opened file. When ChatGPT reports a change and you have no unsaved spacers, the editor reloads the file. It ignores the update that echoes its own save.

## Layout

```text
api/mcp.js            Vercel function: stateless MCP over streamable HTTP (handle(request) -> Response)
app/index.html        iframe template; the editor markup from the site, minus the landing page
app/editor.js         plugin layer: MCP App connection, file entrypoint, save and download
app/storage.js        no-op session storage (the iframe has no IndexedDB)
scripts/build.mjs     inlines pdf.js, pdf-lib, the site editor and app/editor.js into dist/app-html.js
scripts/serve.mjs     local HTTP server for api/mcp.js
test/                 server round trip, Playwright host test, and the AppBridge test host
.well-known/          OpenAI domain verification token
```

The build reads `layout.js`, `export.js`, `app.js`, `styles.css` and `favicon.svg` from the repository root, so the editor stays one codebase.

## Build and test

Requires Node.js 22 or later.

```sh
cd chatgpt
npm install
npm run build   # writes dist/app-html.js and dist/app.html
npm test        # build, MCP round trip, Playwright end-to-end test
```

The Playwright test needs Chromium. If it is missing, run `npx playwright install chromium`.

`test/app.test.mjs` serves `test/host.html`, a real MCP Apps host built on `AppBridge`. The host loads the app in an opaque-origin sandboxed iframe with the MCP Apps default CSP. It sends the file and global entrypoint tool inputs, answers `resources/read`, `openai/resources/write`, `resources/subscribe` and `ui/download-file`, and records each request. The test fails on any console error or on any request from the app frame other than the app document.

## Run locally

```sh
npm run build
npm start       # http://127.0.0.1:3000/api/mcp (set PORT to change)
```

To try the editor without a host, open `dist/app.html` in a browser. It works like the website editor. Downloads use a normal browser download.

## Connect in ChatGPT developer mode

1. Run the server locally (`npm start`) and expose it over HTTPS with a tunnel, for example `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`.
2. In ChatGPT, turn on developer mode and add a custom app with the MCP server URL `https://<tunnel-host>/api/mcp` and no authentication. Follow [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) for the current menu names.
3. Open PDFSpacer from the sidebar, or open a PDF in the desktop app and choose PDFSpacer as the viewer.

ChatGPT caches tool metadata. After you change a tool or the UI resource, refresh the app in the developer mode settings.

## Deploy on Vercel

1. Create a Vercel project from this repository with root directory `chatgpt`.
2. Keep **Include files outside the root directory in the Build Step** turned on. The build reads the editor files from the repository root.
3. `vercel.json` sets the build command to `npm run build`. The function `api/mcp.js` imports `dist/app-html.js`, so the build must run before the function is packaged.
4. The MCP endpoint is `https://<deployment>/api/mcp`.
5. Replace the contents of `.well-known/openai-apps-challenge` with the token from the OpenAI dashboard before you verify the domain.

The `resources/read` response for the editor is about 2.4 MB, below the 4.5 MB Vercel response limit.
