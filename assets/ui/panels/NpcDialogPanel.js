class NpcDialogPanel {
    constructor() {
        this.containerId = 'npc-dialog-container';
        this.containerElement = null;
        this.currentDialog = null;
        console.log('[NpcDialogPanel] Constructor called');
    }

    initialize() {
        console.log('[NpcDialogPanel] Initializing...');
        this.containerElement = document.getElementById(this.containerId);
        if (!this.containerElement) {
            console.error(`[NpcDialogPanel] Container element #${this.containerId} not found! Make sure it exists in index.html.`);
            return;
        }

        // Listen for events from the server
        hytopia.onData((data) => {
            if (data.type === 'showNpcDialog') {
                console.log('[NpcDialogPanel] Received showNpcDialog:', data);
                this.showDialog(data.text, data.npcId, data.position);
            } else if (data.type === 'updateNpcDialog') {
                console.log('[NpcDialogPanel] Received updateNpcDialog:', data);
                this.updateDialog(data.text);
            } else if (data.type === 'hideNpcDialog') {
                console.log('[NpcDialogPanel] Received hideNpcDialog. Hiding dialog.');
                this.hideDialog();
            } else if (data.type === 'npcInteractionEnded') {
                console.log('[NpcDialogPanel] Received npcInteractionEnded. Hiding dialog.');
                this.hideDialog();
            }
        });

        console.log('[NpcDialogPanel] Initialization complete.');
    }

    showDialog(text, npcId, position) {
        if (!this.containerElement) return;

        console.log(`[NpcDialogPanel] Showing dialog: "${text}" for NPC ${npcId}`);

        // Clear any existing dialog
        this.containerElement.innerHTML = '';

        // Create dialog bubble
        const dialogBubble = document.createElement('div');
        dialogBubble.className = 'npc-dialog-bubble';
        dialogBubble.id = `dialog-${npcId}`;
        
        const dialogText = document.createElement('div');
        dialogText.className = 'npc-dialogue-text';
        dialogText.textContent = text;
        
        dialogBubble.appendChild(dialogText);
        this.containerElement.appendChild(dialogBubble);

        // Show the container
        this.containerElement.style.display = 'block';
        
        // Store current dialog info
        this.currentDialog = { text, npcId, position };
        
        console.log(`[NpcDialogPanel] Dialog displayed for NPC ${npcId}`);
    }

    updateDialog(text) {
        if (!this.containerElement) return;

        const dialogText = this.containerElement.querySelector('.npc-dialogue-text');
        if (dialogText) {
            dialogText.textContent = text;
            console.log(`[NpcDialogPanel] Updated dialog text to: "${text}"`);
        }
    }

    hideDialog() {
        if (!this.containerElement) return;

        this.containerElement.innerHTML = '';
        this.containerElement.style.display = 'none';
        this.currentDialog = null;
        
        console.log('[NpcDialogPanel] Dialog hidden');
    }
}

// Create and register the panel instance
window.NpcDialogPanel = new NpcDialogPanel();

// Add CSS for NPC dialog positioning
const style = document.createElement('style');
style.textContent = `
    #npc-dialog-container {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: none;
        z-index: 2000;
        pointer-events: none;
    }

    .npc-dialog-bubble {
        background: rgba(255, 0, 0, 0.9) !important; /* Bright red for testing */
        border: 4px solid #FFFF00 !important; /* Bright yellow border */
        border-radius: 12px;
        padding: 12px 16px;
        max-width: 300px;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: dialogue-pop 0.3s ease-out;
        z-index: 9999 !important;
        position: relative !important;
    }

    .npc-dialogue-text {
        color: white;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.4;
        margin: 0;
    }

    @keyframes dialogue-pop {
        0% { transform: scale(0.8); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
    }

    /* Mobile-specific adjustments */
    @media (max-width: 768px) {
        .npc-dialog-bubble {
            max-width: 250px;
            padding: 10px 14px;
        }
        
        .npc-dialogue-text {
            font-size: 13px;
        }
    }
`;
document.head.appendChild(style); 