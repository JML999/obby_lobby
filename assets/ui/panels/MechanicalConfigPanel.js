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
        
        // Re-enable player input and lock cursor (like inventory does)
        if (window.hytopia && window.hytopia.sendData) {
            window.hytopia.sendData({
                type: 'enablePlayerInput'
            });
        }
    }

    createPanel() {
        // Create main panel
        this.panel = document.createElement('div');
        this.panel.className = 'mechanical-config-panel';
        this.panel.innerHTML = `
            <div class="config-header">
                <h2>🔧 Configure Mechanical Block</h2>
                <div class="position-info">Position: ${this.currentPosition.x}, ${this.currentPosition.y}, ${this.currentPosition.z}</div>
            </div>

            <div class="config-content">
                <div class="config-section">
                    <h3>Type Selection</h3>
                    <div class="type-buttons">
                        <button class="type-btn ${this.currentConfig.type === 'elevator' ? 'active' : ''}" data-type="elevator">
                            🔼 Elevator
                        </button>
                        <button class="type-btn ${this.currentConfig.type === 'side-to-side' ? 'active' : ''}" data-type="side-to-side">
                            ↔️ Left-Right
                        </button>
                        <button class="type-btn ${this.currentConfig.type === 'carousel' ? 'active' : ''}" data-type="carousel">
                            🎠 Carousel
                        </button>
                        <button class="type-btn ${this.currentConfig.type === 'front-to-back' ? 'active' : ''}" data-type="front-to-back">
                            ↕️ Front-Back
                        </button>
                    </div>
                    <div class="static-info">
                        <small>💡 No selection = Static block</small>
                    </div>
                </div>

                <div class="config-section">
                    <h3>Size Configuration</h3>
                    <div class="size-controls">
                        <div class="size-input-group">
                            <label>X (Width): <span class="size-value">${this.currentConfig.sizeX}</span></label>
                            <input type="range" class="size-slider" data-axis="sizeX" min="1" max="5" value="${this.currentConfig.sizeX}">
                        </div>
                        <div class="size-input-group">
                            <label>Y (Height): <span class="size-value">${this.currentConfig.sizeY}</span></label>
                            <input type="range" class="size-slider" data-axis="sizeY" min="1" max="5" value="${this.currentConfig.sizeY}">
                        </div>
                        <div class="size-input-group">
                            <label>Z (Depth): <span class="size-value">${this.currentConfig.sizeZ}</span></label>
                            <input type="range" class="size-slider" data-axis="sizeZ" min="1" max="5" value="${this.currentConfig.sizeZ}">
                        </div>
                    </div>
                </div>

                <div class="config-section">
                    <h3>Movement Configuration</h3>
                    <div class="movement-controls">
                        <div class="movement-input-group">
                            <label>Speed: <span class="movement-value">${this.currentConfig.speed.toFixed(1)}</span></label>
                            <input type="range" class="movement-slider" data-param="speed" min="0.2" max="4.0" step="0.1" value="${this.currentConfig.speed}">
                        </div>
                        <div class="movement-input-group distance-control ${this.currentConfig.type === 'static' || this.currentConfig.type === 'carousel' ? 'hidden' : ''}">
                            <label>Distance: <span class="movement-value">${this.currentConfig.distance}</span></label>
                            <input type="range" class="movement-slider" data-param="distance" min="1" max="8" value="${this.currentConfig.distance}">
                        </div>
                    </div>
                </div>

                <div class="config-section">
                    <div class="preview-info">
                        <h3>🔄 Live Preview Active</h3>
                        <p>Changes are applied in real-time</p>
                    </div>
                </div>
            </div>

            <div class="config-actions">
                <button class="btn btn-success" id="confirmBtn">✅ Done</button>
                <button class="btn btn-cancel" id="cancelBtn">❌ Cancel</button>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .mechanical-config-panel {
                position: fixed;
                left: 2.5%;
                top: 25%;
                width: 22.5%;
                height: 50%;
                background: rgba(18, 18, 27, 0.98);
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                padding: 16px;
                z-index: 10000;
                color: white;
                font-family: 'Inter', Arial, sans-serif;
                backdrop-filter: blur(20px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
                overflow-y: auto;
                display: flex;
                flex-direction: column;
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

        this.attachEventListeners();
    }

    attachEventListeners() {
        // Type selection buttons
        this.panel.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectType(btn.dataset.type);
            });
        });

        // Size sliders
        this.panel.querySelectorAll('.size-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                this.updateSize(e.target.dataset.axis, parseInt(e.target.value));
            });
        });

        // Movement sliders
        this.panel.querySelectorAll('.movement-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const param = e.target.dataset.param;
                const value = param === 'speed' ? parseFloat(e.target.value) : parseInt(e.target.value);
                this.updateMovement(param, value);
            });
        });

        // Action buttons
        this.panel.querySelector('#confirmBtn').addEventListener('click', () => {
            this.confirm();
        });

        this.panel.querySelector('#cancelBtn').addEventListener('click', () => {
            this.cancel();
        });

        // ESC key to cancel
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
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
        const label = this.panel.querySelector(`[data-axis="${axis}"]`).parentElement.querySelector('.size-value');
        label.textContent = value;

        this.updatePreview();
    }

    updateMovement(param, value) {
        this.currentConfig[param] = value;
        
        // Update display
        const label = this.panel.querySelector(`[data-param="${param}"]`).parentElement.querySelector('.movement-value');
        label.textContent = param === 'speed' ? value.toFixed(1) : value;

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