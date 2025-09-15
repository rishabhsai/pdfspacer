// PDF Answer Spacer Application
class PDFAnswerSpacer {
    constructor() {
        this.pdfDocument = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.spacers = new Map(); // Map of pageNumber -> array of spacers
        this.selectedSpacer = null;
        this.isAddingSpacer = false;
        this.currentTool = 'select';
        this.renderToken = 0; // guards against concurrent renders
        this._renderRAF = null; // coalesced re-render scheduling
        this.showPageBreaks = false;
        this.showPlacementGuide = false;
        this.lastSpacerPreset = { style: 'plain', ruleSpacing: 20, dotPitch: 10, gridSize: 20 };
        
        this.initializeElements();
        this.bindEvents();
        this.loadSettings();
    }

    async exportPDFPaginated(progressOverlay, options = {}) {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const DPR = options.dpi || 2;
        const continueAcross = !!options.continueAcross;

        if (!continueAcross) {
            for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
                const progress = (pageNum / this.totalPages) * 100;
                progressOverlay.querySelector('.progress-fill').style.width = progress + '%';
                await this.exportPageSimple(pdf, pageNum, pageNum === 1, pageWidth, pageHeight);
            }
            pdf.save('modified-pdf.pdf');
            return;
        }

        // Continue flow across source pages: build per-page tall canvases and slice across A4 pages
        const slices = [];
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            const progress = (pageNum / this.totalPages) * 100;
            progressOverlay.querySelector('.progress-fill').style.width = progress + '%';

