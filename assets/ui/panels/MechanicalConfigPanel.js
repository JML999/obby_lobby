/**
 * Mechanical Configuration Panel - Real-time configuration for mechanical blocks
 * Shows emoji type selection, size inputs, and live preview
 */
class MechanicalConfigPanel {
    constructor() {
        this.panel = null;
        this.currentConfig = {
            type: 'static',
            sizeX: 1,
            sizeY: 1,
            sizeZ: 1,
            speed: 1.0,
            distance: 2
        };
        this.currentPosition = null;
        this.previewEntity = null;
    }

    show(position, config = {}) {
        this.currentPosition = position;
        this.currentConfig = { ...this.currentConfig, ...config };
        
        if (this.panel) {
            this.hide();
        }

        this.createPanel();
        this.startPreview();
        
        // Unlock cursor and disable player input (like inventory does)
        if (window.hytopia && window.hytopia.sendData) {
            window.hytopia.sendData({
                type: 'disablePlayerInput'
            });
        }
    }

    hide() {
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        this.stopPreview();
        
        // Show all UI again
        this.showAllOtherUI();
        
        // Re-enable player input and lock cursor (like inventory does)
        if (window.hytopia && window.hytopia.sendData) {
            window.hytopia.sendData({
                type: 'enablePlayerInput'
            });
        }
    }

    hideWithoutStopping() {
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        // DON'T call stopPreview() - keep the entity for confirmation
        
        // Show all UI again
        this.showAllOtherUI();
        
        // Re-enable player input and lock cursor (like inventory does)
        if (window.hytopia && window.hytopia.sendData) {
            window.hytopia.sendData({
                type: 'enablePlayerInput'
            });
        }
    }

