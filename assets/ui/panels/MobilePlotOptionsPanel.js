/**
 * MobilePlotOptionsPanel - Touch-optimized plot entrance interactions for mobile
 * 
 * Creates overlay buttons when players approach plot entrances on mobile devices
 * Replaces SceneUI with touch-friendly buttons for plot options like Play, Build, etc.
 */
class MobilePlotOptionsPanel {
    constructor() {
        this.containerId = 'mobile-plot-options-container'; // ID of the div in index.html
        this.containerElement = null;
        this.currentOptions = [];
        this.currentPlotIndex = null;
        this.isVisible = false;
        console.log('[MobilePlotOptionsPanel] Constructor called');
    }

    initialize() {
        console.log('[MobilePlotOptionsPanel] Initializing...');
        this.containerElement = document.getElementById(this.containerId);

        if (!this.containerElement) {
            console.error(`[MobilePlotOptionsPanel] Container element #${this.containerId} not found! Make sure it exists in index.html.`);
            return;
        }

        // Add styles for mobile plot options
        this.addStyles();

        // Listen for events from the server
        hytopia.onData((data) => {
            if (data.type === 'showMobilePlayerOptions') {
                console.log('[MobilePlotOptionsPanel] Received showMobilePlayerOptions:', data);
                this.showMobileOptions(data);
            } else if (data.type === 'plotInteractionEnded') {
                console.log('[MobilePlotOptionsPanel] Received plotInteractionEnded. Hiding buttons.');
                this.hideMobileOptions();
            }
        });

        console.log('[MobilePlotOptionsPanel] Initialization complete.');
    }

    // Method to update MOBILE OVERLAY buttons
    showMobileOptions(data) {
        if (!this.containerElement) return;

        const { options, plotIndex, contextualInfo, currentState } = data;

        // Clear previous buttons
        this.containerElement.innerHTML = '';
        this.currentOptions = options || [];
        this.currentPlotIndex = plotIndex;

        if (!options || options.length === 0) {
            this.hideMobileOptions();
            return;
        }

        // Create info header if contextualInfo is provided
        if (contextualInfo) {
            const infoHeader = document.createElement('div');
            infoHeader.className = 'mobile-plot-info';
            infoHeader.textContent = contextualInfo;
            this.containerElement.appendChild(infoHeader);
        }

        // Show the container
        this.containerElement.style.display = 'flex';
        this.isVisible = true;

        // Add buttons for each option (max 3)
        const maxButtons = Math.min(options.length, 3);
        for (let i = 0; i < maxButtons; i++) {
            const optionText = options[i]; // Get the actual option text
            const button = document.createElement('button');
            button.className = 'mobile-plot-option-button';
            
            // Add appropriate emoji and styling for different options
            let buttonIcon = '';
            switch (optionText) {
                case 'Play':
                    buttonIcon = '🎮';
                    button.classList.add('play-button');
                    break;
                case 'Build':
                    buttonIcon = '🔨';
                    button.classList.add('build-button');
                    break;
                case 'Clear Plot':
                    buttonIcon = '🧹';
                    button.classList.add('clear-button');
                    break;
                case 'Exit Play Mode':
                    buttonIcon = '🚪';
                    button.classList.add('exit-button');
                    break;
                case 'Exit Build Mode':
                    buttonIcon = '🚪';
                    button.classList.add('exit-button');
                    break;
                default:
                    buttonIcon = '📋';
                    break;
            }
            
            button.innerHTML = `
                <div class="button-icon">${buttonIcon}</div>
                <div class="button-text">${optionText}</div>
            `;

            // Shared handler function
            const handleMobileInput = (e) => {
                if(e) e.preventDefault(); // Prevent default for touch
                
                // Add visual feedback
                button.classList.add('button-pressed');
                setTimeout(() => button.classList.remove('button-pressed'), 200);
                
                // Map to corresponding key (Q, E, R)
                const keyMappings = ['q', 'e', 'r'];
                const inputKey = keyMappings[i];
                
                if (inputKey) {
                    console.log(`[MobilePlotOptionsPanel] Option ${i} selected ('${optionText}'). Simulating key press: ${inputKey}`);

                    // Use pressInput like other mobile panels
                    hytopia.pressInput(inputKey, true);
                    setTimeout(() => {
                        hytopia.pressInput(inputKey, false);
                    }, 100);

                    // Hide the container immediately on selection
                    this.hideMobileOptions();
                }
            };

            // Add touch event listeners
            button.addEventListener('click', handleMobileInput);
            button.addEventListener('touchend', handleMobileInput);

            // Prevent touch events from bubbling to prevent accidental double-triggers
            button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                button.classList.add('button-pressed');
            }, { passive: false });