            const page = await this.pdfDocument.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.0 });
            const pageSpacers = this.spacers.get(pageNum) || [];

            if (pageSpacers.length === 0) {
                const scaleToWidth = (pageWidth * DPR) / viewport.width;
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = Math.floor(pageWidth * DPR);
                canvas.height = Math.floor(viewport.height * scaleToWidth);
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await this.renderSimplePage(ctx, page, viewport, canvas.width, canvas.height);
                slices.push(canvas);
            } else {
                const tall = await this.buildTallReflowCanvas(page, viewport, pageSpacers, pageWidth, DPR);
                slices.push(tall);
            }
        }

        // Paginate the sequence of slices into fixed-height A4 pages
        const pageHeightPx = Math.floor(pageHeight * DPR);
        const pageWidthPx = Math.floor(pageWidth * DPR);
        let sliceIndex = 0;
        let sliceOffset = 0; // px offset within current slice
        let isFirstPage = true;
        while (sliceIndex < slices.length) {
            const pageCanvas = document.createElement('canvas');
            const pageCtx = pageCanvas.getContext('2d');
            pageCanvas.width = pageWidthPx;
            pageCanvas.height = pageHeightPx;
            pageCtx.fillStyle = 'white';
            pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

            let yDest = 0;
            while (yDest < pageHeightPx && sliceIndex < slices.length) {
                const src = slices[sliceIndex];
                const remainingInSlice = src.height - sliceOffset;
                const remainingOnPage = pageHeightPx - yDest;
                const h = Math.min(remainingInSlice, remainingOnPage);
                pageCtx.drawImage(
                    src,
                    0, sliceOffset, pageWidthPx, h,
                    0, yDest, pageWidthPx, h
                );
                yDest += h;
                sliceOffset += h;
                if (sliceOffset >= src.height) {
                    sliceIndex++;
                    sliceOffset = 0;
                }
            }

            if (!isFirstPage) pdf.addPage();
            const img = pageCanvas.toDataURL('image/png');
            pdf.addImage(img, 'PNG', 0, 0, pageWidth, pageHeight);
            isFirstPage = false;
        }
        pdf.save('modified-pdf.pdf');
    }

    async exportPDFSingleLong(progressOverlay, options = {}) {
        const { jsPDF } = window.jspdf;
        const TEMP = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = TEMP.internal.pageSize.getWidth();
        const DPR = options.dpi || 2;

        const slices = [];
        let totalHeightPx = 0;
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            const progress = (pageNum / this.totalPages) * 100;
            progressOverlay.querySelector('.progress-fill').style.width = progress + '%';

            const page = await this.pdfDocument.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.0 });
            const pageSpacers = this.spacers.get(pageNum) || [];

            if (pageSpacers.length === 0) {
                const scaleToWidth = (pageWidth * DPR) / viewport.width;
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = Math.floor(pageWidth * DPR);
                canvas.height = Math.floor(viewport.height * scaleToWidth);
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await this.renderSimplePage(ctx, page, viewport, canvas.width, canvas.height);
                slices.push(canvas);
                totalHeightPx += canvas.height;
            } else {
                const tall = await this.buildTallReflowCanvas(page, viewport, pageSpacers, pageWidth, DPR);
                slices.push(tall);
                totalHeightPx += tall.height;
            }
        }

        const totalHeightPt = totalHeightPx / DPR;
        const pdf = new jsPDF({ unit: 'pt', format: [pageWidth, totalHeightPt] });
        let y = 0;
        for (const c of slices) {
            const img = c.toDataURL('image/png');
            const hPt = c.height / DPR;
            pdf.addImage(img, 'PNG', 0, y, pageWidth, hPt);
            y += hPt;
        }
        pdf.save('modified-pdf.pdf');
    }
    initializeElements() {
        // File controls
        this.pdfInput = document.getElementById('pdfInput');
        this.projectInput = document.getElementById('projectInput');
        this.loadPdfBtn = document.getElementById('loadPdfBtn');
        this.loadPdfBtnMain = document.getElementById('loadPdfBtnMain');
        this.exportPdfBtn = document.getElementById('exportPdfBtn');
        
        // Project controls
        this.saveProjectBtn = document.getElementById('saveProjectBtn');
        this.loadProjectBtn = document.getElementById('loadProjectBtn');
        this.clearProjectBtn = document.getElementById('clearProjectBtn');
        
        // Navigation controls
        this.prevPageBtn = document.getElementById('prevPageBtn');
        this.nextPageBtn = document.getElementById('nextPageBtn');
        this.pageInfo = document.getElementById('pageInfo');
        
        // Zoom controls
        this.zoomInBtn = document.getElementById('zoomInBtn');
        this.zoomOutBtn = document.getElementById('zoomOutBtn');
        this.fitWidthBtn = document.getElementById('fitWidthBtn');
        this.zoomLevel = document.getElementById('zoomLevel');
        
        // Tools
        this.addSpaceBtn = document.getElementById('addSpaceBtn');
        this.textBtn = document.getElementById('textBtn');
        
        // Viewer
        this.viewerContainer = document.querySelector('.viewer-container');
        this.pdfViewer = document.getElementById('pdfViewer');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.noContentMessage = document.getElementById('noContentMessage');
        this.spacerPreview = document.getElementById('spacerPreview');
        this.contextMenu = document.getElementById('contextMenu');
        
        // Properties panel
        this.spacerProperties = document.getElementById('spacerProperties');
        this.thumbnails = document.getElementById('thumbnails');

        // Toggles
        this.showBreaksToggle = document.getElementById('showBreaksToggle');
        this.showGuideToggle = document.getElementById('showGuideToggle');

        // Export dialog
        this.exportDialog = document.getElementById('exportDialog');
        this.exportConfirmBtn = document.getElementById('exportConfirmBtn');
        this.exportCancelBtn = document.getElementById('exportCancelBtn');
        this.exportModeRadios = document.querySelectorAll('input[name="exportMode"]');
        this.optContinueAcross = document.getElementById('optContinueAcross');
        this.optDPI = document.getElementById('optDPI');
    }

    bindEvents() {
        // File operations
        this.loadPdfBtn.addEventListener('click', () => this.pdfInput.click());
        this.loadPdfBtnMain.addEventListener('click', () => this.pdfInput.click());
        this.pdfInput.addEventListener('change', (e) => this.loadPDF(e.target.files[0]));
        this.exportPdfBtn.addEventListener('click', () => this.openExportDialog());
        
        // Project operations
        this.saveProjectBtn.addEventListener('click', () => this.saveProject());
        this.loadProjectBtn.addEventListener('click', () => this.projectInput.click());
        this.projectInput.addEventListener('change', (e) => this.loadProject(e.target.files[0]));
        this.clearProjectBtn.addEventListener('click', () => this.clearProject());
        
        // Navigation
        this.prevPageBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        this.nextPageBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        
        // Zoom
        this.zoomInBtn.addEventListener('click', () => this.setZoom(this.scale * 1.2));
        this.zoomOutBtn.addEventListener('click', () => this.setZoom(this.scale / 1.2));
        this.fitWidthBtn.addEventListener('click', () => this.fitToWidth());
        
        // Tools
        this.addSpaceBtn.addEventListener('click', () => this.setTool('addSpace'));
        this.textBtn.addEventListener('click', () => this.setTool('text'));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Context menu
        document.addEventListener('click', () => this.hideContextMenu());
        
        // Window resize
        window.addEventListener('resize', () => this.handleResize());

        if (this.showBreaksToggle) {
            this.showBreaksToggle.addEventListener('change', () => {
                this.showPageBreaks = this.showBreaksToggle.checked;
                this.saveSettings();
                this.renderCurrentPage({ interactive: true });
            });
        }

        if (this.showGuideToggle) {
            this.showGuideToggle.addEventListener('change', () => {
                this.showPlacementGuide = this.showGuideToggle.checked;
                this.saveSettings();
            });
        }
    }

    async loadPDF(file) {
        if (!file) return;
        
        this.showLoading(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            
            // Clear existing content first
            this.pdfViewer.innerHTML = '';
            this.thumbnails.innerHTML = '<p class="no-content">Loading thumbnails...</p>';
            
            this.pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
            this.totalPages = this.pdfDocument.numPages;
            this.currentPage = 1;
            this.spacers.clear();
            this.selectedSpacer = null;
            
            await this.renderCurrentPage();
            this.updateUI();
            await this.generateThumbnails();
            this.saveSettings();
            
        } catch (error) {
            console.error('PDF loading error:', error);
            this.showError('Failed to load PDF: ' + error.message);
            this.pdfViewer.innerHTML = '';
            this.noContentMessage.style.display = 'flex';
        } finally {
            this.showLoading(false);
        }
    }

    async renderCurrentPage(options = {}) {
        const interactive = options.interactive === true;
        if (!this.pdfDocument) {
            console.log('No PDF document loaded');
            return;
        }

        console.log('Rendering page', this.currentPage, 'of', this.totalPages);

        // Prepare render token and preserve scroll position
        const token = ++this.renderToken;
        const prevScrollTop = this.viewerContainer ? this.viewerContainer.scrollTop : 0;
        if (!interactive) this.showLoading(true);
        try {
            const page = await this.pdfDocument.getPage(this.currentPage);
            console.log('Got page object:', page);
            console.log('Page methods:', Object.getOwnPropertyNames(page));
            
            const viewport = page.getViewport({ scale: this.scale });
            console.log('Created viewport:', viewport);
            
            // Clear existing content safely
            this.pdfViewer.innerHTML = '';
            
            // Create loading indicator
            const loadingIndicator = document.createElement('div');
            loadingIndicator.id = 'loadingIndicator';
            loadingIndicator.className = 'loading';
            loadingIndicator.innerHTML = '<div class="spinner"></div><p>Loading PDF...</p>';
            this.pdfViewer.appendChild(loadingIndicator);
            
            // Get spacers for this page
            const pageSpacers = this.spacers.get(this.currentPage) || [];
            
            if (pageSpacers.length === 0) {
                // No spacers - render normally
                await this.renderPageWithoutSpacers(page, viewport, loadingIndicator, token);
            } else {
                // Has spacers - render with reflow
                await this.renderPageWithSpacers(page, viewport, pageSpacers, loadingIndicator, token);
            }

        } catch (error) {
            console.error('Error in renderCurrentPage:', error);
            this.showError('Failed to render page: ' + error.message);
        } finally {
            if (!interactive) this.showLoading(false);
            // Restore scroll position on next frame for smoother UX
            if (this.viewerContainer && token === this.renderToken) {
                requestAnimationFrame(() => {
                    this.viewerContainer.scrollTop = prevScrollTop;
                });
            }
        }
    }

    async renderPageWithoutSpacers(page, viewport, loadingIndicator, token) {
        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Render PDF page
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        // Create page container
        const pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-page';
        pageContainer.style.width = viewport.width + 'px';
        pageContainer.style.height = viewport.height + 'px';
        pageContainer.dataset.pageNumber = this.currentPage;
        
        // Add canvas to page
        pageContainer.appendChild(canvas);
        
        // Add click handler for spacer placement
        pageContainer.addEventListener('click', (e) => this.handlePageClick(e));
        pageContainer.addEventListener('contextmenu', (e) => this.handlePageContextMenu(e));
        
        // Add page break overlays if enabled
        if (this.showPageBreaks) this.addPageBreakOverlays(pageContainer, viewport);
        // Finalize only if this is the latest render
        if (token === this.renderToken) {
            this.pdfViewer.innerHTML = '';
            this.pdfViewer.appendChild(pageContainer);
        }
    }

    async renderPageWithSpacers(page, viewport, pageSpacers, loadingIndicator, token) {
        // Sort spacers by Y position
        const sortedSpacers = [...pageSpacers].sort((a, b) => a.y - b.y);
        
        // Create a container for the reflowed content
        const pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-page reflowed';
        pageContainer.style.width = viewport.width + 'px';
        pageContainer.dataset.pageNumber = this.currentPage;
        
        let currentY = 0;
        let cumulativeOffset = 0;
        
        // Process each segment of content
        for (let i = 0; i < sortedSpacers.length; i++) {
            const spacer = sortedSpacers[i];
            
            // Add content before spacer
            if (spacer.y > currentY) {
                const contentHeight = spacer.y - currentY;
                const contentCanvas = await this.createContentCanvas(page, viewport, currentY, contentHeight);
                
                const contentElement = document.createElement('div');
                contentElement.className = 'content-segment';
                contentElement.style.position = 'absolute';
                contentElement.style.left = '0';
                contentElement.style.top = (currentY + cumulativeOffset) + 'px';
                contentElement.style.width = viewport.width + 'px';
                contentElement.style.height = contentHeight + 'px';
                contentElement.appendChild(contentCanvas);
                
                pageContainer.appendChild(contentElement);
            }
            
            // Add spacer
            const spacerElement = document.createElement('div');
            spacerElement.className = `spacer ${spacer.style}`;
            spacerElement.dataset.spacerId = spacer.id;
            spacerElement.style.position = 'absolute';
            spacerElement.style.left = '0';
            spacerElement.style.top = (spacer.y + cumulativeOffset) + 'px';
            spacerElement.style.width = viewport.width + 'px';
            spacerElement.style.height = spacer.height + 'px';
            
            // Set CSS custom properties for styles
            if (spacer.style === 'ruled') {
                spacerElement.style.setProperty('--rule-spacing', spacer.ruleSpacing + 'px');
            } else if (spacer.style === 'dot-grid') {
                spacerElement.style.setProperty('--dot-pitch', spacer.dotPitch + 'px');
            } else if (spacer.style === 'squared') {
                spacerElement.style.setProperty('--grid-size', spacer.gridSize + 'px');
            }
            
            // Add resize handle
            const handle = document.createElement('div');
            handle.className = 'spacer-handle';
            spacerElement.appendChild(handle);
            
            // Add label
            const label = document.createElement('div');
            label.className = 'spacer-label';
            label.textContent = `${spacer.height}px`;
            spacerElement.appendChild(label);
            
            // Add event listeners
            spacerElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectSpacer(spacer.id);
            });
            
            spacerElement.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('spacer-handle')) {
                    this.startResizeSpacer(spacer.id, e);
                } else {
                    this.beginPotentialDrag(spacer.id, e);
                }
            });
            
            pageContainer.appendChild(spacerElement);
            
            currentY = spacer.y;
            cumulativeOffset += spacer.height;
        }
        
        // Add remaining content after last spacer
        if (currentY < viewport.height) {
            const remainingHeight = viewport.height - currentY;
            const contentCanvas = await this.createContentCanvas(page, viewport, currentY, remainingHeight);
            
            const contentElement = document.createElement('div');
            contentElement.className = 'content-segment';
            contentElement.style.position = 'absolute';
            contentElement.style.left = '0';
            contentElement.style.top = (currentY + cumulativeOffset) + 'px';
            contentElement.style.width = viewport.width + 'px';
            contentElement.style.height = remainingHeight + 'px';
            contentElement.appendChild(contentCanvas);
            
            pageContainer.appendChild(contentElement);
        }
        
        // Set container height based on total content
        const totalHeight = viewport.height + cumulativeOffset;
        pageContainer.style.height = totalHeight + 'px';
        
        // Add click handler for spacer placement
        pageContainer.addEventListener('click', (e) => this.handlePageClick(e));
        pageContainer.addEventListener('contextmenu', (e) => this.handlePageContextMenu(e));
        
        // Add page break overlays if enabled
        if (this.showPageBreaks) this.addPageBreakOverlays(pageContainer, viewport);
        // Finalize only if this is the latest render
        if (token === this.renderToken) {
            this.pdfViewer.innerHTML = '';
            this.pdfViewer.appendChild(pageContainer);
        }
    }

    async createContentCanvas(page, viewport, startY, height) {
        // Create a temporary canvas for the full page
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        
        // Render the full page
        await page.render({
            canvasContext: tempContext,
            viewport: viewport
        }).promise;
        
        // Create the segment canvas
        const segmentCanvas = document.createElement('canvas');
        const segmentContext = segmentCanvas.getContext('2d');
        segmentCanvas.width = viewport.width;
        segmentCanvas.height = height;
        
        // Draw only the segment we need
        segmentContext.drawImage(
            tempCanvas,
            0, startY, viewport.width, height,
            0, 0, viewport.width, height
        );
        
        return segmentCanvas;
    }

    updatePlacementGuide(e) {
        if (!(this.currentTool === 'addSpace' && this.showPlacementGuide)) {
            this.hidePlacementGuide();
            return;
        }
        const pageContainer = e.currentTarget;
        const rect = pageContainer.getBoundingClientRect();
        const y = e.clientY - rect.top;
        let guide = pageContainer.querySelector('.cursor-guide');
        if (!guide) {
            guide = document.createElement('div');
            guide.className = 'cursor-guide';
            pageContainer.appendChild(guide);
        }
        guide.style.top = `${Math.max(0, Math.min(y, pageContainer.clientHeight))}px`;
    }

    hidePlacementGuide() {
        const guides = this.pdfViewer.querySelectorAll('.cursor-guide');
        guides.forEach(g => g.remove());
    }


    handlePageClick(e) {
        if (this.currentTool === 'addSpace') {
            this.handleAddSpaceClick(e);
        } else if (this.currentTool === 'text') {
            this.handleTextClick(e);
        }
    }

    handleAddSpaceClick(e) {
        const pageContainer = e.currentTarget;
        const rect = pageContainer.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        
        // Calculate the original Y position (accounting for any existing spacers above)
        const pageSpacers = this.spacers.get(this.currentPage) || [];
        const sortedSpacers = [...pageSpacers].sort((a, b) => a.y - b.y);
        
        let originalY = clickY;
        let cumulativeOffset = 0;
        
        // Subtract the cumulative offset from spacers above this click point
        for (const spacer of sortedSpacers) {
            if (spacer.y + cumulativeOffset < clickY) {
                cumulativeOffset += spacer.height;
                originalY = clickY - cumulativeOffset;
            } else {
                break;
            }
        }
        
        // Create new spacer at the original Y position, using last preset
        const preset = this.lastSpacerPreset || { style: 'plain', ruleSpacing: 20, dotPitch: 10, gridSize: 20 };
        const spacer = {
            id: Date.now().toString(),
            y: Math.max(0, originalY),
            height: 100,
            style: preset.style || 'plain',
            ruleSpacing: preset.ruleSpacing || 20,
            dotPitch: preset.dotPitch || 10,
            gridSize: preset.gridSize || 20
        };
        
        this.addSpacerToPage(this.currentPage, spacer);
        this.renderCurrentPage();
        this.selectSpacer(spacer.id);
        this.saveSettings();
    }

    handleTextClick(e) {
        const pageContainer = e.currentTarget;
        const rect = pageContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // Prompt for text input
        const text = prompt('Enter text to add:');
        if (text && text.trim()) {
            // For now, just show an alert - in a full implementation, you'd add text elements
            alert(`Text "${text}" would be added at position (${Math.round(clickX)}, ${Math.round(clickY)})`);
        }
    }

    handlePageContextMenu(e) {
        const spacerElement = e.target.closest('.spacer');
        if (!spacerElement) return;
        
        e.preventDefault();
        this.showContextMenu(e.clientX, e.clientY, spacerElement.dataset.spacerId);
    }

    showContextMenu(x, y, spacerId) {
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';
        
        // Remove existing listeners
        const items = this.contextMenu.querySelectorAll('.context-item');
        items.forEach(item => {
            item.replaceWith(item.cloneNode(true));
        });
        
        // Add new listeners
        this.contextMenu.querySelector('[data-action="edit"]').addEventListener('click', () => {
            this.selectSpacer(spacerId);
            this.hideContextMenu();
        });
        
        const dup = this.contextMenu.querySelector('[data-action="duplicate"]');
        if (dup) {
            dup.addEventListener('click', () => {
                this.duplicateSpacer(spacerId);
                this.hideContextMenu();
            });
        }
        
        this.contextMenu.querySelector('[data-action="delete"]').addEventListener('click', () => {
            this.deleteSpacer(spacerId);
            this.hideContextMenu();
        });
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
    }

    addSpacerToPage(pageNumber, spacer) {
        if (!this.spacers.has(pageNumber)) {
            this.spacers.set(pageNumber, []);
        }
        this.spacers.get(pageNumber).push(spacer);
    }

    duplicateSpacer(spacerId) {
        for (let [pageNumber, spacers] of this.spacers) {
            const original = spacers.find(s => s.id === spacerId);
            if (original) {
                const copy = { ...original, id: Date.now().toString(), y: Math.max(0, original.y + 20) };
                spacers.push(copy);
                this.renderCurrentPage({ interactive: true });
                this.selectSpacer(copy.id);
                this.saveSettings();
                return;
            }
        }
    }

    selectSpacer(spacerId) {
        // Remove previous selection
        document.querySelectorAll('.spacer.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Select new spacer
        const spacerElement = document.querySelector(`[data-spacer-id="${spacerId}"]`);
        if (spacerElement) {
            spacerElement.classList.add('selected');
            this.selectedSpacer = spacerId;
            this.updateSpacerProperties();
        }
    }

    deleteSpacer(spacerId) {
        // Find and remove spacer
        for (let [pageNumber, spacers] of this.spacers) {
            const index = spacers.findIndex(s => s.id === spacerId);
            if (index !== -1) {
                spacers.splice(index, 1);
                if (spacers.length === 0) {
                    this.spacers.delete(pageNumber);
                }
                break;
            }
        }
        
        if (this.selectedSpacer === spacerId) {
            this.selectedSpacer = null;
            this.updateSpacerProperties();
        }
        
        this.renderCurrentPage();
        this.saveSettings();
    }

    updateSpacerProperties() {
        if (!this.selectedSpacer) {
            this.spacerProperties.innerHTML = '<p class="no-selection">Select a spacer to edit properties</p>';
            return;
        }
        
        // Find the selected spacer
        let spacer = null;
        for (let spacers of this.spacers.values()) {
            spacer = spacers.find(s => s.id === this.selectedSpacer);
            if (spacer) break;
        }
        
        if (!spacer) return;
        
        this.spacerProperties.innerHTML = `
            <div class="property-group">
                <label class="property-label">Style</label>
                <select class="property-select" data-property="style">
                    <option value="plain" ${spacer.style === 'plain' ? 'selected' : ''}>Plain</option>
                    <option value="ruled" ${spacer.style === 'ruled' ? 'selected' : ''}>Ruled</option>
                    <option value="dot-grid" ${spacer.style === 'dot-grid' ? 'selected' : ''}>Dot Grid</option>
                    <option value="squared" ${spacer.style === 'squared' ? 'selected' : ''}>Squared Paper</option>
                </select>
            </div>
            <div class="property-group">
                <label class="property-label">Height (px)</label>
                <input type="number" class="property-input" data-property="height" value="${spacer.height}" min="20" max="500">
            </div>
            ${spacer.style === 'ruled' ? `
                <div class="property-group">
                    <label class="property-label">Rule Spacing (px)</label>
                    <input type="number" class="property-input" data-property="ruleSpacing" value="${spacer.ruleSpacing}" min="10" max="50">
                </div>
            ` : ''}
            ${spacer.style === 'dot-grid' ? `
                <div class="property-group">
                    <label class="property-label">Dot Pitch (px)</label>
                    <input type="number" class="property-input" data-property="dotPitch" value="${spacer.dotPitch}" min="5" max="30">
                </div>
            ` : ''}
            ${spacer.style === 'squared' ? `
                <div class="property-group">
                    <label class="property-label">Grid Size (px)</label>
                    <input type="number" class="property-input" data-property="gridSize" value="${spacer.gridSize}" min="10" max="40">
                </div>
            ` : ''}
            <div class="property-group">
                <label class="property-label">Y Position (px)</label>
                <input type="number" class="property-input" data-property="y" value="${spacer.y}" min="0">
            </div>
        `;
        
        // Add event listeners
        this.spacerProperties.querySelectorAll('[data-property]').forEach(input => {
            input.addEventListener('change', (e) => {
                const property = e.target.dataset.property;
                const value = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                this.updateSpacerProperty(spacer.id, property, value);
            });
        });
    }

    updateSpacerProperty(spacerId, property, value, options = {}) {
        const immediate = options.immediate !== undefined ? options.immediate : true;
        // Find and update spacer
        for (let spacers of this.spacers.values()) {
            const spacer = spacers.find(s => s.id === spacerId);
            if (spacer) {
                spacer[property] = value;
                // Update last-used preset when style or style-specific properties change
                if (property === 'style') {
                    this.lastSpacerPreset.style = value;
                } else if (property === 'ruleSpacing') {
                    this.lastSpacerPreset.ruleSpacing = value;
                } else if (property === 'dotPitch') {
                    this.lastSpacerPreset.dotPitch = value;
                } else if (property === 'gridSize') {
                    this.lastSpacerPreset.gridSize = value;
                }
                if (immediate) {
                    this.renderCurrentPage();
                    this.saveSettings();
                } else {
                    this.scheduleRender();
                }
                break;
            }
        }
    }

    scheduleRender() {
        if (this._renderRAF) return;
        this._renderRAF = requestAnimationFrame(() => {
            this._renderRAF = null;
            this.renderCurrentPage({ interactive: true });
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        
        // Update button states
        document.querySelectorAll('.btn-tool').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (tool === 'addSpace') {
            this.addSpaceBtn.classList.add('active');
            document.body.style.cursor = 'crosshair';
        } else if (tool === 'text') {
            this.textBtn.classList.add('active');
            document.body.style.cursor = 'text';
        } else {
            document.body.style.cursor = 'default';
        }
    }

    goToPage(pageNumber) {
        if (pageNumber < 1 || pageNumber > this.totalPages) return;
        
        this.currentPage = pageNumber;
        this.renderCurrentPage();
        this.updateUI();
    }

    setZoom(scale) {
        this.scale = Math.max(0.5, Math.min(3.0, scale));
        this.renderCurrentPage();
        this.updateUI();
    }

    fitToWidth() {
        if (!this.pdfViewer.querySelector('.pdf-page')) return;
        
        const pageElement = this.pdfViewer.querySelector('.pdf-page');
        const containerWidth = this.pdfViewer.clientWidth - 40; // Account for padding
        const pageWidth = pageElement.clientWidth;
        
        this.scale = (containerWidth / pageWidth) * this.scale;
        this.renderCurrentPage();
        this.updateUI();
    }

    updateUI() {
        // Update page info
        this.pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
        
        // Update navigation buttons
        this.prevPageBtn.disabled = this.currentPage <= 1;
        this.nextPageBtn.disabled = this.currentPage >= this.totalPages;
        
        // Update zoom level
        this.zoomLevel.textContent = Math.round(this.scale * 100) + '%';
        
        // Update export button
        this.exportPdfBtn.disabled = !this.pdfDocument;
    }

    async generateThumbnails() {
        if (!this.pdfDocument) return;
        
        this.thumbnails.innerHTML = '';
        
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            const page = await this.pdfDocument.getPage(pageNum);
            const viewport = page.getViewport({ scale: 0.2 });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            const thumbnail = document.createElement('img');
            thumbnail.src = canvas.toDataURL();
            thumbnail.className = 'thumbnail';
            if (pageNum === this.currentPage) {
                thumbnail.classList.add('active');
            }
            
            thumbnail.addEventListener('click', () => this.goToPage(pageNum));
            this.thumbnails.appendChild(thumbnail);
        }
    }

    handleKeydown(e) {
        if (!this.selectedSpacer) return;
        
        switch (e.key) {
            case 'Delete':
            case 'Backspace':
                this.deleteSpacer(this.selectedSpacer);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.nudgeSpacer(this.selectedSpacer, -5);
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.nudgeSpacer(this.selectedSpacer, 5);
                break;
        }
    }

    nudgeSpacer(spacerId, deltaY) {
        this.updateSpacerProperty(spacerId, 'y', Math.max(0, this.getSpacerProperty(spacerId, 'y') + deltaY));
    }

    getSpacerProperty(spacerId, property) {
        for (let spacers of this.spacers.values()) {
            const spacer = spacers.find(s => s.id === spacerId);
            if (spacer) return spacer[property];
        }
        return null;
    }

    showLoading(show) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const noContentMessage = document.getElementById('noContentMessage');
        
        if (loadingIndicator) {
            loadingIndicator.style.display = show ? 'flex' : 'none';
        }
        if (noContentMessage) {
            noContentMessage.style.display = show ? 'none' : (this.pdfDocument ? 'none' : 'flex');
        }
    }

    showError(message) {
        // Create a proper error dialog instead of alert
        const errorDialog = document.createElement('div');
        errorDialog.className = 'error-dialog';
        errorDialog.innerHTML = `
            <div class="error-content">
                <h3>Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()">OK</button>
            </div>
        `;
        
        // Add error dialog styles if not already present
        if (!document.getElementById('error-dialog-styles')) {
            const style = document.createElement('style');
            style.id = 'error-dialog-styles';
            style.textContent = `
                .error-dialog {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 5000;
                }
                .error-content {
                    background: white;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
                    max-width: 400px;
                    text-align: center;
                }
                .error-content h3 {
                    color: #e74c3c;
                    margin-bottom: 15px;
                }
                .error-content p {
                    margin-bottom: 20px;
                    color: #2c3e50;
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(errorDialog);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDialog.parentNode) {
                errorDialog.remove();
            }
        }, 5000);
    }

    handleResize() {
        if (this.pdfDocument) {
            this.renderCurrentPage();
        }
    }

    async exportPDF(options) {
        if (!this.pdfDocument) {
            this.showError('No PDF loaded');
            return;
        }
        
        // Check if jsPDF is available
        if (!window.jspdf) {
            this.showError('jsPDF library not loaded');
            return;
        }
        
        // Show progress overlay
        const progressOverlay = document.createElement('div');
        progressOverlay.className = 'progress-overlay';
        progressOverlay.innerHTML = `
            <div class="progress-content">
                <h3>Exporting PDF...</h3>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <p>Please wait while we process your document</p>
            </div>
        `;
        document.body.appendChild(progressOverlay);
        
        try {
            const mode = options?.mode || 'paginated';
            if (mode === 'long') {
                await this.exportPDFSingleLong(progressOverlay, options);
            } else {
                await this.exportPDFPaginated(progressOverlay, options);
            }
            
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Failed to export PDF: ' + error.message);
        } finally {
            if (progressOverlay.parentNode) {
                document.body.removeChild(progressOverlay);
            }
        }
    }

    async exportPageSimple(pdf, pageNum, isFirstPage, pageWidth, pageHeight) {
        try {
            // Use the same method as the viewer to get the page
            const page = await this.pdfDocument.getPage(pageNum);
            console.log('Got page object:', page);
            
            // Create viewport exactly like in the viewer
            const viewport = page.getViewport({ scale: 1.0 });
            console.log('Viewport created:', viewport);
            
            const pageSpacers = this.spacers.get(pageNum) || [];
            
            // Render at higher resolution for crispness
            const DPR = 2; // can be tuned or tied to devicePixelRatio
            
            if (pageSpacers.length === 0) {
                // Simple path: render one full page at 2x and add
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = Math.floor(pageWidth * DPR);
                canvas.height = Math.floor(pageHeight * DPR);
                context.fillStyle = 'white';
                context.fillRect(0, 0, canvas.width, canvas.height);
                await this.renderSimplePage(context, page, viewport, canvas.width, canvas.height);
                if (!isFirstPage) pdf.addPage();
                const img = canvas.toDataURL('image/png');
                pdf.addImage(img, 'PNG', 0, 0, pageWidth, pageHeight);
                return;
            }

            // Reflow path: build a tall canvas at pageWidth, then slice into pages
            const sortedSpacers = [...pageSpacers].sort((a, b) => a.y - b.y);
            const scaleToWidth = (pageWidth * DPR) / viewport.width; // pixels per PDF unit
            const tallWidth = Math.floor(pageWidth * DPR);
            let totalHeightUnits = viewport.height;
            for (const s of sortedSpacers) totalHeightUnits += s.height;
            const tallHeight = Math.ceil(totalHeightUnits * scaleToWidth);

            // Render full original page once
            const tempCanvas = document.createElement('canvas');
            const tempContext = tempCanvas.getContext('2d');
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            await page.render({ canvasContext: tempContext, viewport }).promise;

            // Compose tall canvas with reflow
            const tallCanvas = document.createElement('canvas');
            const tallCtx = tallCanvas.getContext('2d');
            tallCanvas.width = tallWidth;
            tallCanvas.height = tallHeight;
            
            // White background
            tallCtx.fillStyle = 'white';
            tallCtx.fillRect(0, 0, tallWidth, tallHeight);

            let currentY = 0;
            let cumulativeOffset = 0;
            for (const spacer of sortedSpacers) {
                if (spacer.y > currentY) {
                    const contentHeight = spacer.y - currentY; // in original units
                    const destY = Math.round((currentY + cumulativeOffset) * scaleToWidth);
                    const destH = Math.round(contentHeight * scaleToWidth);
                    tallCtx.drawImage(
                        tempCanvas,
                        0, currentY, viewport.width, contentHeight,
                        0, destY, tallWidth, destH
                    );
                }
                // Draw spacer
                const spacerY = Math.round((spacer.y + cumulativeOffset) * scaleToWidth);
                const spacerH = Math.round(spacer.height * scaleToWidth);
                this.drawSpacerOnCanvas(tallCtx, spacer, tallWidth, spacerY, spacerH, scaleToWidth);
                currentY = spacer.y;
                cumulativeOffset += spacer.height;
            }
            // Remaining content
            if (currentY < viewport.height) {
                const remaining = viewport.height - currentY;
                const destY = Math.round((currentY + cumulativeOffset) * scaleToWidth);
                const destH = Math.round(remaining * scaleToWidth);
                tallCtx.drawImage(
                    tempCanvas,
                    0, currentY, viewport.width, remaining,
                    0, destY, tallWidth, destH
                );
            }

            // Slice tall canvas into A4-height pages
            const sliceHeightPx = Math.floor(pageHeight * DPR);
            let offset = 0;
            let firstSlice = true;
            while (offset < tallCanvas.height) {
                const sliceCanvas = document.createElement('canvas');
                const sliceCtx = sliceCanvas.getContext('2d');
                const h = Math.min(sliceHeightPx, tallCanvas.height - offset);
                sliceCanvas.width = tallWidth;
                sliceCanvas.height = h;
                sliceCtx.drawImage(
                    tallCanvas,
                    0, offset, tallWidth, h,
                    0, 0, tallWidth, h
                );
                // Add to PDF
                if (!isFirstPage || !firstSlice) {
                    pdf.addPage();
                }
                const img = sliceCanvas.toDataURL('image/png');
                pdf.addImage(img, 'PNG', 0, 0, pageWidth, h / DPR);
                firstSlice = false;
                offset += h;
            }
            
        } catch (error) {
            console.error(`Error in exportPageSimple for page ${pageNum}:`, error);
            throw error;
        }
    }

    async renderSimplePage(context, page, viewport, canvasWidth, canvasHeight) {
        // Calculate scale to fit canvas
        const scaleX = canvasWidth / viewport.width;
        const scaleY = canvasHeight / viewport.height;
        const scale = Math.min(scaleX, scaleY);
        
        // Calculate position to center
        const scaledWidth = viewport.width * scale;
        const scaledHeight = viewport.height * scale;
        const offsetX = (canvasWidth - scaledWidth) / 2;
        const offsetY = (canvasHeight - scaledHeight) / 2;
        
        // Create temporary canvas
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        
        // Render the page
        await page.render({
            canvasContext: tempContext,
            viewport: viewport
        }).promise;
        
        // Draw to main canvas
        context.drawImage(
            tempCanvas,
            0, 0, viewport.width, viewport.height,
            offsetX, offsetY, scaledWidth, scaledHeight
        );
    }

    async renderPageWithSpacersSimple(context, page, viewport, pageSpacers, canvasWidth, canvasHeight) {
        const sortedSpacers = [...pageSpacers].sort((a, b) => a.y - b.y);
        
        // Calculate total height
        let totalHeight = viewport.height;
        for (const spacer of sortedSpacers) {
            totalHeight += spacer.height;
        }
        
        // Calculate scale to fit
        const scaleX = canvasWidth / viewport.width;
        const scaleY = canvasHeight / totalHeight;
        const scale = Math.min(scaleX, scaleY);
        
        // Calculate position to center
        const scaledWidth = viewport.width * scale;
        const scaledHeight = totalHeight * scale;
        const offsetX = (canvasWidth - scaledWidth) / 2;
        const offsetY = (canvasHeight - scaledHeight) / 2;
        
        // Create temporary canvas for PDF
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        
        // Render the full PDF page
        await page.render({
            canvasContext: tempContext,
            viewport: viewport
        }).promise;
        
        // Render content and spacers
        let currentY = 0;
        let cumulativeOffset = 0;
        
        for (let i = 0; i < sortedSpacers.length; i++) {
            const spacer = sortedSpacers[i];
            
            // Render content before spacer
            if (spacer.y > currentY) {
                const contentHeight = spacer.y - currentY;
                const destY = offsetY + (currentY + cumulativeOffset) * scale;
                
                context.drawImage(
                    tempCanvas,
                    0, currentY, viewport.width, contentHeight,
                    offsetX, destY, scaledWidth, contentHeight * scale
                );
            }
            
            // Render spacer
            const spacerY = offsetY + (spacer.y + cumulativeOffset) * scale;
            const spacerHeight = spacer.height * scale;
            this.drawSpacerOnCanvas(context, spacer, scaledWidth, spacerY, spacerHeight, scale);
            
            currentY = spacer.y;
            cumulativeOffset += spacer.height;
        }
        
        // Render remaining content
        if (currentY < viewport.height) {
            const remainingHeight = viewport.height - currentY;
            const destY = offsetY + (currentY + cumulativeOffset) * scale;
            
            context.drawImage(
                tempCanvas,
                0, currentY, viewport.width, remainingHeight,
                offsetX, destY, scaledWidth, remainingHeight * scale
            );
        }
    }

    // Helper: build a tall canvas for a single source page with spacers, scaled to pageWidth at DPR
    async buildTallReflowCanvas(page, viewport, pageSpacers, pageWidthPt, DPR) {
        const sortedSpacers = [...pageSpacers].sort((a, b) => a.y - b.y);
        const tallWidth = Math.floor(pageWidthPt * DPR);
        const scaleToWidth = (pageWidthPt * DPR) / viewport.width;
        let totalHeightUnits = viewport.height;
        for (const s of sortedSpacers) totalHeightUnits += s.height;
        const tallHeight = Math.ceil(totalHeightUnits * scaleToWidth);

        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        await page.render({ canvasContext: tempContext, viewport }).promise;

        const tallCanvas = document.createElement('canvas');
        const tallCtx = tallCanvas.getContext('2d');
        tallCanvas.width = tallWidth;
        tallCanvas.height = tallHeight;
        tallCtx.fillStyle = 'white';
        tallCtx.fillRect(0, 0, tallWidth, tallHeight);

        let currentY = 0;
        let cumulativeOffset = 0;
        for (const spacer of sortedSpacers) {
            if (spacer.y > currentY) {
                const contentHeight = spacer.y - currentY;
                const destY = Math.round((currentY + cumulativeOffset) * scaleToWidth);
                const destH = Math.round(contentHeight * scaleToWidth);
                tallCtx.drawImage(
                    tempCanvas,
                    0, currentY, viewport.width, contentHeight,
                    0, destY, tallWidth, destH
                );
            }
            const spacerY = Math.round((spacer.y + cumulativeOffset) * scaleToWidth);
            const spacerH = Math.round(spacer.height * scaleToWidth);
            this.drawSpacerOnCanvas(tallCtx, spacer, tallWidth, spacerY, spacerH, scaleToWidth);
            currentY = spacer.y;
            cumulativeOffset += spacer.height;
        }
        if (currentY < viewport.height) {
            const remaining = viewport.height - currentY;
            const destY = Math.round((currentY + cumulativeOffset) * scaleToWidth);
            const destH = Math.round(remaining * scaleToWidth);
            tallCtx.drawImage(
                tempCanvas,
                0, currentY, viewport.width, remaining,
                0, destY, tallWidth, destH
            );
        }
        return tallCanvas;
    }

    async exportSinglePage(pdf, pageNum, isFirstPage) {
        try {
            console.log(`Getting page ${pageNum} from PDF document`);
            
            // Get page using the same method as in the viewer
            const page = await this.pdfDocument.getPage(pageNum);
            console.log('Page object:', page);
            console.log('Page methods:', Object.getOwnPropertyNames(page));
            console.log('Page prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(page)));
            
            const pageSpacers = this.spacers.get(pageNum) || [];
            
            // Create a standard A4-sized canvas
            const A4_WIDTH = 595; // A4 width in points
            const A4_HEIGHT = 842; // A4 height in points
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = A4_WIDTH;
            canvas.height = A4_HEIGHT;
            
            // Fill with white background
            context.fillStyle = 'white';
            context.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
            
            if (pageSpacers.length === 0) {
                // No spacers - render page normally
                await this.renderExportPageWithoutSpacers(context, page, A4_WIDTH, A4_HEIGHT);
            } else {
                // Has spacers - render with reflow
                await this.renderExportPageWithSpacers(context, page, pageSpacers, A4_WIDTH, A4_HEIGHT);
            }
            
            if (!isFirstPage) pdf.addPage();
            
            // Add to PDF
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH, A4_HEIGHT);
        } catch (error) {
            console.error(`Error exporting page ${pageNum}:`, error);
            throw error;
        }
    }

    // Export helpers: distinct names to avoid overriding viewer methods
    async renderExportPageWithoutSpacers(context, page, canvasWidth, canvasHeight) {
        try {
            console.log('Rendering page without spacers');
            
            // Check if page has getViewport method
            if (typeof page.getViewport !== 'function') {
                throw new Error('Page object does not have getViewport method');
            }
            
            // Render the original page
            const viewport = page.getViewport({ scale: 1.0 });
            console.log('Viewport:', viewport);
            
            // Calculate scale to fit canvas while maintaining aspect ratio
            const scaleX = canvasWidth / viewport.width;
            const scaleY = canvasHeight / viewport.height;
            const scale = Math.min(scaleX, scaleY);
            
            // Calculate position to center the content
            const scaledWidth = viewport.width * scale;
            const scaledHeight = viewport.height * scale;
            const offsetX = (canvasWidth - scaledWidth) / 2;
            const offsetY = (canvasHeight - scaledHeight) / 2;
            
            // Create temporary canvas for the PDF page
            const tempCanvas = document.createElement('canvas');
            const tempContext = tempCanvas.getContext('2d');
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            
            // Render the PDF page
            await page.render({
                canvasContext: tempContext,
                viewport: viewport
            }).promise;
            
            // Draw to main canvas with proper scaling and centering
            context.drawImage(
                tempCanvas,
                0, 0, viewport.width, viewport.height,
                offsetX, offsetY, scaledWidth, scaledHeight
            );
        } catch (error) {
            console.error('Error in renderPageWithoutSpacers:', error);
            throw error;
        }
    }

    async renderExportPageWithSpacers(context, page, pageSpacers, canvasWidth, canvasHeight) {
        const viewport = page.getViewport({ scale: 1.0 });
        const sortedSpacers = [...pageSpacers].sort((a, b) => a.y - b.y);
        
        // Calculate total height including spacers
        let totalHeight = viewport.height;
        for (const spacer of sortedSpacers) {
            totalHeight += spacer.height;
        }
        
        // Calculate scale to fit the reflowed content on A4
        const scaleX = canvasWidth / viewport.width;
        const scaleY = canvasHeight / totalHeight;
        const scale = Math.min(scaleX, scaleY);
        
        // Calculate position to center the content
        const scaledWidth = viewport.width * scale;
        const scaledHeight = totalHeight * scale;
        const offsetX = (canvasWidth - scaledWidth) / 2;
        const offsetY = (canvasHeight - scaledHeight) / 2;
        
        // Render content segments and spacers
        let currentY = 0;
        let cumulativeOffset = 0;
        
        // Create temporary canvas for PDF rendering
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        
        // Render the full PDF page once
        await page.render({
            canvasContext: tempContext,
            viewport: viewport
        }).promise;
        
        for (let i = 0; i < sortedSpacers.length; i++) {
            const spacer = sortedSpacers[i];
            
            // Render content before spacer
            if (spacer.y > currentY) {
                const contentHeight = spacer.y - currentY;
                const destY = offsetY + (currentY + cumulativeOffset) * scale;
                
                context.drawImage(
                    tempCanvas,
                    0, currentY, viewport.width, contentHeight,
                    offsetX, destY, scaledWidth, contentHeight * scale
                );
            }
            
            // Render spacer
            const spacerY = offsetY + (spacer.y + cumulativeOffset) * scale;
            const spacerHeight = spacer.height * scale;
            this.drawSpacerOnCanvas(context, spacer, scaledWidth, spacerY, spacerHeight, scale);
            
            currentY = spacer.y;
            cumulativeOffset += spacer.height;
        }
        
        // Render remaining content after last spacer
        if (currentY < viewport.height) {
            const remainingHeight = viewport.height - currentY;
            const destY = offsetY + (currentY + cumulativeOffset) * scale;
            
            context.drawImage(
                tempCanvas,
                0, currentY, viewport.width, remainingHeight,
                offsetX, destY, scaledWidth, remainingHeight * scale
            );
        }
    }


    drawSpacerOnCanvas(context, spacer, pageWidth, y = spacer.y, height = spacer.height, scale = 1) {
        context.save();
        
        // Draw spacer background
        context.fillStyle = 'white';
        context.fillRect(0, y, pageWidth, height);
        
        // Draw spacer style with proper scaling
        if (spacer.style === 'ruled') {
            context.strokeStyle = '#ddd';
            context.lineWidth = 1;
            for (let ruleY = y; ruleY < y + height; ruleY += spacer.ruleSpacing * scale) {
                context.beginPath();
                context.moveTo(0, ruleY);
                context.lineTo(pageWidth, ruleY);
                context.stroke();
            }
        } else if (spacer.style === 'dot-grid') {
            context.fillStyle = '#ddd';
            for (let x = 0; x < pageWidth; x += spacer.dotPitch * scale) {
                for (let dotY = y; dotY < y + height; dotY += spacer.dotPitch * scale) {
                    context.beginPath();
                    context.arc(x, dotY, 1, 0, Math.PI * 2);
                    context.fill();
                }
            }
        } else if (spacer.style === 'squared') {
            context.strokeStyle = '#ddd';
            context.lineWidth = 1;
            // Draw vertical lines
            for (let x = 0; x < pageWidth; x += spacer.gridSize * scale) {
                context.beginPath();
                context.moveTo(x, y);
                context.lineTo(x, y + height);
                context.stroke();
            }
            // Draw horizontal lines
            for (let gridY = y; gridY < y + height; gridY += spacer.gridSize * scale) {
                context.beginPath();
                context.moveTo(0, gridY);
                context.lineTo(pageWidth, gridY);
                context.stroke();
            }
        }
        
        context.restore();
    }

    // Click vs drag threshold handling
    beginPotentialDrag(spacerId, e) {
        this.pendingDrag = { id: spacerId, startY: e.clientY, moved: false };
        document.addEventListener('mousemove', this.monitorPotentialDrag);
        document.addEventListener('mouseup', this.finalizePotentialDrag, { once: true });
    }

    monitorPotentialDrag = (e) => {
        if (!this.pendingDrag) return;
        const threshold = 5;
        const delta = Math.abs(e.clientY - this.pendingDrag.startY);
        if (delta > threshold) {
            const id = this.pendingDrag.id;
            // Stop monitoring and start real drag
            document.removeEventListener('mousemove', this.monitorPotentialDrag);
            this.pendingDrag = null;
            this.startDragSpacer(id, e);
        }
    }

    finalizePotentialDrag = (e) => {
        // If no drag started, treat as selection
        if (this.pendingDrag) {
            const id = this.pendingDrag.id;
            document.removeEventListener('mousemove', this.monitorPotentialDrag);
            this.pendingDrag = null;
            this.selectSpacer(id);
        }
    }

    startDragSpacer(spacerId, e) {
        this.draggingSpacer = spacerId;
        this.dragStartY = e.clientY;
        this.dragStartSpacerY = this.getSpacerProperty(spacerId, 'y');
        
        document.addEventListener('mousemove', this.handleSpacerDrag);
        document.addEventListener('mouseup', this.stopDragSpacer);
        // Prevent text selection once drag has actually started
        e.preventDefault();
    }

    handleSpacerDrag = (e) => {
        if (!this.draggingSpacer) return;
        
        const deltaY = e.clientY - this.dragStartY;
        const newY = Math.max(0, this.dragStartSpacerY + deltaY);
        
        this.updateSpacerProperty(this.draggingSpacer, 'y', newY, { immediate: false });
    }

    stopDragSpacer = () => {
        this.draggingSpacer = null;
        document.removeEventListener('mousemove', this.handleSpacerDrag);
        document.removeEventListener('mouseup', this.stopDragSpacer);
        // Commit final layout and persist
            this.renderCurrentPage({ interactive: false });
            this.saveSettings();
    }

    startResizeSpacer(spacerId, e) {
        this.resizingSpacer = spacerId;
        this.resizeStartY = e.clientY;
        this.resizeStartHeight = this.getSpacerProperty(spacerId, 'height');
        
        document.addEventListener('mousemove', this.handleSpacerResize);
        document.addEventListener('mouseup', this.stopResizeSpacer);
        e.preventDefault();
        e.stopPropagation();
    }

    handleSpacerResize = (e) => {
        if (!this.resizingSpacer) return;
        
        const deltaY = e.clientY - this.resizeStartY;
        const newHeight = Math.max(20, this.resizeStartHeight + deltaY);
        
        // Update the spacer property and re-render the page
        this.updateSpacerProperty(this.resizingSpacer, 'height', newHeight, { immediate: false });
    }

    stopResizeSpacer = () => {
        this.resizingSpacer = null;
        document.removeEventListener('mousemove', this.handleSpacerResize);
        document.removeEventListener('mouseup', this.stopResizeSpacer);
        // Commit final layout and persist
        this.renderCurrentPage({ interactive: false });
        this.saveSettings();
    }

    saveSettings() {
        const settings = {
            spacers: Object.fromEntries(this.spacers),
            scale: this.scale,
            currentPage: this.currentPage,
            showPageBreaks: this.showPageBreaks,
            showPlacementGuide: this.showPlacementGuide,
            lastSpacerPreset: this.lastSpacerPreset
        };
        localStorage.setItem('pdfSpacerSettings', JSON.stringify(settings));
    }

    loadSettings() {
        const saved = localStorage.getItem('pdfSpacerSettings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                this.spacers = new Map(Object.entries(settings.spacers || {}));
                this.scale = settings.scale || 1.0;
                this.currentPage = settings.currentPage || 1;
                if (typeof settings.showPageBreaks === 'boolean') this.showPageBreaks = settings.showPageBreaks;
                if (typeof settings.showPlacementGuide === 'boolean') this.showPlacementGuide = settings.showPlacementGuide;
                if (settings.lastSpacerPreset) this.lastSpacerPreset = settings.lastSpacerPreset;
            } catch (error) {
                console.warn('Failed to load settings:', error);
            }
        }
        if (this.showBreaksToggle) this.showBreaksToggle.checked = this.showPageBreaks;
    }

    saveProject() {
        if (!this.pdfDocument) {
            this.showError('Please load a PDF first');
            return;
        }

        const project = {
            spacers: Object.fromEntries(this.spacers),
            scale: this.scale,
            currentPage: this.currentPage,
            pdfName: this.pdfDocument.fingerprints?.[0] || 'unknown',
            timestamp: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pdf-spacer-project.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async loadProject(file) {
        if (!file) return;

        try {
            const text = await file.text();
            const project = JSON.parse(text);
            
            if (!project.spacers) {
                throw new Error('Invalid project file format');
            }

            // Clear current spacers and load project data
            this.spacers = new Map(Object.entries(project.spacers));
            this.scale = project.scale || 1.0;
            this.currentPage = project.currentPage || 1;

            // Re-render if PDF is loaded
            if (this.pdfDocument) {
                await this.renderCurrentPage();
                this.updateUI();
            }

            this.saveSettings();
            this.showSuccess('Project loaded successfully');

        } catch (error) {
            this.showError('Failed to load project: ' + error.message);
        }
    }

    clearProject() {
        if (confirm('Are you sure you want to clear all spacers? This action cannot be undone.')) {
            this.spacers.clear();
            this.selectedSpacer = null;
            this.updateSpacerProperties();
            
            if (this.pdfDocument) {
                this.renderCurrentPage();
            }
            
            this.saveSettings();
        }
    }

    showSuccess(message) {
        // Simple success notification - in a real app you'd want a proper toast
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #27ae60;
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 4000;
            font-size: 14px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 3000);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Wait for PDF.js to be loaded
    if (typeof pdfjsLib === 'undefined') {
        console.error('PDF.js library not loaded');
        alert('PDF.js library failed to load. Please refresh the page.');
        return;
    }

    // Configure PDF.js worker to avoid deprecation and ensure rendering works
    try {
        if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    } catch (e) {
        console.warn('Unable to set PDF.js workerSrc:', e);
    }
    
    if (typeof window.jspdf === 'undefined') {
        console.error('jsPDF library not loaded');
        alert('jsPDF library failed to load. Please refresh the page.');
        return;
    }
    
    console.log('Libraries loaded successfully');
    new PDFAnswerSpacer();
});
        if (this.exportConfirmBtn) {
            this.exportConfirmBtn.addEventListener('click', () => {
                const mode = Array.from(this.exportModeRadios).find(r => r.checked)?.value || 'paginated';
                const continueAcross = !!this.optContinueAcross?.checked;
                const dpi = parseInt(this.optDPI?.value || '2', 10);
                this.exportOptions = { mode, continueAcross, dpi };
                this.saveSettings();
                this.closeExportDialog();
                this.exportPDF(this.exportOptions);
            });
        }
        if (this.exportCancelBtn) {
            this.exportCancelBtn.addEventListener('click', () => this.closeExportDialog());
        }
