import { App } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions, OpenAIFileEntrypointInputSchema } from '@openai/mcp-extensions/app';

/**
 * How the open PDF arrived, and whether it can go back to ChatGPT.
 * @typedef {{ kind: 'host-file', name: string, resourceUri: string, etag?: string, writable: boolean }} HostFileSource
 * @typedef {{ kind: 'picked', name: string }} PickedSource
 * @typedef {HostFileSource | PickedSource} Source
 */

/**
 * @typedef {object} SaveRequest
 * @property {HostFileSource} source
 * @property {object} layout spacer state that was exported
 */

const PDF_TYPE = 'application/pdf';

const megabytes = bytes => `${Math.floor(bytes / 104857.6) / 10} MB`;

/** What the editor says and does for each `openai/resources/write` outcome. */
const saveOutcomes = {
    saved: {
        message: () => 'Saved to ChatGPT',
        follow: (actions, result, request) => actions.markSaved(request, result.etag),
    },
    conflict: {
        message: () => 'This file changed in ChatGPT, so your spaces were not saved. Showing the latest version.',
        error: true,
        follow: (actions, result, request) => actions.openHostFile(request.source),
    },
    'too-large': {
        message: result => `ChatGPT can save files up to ${megabytes(result.maxBytes)}. Use Export PDF to download this one instead.`,
        error: true,
        follow: () => {},
    },
};

/** @param {Uint8Array} bytes */
function bytesToBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
}

