class MobileNpcOptionsPanel {
    constructor() {
        this.containerId = 'mobile-npc-options-container';
        this.containerElement = null;
        console.log('[MobileNpcOptionsPanel] Constructor called');
    }

    initialize() {
        console.log('[MobileNpcOptionsPanel] Initializing...');
        this.containerElement = document.getElementById(this.containerId);
        if (!this.containerElement) {
            console.error(`[MobileNpcOptionsPanel] Container element #${this.containerId} not found! Make sure it exists in index.html.`);
            return;
        }

        // Listen for events from the server
        hytopia.onData((data) => {
            if (data.type === 'showMobileNpcOptions') {
                console.log('[MobileNpcOptionsPanel] Received showMobileNpcOptions:', data.options);
                this.updateMobileOptionButtons(data.options, data.npcId);
            } else if (data.type === 'npcInteractionEnded') {
                console.log('[MobileNpcOptionsPanel] Received npcInteractionEnded. Hiding buttons.');
                this.hideMobileOptions();
            }
        });

        console.log('[MobileNpcOptionsPanel] Initialization complete.');
    }

    // Method to update MOBILE OVERLAY buttons
    updateMobileOptionButtons(options, npcId) {
        if (!this.containerElement) return;

        // Clear previous buttons
        this.containerElement.innerHTML = '';

        if (!options || options.length === 0) {
            this.containerElement.style.display = 'none';
            return;
        }

        // Show the container
        this.containerElement.style.display = 'flex';

        // Add buttons for each option (max 3)
        const maxButtons = Math.min(options.length, 3);
        for (let i = 0; i < maxButtons; i++) {
            const optionText = options[i];
            const button = document.createElement('button');
            button.className = 'mobile-npc-option-button';
            button.textContent = `${i + 1}. ${optionText}`;

            // Shared handler function
            const handleMobileInput = (e) => {
                if(e) e.preventDefault();
                console.log(`[MobileNpcOptionsPanel] Mobile Option ${i} selected ('${optionText}'). Sending direct option selection.`);
                
                // Send direct option selection to server instead of simulating key presses
                hytopia.sendData({
                    type: 'npcOptionSelected',
                    optionIndex: i
                });

                // Hide the container immediately on selection
                this.hideMobileOptions();
            };

            // Add listeners
            button.addEventListener('click', handleMobileInput);
            button.addEventListener('touchend', handleMobileInput);
            this.containerElement.appendChild(button);
        }

        console.log(`[MobileNpcOptionsPanel] Displayed ${maxButtons} mobile overlay buttons.`);
    }

    hideMobileOptions() {
        if (this.containerElement) {
            this.containerElement.innerHTML = '';
            this.containerElement.style.display = 'none';
        }
    }
}

// Create and register the panel instance
window.MobileNpcOptionsPanel = new MobileNpcOptionsPanel();

// Add CSS for mobile NPC options
const style = document.createElement('style');
style.textContent = `
    #mobile-npc-options-container {
        position: fixed;
        bottom: 120px;
        left: 50%;
        transform: translateX(-50%);
        display: none;
        flex-direction: column;
        gap: 10px;
        z-index: 1000;
        pointer-events: auto;
    }

    .mobile-npc-option-button {
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border: 2px solid #4CAF50;
        border-radius: 8px;
        padding: 12px 20px;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        min-width: 200px;
        cursor: pointer;
        transition: all 0.2s ease;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
    }

    .mobile-npc-option-button:active {
        background: rgba(76, 175, 80, 0.8);
        transform: scale(0.95);
    }

    .mobile-npc-option-button:hover {
        background: rgba(76, 175, 80, 0.6);
    }

    /* Mobile-specific adjustments */
    @media (max-width: 768px) {
        #mobile-npc-options-container {
            bottom: 100px;
        }
        
        .mobile-npc-option-button {
            min-width: 180px;
            padding: 10px 16px;
            font-size: 14px;
        }
    }

    @media (max-width: 480px) {
        #mobile-npc-options-container {
            bottom: 80px;
        }
        
        .mobile-npc-option-button {
            min-width: 160px;
            padding: 8px 14px;
            font-size: 13px;
        }
    }
`;
document.head.appendChild(style); 