    createPanel() {
        // Create main panel with side tabs design
        this.panel = document.createElement('div');
        this.panel.className = 'mechanical-config-panel';
        this.panel.innerHTML = `
            <!-- Side Tab Navigation -->
            <div class="side-tabs">
                <div class="side-tab active" data-tab="type">
                    <div class="tab-icon">⚙️</div>
                    <div class="tab-label">Type</div>
                </div>
                <div class="side-tab" data-tab="size">
                    <div class="tab-icon">📐</div>
                    <div class="tab-label">Size</div>
                </div>
                <div class="side-tab" data-tab="movement">
                    <div class="tab-icon">🏃</div>
                    <div class="tab-label">Move</div>
                </div>
                <div class="side-tab" data-tab="accept">
                    <div class="tab-icon">✓</div>
                    <div class="tab-label">OK</div>
                </div>
                <div class="side-tab" data-tab="cancel">
                    <div class="tab-icon">✗</div>
                    <div class="tab-label">Cancel</div>
                </div>
            </div>

            <!-- Tab Content Area -->
            <div class="tab-content-area">
                <!-- Type Tab -->
                <div class="tab-content active" id="type-content">
                    <div class="type-cycling">
                        <div class="current-type-display">
                            <div class="type-icon">${this.getTypeInfo(this.currentConfig.type).icon}</div>
                            <div class="type-name">${this.getTypeInfo(this.currentConfig.type).name}</div>
                        </div>
                        <div class="type-controls">
                            <button class="type-nav-btn" id="prev-type">◀</button>
                            <button class="type-nav-btn" id="next-type">▶</button>
                        </div>
                    </div>
                </div>

                <!-- Size Tab -->
                <div class="tab-content" id="size-content">
                    <div class="plus-minus-control">
                        <div class="control-row">
                            <span class="control-label">Width</span>
                            <div class="pm-controls">
                                <button class="pm-btn" data-axis="sizeX" data-action="minus">-</button>
                                <span class="pm-value" id="sizeX-value">${this.currentConfig.sizeX}</span>
                                <button class="pm-btn" data-axis="sizeX" data-action="plus">+</button>
                            </div>
                        </div>
                        <div class="control-row">
                            <span class="control-label">Height</span>
                            <div class="pm-controls">
                                <button class="pm-btn" data-axis="sizeY" data-action="minus">-</button>
                                <span class="pm-value" id="sizeY-value">${this.currentConfig.sizeY}</span>
                                <button class="pm-btn" data-axis="sizeY" data-action="plus">+</button>
                            </div>
                        </div>
                        <div class="control-row">
                            <span class="control-label">Depth</span>
                            <div class="pm-controls">
                                <button class="pm-btn" data-axis="sizeZ" data-action="minus">-</button>
                                <span class="pm-value" id="sizeZ-value">${this.currentConfig.sizeZ}</span>
                                <button class="pm-btn" data-axis="sizeZ" data-action="plus">+</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Movement Tab -->
                <div class="tab-content" id="movement-content">
                    <div class="plus-minus-control">
                        <div class="control-row">
                            <span class="control-label">Speed</span>
                            <div class="pm-controls">
                                <button class="pm-btn" data-param="speed" data-action="minus">-</button>
                                <span class="pm-value" id="speed-value">${this.currentConfig.speed.toFixed(1)}</span>
                                <button class="pm-btn" data-param="speed" data-action="plus">+</button>
                            </div>
                        </div>
                        <div class="control-row distance-control ${this.currentConfig.type === 'static' || this.currentConfig.type === 'carousel' ? 'hidden' : ''}">
                            <span class="control-label">Distance</span>
                            <div class="pm-controls">
                                <button class="pm-btn" data-param="distance" data-action="minus">-</button>
                                <span class="pm-value" id="distance-value">${this.currentConfig.distance}</span>
                                <button class="pm-btn" data-param="distance" data-action="plus">+</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .mechanical-config-panel {
                position: fixed;
                right: 0;
                top: 25%;
                width: 300px;
                height: 400px;
                z-index: 10000;
                color: white;
                font-family: 'Inter', Arial, sans-serif;
                display: flex;
                flex-direction: row-reverse;
            }

            /* Side Tabs - Small and constrained to right edge */
            .side-tabs {
                width: 50px;
                background: none;
                border: none;
                display: flex;
                flex-direction: column;
                padding: 5px 0;
                gap: 5px;
            }

            .side-tab {
                width: 40px;
                height: 40px;
                background: rgba(60, 60, 60, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.3);
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                color: rgba(255, 255, 255, 0.8);
                border-radius: 6px;
                touch-action: manipulation;
            }

            .side-tab:hover {
                background: rgba(255, 255, 255, 0.2);
                color: white;
            }

            .side-tab.active {
                background: rgba(33, 150, 243, 0.8);
                color: white;
                border: 1px solid rgba(33, 150, 243, 1);
            }

            /* Special colors for accept/cancel tabs */
            .side-tab[data-tab="accept"] {
                background: rgba(34, 197, 94, 0.8);
                border: 1px solid rgba(34, 197, 94, 1);
                color: white;
            }

            .side-tab[data-tab="accept"]:hover {
                background: rgba(34, 197, 94, 0.9);
            }

            .side-tab[data-tab="cancel"] {
                background: rgba(239, 68, 68, 0.8);
                border: 1px solid rgba(239, 68, 68, 1);
                color: white;
            }

            .side-tab[data-tab="cancel"]:hover {
                background: rgba(239, 68, 68, 0.9);
            }

            .tab-icon {
                font-size: 16px;
                margin-bottom: 2px;
            }

            .tab-label {
                font-size: 8px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            /* Tab Content Area */
            .tab-content-area {
                flex: 1;
                background: none;
                border-radius: 12px 0 0 12px;
                padding: 20px;
                display: flex;
                align-items: flex-start;
                justify-content: center;
                transform: translateY(-100px); /* Move content up relative to tabs */
            }

            .tab-content {
                display: none;
                width: 100%;
                height: 100%;
            }

            .tab-content.active {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }

            /* Type Tab */
            .type-cycling {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 15px;
            }

            .current-type-display {
                text-align: center;
                padding: 15px;
                background: none;
                border-radius: 8px;
                min-width: 120px;
            }

            .type-icon {
                font-size: 48px;
                margin-bottom: 8px;
            }

            .type-name {
                font-size: 14px;
                font-weight: bold;
                color: rgba(255, 255, 255, 0.9);
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .type-controls {
                display: flex;
                gap: 15px;
                align-items: center;
            }

            .type-nav-btn {
                width: 40px;
                height: 40px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                background: rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: white;
                font-size: 18px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                touch-action: manipulation;
            }

            .type-nav-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(255, 255, 255, 0.5);
                transform: scale(1.05);
            }

            /* Plus/Minus Controls */
            .plus-minus-control {
                display: flex;
                flex-direction: column;
                gap: 10px;
                width: 100%;
            }

            .control-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 8px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                gap: 8px;
            }

            .control-row:last-child {
                border-bottom: none;
            }

            .control-row.hidden {
                display: none;
            }

            .control-label {
                font-size: 12px;
                font-weight: bold;
                color: rgba(255, 255, 255, 0.9);
                flex: 0 0 auto;
                margin-right: 8px;
            }

            .pm-controls {
                display: flex;
                align-items: center;
                gap: 2px;
            }

            .pm-btn {
                width: 28px;
                height: 28px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                color: white;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                touch-action: manipulation;
            }

            .pm-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(255, 255, 255, 0.5);
                transform: scale(1.05);
            }

            .pm-value {
                min-width: 30px;
                text-align: center;
                font-size: 14px;
                font-weight: bold;
                color: #4CAF50;
                background: none;
                border-radius: 4px;
                padding: 2px 4px;
            }

            /* Mobile responsive */
            @media (max-width: 768px) {
                .mechanical-config-panel {
                    left: 5%;
                    top: 20%;
                    width: 90%;
                    height: 60%;
                    padding: 12px;
                }
            }

            @media (max-width: 480px) {
                .mechanical-config-panel {
                    left: 2%;
                    top: 15%;
                    width: 96%;
                    height: 70%;
                    padding: 10px;
                }
            }

            .config-header {
                text-align: center;
                margin-bottom: 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                padding-bottom: 12px;
                flex-shrink: 0;
            }

            .config-header h2 {
                margin: 0 0 4px 0;
                color: rgba(255, 255, 255, 0.95);
                font-size: 1.2em;
                font-weight: 600;
            }

            .position-info {
                color: rgba(255, 255, 255, 0.6);
                font-size: 0.85em;
            }

            .config-content {
                flex: 1;
                overflow-y: auto;
            }

            .config-section {
                margin-bottom: 20px;
            }

            .config-section h3 {
                margin: 0 0 12px 0;
                color: rgba(255, 255, 255, 0.9);
                font-size: 1em;
                font-weight: 500;
                padding-bottom: 6px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .type-buttons {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }

            @media (max-width: 480px) {
                .type-buttons {
                    grid-template-columns: 1fr;
                    gap: 6px;
                }
            }

            .type-btn {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                color: rgba(255, 255, 255, 0.9);
                padding: 10px 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 0.9em;
                font-family: inherit;
                font-weight: 500;
                text-align: center;
            }

            .type-btn:hover {
                background: rgba(255, 255, 255, 0.12);
                border-color: rgba(255, 255, 255, 0.3);
                transform: translateY(-1px);
            }

            .type-btn.active {
                background: rgba(59, 130, 246, 0.2);
                border-color: rgba(59, 130, 246, 0.5);
                color: rgba(59, 130, 246, 1);
                box-shadow: 0 0 8px rgba(59, 130, 246, 0.3);
            }

            .size-controls {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .size-input-group {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .size-input-group label {
                font-size: 0.9em;
                color: rgba(255, 255, 255, 0.8);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .size-value {
                background: rgba(59, 130, 246, 0.2);
                padding: 3px 8px;
                border-radius: 4px;
                color: rgba(59, 130, 246, 1);
                font-weight: 600;
                min-width: 24px;
                text-align: center;
                font-size: 0.85em;
            }

            .size-slider {
                width: 100%;
                height: 4px;
                border-radius: 2px;
                background: rgba(255, 255, 255, 0.15);
                outline: none;
                cursor: pointer;
                -webkit-appearance: none;
            }

            .size-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: rgba(59, 130, 246, 1);
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                transition: all 0.2s ease;
            }

            .size-slider::-webkit-slider-thumb:hover {
                background: rgba(37, 99, 235, 1);
                transform: scale(1.1);
            }

            .size-slider::-moz-range-thumb {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: rgba(59, 130, 246, 1);
                cursor: pointer;
                border: none;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            }

            .movement-controls {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .movement-input-group {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .movement-input-group.hidden {
                display: none;
            }

            .movement-input-group label {
                font-size: 0.9em;
                color: rgba(255, 255, 255, 0.8);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .movement-value {
                background: rgba(34, 197, 94, 0.2);
                padding: 3px 8px;
                border-radius: 4px;
                color: rgba(34, 197, 94, 1);
                font-weight: 600;
                min-width: 32px;
                text-align: center;
                font-size: 0.85em;
            }

            .movement-slider {
                width: 100%;
                height: 4px;
                border-radius: 2px;
                background: rgba(255, 255, 255, 0.15);
                outline: none;
                cursor: pointer;
                -webkit-appearance: none;
            }

            .movement-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: rgba(34, 197, 94, 1);
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                transition: all 0.2s ease;
            }

            .movement-slider::-webkit-slider-thumb:hover {
                background: rgba(22, 163, 74, 1);
                transform: scale(1.1);
            }

            .movement-slider::-moz-range-thumb {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: rgba(34, 197, 94, 1);
                cursor: pointer;
                border: none;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            }

            .preview-info {
                background: rgba(251, 191, 36, 0.1);
                border: 1px solid rgba(251, 191, 36, 0.3);
                border-radius: 6px;
                padding: 12px;
                text-align: center;
            }

            .preview-info h3 {
                margin: 0 0 4px 0;
                color: rgba(251, 191, 36, 1);
                border: none;
                padding: 0;
                font-size: 0.9em;
                font-weight: 500;
            }

            .preview-info p {
                margin: 0;
                color: rgba(255, 255, 255, 0.7);
                font-size: 0.8em;
            }

            .config-actions {
                display: flex;
                gap: 10px;
                justify-content: center;
                padding-top: 16px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                flex-shrink: 0;
                margin-top: auto;
            }

            .btn {
                padding: 10px 20px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.9em;
                font-family: inherit;
                font-weight: 500;
                transition: all 0.2s ease;
                flex: 1;
                max-width: 120px;
            }

            .btn-success {
                background: rgba(34, 197, 94, 0.2);
                color: rgba(34, 197, 94, 1);
                border-color: rgba(34, 197, 94, 0.4);
            }

            .btn-success:hover {
                background: rgba(34, 197, 94, 0.3);
                border-color: rgba(34, 197, 94, 0.6);
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
            }

            .btn-cancel {
                background: rgba(239, 68, 68, 0.2);
                color: rgba(239, 68, 68, 1);
                border-color: rgba(239, 68, 68, 0.4);
            }

            .btn-cancel:hover {
                background: rgba(239, 68, 68, 0.3);
                border-color: rgba(239, 68, 68, 0.6);
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(this.panel);

        // Hide all other UI when config panel is shown
        this.hideAllOtherUI();

        this.attachEventListeners();
    }

    hidePlaceBreakButtons() {
        const buildContainer = document.getElementById('mobile-build-container');
        if (buildContainer) {
            buildContainer.style.display = 'none';
        }
    }

    showPlaceBreakButtons() {
        const buildContainer = document.getElementById('mobile-build-container');
        if (buildContainer) {
            buildContainer.style.display = 'flex';
        }
    }

    hideAllOtherUI() {
        // Hide place/break buttons
        this.hidePlaceBreakButtons();
        
        // Hide fly controls
        const flyContainer = document.getElementById('mobile-fly-container');
        if (flyContainer) {
            flyContainer.style.display = 'none';
        }
        
        // Hide walk toggle
        const walkToggle = document.getElementById('mobile-walk-toggle');
        if (walkToggle) {
            walkToggle.style.display = 'none';
        }
        
        // Hide cash UI
        if (window.BuildModePanel && window.BuildModePanel.cashDisplay) {
            window.BuildModePanel.cashDisplay.style.display = 'none';
        }
        
        // Hide hotbar
        if (window.HotbarPanel && window.HotbarPanel.hotbarElement) {
            window.HotbarPanel.hotbarElement.style.display = 'none';
        }
        
        // Hide level UI
        if (window.PersistentLevelPanel && window.PersistentLevelPanel.levelContainer) {
            window.PersistentLevelPanel.levelContainer.style.display = 'none';
        }
    }

    showAllOtherUI() {
        // Show place/break buttons
        this.showPlaceBreakButtons();
        
        // Show fly controls
        const flyContainer = document.getElementById('mobile-fly-container');
        if (flyContainer) {
            flyContainer.style.display = 'flex';
        }
        
        // Show walk toggle
        const walkToggle = document.getElementById('mobile-walk-toggle');
        if (walkToggle) {
            walkToggle.style.display = 'flex';
        }
        
        // Show cash UI
        if (window.BuildModePanel && window.BuildModePanel.cashDisplay) {
            window.BuildModePanel.cashDisplay.style.display = 'flex';
        }
        
        // Show hotbar
        if (window.HotbarPanel && window.HotbarPanel.hotbarElement) {
            window.HotbarPanel.hotbarElement.style.display = 'flex';
        }
        
        // Show level UI
        if (window.PersistentLevelPanel && window.PersistentLevelPanel.levelContainer) {
            window.PersistentLevelPanel.levelContainer.style.display = 'block';
        }
    }

    getTypeInfo(typeId) {
        const types = [
            { id: 'static', icon: '⬜', name: 'Static' },
            { id: 'elevator', icon: '🔼', name: 'Elevator' },
            { id: 'front-to-back', icon: '↕️', name: 'Front/Back' },
            { id: 'side-to-side', icon: '↔️', name: 'Side/Side' },
            { id: 'carousel', icon: '🔄', name: 'Carousel' }
        ];
        return types.find(t => t.id === typeId) || types[0];
    }

    attachEventListeners() {
        // Side tab navigation
        this.panel.querySelectorAll('.side-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                if (tabName === 'accept') {
                    this.confirm();
                } else if (tabName === 'cancel') {
                    this.cancel();
                } else {
                    this.switchTab(tabName);
                }
            });
        });

        // Type cycling controls
        const prevTypeBtn = this.panel.querySelector('#prev-type');
        const nextTypeBtn = this.panel.querySelector('#next-type');
        if (prevTypeBtn) {
            prevTypeBtn.addEventListener('click', () => this.cycleType(-1));
        }
        if (nextTypeBtn) {
            nextTypeBtn.addEventListener('click', () => this.cycleType(1));
        }

        // Plus/minus controls for size
        this.panel.querySelectorAll('.pm-btn[data-axis]').forEach(btn => {
            btn.addEventListener('click', () => {
                const axis = btn.dataset.axis;
                const action = btn.dataset.action;
                const currentValue = this.currentConfig[axis];
                const newValue = action === 'plus' ? currentValue + 1 : Math.max(1, currentValue - 1);
                this.updateSize(axis, newValue);
            });
        });

        // Plus/minus controls for movement
        this.panel.querySelectorAll('.pm-btn[data-param]').forEach(btn => {
            btn.addEventListener('click', () => {
                const param = btn.dataset.param;
                const action = btn.dataset.action;
                const currentValue = this.currentConfig[param];
                let newValue;
                
                if (param === 'speed') {
                    newValue = action === 'plus' ? 
                        Math.min(5.0, currentValue + 0.1) : 
                        Math.max(0.1, currentValue - 0.1);
                } else { // distance
                    newValue = action === 'plus' ? 
                        Math.min(10, currentValue + 1) : 
                        Math.max(1, currentValue - 1);
                }
                
                this.updateMovement(param, newValue);
            });
        });

        // ESC key to cancel
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    switchTab(tabName) {
        // Update tab states
        this.panel.querySelectorAll('.side-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update content visibility
        this.panel.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-content`);
        });
    }

    cycleType(direction) {
        const types = [
            { id: 'static', icon: '⬜', name: 'Static' },
            { id: 'elevator', icon: '🔼', name: 'Elevator' },
            { id: 'front-to-back', icon: '↕️', name: 'Front/Back' },
            { id: 'side-to-side', icon: '↔️', name: 'Side/Side' },
            { id: 'carousel', icon: '🔄', name: 'Carousel' }
        ];

        const currentIndex = types.findIndex(t => t.id === this.currentConfig.type);
        const newIndex = (currentIndex + direction + types.length) % types.length;
        const newType = types[newIndex];
        
        console.log('[MechanicalConfigPanel] Type cycling:', {
            direction,
            currentType: this.currentConfig.type,
            currentIndex,
            newIndex,
            newType: newType.name
        });

        this.currentConfig.type = newType.id;

        // Update display
        const typeIcon = this.panel.querySelector('.type-icon');
        const typeName = this.panel.querySelector('.type-name');
        if (typeIcon) typeIcon.textContent = newType.icon;
        if (typeName) typeName.textContent = newType.name;

        // Show/hide distance control based on type
        const distanceControl = this.panel.querySelector('.distance-control');
        if (distanceControl) {
            const shouldHide = newType.id === 'static' || newType.id === 'carousel';
            distanceControl.classList.toggle('hidden', shouldHide);
        }

        this.updatePreview();
    }

    selectType(type) {
        this.currentConfig.type = type;
        
        // Update button states
        this.panel.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        // Show/hide distance control based on type
        const distanceControl = this.panel.querySelector('.distance-control');
        if (distanceControl) {
            const shouldHide = type === 'static' || type === 'carousel';
            distanceControl.classList.toggle('hidden', shouldHide);
        }

        this.updatePreview();
    }

    updateSize(axis, value) {
        this.currentConfig[axis] = value;
        
        // Update display
        const valueElement = this.panel.querySelector(`#${axis}-value`);
        if (valueElement) {
            valueElement.textContent = value;
        }

        this.updatePreview();
    }

    updateMovement(param, value) {
        this.currentConfig[param] = value;
        
        // Update display
        const valueElement = this.panel.querySelector(`#${param}-value`);
        if (valueElement) {
            valueElement.textContent = param === 'speed' ? value.toFixed(1) : value;
        }

        this.updatePreview();
    }

    startPreview() {
        console.log('[MechanicalConfigPanel] Starting preview for position:', this.currentPosition);
        this.updatePreview();
    }

    updatePreview() {
        // Send preview update to backend
        console.log('[MechanicalConfigPanel] Sending preview update:', this.currentConfig);
        if (window.hytopia && window.hytopia.sendData) {
            window.hytopia.sendData({
                type: 'mechanicalPreviewUpdate',
                position: this.currentPosition,
                config: this.currentConfig
            });
        } else {
            console.error('[MechanicalConfigPanel] hytopia.sendData not available for preview update');
        }
    }

    stopPreview() {
        // Stop preview on backend
        console.log('[MechanicalConfigPanel] Stopping preview');
        if (window.hytopia && window.hytopia.sendData) {
            window.hytopia.sendData({
                type: 'mechanicalPreviewStop',
                position: this.currentPosition
            });
        } else {
            console.error('[MechanicalConfigPanel] hytopia.sendData not available for preview stop');
        }
    }

    confirm() {
        console.log('[MechanicalConfigPanel] Configuration confirmed:', this.currentConfig);
        
        // Send confirmation to backend
        if (window.hytopia && window.hytopia.sendData) {
            window.hytopia.sendData({
                type: 'mechanicalConfigConfirmed',
                position: this.currentPosition,
                config: this.currentConfig
            });
        } else {
            console.error('[MechanicalConfigPanel] hytopia.sendData not available for confirmation');
        }

        // Hide panel without stopping preview (keep the entity)
        this.hideWithoutStopping();
    }

    cancel() {
        console.log('[MechanicalConfigPanel] Configuration cancelled');
        
        // Send cancellation to backend
        if (window.hytopia && window.hytopia.sendData) {
            window.hytopia.sendData({
                type: 'mechanicalConfigCancelled',
                position: this.currentPosition
            });
        } else {
            console.error('[MechanicalConfigPanel] hytopia.sendData not available for cancellation');
        }

        this.hide();
    }

    handleKeyDown(event) {
        if (event.key === 'Escape' && this.panel) {
            this.cancel();
        }
    }
}

// Export for use in main UI
window.MechanicalConfigPanel = MechanicalConfigPanel;