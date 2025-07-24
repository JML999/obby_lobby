/**
 * MobileControlPanel - Touch-optimized controls for mobile devices
 * 
 * Provides state-aware mobile controls that adapt based on the player's current game state:
 * - LOBBY: Jump button only
 * - BUILDING: Fly up/down, inventory, save buttons
 * - PLAYING: Jump button only
 */
class MobileControlPanel {
    constructor() {
        this.container = null;
        this.currentState = 'LOBBY';
        this.isVisible = false;
        this.isMobileDevice = false;
        this.controls = {
            jump: null,
            flyUp: null,
            flyDown: null,
            inventory: null,
            place: null,
            break: null,
            walkToggle: null
        };
    }

    initialize(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`[MobileControlPanel] Container with ID '${containerId}' not found.`);
            return;
        }

        this.createMobileUI();
        this.addStyles();
        this.setupEventListeners();
        this.setVisible(false);
        this.isFlying = false; // Track fly mode
        
        // Listen for player state changes and fly mode changes
        if (window.hytopia && window.hytopia.onData) {
            window.hytopia.onData((data) => {
                if (data.type === 'playerStateChanged') {
                    this.onPlayerStateChanged(data.state, data.isMobile, data.mobileControls);
                }
                if (data.type === 'flyModeChanged') {
                    this.setFlyMode(data.isFlying);
                }
            });
        }
        
        console.log('[MobileControlPanel] Initialized successfully.');
    }

    createMobileUI() {
        this.container.innerHTML = `
            <div class="mobile-controls-overlay" id="mobile-controls-overlay">
                <!-- Jump Button (LOBBY/PLAYING) - Bottom center -->
                <div class="mobile-game-button mobile-jump" id="mobile-jump" style="display: none;">
                    <div class="mobile-jump-icon">🦘</div>
                    <div class="mobile-button-text">Jump</div>
                </div>

                <!-- Fly Controls Container (BUILDING only) - Left side, lower -->
                <div class="mobile-fly-container" id="mobile-fly-container" style="display: none;">
                    <div class="mobile-game-button mobile-fly-up" id="mobile-fly-up">
                        <div class="mobile-button-icon">⬆️</div>
                        <div class="mobile-button-text">Up</div>
                    </div>
                    <div class="mobile-game-button mobile-fly-down" id="mobile-fly-down">
                        <div class="mobile-button-icon">⬇️</div>
                        <div class="mobile-button-text">Down</div>
                    </div>
                </div>

                <!-- Inventory Button (BUILDING only) - Top right -->
                <div class="mobile-game-button mobile-inventory" id="mobile-inventory" style="display: none;">
                    <div class="mobile-button-icon">🎒</div>
                    <div class="mobile-button-text">Inventory</div>
                </div>

                <!-- Place/Break Buttons (BUILDING only) - Right side, centered -->
                <div class="mobile-build-container" id="mobile-build-container" style="display: none;">
                    <div class="mobile-game-button mobile-place" id="mobile-place">
                        <div class="mobile-button-icon">🔨</div>
                        <div class="mobile-button-text">Place</div>
                    </div>
                    <div class="mobile-game-button mobile-break" id="mobile-break">
                        <div class="mobile-button-icon">⛏️</div>
                        <div class="mobile-button-text">Break</div>
                    </div>
                </div>

                <!-- Walk/Create Toggle Button (BUILDING only) - Left side, below fly controls -->
                <div class="mobile-game-button mobile-walk-toggle" id="mobile-walk-toggle" style="display: none;">
                    <div class="mobile-button-icon">🚶</div>
                    <div class="mobile-button-text">Walk</div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Get control references
        this.controls.jump = document.getElementById('mobile-jump');
        this.controls.flyUp = document.getElementById('mobile-fly-up');
        this.controls.flyDown = document.getElementById('mobile-fly-down');
        this.controls.inventory = document.getElementById('mobile-inventory');
        this.controls.place = document.getElementById('mobile-place');
        this.controls.break = document.getElementById('mobile-break');
        this.controls.walkToggle = document.getElementById('mobile-walk-toggle');

        // Jump button - space key simulation
        if (this.controls.jump) {
            this.controls.jump.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.controls.jump.classList.add('active');
                hytopia.pressInput('sp', true); // Space key for jump
                console.log('[MobileControlPanel] Jump pressed');
            }, { passive: false });

            this.controls.jump.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.controls.jump.classList.remove('active');
                hytopia.pressInput('sp', false);
                console.log('[MobileControlPanel] Jump released');
            }, { passive: false });
        }

        // Fly up button - space key for fly up (correct for fly mode)
        if (this.controls.flyUp) {
            this.controls.flyUp.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.controls.flyUp.classList.add('active');
                hytopia.pressInput('sp', true); // Space key for fly up - this is correct
                console.log('[MobileControlPanel] Fly up pressed');
            }, { passive: false });

            this.controls.flyUp.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.controls.flyUp.classList.remove('active');
                hytopia.pressInput('sp', false);
                console.log('[MobileControlPanel] Fly up released');
            }, { passive: false });
        }

        // Fly down button - shift key for fly down (correct for fly mode)
        if (this.controls.flyDown) {
            this.controls.flyDown.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.controls.flyDown.classList.add('active');
                hytopia.pressInput('sh', true); // Shift key for fly down - this is correct
                console.log('[MobileControlPanel] Fly down pressed');
            }, { passive: false });

            this.controls.flyDown.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.controls.flyDown.classList.remove('active');
                hytopia.pressInput('sh', false);
                console.log('[MobileControlPanel] Fly down released');
            }, { passive: false });
        }

        // Inventory button - send showInventoryPanel message to server
        if (this.controls.inventory) {
            this.controls.inventory.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.controls.inventory.classList.add('active');
                console.log('[MobileControlPanel] Inventory button pressed - sending showInventoryPanel');
                hytopia.sendData({ type: 'showInventoryPanel' });
            }, { passive: false });

            this.controls.inventory.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.controls.inventory.classList.remove('active');
                console.log('[MobileControlPanel] Inventory button released');
            }, { passive: false });
        }

        // Place button - mouse left click simulation (ml)
        if (this.controls.place) {
            this.controls.place.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.controls.place.classList.add('active');
                hytopia.pressInput('ml', true); // Mouse left for place/build
                console.log('[MobileControlPanel] Place button pressed');
            }, { passive: false });

            this.controls.place.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.controls.place.classList.remove('active');
                hytopia.pressInput('ml', false);
                console.log('[MobileControlPanel] Place button released');
            }, { passive: false });
        }

        // Break button - mouse right click simulation (mr)
        if (this.controls.break) {
            this.controls.break.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.controls.break.classList.add('active');
                hytopia.pressInput('mr', true); // Mouse right for break/destroy
                console.log('[MobileControlPanel] Break button pressed');
            }, { passive: false });

            this.controls.break.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.controls.break.classList.remove('active');
                hytopia.pressInput('mr', false);
                console.log('[MobileControlPanel] Break button released');
            }, { passive: false });
        }

        // Walk/Create Toggle button - send walkTogglePressed message to server
        if (this.controls.walkToggle) {
            this.controls.walkToggle.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.controls.walkToggle.classList.add('active');
                console.log('[MobileControlPanel] Walk toggle button pressed - sending walkTogglePressed');
                hytopia.sendData({ type: 'walkTogglePressed' });
            }, { passive: false });

            this.controls.walkToggle.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.controls.walkToggle.classList.remove('active');
                console.log('[MobileControlPanel] Walk toggle button released');
            }, { passive: false });
        }
    }

    onPlayerStateChanged(state, isMobile, mobileControls) {
        console.log('[MobileControlPanel] Player state changed:', { state, isMobile, mobileControls });
        
        this.currentState = state;
        this.isMobileDevice = isMobile;
        
        // Only show controls if this is a mobile device
        if (!isMobile) {
            this.setVisible(false);
            return;
        }

        // Show the mobile controls
        this.setVisible(true);
        
        // Update control visibility based on state
        if (mobileControls) {
            this.updateControlVisibility(mobileControls);
        }
    }

    updateControlVisibility(controls) {
        console.log('[MobileControlPanel] Updating control visibility:', controls);
        
        // Show/hide controls based on game state
        if (this.controls.jump) {
            this.controls.jump.style.display = controls.showJumpButton ? 'flex' : 'none';
        }
        
        const flyContainer = document.getElementById('mobile-fly-container');
        if (flyContainer) {
            flyContainer.style.display = controls.showFlyControls ? 'flex' : 'none';
        }
        
        if (this.controls.inventory) {
            this.controls.inventory.style.display = controls.showInventoryButton ? 'flex' : 'none';
        }

        const buildContainer = document.getElementById('mobile-build-container');
        if (buildContainer) {
            buildContainer.style.display = controls.showFlyControls ? 'flex' : 'none'; // Show place/break buttons in building mode
        }

        if (this.controls.walkToggle) {
            this.controls.walkToggle.style.display = controls.showFlyControls ? 'flex' : 'none'; // Show walk toggle in building mode
        }
    }

    setVisible(visible) {
        this.isVisible = visible;
        if (this.container) {
            this.container.style.display = visible ? 'block' : 'none';
        }
        console.log('[MobileControlPanel] Visibility set to:', visible);
    }

    setFlyMode(isFlying) {
        this.isFlying = isFlying;
        const walkToggle = this.controls.walkToggle;
        if (walkToggle) {
            const icon = walkToggle.querySelector('.mobile-button-icon');
            const label = walkToggle.querySelector('.mobile-button-text');
            // Invert: show the mode you will enter if you press it
            if (isFlying) {
                icon.textContent = '🚶';
                label.textContent = 'Walk';
            } else {
                icon.textContent = '🛠️';
                label.textContent = 'Create';
            }
        }
        // Hide build UI when in walk mode, show only walk toggle and cash UI
        // Show build controls only in create (fly) mode
        const showBuildControls = isFlying;
        // Fly controls
        const flyContainer = document.getElementById('mobile-fly-container');
        if (flyContainer) flyContainer.style.display = showBuildControls ? 'flex' : 'none';
        // Place/Break controls
        const buildContainer = document.getElementById('mobile-build-container');
        if (buildContainer) buildContainer.style.display = showBuildControls ? 'flex' : 'none';
        // Inventory button
        if (this.controls.inventory) this.controls.inventory.style.display = showBuildControls ? 'flex' : 'none';
        // Jump button - show when in walking mode (not flying) in build mode
        if (this.controls.jump) {
            this.controls.jump.style.display = !isFlying ? 'flex' : 'none';
        }
        // Hotbar
        if (window.HotbarPanel && window.HotbarPanel.hotbarElement) {
            window.HotbarPanel.setVisible(showBuildControls);
        }
        // Inventory panel
        if (window.BlockInventoryPanel && window.BlockInventoryPanel.inventoryElement) {
            window.BlockInventoryPanel.inventoryElement.style.display = showBuildControls && window.BlockInventoryPanel.inventoryOpen ? 'flex' : 'none';
        }
        // The walk toggle and cash UI remain visible
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .mobile-controls-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                z-index: 1000;
                pointer-events: none;
            }

            /* Jump button - ergonomic, further up and in, and 33% bigger */
            .mobile-jump {
                position: absolute !important;
                bottom: 44px !important;
                right: 66px !important;
                width: 96px !important;
                height: 96px !important;
                z-index: 1001 !important;
            }
            .mobile-jump .control-icon {
                font-size: 70px;
            }
            .mobile-jump .control-label {
                font-size: 16px;
            }
            @media (max-width: 480px) {
                .mobile-jump {
                    right: 28px;
                    width: 180px;
                    height: 180px;
                }
                .mobile-jump .control-icon {
                    font-size: 90px !important;
                }
                .mobile-jump .control-label {
                    font-size: 12px;
                }
            }
            @media (orientation: landscape) and (max-height: 500px) {
                .mobile-jump {
                    bottom: 166px;
                    right: 66px;
                    width: 68px;
                    height: 168px;
                }
                .mobile-jump .control-icon {
                    font-size: 66px;
                }
                .mobile-jump .control-label {
                    font-size: 9px;
                }
            }

            /* Fly controls - left side, 60% down from top */
            .mobile-fly-container {
                position: absolute;
                left: 20px;
                top: 60%;
                transform: translateY(-50%);
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            }

            /* Inventory button - top right */
            .mobile-inventory {
                position: absolute;
                top: 20px;
                right: 20px;
            }

            /* Place/Break buttons - right side, vertically centered */
            .mobile-build-container {
                position: absolute;
                right: 20px;
                top: 50%;
                transform: translateY(-50%);
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            }

            /* Walk Toggle button - left side, below fly controls with more spacing */
                        .mobile-walk-toggle {
                position: absolute !important;
                left: 20px !important;
                top: 60.5% !important;
                transform: translateY(120px) !important;
            }
            @media (max-width: 480px) {
                .mobile-walk-toggle {
                    left: 15px !important;
                    top: 60.5% !important;
                    transform: translateY(100px) !important;
                }
            }
            @media (orientation: landscape) and (max-height: 500px) {
                .mobile-walk-toggle {
                    left: 10px !important;
                    top: 60.5% !important;
                    transform: translateY(80px) !important;
                }
            }

            .mobile-game-button {
                width: 64px;
                height: 64px;
                background: rgba(0, 0, 0, 0.8);
                border: 3px solid rgba(255, 255, 255, 0.4);
                border-radius: 50%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                pointer-events: auto;
                transition: all 0.2s ease;
                user-select: none;
                -webkit-user-select: none;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                gap: 2px;
            }

            .mobile-game-button.active {
                background: rgba(76, 175, 80, 0.9);
                border-color: rgba(76, 175, 80, 1);
                transform: scale(0.95);
                box-shadow: 0 2px 8px rgba(76, 175, 80, 0.4);
            }

            .mobile-game-button:hover {
                background: rgba(0, 0, 0, 0.9);
                border-color: rgba(255, 255, 255, 0.6);
                transform: scale(1.05);
            }

            .mobile-button-icon {
                font-size: 30px;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }
            .mobile-jump-icon {
                font-size: 40px;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }
            .mobile-jump-icon {
                font-size: 55px;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            .mobile-button-text {
                font-size: 9px;
                color: white;
                text-align: center;
                font-weight: bold;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
                line-height: 1;
            }

            .mobile-fly-container .mobile-game-button,
            .mobile-build-container .mobile-game-button {
                pointer-events: auto;
            }

            /* Responsive adjustments for smaller screens */
            @media (max-width: 480px) {
                .mobile-jump {
                    bottom: 15px;
                }

                .mobile-fly-container {
                    left: 15px;
                    gap: 8px;
                }

                .mobile-inventory {
                    top: 15px;
                    right: 15px;
                }

                .mobile-build-container {
                    right: 15px;
                    gap: 8px;
                }

                .mobile-walk-toggle {
                    left: 15px;
                    top: 60%;
                    transform: translateY(60px);
                }

                .mobile-game-button {
                    width: 56px;
                    height: 56px;
                }
                
                .mobile-button-icon {
                    font-size: 36px;
                }
                                    
                .mobile-jump-icon {
                    font-size: 45px;
                }
                
                
                .mobile-button-text {
                    font-size: 8px;
                }
            }

            /* Very small screens */
            @media (max-width: 360px) {
                .mobile-game-button {
                    width: 50px;
                    height: 50px;
                }
                
                .mobile-button-icon {
                    font-size: 28px;
                }

                                
                .mobile-jump-icon {
                    font-size: 35px;
                }
                
                .mobile-button-text {
                    font-size: 7px;
                }
            }

            /* Landscape orientation adjustments */
            @media (orientation: landscape) and (max-height: 500px) {
                .mobile-jump {
                    bottom: 10px;
                }

                .mobile-fly-container {
                    left: 10px;
                    gap: 6px;
                }

                .mobile-inventory {
                    top: 10px;
                    right: 10px;
                }

                .mobile-build-container {
                    right: 10px;
                    gap: 6px;
                }

                .mobile-walk-toggle {
                    left: 10px;
                    top: 60%;
                    transform: translateY(50px);
                }

                .mobile-game-button {
                    width: 48px;
                    height: 48px;
                }
                
                .mobile-button-icon {
                    font-size: 25px;
                }
                
                .mobile-jump-icon {
                    font-size: 40px;
                }
                
                .mobile-button-text {
                    font-size: 7px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Make it globally available as a singleton instance
window.MobileControlPanel = new MobileControlPanel(); 