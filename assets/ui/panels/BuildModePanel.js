class BuildModePanel {
    constructor() {
        this.container = null;
        this.cashDisplay = null;
        this.cashAmount = null;
        this.currentCash = 100; // Default starting cash
        this.maxCash = 100;
        this.initialized = false;
        
        // State management
        this.currentPlayerState = 'LOBBY';
        this.isVisible = false;
    }

    initialize(containerId) {
        console.log('[BuildModePanel] Initializing with container:', containerId);
        this.container = document.getElementById(containerId);
        
        if (!this.container) {
            console.error('[BuildModePanel] Container not found:', containerId);
            return;
        }
        
        this.createCashUI();
        this.addStyles();
        this.setupEventListeners();
        
        // Initially hidden (only show in build mode)
        this.setVisible(false);
        
        // Listen for cash updates and state changes from the game
        if (window.hytopia && window.hytopia.onData) {
            window.hytopia.onData((data) => {
                if (data.type === 'cashUpdate') {
                    this.updateCash(data.cash, data.maxCash);
                } else if (data.type === 'playerStateChanged') {
                    this.onPlayerStateChanged(data.state, data.plotIndex, data.cash, data.maxCash);
                }
            });
        }
        
        this.initialized = true;
        console.log('[BuildModePanel] Initialized successfully.');
    }

    createCashUI() {
        const panel = document.createElement('div');
        panel.id = 'build-mode-panel';
        panel.className = 'build-mode-panel';
        
        panel.innerHTML = `
            <div id="cash-display" class="cash-display">
                <span id="cash-amount">${this.currentCash}</span>
                <span class="cash-label">CASH</span>
            </div>
        `;
        
        this.container.appendChild(panel);
        
        // Store references to elements
        this.cashDisplay = document.getElementById('cash-display');
        this.cashAmount = document.getElementById('cash-amount');
    }

    setupEventListeners() {
        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.isInputElementActive()) return;
            
            // Add any build mode specific shortcuts here
            // For example: Ctrl+Z for undo, Ctrl+Y for redo, etc.
        });
    }

    updateCash(cash, maxCash = null) {
        this.currentCash = cash;
        if (maxCash !== null) {
            this.maxCash = maxCash;
        }
        
        if (this.cashAmount) {
            this.cashAmount.textContent = this.currentCash;
            
            // Update color based on cash remaining
            if (this.currentCash <= 0) {
                this.cashDisplay.classList.add('no-cash');
                this.cashDisplay.classList.remove('low-cash', 'normal-cash');
            } else if (this.currentCash <= 10) {
                this.cashDisplay.classList.add('low-cash');
                this.cashDisplay.classList.remove('no-cash', 'normal-cash');
            } else {
                this.cashDisplay.classList.add('normal-cash');
                this.cashDisplay.classList.remove('no-cash', 'low-cash');
            }
        }
        
        console.log('[BuildModePanel] Updated cash:', this.currentCash);
    }

    setCash(cash, maxCash = null) {
        this.updateCash(cash, maxCash);
    }

    getCurrentCash() {
        return this.currentCash;
    }

    getMaxCash() {
        return this.maxCash;
    }

    isInputElementActive() {
        const activeElement = document.activeElement;
        return activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );
    }

    onPlayerStateChanged(newState, plotIndex, cash, maxCash) {
        console.log('[BuildModePanel] Player state changed to:', newState, 'plotIndex:', plotIndex);
        this.currentPlayerState = newState;
        
        // Only show panel when in building mode
        if (newState === 'BUILDING') {
            // Initialize cash if provided
            if (cash !== undefined && maxCash !== undefined) {
                this.updateCash(cash, maxCash);
                console.log('[BuildModePanel] Initialized cash:', cash, '/', maxCash);
            }
            this.setVisible(true);
            console.log('[BuildModePanel] Build mode activated - panel now visible');
        } else {
            this.setVisible(false);
            console.log('[BuildModePanel] Exited build mode - panel hidden');
        }
    }

    setVisible(visible) {
        this.isVisible = visible;
        if (this.cashDisplay) {
            this.cashDisplay.style.display = visible ? 'flex' : 'none';
        }
    }

    isInBuildMode() {
        return this.currentPlayerState === 'BUILDING' && this.isVisible;
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .build-mode-panel {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 1000;
                font-family: 'Inter', sans-serif;
                user-select: none;
            }

            .cash-display {
                background-color: rgba(0, 0, 0, 0.6);
                padding: 8px 12px;
                border-radius: 8px;
                border: 2px solid #555;
                color: white;
                font-family: 'Minecraft', monospace;
                font-size: 14px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
                min-width: 60px;
                text-align: center;
            }

            #cash-amount {
                font-weight: bold;
                font-size: 18px;
                line-height: 1;
            }

            .cash-label {
                font-size: 10px;
                opacity: 0.8;
                font-weight: normal;
                letter-spacing: 0.5px;
            }

            /* Cash state colors */
            .cash-display.normal-cash {
                border-color: #4CAF50;
                color: #4CAF50;
            }

            .cash-display.low-cash {
                border-color: #FF9800;
                color: #FF9800;
                animation: pulse 1.5s infinite;
            }

            .cash-display.no-cash {
                border-color: #F44336;
                color: #F44336;
                animation: pulse 0.8s infinite;
            }

            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.7; }
                100% { opacity: 1; }
            }

            /* Mobile Styles */
            @media (max-width: 768px), (pointer: coarse) {
                .build-mode-panel {
                    bottom: 10px;
                    right: 10px;
                }

                .cash-display {
                    padding: 6px 10px;
                    font-size: 12px;
                    min-width: 50px;
                }

                #cash-amount {
                    font-size: 16px;
                }

                .cash-label {
                    font-size: 9px;
                }
            }

            /* Very small screens */
            @media (max-width: 480px) {
                .build-mode-panel {
                    bottom: 8px;
                    right: 8px;
                }

                .cash-display {
                    padding: 4px 8px;
                    font-size: 11px;
                    min-width: 45px;
                }

                #cash-amount {
                    font-size: 14px;
                }

                .cash-label {
                    font-size: 8px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Make it globally available as a singleton instance
window.BuildModePanel = new BuildModePanel(); 