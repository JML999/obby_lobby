class BuildTutorialPanel {
    constructor() {
        this.container = null;
        this.isVisible = false;
    }

    initialize(containerId = 'build-tutorial-panel') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`[BuildTutorialPanel] Container with ID '${containerId}' not found.`);
            return;
        }

        this.createTutorialUI();
        this.addStyles();
        this.setupEventListeners();
        
        // Listen for player state changes to show tutorial on first build
        if (window.hytopia && window.hytopia.onData) {
            window.hytopia.onData((data) => {
                if (data.type === 'playerStateChanged') {
                    // this.onPlayerStateChanged(data.state, data.plotIndex, data.isMobile); // Removed
                } else if (data.type === 'showBuildTutorial') {
                    // Send message to server to check if tutorial should be shown
                    if (window.hytopia && window.hytopia.sendData) {
                        window.hytopia.sendData({
                            type: 'showBuildTutorial',
                            plotIndex: data.plotIndex
                        });
                    }
                } else if (data.type === 'displayBuildTutorial') {
                    // Server approved showing the tutorial
                    this.show();
                }
            });
        }
        
        console.log('[BuildTutorialPanel] Initialized successfully.');
    }

    createTutorialUI() {
        // Detect if this is a mobile device
        const isMobile = this.detectMobileDevice();
        
        if (isMobile) {
            this.createMobileTutorialUI();
        } else {
            this.createDesktopTutorialUI();
        }
    }
    
    detectMobileDevice() {
        // Same logic as used in index.html for mobile detection
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const mobileUserAgents = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
        const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallScreen = window.screen.width < 768 || window.innerWidth < 768;
        const matchesMediaQuery = window.matchMedia("(max-width: 768px)").matches;
        const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
        
        return mobileUserAgents || (hasTouchSupport && (isSmallScreen || matchesMediaQuery || isCoarsePointer));
    }
    
    createMobileTutorialUI() {
        this.container.innerHTML = `
            <div class="tutorial-overlay mobile-tutorial" id="tutorial-overlay">
                <div class="tutorial-modal mobile-modal">
                    <div class="tutorial-header mobile-header">
                        <h2>🏗️ Build Guide</h2>
                        <button class="tutorial-close mobile-close" id="tutorial-close">×</button>
                    </div>
                    
                    <div class="tutorial-content mobile-content">
                        <!-- Mobile-optimized condensed content -->
                        <div class="tutorial-section mobile-section">
                            <h3>📋 Create a Course</h3>
                            <div class="mobile-steps">
                                <div class="mobile-step">1️⃣ Place Start Block</div>
                                <div class="mobile-step">2️⃣ Place Goal Block</div>
                                <div class="mobile-step">3️⃣ Connect with 5+ blocks</div>
                            </div>
                        </div>
                        
                        <div class="tutorial-section mobile-section">
                            <h3>🎮 Controls</h3>
                            <div class="mobile-controls">
                                <div class="mobile-control-columns">
                                    <div class="mobile-control-column">
                                        <div class="control-row">
                                            <span class="control-label">Move:</span>
                                            <span class="control-keys">Joystick</span>
                                        </div>
                                        <div class="control-row">
                                            <span class="control-label">Jump:</span>
                                            <span class="control-keys">🦘 Button</span>
                                        </div>
                                        <div class="control-row">
                                            <span class="control-label">Build / Walk:</span>
                                            <span class="control-keys">🛠️ Toggle</span>
                                        </div>
                                    </div>
                                    <div class="mobile-control-column">
                                        <div class="control-row">
                                            <span class="control-label">Place Block:</span>
                                            <span class="control-keys">🔨 Button</span>
                                        </div>
                                        <div class="control-row">
                                            <span class="control-label">Remove Block:</span>
                                            <span class="control-keys">⛏️ Button</span>
                                        </div>
                                        <div class="control-row">
                                            <span class="control-label">Blocks:</span>
                                            <span class="control-keys">🎒 Inventory</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="tutorial-section mobile-section">
                            <h3>💡 Tips</h3>
                            <div class="mobile-tips">
                                <div class="tip-item">• Use fly mode to build</div>
                                <div class="tip-item">• Test your course in walk mode</div>
                                <div class="tip-item">• Have fun! There is no right or wrong way to build.</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tutorial-footer mobile-footer">
                        <button class="tutorial-button mobile-button" id="tutorial-got-it">Got it!</button>
                    </div>
                </div>
            </div>
        `;
    }
    
    createDesktopTutorialUI() {
        this.container.innerHTML = `
            <div class="tutorial-overlay" id="tutorial-overlay">
                <div class="tutorial-modal">
                    <div class="tutorial-header">
                        <h2>🏗️ Build Mode Tutorial</h2>
                        <button class="tutorial-close" id="tutorial-close">×</button>
                    </div>
                    
                    <div class="tutorial-content">
                        <div class="tutorial-section">
                            <h3>📋 How to Create a Course</h3>
                            <div class="tutorial-steps">
                                <div class="tutorial-step">
                                    <div class="step-number">1</div>
                                    <div class="step-content">
                                        <strong>Place a Start Block</strong>
                                        <p>Choose a spawn point for players</p>
                                    </div>
                                </div>
                                <div class="tutorial-step">
                                    <div class="step-number">2</div>
                                    <div class="step-content">
                                        <strong>Place a Goal Block</strong>
                                        <p>Set the finish line for your course</p>
                                    </div>
                                </div>
                                <div class="tutorial-step">
                                    <div class="step-number">3</div>
                                    <div class="step-content">
                                        <strong>Connect with 5+ Blocks</strong>
                                        <p>Build a challenging path between them</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tutorial-section">
                            <h3>🎮 Controls</h3>
                            <div class="tutorial-controls">
                                <div class="control-columns">
                                    <div class="control-column left-column">
                                        <div class="control-item">
                                            <span class="control-key">W A S D</span>
                                            <span class="control-desc">Move around</span>
                                        </div>
                                        <div class="control-item">
                                            <span class="control-key">Space</span>
                                            <span class="control-desc">Jump</span>
                                        </div>
                                        <div class="control-item">
                                            <span class="control-key">F</span>
                                            <span class="control-desc">Toggle fly/walk mode</span>
                                        </div>
                                    </div>
                                    
                                    <div class="control-column right-column">
                                        <div class="control-item">
                                            <span class="control-key">Left Click</span>
                                            <span class="control-desc">Place block/obstacle</span>
                                        </div>
                                        <div class="control-item">
                                            <span class="control-key">Right Click</span>
                                            <span class="control-desc">Remove block/obstacle</span>
                                        </div>
                                        <div class="control-item">
                                            <span class="control-key">E</span>
                                            <span class="control-desc">Open inventory</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tutorial-section">
                            <h3>💡 Pro Tips</h3>
                            <div class="tutorial-tips">
                                <div class="tip-item">
                                    <span class="tip-icon">✈️</span>
                                    <span>Use fly mode for easier building and positioning</span>
                                </div>
                                <div class="tip-item">
                                    <span class="tip-icon">🎯</span>
                                    <span>Test your course by switching to walk mode</span>
                                </div>
                                <div class="tip-item">
                                    <span class="tip-icon">🧱</span>
                                    <span>Mix different block types for variety</span>
                                </div>
                                <div class="tip-item">
                                    <span class="tip-icon">⚡</span>
                                    <span>Add obstacles for extra challenge</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tutorial-footer">
                        <button class="tutorial-button" id="tutorial-got-it">Got it! Start Building</button>
                    </div>
                </div>
            </div>
        `;
    }

    addStyles() {
        // Remove existing styles to allow updates
        const existingStyle = document.getElementById('build-tutorial-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        const style = document.createElement('style');
        style.id = 'build-tutorial-styles';
        style.textContent = `
            .tutorial-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                font-family: 'Inter', sans-serif;
                padding: 20px; /* Add padding to prevent edge touching */
                box-sizing: border-box;
            }

            .tutorial-overlay.visible {
                display: flex;
                animation: tutorial-fade-in 0.3s ease-out;
            }

            @keyframes tutorial-fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .tutorial-modal {
                background: rgba(0, 0, 0, 0.9);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
                max-width: 800px;
                max-height: 80vh;
                width: 90%;
                overflow-y: auto;
                position: relative;
                margin: auto; /* Ensure centering */
                box-sizing: border-box;
            }

            .tutorial-header {
                background: rgba(255, 255, 255, 0.1);
                color: white;
                padding: 20px 30px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .tutorial-header h2 {
                margin: 0;
                font-size: 24px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 1px;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
            }

            .tutorial-close {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: white;
                font-size: 18px;
                cursor: pointer;
                padding: 8px 12px;
                border-radius: 4px;
                font-weight: bold;
                transition: all 0.2s ease;
            }

            .tutorial-close:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .tutorial-content {
                padding: 30px;
                color: white;
            }

            .tutorial-section {
                margin-bottom: 30px;
            }

            .tutorial-section h3 {
                color: white;
                font-size: 18px;
                margin-bottom: 15px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-weight: bold;
            }

            .tutorial-steps {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .tutorial-step {
                display: flex;
                align-items: flex-start;
                gap: 15px;
                background: rgba(255, 255, 255, 0.05);
                padding: 15px;
                border-radius: 6px;
                border-left: 3px solid rgba(255, 255, 255, 0.3);
            }

            .step-number {
                background: rgba(255, 255, 255, 0.2);
                color: white;
                width: 28px;
                height: 28px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 14px;
                flex-shrink: 0;
                border: 1px solid rgba(255, 255, 255, 0.3);
            }

            .step-content strong {
                display: block;
                font-size: 16px;
                margin-bottom: 4px;
                color: #ffffff;
                font-weight: bold;
            }

            .step-content p {
                margin: 0;
                color: rgba(255, 255, 255, 0.8);
                font-size: 14px;
                line-height: 1.4;
            }

            .tutorial-controls {
                display: flex;
                justify-content: space-between;
                gap: 20px;
            }

            .control-columns {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
            }

            .control-column {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .control-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                margin-bottom: 6px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .control-key {
                background: rgba(0, 0, 0, 0.6);
                color: white;
                padding: 4px 8px;
                border-radius: 3px;
                font-family: 'Inter', monospace;
                font-weight: bold;
                font-size: 12px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                text-transform: uppercase;
            }

            .control-desc {
                color: rgba(255, 255, 255, 0.9);
                font-size: 14px;
            }

            .tutorial-tips {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .tip-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                color: rgba(255, 255, 255, 0.9);
                border-left: 3px solid rgba(255, 255, 255, 0.3);
            }

            .tip-icon {
                font-size: 16px;
                width: 20px;
                text-align: center;
                flex-shrink: 0;
            }

            .tutorial-footer {
                padding: 20px 30px;
                border-top: 1px solid rgba(255, 255, 255, 0.2);
                background: rgba(0, 0, 0, 0.2);
                border-radius: 0 0 12px 12px;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .tutorial-button {
                background: linear-gradient(135deg, #4CAF50, #45a049);
                color: white;
                border: none;
                padding: 12px 24px;
                font-size: 16px;
                font-weight: bold;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                text-transform: uppercase;
                letter-spacing: 1px;
                box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
            }

            .tutorial-button:hover {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(255, 255, 255, 0.5);
                transform: translateY(-1px);
            }

            /* Mobile responsive */
            @media (max-width: 768px) {
                .tutorial-modal {
                    width: 95%;
                    max-height: 85vh;
                }

                .tutorial-content {
                    padding: 20px;
                }

                .control-columns {
                    grid-template-columns: 1fr;
                    gap: 15px;
                }

                .control-column {
                    gap: 8px;
                }

                .tutorial-header {
                    padding: 15px 20px;
                }

                .tutorial-header h2 {
                    font-size: 18px;
                }

                .tutorial-footer {
                    padding: 15px 20px;
                    flex-direction: column;
                    gap: 15px;
                }
            }

            @media (max-width: 480px) {
                .tutorial-steps {
                    gap: 8px;
                }

                .tutorial-step {
                    padding: 12px;
                }

                .step-number {
                    width: 24px;
                    height: 24px;
                    font-size: 12px;
                }

                .step-content strong {
                    font-size: 14px;
                }

                .step-content p {
                    font-size: 13px;
                }
            }

            /* Mobile Tutorial Optimizations */
            .mobile-tutorial {
                padding: 15px; /* Increased padding for better spacing */
                backdrop-filter: blur(2px);
                box-sizing: border-box;
            }

            .mobile-modal {
                width: 95vw;
                max-width: 320px; /* Slightly wider for better content fit */
                max-height: 55vh; /* Slightly taller for better content visibility */
                margin: auto; /* Ensure perfect centering */
                background: rgba(20, 20, 25, 0.95);
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
                box-sizing: border-box;
            }

            .mobile-header {
                padding: 8px 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.15);
            }

            .mobile-header h2 {
                font-size: 16px;
                margin: 0;
            }

            .mobile-close {
                width: 32px;
                height: 32px;
                font-size: 20px;
                border-radius: 6px;
                min-width: 44px;
                min-height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                touch-action: manipulation;
            }

            .mobile-content {
                padding: 12px;
                color: white;
            }

            .mobile-section {
                margin-bottom: 12px;
            }

            .mobile-section h3 {
                font-size: 12px;
                margin-bottom: 6px;
                color: white;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-weight: bold;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                padding-bottom: 4px;
            }

            .mobile-steps {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .mobile-step {
                padding: 6px 8px;
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                color: white;
                min-height: 32px;
                display: flex;
                align-items: center;
            }

            .mobile-controls {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .mobile-control-columns {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }

            .mobile-control-column {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .control-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 6px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 6px;
                font-size: 12px;
                min-height: 28px;
            }

            .control-label {
                font-weight: 600;
                color: rgba(255, 255, 255, 0.8);
                flex: 1;
            }

            .control-keys {
                background: rgba(255, 255, 255, 0.1);
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: bold;
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.2);
                min-width: 60px;
                text-align: center;
            }

            .mobile-tips {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .tip-item {
                padding: 4px 6px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 6px;
                font-size: 12px;
                color: rgba(255, 255, 255, 0.9);
                border-left: 3px solid rgba(76, 175, 80, 0.6);
            }

            .mobile-footer {
                padding: 8px 12px;
                border-top: 1px solid rgba(255, 255, 255, 0.15);
                background: rgba(0, 0, 0, 0.2);
                border-radius: 0 0 12px 12px;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .mobile-button {
                background: linear-gradient(135deg, #4CAF50, #45a049);
                color: white;
                border: none;
                padding: 10px 16px;
                font-size: 16px;
                font-weight: bold;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                width: 100%;
                max-width: 200px;
                min-height: 40px;
                touch-action: manipulation;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .mobile-button:hover {
                background: linear-gradient(135deg, #45a049, #4CAF50);
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
            }

            .mobile-button:active {
                transform: translateY(0);
                box-shadow: 0 2px 6px rgba(76, 175, 80, 0.2);
            }

            /* Small mobile screens */
            @media (max-width: 480px) {
                .tutorial-modal {
                    max-height: 40vh;
                }

                .mobile-modal {
                    width: 98vw;
                    max-width: none;
                    max-height: 35vh; /* Much shorter for small mobile */
                    border-radius: 8px;
                }

                .mobile-header {
                    padding: 10px 12px;
                }

                .mobile-header h2 {
                    font-size: 16px;
                }

                .mobile-close {
                    width: 28px;
                    height: 28px;
                    font-size: 18px;
                    min-width: 40px;
                    min-height: 40px;
                }

                .mobile-content {
                    padding: 12px;
                }

                .mobile-section h3 {
                    font-size: 13px;
                }

                .mobile-control-columns {
                    grid-template-columns: 1fr;
                    gap: 6px;
                }

                .mobile-step {
                    padding: 8px 10px;
                    font-size: 12px;
                    min-height: 36px;
                }

                .control-row {
                    padding: 6px 8px;
                    font-size: 11px;
                    min-height: 32px;
                }

                .control-keys {
                    padding: 3px 6px;
                    font-size: 10px;
                    min-width: 50px;
                }

                .tip-item {
                    padding: 6px 8px;
                    font-size: 11px;
                }

                .mobile-footer {
                    padding: 10px 12px;
                }

                .mobile-button {
                    padding: 12px 20px;
                    font-size: 14px;
                    min-height: 44px;
                }

                .tutorial-steps {
                    gap: 8px;
                }

                .tutorial-step {
                    padding: 12px;
                }

                .step-number {
                    width: 24px;
                    height: 24px;
                    font-size: 12px;
                }

                .step-content strong {
                    font-size: 14px;
                }

                .step-content p {
                    font-size: 13px;
                }
            }

            /* Very small screens */
            @media (max-width: 360px) {
                .tutorial-modal {
                    max-height: 75vh;
                }

                .mobile-modal {
                    max-height: 30vh; /* Much shorter for very small screens */
                    border-radius: 6px;
                }

                .mobile-content {
                    padding: 10px;
                }

                .mobile-section {
                    margin-bottom: 16px;
                }

                .mobile-control-columns {
                    grid-template-columns: 1fr;
                    gap: 4px;
                }

                .mobile-step {
                    padding: 6px 8px;
                    font-size: 11px;
                    min-height: 32px;
                }

                .control-row {
                    padding: 5px 6px;
                    font-size: 10px;
                    min-height: 28px;
                }

                .tip-item {
                    padding: 5px 6px;
                    font-size: 10px;
                }

                .mobile-button {
                    padding: 10px 16px;
                    font-size: 13px;
                    min-height: 40px;
                }
            }

            /* Landscape orientation on mobile - Optimized for center screen positioning */
            @media (orientation: landscape) and (max-height: 500px) {
                .mobile-modal {
                    max-height: 75vh; /* Reduced from 95vh for better centering */
                    width: 85vw; /* Reduced from 90vw for better fit */
                    max-width: 500px; /* Reduced from 600px for better center positioning */
                    margin: auto; /* Ensure perfect centering */
                }

                .mobile-content {
                    padding: 10px 14px; /* Slightly more padding for better readability */
                }

                .mobile-section {
                    margin-bottom: 10px; /* Reduced from 12px for better spacing */
                }

                .mobile-section h3 {
                    font-size: 13px; /* Increased from 12px for better readability */
                    margin-bottom: 7px;
                }

                .mobile-steps,
                .mobile-controls,
                .mobile-tips {
                    gap: 6px; /* Increased from 4px for better spacing */
                }

                .mobile-step,
                .control-row,
                .tip-item {
                    padding: 6px 8px; /* Increased padding for better touch targets */
                    min-height: 28px; /* Increased from 24px for better readability */
                    font-size: 11px; /* Increased from 10px for better readability */
                }

                .mobile-footer {
                    padding: 10px 14px; /* Increased padding */
                    gap: 10px;
                }

                .mobile-button {
                    padding: 10px 18px; /* Better padding for touch */
                    font-size: 13px; /* Increased from 12px for better readability */
                    min-height: 40px; /* Increased from 36px for better touch targets */
                }

                /* Improved control layout for landscape */
                .mobile-control-columns {
                    grid-template-columns: 1fr 1fr; /* Keep two columns in landscape */
                    gap: 8px; /* Better spacing */
                }

                .control-label {
                    font-size: 11px; /* Consistent with other text */
                }

                                 .control-keys {
                     font-size: 10px; /* Slightly larger for readability */
                     padding: 3px 6px;
                 }
             }

             /* Landscape mode for larger devices (tablets, etc.) */
             @media (orientation: landscape) and (min-height: 500px) and (max-width: 1024px) {
                 .tutorial-modal {
                     max-width: 700px; /* Slightly smaller for better centering */
                     max-height: 70vh; /* Reduced height for better fit */
                     width: 85%; /* Slightly narrower */
                 }

                 .mobile-modal {
                     max-width: 450px; /* Better size for landscape tablets */
                     max-height: 65vh; /* Appropriate height */
                     width: 80vw; /* Better proportions */
                 }

                 .tutorial-content, .mobile-content {
                     padding: 16px 20px; /* Better padding for larger landscape */
                 }
             }
        `;
        document.head.appendChild(style);
    }

    setupEventListeners() {
        // Close button
        const closeButton = this.container.querySelector('#tutorial-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => this.hide());
        }

        // Got it button
        const gotItButton = this.container.querySelector('#tutorial-got-it');
        if (gotItButton) {
            gotItButton.addEventListener('click', () => {
                this.hide();
            });
        }

        // Close when clicking overlay background
        const overlay = this.container.querySelector('#tutorial-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.hide();
                }
            });
        }

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    checkAndShowTutorial() {
        // This function is no longer needed as we are session-based
        // Keeping it for now, but it will always return false
        return false;
    }

    show() {
        const overlay = this.container.querySelector('#tutorial-overlay');
        if (overlay) {
            overlay.classList.add('visible');
            this.isVisible = true;
            
            // Disable player input to prevent mouse control loss
            if (window.hytopia && window.hytopia.sendData) {
                window.hytopia.sendData({
                    type: 'disablePlayerInput'
                });
            }
            
            console.log('[BuildTutorialPanel] show called, panel should be visible.');
        }
    }

    hide() {
        const overlay = this.container.querySelector('#tutorial-overlay');
        if (overlay) {
            overlay.classList.remove('visible');
            this.isVisible = false;
            
            // Re-enable player input to restore mouse control
            if (window.hytopia && window.hytopia.sendData) {
                window.hytopia.sendData({
                    type: 'enablePlayerInput'
                });
            }
            
            console.log('[BuildTutorialPanel] hide called, panel should be hidden.');
        }
    }

    // Public method to force show tutorial (for testing or manual trigger)
    forceShow() {
        this.show();
    }
}

// Auto-initialize if the container exists
if (document.getElementById('build-tutorial-panel')) {
    const panel = new BuildTutorialPanel();
    panel.initialize();
    
    // Make it globally accessible for manual control
    window.BuildTutorialPanel = panel;
} 