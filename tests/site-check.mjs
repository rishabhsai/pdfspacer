#!/usr/bin/env node
// Run from any directory: node tests/site-check.mjs [https://preview.example.com]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://www.pdfspacer.com';
const read = path => readFileSync(join(root, path), 'utf8');
const redirects = JSON.parse(read('vercel.json')).redirects ?? [];
const removedPaths = ['/add-lines-to-pdf-worksheet', '/insert-blank-page-after-every-page-pdf'];
let failures = 0;

function report(name, errors) {
    console.log(`${errors.length ? 'FAIL' : 'PASS'} ${name}`);
    for (const error of errors) console.log(`  ${error}`);
    failures += errors.length;
}

function decode(text) {
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, key) => {
        if (!key.startsWith('#')) return entities[key.toLowerCase()];
        const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    });
}

function normalize(text) {
    return decode(text.replace(/<[^>]*>/g, '')).replace(/\s+/gu, ' ').trim();
}

function attributes(tag) {
    const result = {};
    for (const match of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
    }
    return result;
}

function markup(html) {
    return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

function tags(html) {
    return html.match(/<[a-z][^>]*>/gi) ?? [];
}

function exists(path) {
    try {
        return statSync(join(root, path)).isFile();
    } catch {
        return false;
    }
}

function fileFor(pathname) {
    const path = decodeURIComponent(pathname).replace(/^\/+/, '');
    if (!path) return 'index.html';
    const candidates = [path, ...(extname(path) ? [] : [`${path}.html`]), `${path.replace(/\/$/, '')}/index.html`];
    return candidates.find(exists);
}

function isRedirect(pathname) {
    return redirects.some(({ source }) => {
        // Vercel sources in this repository are literal paths or paths ending in /(.*).
        return source.endsWith('/(.*)') ? pathname.startsWith(source.slice(0, -4)) : pathname === source;
    });
}

function* objects(value) {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value)) yield value;
    for (const child of Object.values(value)) yield* objects(child);
}

// Public pages live at the root or one directory down; nested app/test fixtures
// have their own servers and are outside the *.html and */*.html site inventory.
const paths = readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (entry.isFile()) return entry.name.endsWith('.html') ? [entry.name] : [];
    if (!entry.isDirectory() || entry.name.startsWith('.')) return [];
    return readdirSync(join(root, entry.name), { withFileTypes: true })
        .filter(child => child.isFile() && child.name.endsWith('.html'))
        .map(child => `${entry.name}/${child.name}`);
}).sort();
const pages = paths.map(path => ({ path, html: read(path) }));
const sitemap = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
const sitemapErrors = [];
if (!sitemap.length) sitemapErrors.push('No sitemap URLs found.');
for (const loc of sitemap) {
    try {
        const url = new URL(loc);
        const path = url.pathname === '/' ? 'index.html' : `${decodeURIComponent(url.pathname).slice(1)}.html`;
        if (!exists(path)) throw new Error(`Missing ${path}`);
        const canonicals = tags(markup(read(path))).filter(tag => /^<link\b/i.test(tag))
            .map(attributes).filter(attrs => attrs.rel?.split(/\s+/).includes('canonical'));
        if (canonicals.length !== 1 || canonicals[0].href !== loc) throw new Error(`Canonical in ${path} does not equal ${loc}`);
    } catch (error) {
        sitemapErrors.push(`${loc}: ${error.message}`);
    }
}
report(`Sitemap files and canonicals (${sitemap.length} URLs)`, sitemapErrors);