/** @param {string} text */
function base64ToBytes(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

const exportMode = () => document.querySelector('input[name="exportMode"]:checked').value;

/** @param {PDFAnswerSpacer} editor */
function connectEditor(editor) {
    const app = new App({ name: 'pdfspacer', version: '0.1.0' }, { availableDisplayModes: ['fullscreen'] }, { autoResize: false });
    const openai = new OpenAIExtensions(app);
    const saveButton = editor.$('saveToChatGptBtn');
    const exportButton = editor.$('exportPdfBtn');
    const session = {
        /** @type {Source | null} */
        source: null,
        savedLayout: null,
        saving: false,
        updateQueued: false,
        subscribedUri: null,
    };
    const loadPDF = editor.loadPDF.bind(editor);
    const anchorDownload = editor.download.bind(editor);
    const fail = action => error => editor.status(`${action}: ${error.message}`, true);

    const isDirty = () => editor.history.current !== session.savedLayout;
    const canSave = () => session.source?.kind === 'host-file' && session.source.writable && openai.resources != null;

    function render() {
        saveButton.hidden = !canSave();
        saveButton.disabled = session.saving || !editor.pdfDocument;
        exportButton.classList.toggle('primary', !canSave());
    }

    /** @param {Source} source @param {File} file */
    async function openDocument(source, file) {
        const generation = editor.generation + 1;
        const previous = editor.pdfDocument;
        await loadPDF(file);
        if (editor.generation !== generation || editor.pdfDocument === previous) return false;
        session.source = source;
        session.savedLayout = editor.history.current;
        editor.status('');
        render();
        return true;
    }

    /** @param {{ name: string, resourceUri: string }} file */
    async function readHostFile({ name, resourceUri }) {
        const response = await openai.resources.read({ uri: resourceUri, representation: 'blob' });
        const content = response.contents.find(item => item.uri === resourceUri) ?? response.contents[0];
        if (!content) throw new Error('ChatGPT returned no file contents.');
        const bytes = 'blob' in content ? base64ToBytes(content.blob) : new TextEncoder().encode(content.text);
        /** @type {HostFileSource} */
        const source = { kind: 'host-file', name, resourceUri, etag: content.openaiMetadata?.etag, writable: content.openaiMetadata?.writable === true };
        return { source, file: new File([bytes], name, { type: PDF_TYPE }) };
    }

    /** @param {{ name: string, resourceUri: string }} file */
    async function openHostFile(file) {
        const latest = await readHostFile(file);
        if (!await openDocument(latest.source, latest.file) || session.subscribedUri === file.resourceUri) return;
        session.subscribedUri = file.resourceUri;
        // Live updates are optional; without a subscription the editor still opens and saves.
        await openai.resources.subscribe({ uri: file.resourceUri }).catch(() => {});
    }

    /** @param {SaveRequest} request @param {string} etag */
    function markSaved(request, etag) {
        if (session.source !== request.source) return;
        session.source = { ...request.source, etag };
        session.savedLayout = request.layout;
    }

    async function save() {
        if (session.saving || !canSave()) return;
        const request = { source: session.source, layout: editor.history.current };
        session.saving = true;
        render();
        try {
            const bytes = await SpacerExport.create(editor.pdfData.slice(0), editor.geometry, request.layout, exportMode(),
                fraction => editor.status(`Preparing PDF… ${Math.round(fraction * 100)}%`));
            editor.status('Saving to ChatGPT…');
            const { resourceUri, etag } = request.source;
            const result = await openai.resources.write(resourceUri, { blob: bytesToBase64(bytes), ...(etag ? { ifMatch: etag } : {}) });
            const outcome = saveOutcomes[result.outcome];
            await outcome.follow({ markSaved, openHostFile }, result, request);
            editor.status(outcome.message(result), outcome.error);
        } catch (error) {
            fail('Could not save to ChatGPT')(error);
        } finally {
            session.saving = false;
            render();
        }
        if (session.updateQueued) {
            session.updateQueued = false;
            await resourceUpdated(request.source.resourceUri).catch(fail('Could not reload the file'));
        }
    }

    /** @param {string} uri */
    async function resourceUpdated(uri) {
        const source = session.source;
        if (source?.kind !== 'host-file' || source.resourceUri !== uri) return;
        if (session.saving) {
            session.updateQueued = true;
            return;
        }
        const latest = await readHostFile(source);
        if (session.source !== source || latest.source.etag === source.etag) return;
        if (isDirty()) {
            editor.status('This file changed in ChatGPT. Your unsaved spaces are kept.');
            return;
        }
        if (await openDocument(latest.source, latest.file)) editor.status('Showing the latest version from ChatGPT');
    }

    async function toolInput({ arguments: args }) {
        const input = OpenAIFileEntrypointInputSchema.safeParse(args);
        if (!input.success) return;
        if (!openai.resources) {
            editor.status('This version of ChatGPT cannot share files with PDFSpacer. Choose a PDF instead.', true);
            return;
        }
        editor.status(`Opening ${input.data.file.name}…`);
        await openHostFile(input.data.file);
    }

    async function hostDownload(data, name, type) {
        const content = typeof data === 'string' ? { text: data } : { blob: bytesToBase64(data) };
        const result = await app.downloadFile({
            contents: [{ type: 'resource', resource: { uri: `file:///${encodeURIComponent(name)}`, mimeType: type, ...content } }],
        });
        if (result.isError) editor.status('Download cancelled');
    }

    editor.loadPDF = file => openDocument({ kind: 'picked', name: file.name }, file);
    editor.persist = async pdf => {
        if (!pdf) editor.status(canSave() && isDirty() ? 'Not saved to ChatGPT yet' : '');
    };
    editor.download = (data, name, type = PDF_TYPE) => {
        if (!app.getHostCapabilities()?.downloadFile) return anchorDownload(data, name, type);
        hostDownload(data, name, type).catch(fail('Could not download'));
    };

    saveButton.onclick = () => save();
    app.ontoolinput = params => toolInput(params).catch(fail('Could not open the file'));
    app.onteardown = async () => {
        if (session.subscribedUri) await openai.resources?.unsubscribe({ uri: session.subscribedUri }).catch(() => {});
        return {};
    };
    if (window.parent === window) return;
    app.connect()
        .then(() => {
            openai.resources?.addUpdateHandler(({ params }) => resourceUpdated(params.uri).catch(fail('Could not reload the file')));
            render();
        })
        .catch(fail('Could not connect to ChatGPT'));
}

function start() {
    if (window.pdfSpacer) connectEditor(window.pdfSpacer);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