            this.containerElement.appendChild(button);
        }
        
        console.log(`[MobilePlotOptionsPanel] Displayed ${maxButtons} mobile plot option buttons.`);
    }

    hideMobileOptions() {
        if (this.containerElement) {
            this.containerElement.innerHTML = ''; // Clear buttons
            this.containerElement.style.display = 'none';
            this.isVisible = false;
            this.currentOptions = [];
            this.currentPlotIndex = null;
        }
        console.log('[MobilePlotOptionsPanel] Mobile plot options hidden.');
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #mobile-plot-options-container {
                position: fixed;
                bottom: 100px; /* Above mobile controls */
                left: 50%;
                transform: translateX(-50%);
                display: none;
                flex-direction: column;
                gap: 12px;
                z-index: 1100; /* Above mobile controls */
                pointer-events: none;
                width: 280px;
                max-width: 90vw;
            }

            .mobile-plot-info {
                background: rgba(0, 0, 0, 0.85);
                color: white;
                text-align: center;
                padding: 8px 16px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 4px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                pointer-events: none;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
            }

            .mobile-plot-option-button {
                background: rgba(40, 40, 40, 0.95);
                border: 3px solid rgba(255, 255, 255, 0.4);
                border-radius: 12px;
                padding: 16px 20px;
                cursor: pointer;
                pointer-events: auto;
                transition: all 0.2s ease;
                user-select: none;
                -webkit-user-select: none;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                display: flex;
                align-items: center;
                gap: 12px;
                width: 100%;
                min-height: 60px;
            }

            .mobile-plot-option-button:hover {
                background: rgba(60, 60, 60, 0.95);
                border-color: rgba(255, 255, 255, 0.6);
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
            }

            .mobile-plot-option-button.button-pressed {
                background: rgba(76, 175, 80, 0.9);
                border-color: rgba(76, 175, 80, 1);
                transform: translateY(1px) scale(0.98);
                box-shadow: 0 2px 8px rgba(76, 175, 80, 0.4);
            }

            .button-icon {
                font-size: 24px;
                min-width: 32px;
                text-align: center;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            .button-text {
                color: white;
                font-size: 16px;
                font-weight: bold;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
                flex: 1;
                text-align: left;
            }

            /* Specific button type styling */
            .mobile-plot-option-button.play-button {
                border-color: rgba(76, 175, 80, 0.6);
            }

            .mobile-plot-option-button.build-button {
                border-color: rgba(255, 193, 7, 0.6);
            }

            .mobile-plot-option-button.clear-button {
                border-color: rgba(244, 67, 54, 0.6);
            }

            .mobile-plot-option-button.exit-button {
                border-color: rgba(156, 39, 176, 0.6);
            }

            /* Responsive adjustments */
            @media (max-width: 480px) {
                #mobile-plot-options-container {
                    width: 260px;
                    bottom: 90px;
                    gap: 10px;
                }

                .mobile-plot-option-button {
                    padding: 14px 18px;
                    min-height: 55px;
                }

                .button-icon {
                    font-size: 22px;
                    min-width: 28px;
                }

                .button-text {
                    font-size: 15px;
                }

                .mobile-plot-info {
                    font-size: 13px;
                    padding: 6px 14px;
                }
            }

            /* Very small screens */
            @media (max-width: 360px) {
                #mobile-plot-options-container {
                    width: 240px;
                    bottom: 85px;
                    gap: 8px;
                }

                .mobile-plot-option-button {
                    padding: 12px 16px;
                    min-height: 50px;
                }

                .button-icon {
                    font-size: 20px;
                    min-width: 26px;
                }

                .button-text {
                    font-size: 14px;
                }

                .mobile-plot-info {
                    font-size: 12px;
                    padding: 6px 12px;
                }
            }

            /* Landscape orientation adjustments */
            @media (orientation: landscape) and (max-height: 500px) {
                #mobile-plot-options-container {
                    bottom: 70px;
                    gap: 6px;
                }

                .mobile-plot-option-button {
                    padding: 10px 16px;
                    min-height: 45px;
                }

                .button-icon {
                    font-size: 18px;
                    min-width: 24px;
                }

                .button-text {
                    font-size: 13px;
                }

                .mobile-plot-info {
                    font-size: 11px;
                    padding: 5px 12px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Create and register the panel instance
window.MobilePlotOptionsPanel = new MobilePlotOptionsPanel(); 