const guideIds = new Set(tags(markup(read('guide.html'))).map(attributes).map(attrs => attrs.id).filter(Boolean));
const linkErrors = [];
const fragmentErrors = [];
let links = 0;
let fragments = 0;
for (const { path, html } of pages) {
    // Keep script opening tags so their src attributes are checked too.
    const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<(script|style)\b[^>]*>)[\s\S]*?<\/\2\s*>/gi, '$1');
    for (const tag of tags(source)) {
        const attrs = attributes(tag);
        for (const value of [attrs.href, attrs.src].filter(value => value !== undefined)) {
            if (value.startsWith('#') || /^(mailto:|data:)/i.test(value)) continue;
            try {
                const url = new URL(value, `${origin}/${path}`);
                if (url.origin !== origin) continue;
                links++;
                if (!fileFor(url.pathname) && !isRedirect(url.pathname)) linkErrors.push(`${path}: ${value}`);
                if (['/guide', '/guide.html'].includes(url.pathname) && url.hash) {
                    fragments++;
                    if (!guideIds.has(decodeURIComponent(url.hash.slice(1)))) fragmentErrors.push(`${path}: ${value}`);
                }
            } catch (error) {
                linkErrors.push(`${path}: ${value} (${error.message})`);
            }
        }
    }
}
report(`Internal href/src targets (${links} references in ${pages.length} pages)`, linkErrors);
report(`Guide fragment targets (${fragments} links)`, fragmentErrors);

const jsonErrors = [];
const faqErrors = [];
let scripts = 0;
let faqs = 0;
let questions = 0;
for (const { path, html } of pages) {
    const visible = markup(html);
    const answers = [...visible.matchAll(/<(summary|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi)].flatMap(match => {
        const paragraph = visible.slice(match.index + match[0].length).match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>/i);
        return paragraph ? [{ question: normalize(match[2]), answer: normalize(paragraph[1]) }] : [];
    });
    for (const match of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        if (attributes(match[1]).type?.toLowerCase() !== 'application/ld+json') continue;
        scripts++;
        let data;
        try {
            data = JSON.parse(match[2]);
        } catch (error) {
            jsonErrors.push(`${path}: ${error.message}`);
            continue;
        }
        for (const node of objects(data)) {
            if (![node['@type']].flat().includes('FAQPage')) continue;
            faqs++;
            const entities = [node.mainEntity].flat().filter(Boolean);
            if (!entities.length) faqErrors.push(`${path}: FAQPage has no questions`);
            for (const question of entities) {
                questions++;
                if (question['@type'] !== 'Question' || typeof question.name !== 'string' || typeof question.acceptedAnswer?.text !== 'string') {
                    faqErrors.push(`${path}: malformed FAQ Question/acceptedAnswer`);
                    continue;
                }
                if (!answers.some(answer => answer.question === normalize(question.name) && answer.answer === normalize(question.acceptedAnswer.text))) {
                    faqErrors.push(`${path}: visible question/answer differs: ${question.name}`);
                }
            }
        }
    }
}
report(`JSON-LD parses (${scripts} scripts)`, jsonErrors);
report(`FAQ visible/schema parity (${questions} questions in ${faqs} FAQPages)`, faqErrors);

if (process.argv[2]) {
    const base = new URL(process.argv[2]);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Base URL must use HTTP or HTTPS.');
    console.log(`HTTP base: ${base.origin}`);
    async function httpCheck(path, validate) {
        const errors = [];
        let detail = '';
        try {
            const response = await fetch(new URL(path, base.origin), { redirect: 'manual', signal: AbortSignal.timeout(20000) });
            detail = validate(response);
            await response.body?.cancel();
        } catch (error) {
            errors.push(error.message);
        }
        report(`HTTP ${path}${detail ? ` (${detail})` : ''}`, errors);
    }
    for (const loc of sitemap) {
        await httpCheck(new URL(loc).pathname, response => {
            if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
            return '200';
        });
    }
    for (const path of removedPaths) {
        await httpCheck(path, response => {
            const location = response.headers.get('location');
            const target = location && new URL(location, base.origin);
            if (response.status < 300 || response.status >= 400 || !target || target.pathname !== '/guide' || target.origin !== base.origin) {
                throw new Error(`Expected 3xx to /guide, got ${response.status}, Location: ${location}`);
            }
            const expected = redirects.find(redirect => redirect.source === path)?.destination;
            if (`${target.pathname}${target.hash}` !== expected) throw new Error(`Expected Location ${expected}, got ${location}`);
            return `${response.status} → ${location}`;
        });
    }
}
console.log(`${failures ? 'FAIL' : 'PASS'} Site checks complete (${failures} failures)`);
process.exitCode = failures ? 1 : 0;
