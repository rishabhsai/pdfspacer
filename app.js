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
        
        this.initializeElements();
        this.bindEvents();
        this.loadSettings();
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
        this.pdfViewer = document.getElementById('pdfViewer');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.noContentMessage = document.getElementById('noContentMessage');
        this.spacerPreview = document.getElementById('spacerPreview');
        this.contextMenu = document.getElementById('contextMenu');
        
        // Properties panel
        this.spacerProperties = document.getElementById('spacerProperties');
        this.thumbnails = document.getElementById('thumbnails');
    }

    bindEvents() {
        // File operations
        this.loadPdfBtn.addEventListener('click', () => this.pdfInput.click());
        this.loadPdfBtnMain.addEventListener('click', () => this.pdfInput.click());
        this.pdfInput.addEventListener('change', (e) => this.loadPDF(e.target.files[0]));
        this.exportPdfBtn.addEventListener('click', () => this.exportPDF());
        
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

    async renderCurrentPage() {
        if (!this.pdfDocument) return;
        
        this.showLoading(true);
        try {
            const page = await this.pdfDocument.getPage(this.currentPage);
            const viewport = page.getViewport({ scale: this.scale });
            
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
                await this.renderPageWithoutSpacers(page, viewport, loadingIndicator);
            } else {
                // Has spacers - render with reflow
                await this.renderPageWithSpacers(page, viewport, pageSpacers, loadingIndicator);
            }
            
        } catch (error) {
            this.showError('Failed to render page: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async renderPageWithoutSpacers(page, viewport, loadingIndicator) {
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
        
        // Replace loading with page safely
        if (loadingIndicator.parentNode === this.pdfViewer) {
            this.pdfViewer.replaceChild(pageContainer, loadingIndicator);
        } else {
            this.pdfViewer.appendChild(pageContainer);
        }
    }

    async renderPageWithSpacers(page, viewport, pageSpacers, loadingIndicator) {
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
                    this.startDragSpacer(spacer.id, e);
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
        
        // Replace loading with page safely
        if (loadingIndicator.parentNode === this.pdfViewer) {
            this.pdfViewer.replaceChild(pageContainer, loadingIndicator);
        } else {
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
        
        // Create new spacer at the original Y position
        const spacer = {
            id: Date.now().toString(),
            y: Math.max(0, originalY),
            height: 100,
            style: 'plain',
            ruleSpacing: 20,
            dotPitch: 10,
            gridSize: 20
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

    updateSpacerProperty(spacerId, property, value) {
        // Find and update spacer
        for (let spacers of this.spacers.values()) {
            const spacer = spacers.find(s => s.id === spacerId);
            if (spacer) {
                spacer[property] = value;
                this.renderCurrentPage();
                this.saveSettings();
                break;
            }
        }
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

    async exportPDF() {
        if (!this.pdfDocument) return;
        
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
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF();
            
            // Export each page with spacers
            let progress = 0;
            const totalPages = this.totalPages;
            
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                // Update progress
                progress = ((pageNum) / totalPages) * 100;
                progressOverlay.querySelector('.progress-fill').style.width = progress + '%';
                
                await this.exportPage(pdf, pageNum, pageNum === 1);
            }
            
            // Save the PDF
            pdf.save('modified-pdf.pdf');
            
        } catch (error) {
            this.showError('Failed to export PDF: ' + error.message);
        } finally {
            document.body.removeChild(progressOverlay);
        }
    }

    async exportPage(pdf, pageNum, isFirstPage) {
        const { jsPDF } = window.jspdf;
        const page = await this.pdfDocument.getPage(pageNum);
        const pageSpacers = this.spacers.get(pageNum) || [];
        
        if (pageSpacers.length === 0) {
            // No spacers, export page as-is
            const viewport = page.getViewport({ scale: 1.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            if (!isFirstPage) pdf.addPage();
            
            // Scale to fit A4
            const A4_WIDTH = 595;
            const A4_HEIGHT = 842;
            const scaleX = A4_WIDTH / viewport.width;
            const scaleY = A4_HEIGHT / viewport.height;
            const scale = Math.min(scaleX, scaleY);
            
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(imgData, 'JPEG', 0, 0, viewport.width * scale, viewport.height * scale);
            return;
        }
        
        // Has spacers, need to reflow
        const viewport = page.getViewport({ scale: 1.0 });
        const sortedSpacers = [...pageSpacers].sort((a, b) => a.y - b.y);
        
        // Calculate total height with spacers
        let totalHeight = viewport.height;
        for (const spacer of sortedSpacers) {
            totalHeight += spacer.height;
        }
        
        // Create canvas for the reflowed page
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = totalHeight;
        
        // Fill with white background
        context.fillStyle = 'white';
        context.fillRect(0, 0, viewport.width, totalHeight);
        
        // Render content segments and spacers
        let currentY = 0;
        let cumulativeOffset = 0;
        
        for (let i = 0; i < sortedSpacers.length; i++) {
            const spacer = sortedSpacers[i];
            
            // Render content before spacer
            if (spacer.y > currentY) {
                const contentHeight = spacer.y - currentY;
                await this.renderContentSegment(context, page, viewport, currentY, contentHeight, currentY + cumulativeOffset);
            }
            
            // Render spacer
            const spacerY = spacer.y + cumulativeOffset;
            this.drawSpacerOnCanvas(context, spacer, viewport.width, spacerY, spacer.height);
            
            currentY = spacer.y;
            cumulativeOffset += spacer.height;
        }
        
        // Render remaining content
        if (currentY < viewport.height) {
            const remainingHeight = viewport.height - currentY;
            await this.renderContentSegment(context, page, viewport, currentY, remainingHeight, currentY + cumulativeOffset);
        }
        
        if (!isFirstPage) pdf.addPage();
        
        // Scale to fit A4
        const A4_WIDTH = 595;
        const A4_HEIGHT = 842;
        const scaleX = A4_WIDTH / viewport.width;
        const scaleY = A4_HEIGHT / totalHeight;
        const scale = Math.min(scaleX, scaleY);
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, viewport.width * scale, totalHeight * scale);
    }

    async renderContentSegment(context, page, viewport, startY, height, destY) {
        // Create temporary canvas for this segment
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        
        // Render full page
        await page.render({
            canvasContext: tempContext,
            viewport: viewport
        }).promise;
        
        // Draw the segment
        context.drawImage(
            tempCanvas,
            0, startY, viewport.width, height,
            0, destY, viewport.width, height
        );
    }

    async calculateReflowedPages() {
        const reflowedPages = [];
        const A4_HEIGHT = 842; // A4 height in points (jsPDF units)
        const A4_WIDTH = 595;  // A4 width in points
        
        for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
            const page = await this.pdfDocument.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.0 });
            const pageSpacers = this.spacers.get(pageNum) || [];
            
            if (pageSpacers.length === 0) {
                // No spacers on this page, add as-is
                reflowedPages.push({
                    originalPageNum: pageNum,
                    page: page,
                    viewport: viewport,
                    contentSegments: [{
                        y: 0,
                        height: viewport.height,
                        isSpacer: false
                    }]
                });
                continue;
            }
            
            // Sort spacers by Y position
            const sortedSpacers = [...pageSpacers].sort((a, b) => a.y - b.y);
            
            // Create content segments
            const segments = [];
            let currentY = 0;
            let cumulativeOffset = 0;
            
            for (let i = 0; i < sortedSpacers.length; i++) {
                const spacer = sortedSpacers[i];
                
                // Add content before spacer
                if (spacer.y > currentY) {
                    segments.push({
                        y: currentY,
                        height: spacer.y - currentY,
                        isSpacer: false,
                        originalY: currentY
                    });
                }
                
                // Add spacer
                segments.push({
                    y: spacer.y + cumulativeOffset,
                    height: spacer.height,
                    isSpacer: true,
                    spacer: spacer,
                    originalY: spacer.y
                });
                
                currentY = spacer.y;
                cumulativeOffset += spacer.height;
            }
            
            // Add remaining content after last spacer
            if (currentY < viewport.height) {
                segments.push({
                    y: currentY + cumulativeOffset,
                    height: viewport.height - currentY,
                    isSpacer: false,
                    originalY: currentY
                });
            }
            
            // Check if content overflows and split into multiple pages
            const totalHeight = viewport.height + cumulativeOffset;
            if (totalHeight <= A4_HEIGHT) {
                // Fits on one page
                reflowedPages.push({
                    originalPageNum: pageNum,
                    page: page,
                    viewport: viewport,
                    contentSegments: segments,
                    totalHeight: totalHeight
                });
            } else {
                // Need to split into multiple pages
                const pages = this.splitPageIntoMultiple(segments, A4_HEIGHT, pageNum, page, viewport);
                reflowedPages.push(...pages);
            }
        }
        
        return reflowedPages;
    }

    splitPageIntoMultiple(segments, maxHeight, originalPageNum, page, viewport) {
        const pages = [];
        let currentPageY = 0;
        let currentPageSegments = [];
        let pageIndex = 0;
        
        for (const segment of segments) {
            if (currentPageY + segment.height > maxHeight && currentPageSegments.length > 0) {
                // Current page is full, start a new one
                pages.push({
                    originalPageNum: originalPageNum,
                    pageIndex: pageIndex,
                    page: page,
                    viewport: viewport,
                    contentSegments: currentPageSegments,
                    totalHeight: currentPageY
                });
                
                currentPageSegments = [];
                currentPageY = 0;
                pageIndex++;
            }
            
            // Adjust segment Y for current page
            const adjustedSegment = {
                ...segment,
                y: currentPageY
            };
            
            currentPageSegments.push(adjustedSegment);
            currentPageY += segment.height;
        }
        
        // Add the last page if it has content
        if (currentPageSegments.length > 0) {
            pages.push({
                originalPageNum: originalPageNum,
                pageIndex: pageIndex,
                page: page,
                viewport: viewport,
                contentSegments: currentPageSegments,
                totalHeight: currentPageY
            });
        }
        
        return pages;
    }

    async renderReflowedPage(pdf, reflowedPage, isFirstPage) {
        const { jsPDF } = window.jspdf;
        const A4_WIDTH = 595;
        const A4_HEIGHT = 842;
        
        if (!isFirstPage) {
            pdf.addPage();
        }
        
        // Use the current scale from the viewer for consistency
        const viewerScale = this.scale;
        const originalWidth = reflowedPage.viewport.width * viewerScale;
        const originalHeight = reflowedPage.totalHeight * viewerScale;
        
        // Calculate scale to fit A4 while maintaining aspect ratio
        const scaleX = A4_WIDTH / originalWidth;
        const scaleY = A4_HEIGHT / originalHeight;
        const exportScale = Math.min(scaleX, scaleY);
        
        // Calculate final dimensions
        const finalWidth = originalWidth * exportScale;
        const finalHeight = originalHeight * exportScale;
        const offsetX = (A4_WIDTH - finalWidth) / 2;
        const offsetY = (A4_HEIGHT - finalHeight) / 2;
        
        // Create canvas for export
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = A4_WIDTH;
        canvas.height = A4_HEIGHT;
        
        // Fill with white background
        context.fillStyle = 'white';
        context.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
        
        // Render each segment with proper scaling
        for (const segment of reflowedPage.contentSegments) {
            if (segment.isSpacer) {
                // Draw spacer
                const spacerY = offsetY + (segment.y * viewerScale * exportScale);
                const spacerHeight = segment.height * viewerScale * exportScale;
                this.drawSpacerOnCanvas(context, segment.spacer, finalWidth, spacerY, spacerHeight, exportScale);
            } else {
                // Draw content segment
                await this.drawContentSegment(context, reflowedPage.page, reflowedPage.viewport, segment, finalWidth, finalHeight, offsetX, offsetY, exportScale, viewerScale);
            }
        }
        
        // Add to PDF
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH, A4_HEIGHT);
    }

    async drawContentSegment(context, page, viewport, segment, targetWidth, targetHeight, offsetX = 0, offsetY = 0, exportScale = 1, viewerScale = 1) {
        // Create a high-resolution temporary canvas for the original content
        const renderScale = 2; // Higher resolution
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        tempCanvas.width = viewport.width * renderScale;
        tempCanvas.height = viewport.height * renderScale;
        
        // Scale the context for high resolution
        tempContext.scale(renderScale, renderScale);
        
        // Render the full page at high resolution
        const highResViewport = page.getViewport({ scale: viewport.scale * renderScale });
        await page.render({
            canvasContext: tempContext,
            viewport: highResViewport
        }).promise;
        
        // Calculate proper scaling and positioning
        const sourceY = segment.originalY;
        const sourceHeight = segment.height;
        const destX = offsetX;
        const destY = offsetY + (segment.y * viewerScale * exportScale);
        const destWidth = targetWidth;
        const destHeight = sourceHeight * viewerScale * exportScale;
        
        context.drawImage(
            tempCanvas,
            0, sourceY * renderScale, viewport.width * renderScale, sourceHeight * renderScale,
            destX, destY, destWidth, destHeight
        );
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

    startDragSpacer(spacerId, e) {
        this.draggingSpacer = spacerId;
        this.dragStartY = e.clientY;
        this.dragStartSpacerY = this.getSpacerProperty(spacerId, 'y');
        
        document.addEventListener('mousemove', this.handleSpacerDrag);
        document.addEventListener('mouseup', this.stopDragSpacer);
        e.preventDefault();
    }

    handleSpacerDrag = (e) => {
        if (!this.draggingSpacer) return;
        
        const deltaY = e.clientY - this.dragStartY;
        const newY = Math.max(0, this.dragStartSpacerY + deltaY);
        
        this.updateSpacerProperty(this.draggingSpacer, 'y', newY);
    }

    stopDragSpacer = () => {
        this.draggingSpacer = null;
        document.removeEventListener('mousemove', this.handleSpacerDrag);
        document.removeEventListener('mouseup', this.stopDragSpacer);
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
        this.updateSpacerProperty(this.resizingSpacer, 'height', newHeight);
    }

    stopResizeSpacer = () => {
        this.resizingSpacer = null;
        document.removeEventListener('mousemove', this.handleSpacerResize);
        document.removeEventListener('mouseup', this.stopResizeSpacer);
    }

    saveSettings() {
        const settings = {
            spacers: Object.fromEntries(this.spacers),
            scale: this.scale,
            currentPage: this.currentPage
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
            } catch (error) {
                console.warn('Failed to load settings:', error);
            }
        }
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
    new PDFAnswerSpacer();
});
