class PDFAnswerSpacer {
    constructor() {
        this.storage = new SpacerStorage();
        this.history = new SpacerLayout.History();
        this.geometry = [];
        this.scale = 1;
        this.selected = null;
        this.sourceCache = new Map();
        this.generation = 0;
        this.renderGeneration = 0;
        this.saveRevision = 0;
        this.tool = 'add';
        this.preset = { style: 'plain', ruleSpacing: 20, dotPitch: 10, gridSize: 20 };
        this.$ = id => document.getElementById(id);
        this.viewer = this.$('pdfViewer');
        this.viewport = this.$('viewerContainer');
        this.bindEvents();
        this.restore();
    }
    bindEvents() {
        document.querySelectorAll('[data-choose-pdf]').forEach(button => button.onclick = () => this.$('pdfInput').click());
        this.$('pdfInput').onchange = event => {
            const file = event.target.files[0];
            event.target.value = '';
            if (file) this.loadPDF(file);
        };
        this.$('projectInput').onchange = event => {
            const file = event.target.files[0];
            event.target.value = '';
            if (file) this.loadProject(file);
        };
        this.$('sampleBtn').onclick = () => this.loadPDF(new URL('sample.pdf', location.href));
        this.$('loadProjectBtn').onclick = () => this.$('projectInput').click();
        this.$('saveProjectBtn').onclick = () => this.download(JSON.stringify(this.project(), null, 2), 'pdf-spacer-project.json', 'application/json');
        this.$('clearProjectBtn').onclick = () => { this.selected = null; this.commit({}); };
        this.$('clearSessionBtn').onclick = () => this.clearSession();
        this.$('undoBtn').onclick = () => this.travel('undo');
        this.$('redoBtn').onclick = () => this.travel('redo');
        this.$('addSpaceBtn').onclick = () => this.setTool('add');
        this.$('selectBtn').onclick = () => this.setTool('select');
        this.$('zoomOutBtn').onclick = () => this.setZoom(this.scale / 1.2);
        this.$('zoomInBtn').onclick = () => this.setZoom(this.scale * 1.2);
        this.$('fitWidthBtn').onclick = () => this.fitWidth();
        this.$('showBreaksToggle').onchange = () => this.updateBreaks();
        this.$('exportPdfBtn').onclick = () => { this.$('exportDialog').showModal(); };
        this.$('exportCancelBtn').onclick = () => this.$('exportDialog').close();
        this.$('exportConfirmBtn').onclick = () => this.exportPDF();
        this.$('previewBtn').onclick = () => this.exportPDF(true);
        this.$('closePreviewBtn').onclick = () => this.$('previewDialog').close();
        this.$('previewDialog').addEventListener('close', () => {
            this.$('previewPages').replaceChildren();
            if (this.previewDocument) { this.previewDocument.destroy(); this.previewDocument = null; }
        });
        document.addEventListener('keydown', event => this.handleKeydown(event));
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => { if (this.pdfDocument && this.fitted) this.fitWidth(); }, 150);
        });
        const drop = this.$('landing');
        drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('drop-active'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('drop-active'));
        drop.addEventListener('drop', event => {
            event.preventDefault();
            drop.classList.remove('drop-active');
            const file = event.dataTransfer.files[0];
            if (file) this.loadPDF(file);
        });
        window.addEventListener('beforeunload', event => {
            if (this.saving || this.unsaved) { event.preventDefault(); event.returnValue = ''; }
        });
    }
    status(message, error = false) {
        this.$('status').textContent = message;
        this.$('status').classList.toggle('error', error);
    }
    async loadPDF(file, saved = null, restoreGeneration = null) {
        const generation = restoreGeneration ?? ++this.generation;
        this.status('Opening PDF…');
        let candidate;
        try {
            const bytes = file instanceof URL ? await fetch(file).then(response => {
                if (!response.ok) throw new Error('The sample could not be loaded.');
                return response.arrayBuffer();
            }) : await file.arrayBuffer();
            candidate = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise;
            const geometry = [];
            for (let pageNumber = 1; pageNumber <= candidate.numPages; pageNumber++) {
                const page = await candidate.getPage(pageNumber);
                const viewport = page.getViewport({ scale: 1 });
                geometry.push({ width: viewport.width, height: viewport.height, transform: viewport.transform, view: page.view });
            }
            if (generation !== this.generation) { candidate.destroy(); return; }
            const fingerprint = candidate.fingerprints[0];
            if (saved?.pdfName && saved.pdfName !== fingerprint) throw new Error('The saved layout belongs to a different PDF.');
            const state = SpacerLayout.validate(saved?.spacers || {}, geometry);
            const previous = this.pdfDocument;
            this.pdfDocument = candidate;
            this.pdfData = bytes;
            this.pdfName = file instanceof URL ? 'sample-worksheet.pdf' : file.name;
            this.fingerprint = fingerprint;
            this.geometry = geometry;
            this.history = new SpacerLayout.History(state);
            this.selected = null;
            this.sourceCache.clear();
            this.viewer.replaceChildren();
            this.$('landing').hidden = true;
            this.$('editor').hidden = false;
            document.body.classList.add('editing');
            this.$('documentName').textContent = this.pdfName;
            this.$('documentName').title = this.pdfName;
            this.fitWidth();
            this.updateProperties();
            this.updateHistory();
            this.$('addSpaceBtn').focus();
            if (previous) previous.destroy();
            await this.persist({ name: this.pdfName, type: 'application/pdf', data: bytes });
        } catch (error) {
            if (candidate && candidate !== this.pdfDocument) candidate.destroy();
            if (generation === this.generation) this.status(`Could not open PDF: ${error.message}`, true);
        }
    }
    async restore() {
        const generation = this.generation;
        try {
            const saved = await this.storage.read();
            if (!saved.pdf || generation !== this.generation) return;
            // One-time upgrade of layouts saved by the previous editor.
            const layout = saved.layout || JSON.parse(localStorage.getItem('pdfSpacerSettings') || 'null');
            await this.loadPDF(new File([saved.pdf.data], saved.pdf.name, { type: 'application/pdf' }), layout, generation);
            if (generation === this.generation && this.pdfDocument) localStorage.removeItem('pdfSpacerSettings');
        } catch (error) { this.status('Your saved session could not be restored. Choose a PDF to start again.', true); }
    }
    project() { return { spacers: this.history.current, pdfName: this.fingerprint, timestamp: new Date().toISOString() }; }
    async persist(pdf = null) {
        const revision = ++this.saveRevision;
        this.saving = true;
        this.status('Saving on this device…');
        try {
            await this.storage.write(pdf, this.project());
            if (revision === this.saveRevision) { this.unsaved = false; this.status('Saved on this device'); }
        } catch (error) {
            if (revision === this.saveRevision) { this.unsaved = true; this.status('Could not autosave. Download your layout from Project before closing.', true); }
        } finally { if (revision === this.saveRevision) this.saving = false; }
    }
    commit(state) {
        try {
            const valid = SpacerLayout.validate(state, this.geometry);
            if (!this.history.commit(valid)) return;
            this.persist();
            this.renderDocument();
            this.updateProperties();
            this.updateHistory();
        } catch (error) { this.status(error.message, true); this.updateProperties(); }
    }
    travel(direction) {
        if (!this.history[direction]()) return;
        this.selected = null;
        this.persist();
        this.renderDocument();
        this.updateProperties();
        this.updateHistory();
    }
    updateHistory() {
        this.$('undoBtn').disabled = !this.history.past.length;
        this.$('redoBtn').disabled = !this.history.future.length;
    }
    setTool(tool) {
        this.tool = tool;
        this.$('addSpaceBtn').setAttribute('aria-pressed', tool === 'add');
        this.$('selectBtn').setAttribute('aria-pressed', tool === 'select');
        this.viewer.classList.toggle('placing', tool === 'add');
    }
    setZoom(scale, fitted = false) {
        this.scale = Math.max(0.1, Math.min(3, scale));
        this.fitted = fitted;
        this.$('zoomLevel').textContent = `${Math.round(this.scale * 100)}%`;
        this.sourceCache.clear();
        this.renderDocument(true);
    }
    fitWidth() { this.setZoom(Math.min(1.3, (this.viewport.clientWidth - 40) / SpacerLayout.WIDTH), true); }
    renderDocument(force = false) {
        if (!this.pdfDocument) return;
        this.layout = SpacerLayout.document(this.geometry, this.history.current);
        if (force) {
            this.renderGeneration++;
            this.observer?.disconnect();
            this.viewer.replaceChildren();
        }
        const generation = this.renderGeneration;
        this.observer ??= new IntersectionObserver(entries => {
            entries.filter(entry => entry.isIntersecting).forEach(entry => {
                this.renderPage(entry.target).catch(error => this.status(`Could not display page: ${error.message}`, true));
            });
        }, { root: this.viewport, rootMargin: '800px 0px' });
        for (const pageLayout of this.layout.pages) {
            let element = this.viewer.querySelector(`[data-page-number="${pageLayout.pageNumber}"]`);
            if (!element) {
                element = document.createElement('div');
                element.className = 'pdf-page';
                element.dataset.pageNumber = pageLayout.pageNumber;
                element.setAttribute('aria-label', `Source page ${pageLayout.pageNumber}`);
                element.onclick = event => this.pageClick(event, element);
                element.onpointermove = event => this.showGuide(event, element);
                element.onpointerleave = () => element.querySelector('.insertion-guide')?.remove();
                this.viewer.append(element);
                this.observer.observe(element);
            }
            element.style.width = `${SpacerLayout.WIDTH * this.scale}px`;
            element.style.height = `${pageLayout.height * this.scale}px`;
            const signature = JSON.stringify(this.history.current[pageLayout.pageNumber] || []);
            if (element.dataset.signature !== signature) {
                element.dataset.signature = signature;
                element.dataset.ready = '';
                if (element.childElementCount || this.sourceCache.has(pageLayout.pageNumber)) {
                    this.renderPage(element, generation).catch(error => this.status(error.message, true));
                }
            }
        }
        this.setTool(this.tool);
        this.updateBreaks();
        this.highlight();
    }
    async sourceCanvas(pageNumber) {
        if (this.sourceCache.has(pageNumber)) return this.sourceCache.get(pageNumber);
        const doc = this.pdfDocument;
        const scale = this.scale;
        const geometry = this.geometry[pageNumber - 1];
        const promise = (async () => {
            const page = await doc.getPage(pageNumber);
            const density = Math.min(window.devicePixelRatio || 1, 2);
            const viewport = page.getViewport({ scale: SpacerLayout.WIDTH / geometry.width * scale * density });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvasContext: canvas.getContext('2d'), viewport, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
            return canvas;
        })();
        this.sourceCache.set(pageNumber, promise);
        while (this.sourceCache.size > 6) this.sourceCache.delete(this.sourceCache.keys().next().value);
        return promise;
    }
    async renderPage(element, generation = this.renderGeneration) {
        if (element.dataset.ready === element.dataset.signature) return;
        const signature = element.dataset.signature;
        const pageNumber = Number(element.dataset.pageNumber);
        const layout = this.layout.pages[pageNumber - 1];
        const source = await this.sourceCanvas(pageNumber);
        if (!element.isConnected || generation !== this.renderGeneration || signature !== element.dataset.signature) return;
        const content = document.createDocumentFragment();
        for (const item of layout.items) {
            if (item.type === 'slice') {
                const canvas = document.createElement('canvas');
                canvas.className = 'content-slice';
                const ratio = source.width / SpacerLayout.WIDTH;
                canvas.width = source.width;
                canvas.height = Math.max(1, Math.ceil(item.height * ratio));
                canvas.style.cssText = `top:${item.top * this.scale}px;width:100%;height:${item.height * this.scale}px`;
                canvas.getContext('2d').drawImage(source, 0, item.sourceY * item.factor * ratio, source.width, item.height * ratio, 0, 0, canvas.width, canvas.height);
                content.append(canvas);
            } else {
                const element = document.createElement('div');
                element.className = `spacer spacer-${item.spacer.style}`;
                element.dataset.spacerId = item.spacer.id;
                element.tabIndex = 0;
                element.setAttribute('role', 'button');
                element.setAttribute('aria-label', `Writing space, ${Math.round(item.height * 25.4 / 72)} millimetres. Select to edit.`);
                element.style.cssText = `top:${item.top * this.scale}px;height:${item.height * this.scale}px;--pitch:${this.pitch(item.spacer) * item.factor * this.scale}px`;
                const label = document.createElement('span');
                label.className = 'spacer-label';
                label.textContent = `${Math.round(item.height * 25.4 / 72)} mm · drag to move`;
                const handle = document.createElement('span');
                handle.className = 'spacer-handle';
                handle.textContent = '↕';
                element.append(label, handle);
                element.onclick = event => { event.stopPropagation(); this.select(item.spacer.id, pageNumber); };
                element.oncontextmenu = event => { event.preventDefault(); this.select(item.spacer.id, pageNumber); this.$('spacerProperties').scrollIntoView({ block: 'nearest' }); };
                element.onpointerdown = event => this.beginGesture(event, element, pageNumber, item);
                element.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.select(item.spacer.id, pageNumber); } };
                content.append(element);
            }
        }
        element.replaceChildren(content);
        element.dataset.ready = signature;
        this.updateBreaks();
        this.highlight();
    }
    pitch(spacer) { return spacer.style === 'ruled' ? spacer.ruleSpacing : spacer.style === 'dot-grid' ? spacer.dotPitch : spacer.gridSize; }
    updateBreaks() {
        this.viewer.querySelectorAll('.page-break').forEach(line => line.remove());
        if (!this.layout || !this.$('showBreaksToggle').checked) return;
        for (const page of this.layout.pages) {
            const element = this.viewer.querySelector(`[data-page-number="${page.pageNumber}"]`);
            let boundary = Math.ceil((page.offset + 1e-6) / SpacerLayout.HEIGHT) * SpacerLayout.HEIGHT;
            while (boundary < page.offset + page.height - 1e-6) {
                const line = document.createElement('div');
                line.className = 'page-break';
                line.style.top = `${(boundary - page.offset) * this.scale}px`;
                line.textContent = `A4 page ${Math.round(boundary / SpacerLayout.HEIGHT) + 1}`;
                element.append(line);
                boundary += SpacerLayout.HEIGHT;
            }
        }
    }
    showGuide(event, element) {
        if (this.gesture || this.tool !== 'add' || event.target.closest('.spacer') || event.pointerType === 'touch') { element.querySelector('.insertion-guide')?.remove(); return; }
        let line = element.querySelector('.insertion-guide');
        if (!line) { line = document.createElement('div'); line.className = 'insertion-guide'; line.textContent = 'Insert writing space here'; element.append(line); }
        line.style.top = `${event.clientY - element.getBoundingClientRect().top}px`;
    }
    pageClick(event, element) {
        if (this.tool !== 'add' || event.target.closest('.spacer')) return;
        const pageNumber = Number(element.dataset.pageNumber);
        const layout = this.layout.pages[pageNumber - 1];
        const y = SpacerLayout.sourceAt(layout, (event.clientY - element.getBoundingClientRect().top) / this.scale);
        const spacer = { ...this.preset, id: crypto.randomUUID(), y, height: 85 / layout.factor };
        this.selected = { id: spacer.id, pageNumber };
        this.commit({ ...this.history.current, [pageNumber]: [...(this.history.current[pageNumber] || []), spacer] });
    }
    select(id, pageNumber) { this.selected = { id, pageNumber }; this.highlight(); this.updateProperties(); }
    highlight() { this.viewer.querySelectorAll('.spacer').forEach(element => element.classList.toggle('selected', element.dataset.spacerId === this.selected?.id)); }
    selectedSpacer() { return this.selected && this.history.current[this.selected.pageNumber]?.find(item => item.id === this.selected.id); }
    edit(patch) {
        if (!this.selectedSpacer()) return;
        const { pageNumber, id } = this.selected;
        const state = { ...this.history.current, [pageNumber]: this.history.current[pageNumber].map(item => item.id === id ? { ...item, ...patch } : item) };
        this.commit(state);
        const spacer = this.selectedSpacer();
        this.preset = { style: spacer.style, ruleSpacing: spacer.ruleSpacing, dotPitch: spacer.dotPitch, gridSize: spacer.gridSize };
    }
    remove() {
        if (!this.selectedSpacer()) return;
        const { id, pageNumber } = this.selected;
        this.selected = null;
        this.commit({ ...this.history.current, [pageNumber]: this.history.current[pageNumber].filter(item => item.id !== id) });
    }
    duplicate() {
        const spacer = this.selectedSpacer();
        if (!spacer) return;
        const { pageNumber } = this.selected;
        const copy = { ...spacer, id: crypto.randomUUID(), y: Math.min(this.geometry[pageNumber - 1].height, spacer.y + 20) };
        this.selected = { pageNumber, id: copy.id };
        this.commit({ ...this.history.current, [pageNumber]: [...this.history.current[pageNumber], copy] });
    }
    updateProperties() {
        const panel = this.$('spacerProperties');
        const spacer = this.selectedSpacer();
        panel.replaceChildren();
        if (!spacer) {
            const hint = document.createElement('p');
            hint.className = 'muted';
            hint.textContent = 'Choose Add space, then click in a clear gap below a question. Select a space to adjust it.';
            panel.append(hint);
            return;
        }
        const factor = SpacerLayout.WIDTH / this.geometry[this.selected.pageNumber - 1].width;
        const mm = factor * 25.4 / 72;
        const styleLabel = document.createElement('label');
        styleLabel.textContent = 'Paper style';
        const select = document.createElement('select');
        select.id = 'spacerStyle';
        for (const [value, name] of [['plain', 'Plain'], ['ruled', 'Ruled lines'], ['squared', 'Squared paper'], ['dot-grid', 'Dot grid']]) {
            const option = new Option(name, value, false, spacer.style === value); select.add(option);
        }
        select.onchange = () => this.edit({ style: select.value });
        styleLabel.append(select);
        panel.append(styleLabel);
        const field = (label, key, max, multiplier = mm) => {
            const wrapper = document.createElement('label');
            wrapper.textContent = label;
            const input = document.createElement('input');
            input.id = `spacer-${key}`;
            input.type = 'number'; input.step = 'any'; input.min = key === 'y' ? 0 : (key === 'height' ? 1 : 2) * multiplier; input.max = max * multiplier;
            input.value = Number((spacer[key] * multiplier).toFixed(2));
            input.onchange = () => {
                if (!input.checkValidity() || !Number.isFinite(input.valueAsNumber)) { input.reportValidity(); input.value = Number((spacer[key] * multiplier).toFixed(2)); return; }
                this.edit({ [key]: input.valueAsNumber / multiplier });
            };
            wrapper.append(input); panel.append(wrapper);
        };
        field('Height (mm on A4)', 'height', 10000);
        field('Insertion position (mm from source top)', 'y', this.geometry[this.selected.pageNumber - 1].height);
        if (spacer.style !== 'plain') field('Pattern spacing (mm)', spacer.style === 'ruled' ? 'ruleSpacing' : spacer.style === 'dot-grid' ? 'dotPitch' : 'gridSize', 100);
        const actions = document.createElement('div'); actions.className = 'property-actions';
        const duplicate = document.createElement('button'); duplicate.className = 'btn'; duplicate.textContent = 'Duplicate'; duplicate.onclick = () => this.duplicate();
        const remove = document.createElement('button'); remove.className = 'btn danger'; remove.textContent = 'Delete'; remove.onclick = () => this.remove();
        actions.append(duplicate, remove); panel.append(actions);
    }
    beginGesture(event, element, pageNumber, item) {
        if (event.button !== 0) return;
        event.stopPropagation();
        this.select(item.spacer.id, pageNumber);
        const resize = event.target.closest('.spacer-handle');
        const startY = event.clientY;
        const startTop = item.top;
        let patch = null;
        let active = false;
        element.setPointerCapture(event.pointerId);
        const original = { top: element.style.top, height: element.style.height };
        this.gesture = true;
        const move = moveEvent => {
            const delta = (moveEvent.clientY - startY) / this.scale;
            if (!active && Math.abs(moveEvent.clientY - startY) < 5) return;
            active = true;
            if (resize) {
                const height = Math.max(1, Math.min(10000, item.spacer.height + delta / item.factor));
                patch = { height };
                element.style.height = `${height * item.factor * this.scale}px`;
            } else {
                const others = this.history.current[pageNumber].filter(spacer => spacer.id !== item.spacer.id);
                const layout = SpacerLayout.page(this.geometry[pageNumber - 1], others);
                const top = Math.max(0, Math.min(layout.height, startTop + delta));
                patch = { y: SpacerLayout.sourceAt(layout, top) };
                element.style.top = `${top * this.scale}px`;
            }
        };
        const finish = finishEvent => {
            element.removeEventListener('pointermove', move);
            element.removeEventListener('pointerup', finish);
            element.removeEventListener('pointercancel', finish);
            element.style.top = original.top; element.style.height = original.height;
            this.gesture = false;
            if (patch && finishEvent.type !== 'pointercancel') this.edit(patch);
        };
        element.addEventListener('pointermove', move);
        element.addEventListener('pointerup', finish);
        element.addEventListener('pointercancel', finish);
    }
    handleKeydown(event) {
        if (!this.pdfDocument || event.target.closest('input, select, textarea, dialog')) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); this.travel(event.shiftKey ? 'redo' : 'undo'); return; }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); this.travel('redo'); return; }
        if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.remove(); }
        const spacer = this.selectedSpacer();
        if (spacer && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            const delta = (event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? 10 : 1);
            this.edit({ y: Math.max(0, Math.min(this.geometry[this.selected.pageNumber - 1].height, spacer.y + delta)) });
        }
    }
    async loadProject(file) {
        const generation = this.generation;
        try {
            if (!this.pdfDocument) throw new Error('Open the original PDF first.');
            const project = JSON.parse(await file.text());
            if (generation !== this.generation) return;
            if (project.pdfName !== this.fingerprint) throw new Error('This layout belongs to another PDF. Open its original PDF first.');
            const valid = SpacerLayout.validate(project.spacers, this.geometry);
            this.selected = null;
            this.commit(valid);
        } catch (error) { this.status(`Could not load layout: ${error.message}`, true); }
    }
    async clearSession() {
        if (!confirm('Remove this PDF and its saved layout from this browser? Download your PDF or layout first if you need a copy.')) return;
        const generation = ++this.generation;
        ++this.renderGeneration;
        ++this.saveRevision;
        try {
            await this.storage.clear();
            if (generation !== this.generation) return;
            localStorage.removeItem('pdfSpacerSettings');
            this.pdfDocument?.destroy();
            this.pdfDocument = null; this.pdfData = null; this.selected = null;
            this.sourceCache.clear(); this.observer?.disconnect();
            this.viewer.replaceChildren();
            this.$('editor').hidden = true; this.$('landing').hidden = false;
            document.body.classList.remove('editing');
            this.saving = false; this.unsaved = false;
            this.status('Session removed from this device');
            document.querySelector('[data-choose-pdf]').focus();
        } catch (error) { this.status('Could not clear the saved session. Please try again.', true); }
    }
    download(data, name, type = 'application/pdf') {
        const url = URL.createObjectURL(new Blob([data], { type }));
        const link = document.createElement('a'); link.href = url; link.download = name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    async exportPDF(preview = false) {
        if (this.exporting) return;
        this.exporting = true;
        const mode = document.querySelector('input[name="exportMode"]:checked').value;
        const filename = this.pdfName;
        this.$('exportConfirmBtn').disabled = true;
        this.$('previewBtn').disabled = true;
        try {
            this.status('Preparing PDF…');
            const data = await SpacerExport.create(this.pdfData.slice(0), this.geometry, this.history.current, mode, fraction => this.status(`Preparing PDF… ${Math.round(fraction * 100)}%`));
            if (preview) {
                this.$('previewDialog').showModal();
                this.$('previewPages').textContent = 'Rendering preview…';
                const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
                this.previewDocument = doc;
                this.$('previewPages').replaceChildren();
                for (let number = 1; number <= doc.numPages && this.$('previewDialog').open; number++) {
                    const page = await doc.getPage(number);
                    const size = page.getViewport({ scale: 1 });
                    const canvas = document.createElement('canvas');
                    const scale = Math.min(1, 700 / size.width, 12000 / size.height);
                    const viewport = page.getViewport({ scale });
                    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                    canvas.setAttribute('aria-label', `Exported page ${number}`);
                    this.$('previewPages').append(canvas);
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                }
                this.status('Preview shows the PDF that will be downloaded');
            } else {
                this.download(data, `${filename.replace(/\.pdf$/i, '')}-spaced.pdf`);
                this.$('exportDialog').close();
                this.status('PDF exported');
            }
        } catch (error) { this.status(`Could not export PDF: ${error.message}`, true); }
        finally { this.exporting = false; this.$('exportConfirmBtn').disabled = false; this.$('previewBtn').disabled = false; }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.pdfjsLib || !window.PDFLib) {
        document.getElementById('status').textContent = 'PDF tools could not load. Check your connection and reload the page.';
        return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    new PDFAnswerSpacer();
});
