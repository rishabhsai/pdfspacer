import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const site = new URL('../', root);
const at = (base, path) => fileURLToPath(new URL(path, base));
const text = (base, path) => readFile(at(base, path), 'utf8');

/** Classic scripts in load order; later scripts use the globals earlier ones define. */
const classicScripts = [
    [root, 'node_modules/pdfjs-dist/build/pdf.min.js'],
    // Loaded on the main thread so pdf.js uses its in-page fake worker instead of fetching a worker file.
    [root, 'node_modules/pdfjs-dist/build/pdf.worker.min.js'],
    [root, 'node_modules/pdf-lib/dist/pdf-lib.min.js'],
    [site, 'layout.js'],
    [site, 'export.js'],
    [root, 'app/storage.js'],
    [site, 'app.js'],
];

async function bundleEditor() {
    const result = await build({
        entryPoints: [at(root, 'app/editor.js')],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        legalComments: 'none',
        write: false,
    });
    return result.outputFiles[0].text;
}

const inlineScript = code => `<script>${code.replace(/\/\/# sourceMappingURL=\S+/g, '').replace(/<\/script/gi, '<\\/script')}</script>`;

async function buildAppHtml() {
    const [template, styles, editor, ...scripts] = await Promise.all([
        text(root, 'app/index.html'),
        text(site, 'styles.css'),
        bundleEditor(),
        ...classicScripts.map(([base, path]) => text(base, path)),
    ]);
    return template
        .replace('<!-- APP_STYLES -->', () => `<style>${styles}</style>`)
        .replace('<!-- APP_SCRIPT -->', () => [...scripts, editor].map(inlineScript).join('\n'));
}

async function main() {
    const [html, icon] = await Promise.all([buildAppHtml(), text(site, 'favicon.svg')]);
    const iconDataUri = `data:image/svg+xml,${encodeURIComponent(icon)}`;
    await mkdir(at(root, 'dist/'), { recursive: true });
    await Promise.all([
        writeFile(at(root, 'dist/app-html.js'), `export const html = ${JSON.stringify(html)};\nexport const iconDataUri = ${JSON.stringify(iconDataUri)};\n`),
        writeFile(at(root, 'dist/app.html'), html),
    ]);
    const bytes = Buffer.byteLength(html);
    console.log(`dist/app-html.js: app HTML is ${bytes} bytes (${(bytes / 1048576).toFixed(2)} MiB)`);
}

await main();
