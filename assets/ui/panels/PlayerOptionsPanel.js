class PlayerOptionsPanel {
    
    constructor() {
        this.templateId = 'player-options-template';
        this.templateName = 'player-options';
        this.playerId = null;
        this._onStateHandler = null; // Store the onState handler
        this._pendingState = null; // Buffer for state before playerId is set
        console.log('[PlayerOptionsPanel] Constructor called');
    }

    initialize() {
        console.log('[PlayerOptionsPanel] Initializing...');
        this.injectTemplateAndStyles();
        this.registerSceneUITemplate();
        // Listen for player ID and showPlayerOptions from server
        hytopia.onData((data) => {
            if (data.type === 'playerIdentity') {
                this.playerId = data.playerId;
                console.log('[PlayerOptionsPanel] playerId set:', this.playerId);
                // If we have a pending state, show it now
                if (this._pendingState) {
                    console.log('[PlayerOptionsPanel] Showing buffered state after playerId set:', this._pendingState);
                    this.show(this._pendingState);
                    this._pendingState = null;
                }
            }
            if (data.type === 'showPlayerOptions') {
                console.log('[PlayerOptionsPanel] Received showPlayerOptions:', data);
                if (!this.playerId) {
                    console.log('[PlayerOptionsPanel] Buffering state until playerId is set');
                    this._pendingState = data;
                } else {
                    this.show(data);
                }
            }
        });
    }

    injectTemplateAndStyles() {
        console.log('[PlayerOptionsPanel] Injecting template and styles...');
        // --- Create and Inject HTML Template ---
        if (!document.getElementById(this.templateId)) {
            const templateElement = document.createElement('template');
            templateElement.id = this.templateId;
            // Structure to hold multiple option lines
            templateElement.innerHTML = `
                <div class="player-options-container">
                  </div>
            `;
            document.body.appendChild(templateElement);
            console.log('[PlayerOptionsPanel] Template injected');
        } else {
            console.log('[PlayerOptionsPanel] Template already exists');
        }

        // --- Create and Inject CSS Styles ---
        const styleId = 'player-options-styles';
        if (!document.getElementById(styleId)) {
            const styleElement = document.createElement('style');
            styleElement.id = styleId;
            // --- UPDATE STYLES ---
            styleElement.textContent = `
              .player-options-container {
                /* Container styling - adjust as needed */
                display: flex;
                /* Choose layout direction: */
                flex-direction: column; /* Stack buttons vertically */
                /* OR */
                /* flex-direction: row; */ /* Arrange buttons horizontally */
                gap: 8px; /* Spacing between buttons */
                align-items: center; /* Center buttons horizontally */
                justify-content: center;
                max-width: 300px; /* Adjust width */
                margin: 0 auto;
                display: none; /* Hidden by default */
                /* Remove background/padding from container if buttons provide it */
                /* background-color: rgba(0, 0, 0, 0.6); */
                /* padding: 8px 12px; */
                /* border-radius: 6px; */
              }
              /* Style for the clickable button */
              .player-option-button {
                  background-color: rgba(30, 30, 30, 0.8); /* Darker background */
                  color: #ffffff;
                  border: 1px solid rgba(200, 200, 200, 0.5);
                  border-radius: 5px;
                  padding: 8px 15px; /* Make it easily clickable */
                  font-family: Arial, sans-serif;
                  font-size: 14px;
                  cursor: pointer;
                  text-align: left; /* Align text inside button */
                  white-space: normal; /* Allow text wrapping */
                  min-width: 150px; /* Ensure a minimum width */
                  transition: background-color 0.2s; /* Add hover effect */
              }
              .player-option-button:hover {
                   background-color: rgba(70, 70, 70, 0.9);
              }
            `;
            // --- END STYLE UPDATE ---
            document.head.appendChild(styleElement);
            console.log('[PlayerOptionsPanel] Styles injected');
        } else {
            console.log('[PlayerOptionsPanel] Styles already exist');
        }
    }

    registerSceneUITemplate() {
        console.log('[PlayerOptionsPanel] Registering scene UI template...');
        try {
            // Use 'this' to refer to the panel instance
            const panelInstance = this;
            hytopia.registerSceneUITemplate(this.templateName, (id, onState) => {
                panelInstance._onStateHandler = onState; // Store the handler
                console.log('[PlayerOptionsPanel] Template registered. onState handler stored.');
                const template = document.getElementById(panelInstance.templateId); // Use panelInstance
                if (!template) {
                    console.error(`[PlayerOptionsPanel] Template element #${panelInstance.templateId} not found!`);
                    return document.createElement('div'); 
                }
                const clone = template.content.cloneNode(true);
                const optionsContainer = clone.querySelector('.player-options-container');
                if (!optionsContainer) {
                    console.error('[PlayerOptionsPanel] Template content query selector failed!');
                    return document.createElement('div');
                }
                // Use an arrow function for onState to preserve 'this' context
                onState(state => {
                    console.log('[PlayerOptionsPanel] onState called with:', state);
                    // Only hide if state or options are missing
                    if (!state || !state.options || !Array.isArray(state.options)) {
                        console.log('[PlayerOptionsPanel] Hiding: invalid state or options');
                        optionsContainer.style.display = 'none';
                        return;
                    }
                    optionsContainer.innerHTML = '';
                    let hasValidOptions = false;
                    if (state.options && Array.isArray(state.options)) {
                        // Use Q, E, R keys for player options to avoid conflict with hotbar (1, 2, 3)
                        const optionKeys = ['q', 'e', 'r'];
                        const optionKeyLabels = ['Q', 'E', 'R'];
                        
                        state.options.forEach((optionText, index) => {
                            if (typeof optionText === 'string' && optionText.trim() !== '' && index < optionKeys.length) {
                                const optionElement = document.createElement('button');
                                optionElement.className = 'player-option-button';
                                optionElement.textContent = `[${optionKeyLabels[index]}] ${optionText}`;
                                optionElement.addEventListener('click', () => {
                                    const inputCode = optionKeys[index];
                                    hytopia.triggerInput(inputCode, true);
                                    setTimeout(() => hytopia.triggerInput(inputCode, false), 50);
                                    optionsContainer.style.display = 'none';
                                });
                                optionsContainer.appendChild(optionElement);
                                hasValidOptions = true;
                            }
                        });
                    }
                    if (hasValidOptions) {
                        optionsContainer.style.display = 'flex';
                        console.log('[PlayerOptionsPanel] Displaying options:', state.options);
                    } else {
                        optionsContainer.style.display = 'none';
                        console.log('[PlayerOptionsPanel] No valid options to display.');
                    }
                });
                return clone;
            });
        } catch (error) {
            console.error(`[PlayerOptionsPanel] Error registering template '${this.templateName}':`, error);
        }
    }

    show(state) {
        console.log('[PlayerOptionsPanel] show called with:', state);
        if (this._onStateHandler) {
            this._onStateHandler(state);
        } else {
            console.warn('[PlayerOptionsPanel] _onStateHandler is not set!');
        }
    }
}

window.PlayerOptionsPanel = new PlayerOptionsPanel();
window.PlayerOptionsPanel.initialize(); 