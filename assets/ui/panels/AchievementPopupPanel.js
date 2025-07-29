class AchievementPopupPanel {
    constructor() {
        this.container = null;
        this.activeMessages = []; // Simple array of currently visible messages
        this.eventListenerAdded = false;
        this.isRemoving = new Set(); // Track messages currently being removed
        this.animationTimeouts = new Map(); // Track animation timeouts
        console.log('[AchievementPopupPanel] Constructor called');
    }

    initialize(containerId) {
        this.container = document.getElementById(containerId);
        
        // Create stacked panel HTML - back to 3 levels
        const panel = document.createElement('div');
        panel.id = 'achievement-popup-container';
        panel.style.display = 'none';
        panel.innerHTML = `
            <div id="achievement-popup-main">
                <div id="achievement-content-main">
                    <div id="achievement-title-main"></div>
                    <div id="achievement-bonus-main"></div>
                </div>
            </div>
            <div id="achievement-popup-sub">
                <div id="achievement-content-sub">
                    <div id="achievement-title-sub"></div>
                    <div id="achievement-bonus-sub"></div>
                </div>
            </div>
            <div id="achievement-popup-subsub">
                <div id="achievement-content-subsub">
                    <div id="achievement-title-subsub"></div>
                    <div id="achievement-bonus-subsub"></div>
                </div>
            </div>
        `;
        
        // Create styles only once per page load
        if (!document.getElementById('achievement-popup-styles')) {
            const style = document.createElement('style');
            style.id = 'achievement-popup-styles';
            style.textContent = `
                #achievement-popup-container {
                    position: fixed;
                    bottom: 30%;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 1000;
                    pointer-events: none;
                    width: auto;
                    max-width: 90vw;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                #achievement-popup-main {
                    width: auto;
                    max-width: 90vw;
                    background: rgba(20,20,20,0.97);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 8px 2px rgba(255,255,255,0.08);
                    border-radius: 16px;
                    padding: 8px 24px;
                    color: #fff;
                    font-family: 'Segoe UI', 'Arial', sans-serif;
                    font-size: 16px;
                    font-weight: 700;
                    text-shadow: 0 2px 8px rgba(0,0,0,0.5);
                    opacity: 0;
                    transform: translateY(20px) scale(0.9);
                    transition: opacity 0.3s ease-out, transform 0.3s ease-out;
                    margin: 0 auto 6px auto;
                    backdrop-filter: blur(6px);
                    display: none;
                }
                
                #achievement-popup-main.show {
                    opacity: 0.76;
                    transform: translateY(0) scale(1);
                    display: block;
                }

                #achievement-popup-sub {
                    width: auto;
                    max-width: 80vw;
                    background: rgba(20,20,20,0.85);
                    box-shadow: 0 6px 24px rgba(0,0,0,0.35);
                    border-radius: 14px;
                    padding: 6px 20px;
                    color: #e0e0e0;
                    font-family: 'Segoe UI', 'Arial', sans-serif;
                    font-size: 14px;
                    font-weight: 600;
                    text-shadow: 0 1px 4px rgba(0,0,0,0.6);
                    opacity: 0;
                    transform: translateY(15px) scale(0.95);
                    transition: opacity 0.25s ease-out, transform 0.25s ease-out;
                    margin: 0 auto 4px auto;
                    backdrop-filter: blur(4px);
                    display: none;
                }
                
                #achievement-popup-sub.show {
                    opacity: 0.64;
                    transform: translateY(0) scale(1);
                    display: block;
                }

                #achievement-popup-subsub {
                    width: auto;
                    max-width: 70vw;
                    background: rgba(20,20,20,0.7);
                    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
                    border-radius: 12px;
                    padding: 4px 16px;
                    color: #c0c0c0;
                    font-family: 'Segoe UI', 'Arial', sans-serif;
                    font-size: 12px;
                    font-weight: 500;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.4);
                    opacity: 0;
                    transform: translateY(10px) scale(0.9);
                    transition: opacity 0.25s ease-out, transform 0.25s ease-out;
                    margin: 0 auto;
                    backdrop-filter: blur(2px);
                    display: none;
                }
                
                #achievement-popup-subsub.show {
                    opacity: 0.43;
                    transform: translateY(0) scale(1);
                    display: block;
                }

                #achievement-content-main, #achievement-content-sub, #achievement-content-subsub {
                    text-align: center;
                }

                #achievement-title-main {
                    font-size: 15px;
                    font-weight: 600;
                    text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.7);
                    margin-bottom: 2px;
                }

                #achievement-bonus-main {
                    font-size: 12px;
                    color: #cccccc;
                    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
                }

                #achievement-title-sub {
                    font-size: 13px;
                    font-weight: 500;
                    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6);
                    margin-bottom: 1px;
                }

                #achievement-bonus-sub {
                    font-size: 11px;
                    color: #b0b0b0;
                    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.4);
                }

                #achievement-title-subsub {
                    font-size: 11px;
                    font-weight: 400;
                    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
                    margin-bottom: 1px;
                }

                #achievement-bonus-subsub {
                    font-size: 10px;
                    color: #999999;
                    text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.3);
                }

                /* Fade-out animations matching original */
                #achievement-popup-main.fade-out,
                #achievement-popup-sub.fade-out,
                #achievement-popup-subsub.fade-out {
                    opacity: 0 !important;
                    transform: translateY(-10px) scale(0.96) !important;
                    pointer-events: none;
                    transition: opacity 0.25s ease-out, transform 0.25s ease-out;
                }
            `;
            document.head.appendChild(style);
        }
        
        this.container.appendChild(panel);
        this.popupContainer = document.getElementById('achievement-popup-container');
        
        // Main popup elements
        this.mainElement = document.getElementById('achievement-popup-main');
        this.mainTitleElement = document.getElementById('achievement-title-main');
        this.mainBonusElement = document.getElementById('achievement-bonus-main');
        
        // Sub popup elements
        this.subElement = document.getElementById('achievement-popup-sub');
        this.subTitleElement = document.getElementById('achievement-title-sub');
        this.subBonusElement = document.getElementById('achievement-bonus-sub');
        
        // Sub-sub popup elements
        this.subSubElement = document.getElementById('achievement-popup-subsub');
        this.subSubTitleElement = document.getElementById('achievement-title-subsub');
        this.subSubBonusElement = document.getElementById('achievement-bonus-subsub');
        
        // Set up event listeners only once
        if (!this.eventListenerAdded) {
            this.setupEventListeners();
            this.eventListenerAdded = true;
        }
    }

    setupEventListeners() {
        if (window.hytopia && window.hytopia.onData) {
            window.hytopia.onData((data) => {
                if (data.type === 'achievementPopup') {
                    this.addMessage(data);
                }
            });
        }
    }
    
    addMessage(data) {
        const message = {
            id: Date.now() + Math.random(),
            title: data.title || 'Achievement Unlocked!',
            bonus: data.bonus || '',
            duration: data.duration || 5000,
            timeoutId: null
        };
        
        // Add to front of array (newest first)
        this.activeMessages.unshift(message);
        
        // Limit to 3 messages max - remove oldest ones cleanly
        while (this.activeMessages.length > 3) {
            const removed = this.activeMessages.pop();
            if (removed) {
                this.cleanupMessage(removed);
            }
        }
        
        // Set up auto-removal for this message
        message.timeoutId = setTimeout(() => {
            this.removeMessage(message.id);
        }, message.duration);
        
        // Update display
        this.updateDisplay();
    }
    
    removeMessage(messageId) {
        // Prevent double removal
        if (this.isRemoving.has(messageId)) {
            return;
        }
        
        const index = this.activeMessages.findIndex(m => m.id === messageId);
        if (index === -1) {
            return;
        }
        
        const message = this.activeMessages[index];
        
        // Mark as being removed
        this.isRemoving.add(messageId);
        
        // Clear timeout to prevent double removal
        this.cleanupMessage(message);
        
        // Get the element to fade out
        let elementToFade = null;
        if (index === 0) elementToFade = this.mainElement;
        else if (index === 1) elementToFade = this.subElement;
        else if (index === 2) elementToFade = this.subSubElement;
        
        if (elementToFade && elementToFade.classList.contains('show')) {
            // Start fade-out animation
            elementToFade.classList.add('fade-out');
            
            // Set up cleanup after animation
            const animationTimeout = setTimeout(() => {
                this.completeMessageRemoval(messageId, elementToFade);
            }, 250); // Match animation duration
            
            this.animationTimeouts.set(messageId, animationTimeout);
        } else {
            // No animation needed, remove immediately
            this.completeMessageRemoval(messageId, null);
        }
    }
    
    completeMessageRemoval(messageId, elementToFade) {
        // Clear animation timeout
        const animationTimeout = this.animationTimeouts.get(messageId);
        if (animationTimeout) {
            clearTimeout(animationTimeout);
            this.animationTimeouts.delete(messageId);
        }
        
        // Remove fade-out class
        if (elementToFade) {
            elementToFade.classList.remove('fade-out');
        }
        
        // Remove from active messages array
        const index = this.activeMessages.findIndex(m => m.id === messageId);
        if (index !== -1) {
            this.activeMessages.splice(index, 1);
        }
        
        // Remove from tracking sets
        this.isRemoving.delete(messageId);
        
        // Update display
        this.updateDisplay();
    }
    
    cleanupMessage(message) {
        if (message.timeoutId) {
            clearTimeout(message.timeoutId);
            message.timeoutId = null;
        }
    }
    
    updateDisplay() {
        // Show/hide container based on whether we have messages
        if (this.activeMessages.length > 0) {
            this.popupContainer.style.display = 'flex';
        } else {
            this.popupContainer.style.display = 'none';
            return;
        }
        
        // Update main popup (position 0)
        if (this.activeMessages[0] && !this.isRemoving.has(this.activeMessages[0].id)) {
            this.mainTitleElement.textContent = this.activeMessages[0].title;
            this.mainBonusElement.textContent = this.activeMessages[0].bonus;
            this.mainElement.classList.add('show');
        } else {
            this.mainElement.classList.remove('show');
        }
        
        // Update sub popup (position 1)
        if (this.activeMessages[1] && !this.isRemoving.has(this.activeMessages[1].id)) {
            this.subTitleElement.textContent = this.activeMessages[1].title;
            this.subBonusElement.textContent = this.activeMessages[1].bonus;
            this.subElement.classList.add('show');
        } else {
            this.subElement.classList.remove('show');
        }
        
        // Update sub-sub popup (position 2)
        if (this.activeMessages[2] && !this.isRemoving.has(this.activeMessages[2].id)) {
            this.subSubTitleElement.textContent = this.activeMessages[2].title;
            this.subSubBonusElement.textContent = this.activeMessages[2].bonus;
            this.subSubElement.classList.add('show');
        } else {
            this.subSubElement.classList.remove('show');
        }
    }
    
    // Public method to clear all messages (useful for debugging/cleanup)
    clearAll() {
        // Clear all timeouts and animations
        this.activeMessages.forEach(message => {
            this.cleanupMessage(message);
            
            // Clear any pending animation timeouts
            const animationTimeout = this.animationTimeouts.get(message.id);
            if (animationTimeout) {
                clearTimeout(animationTimeout);
                this.animationTimeouts.delete(message.id);
            }
        });
        
        // Clear tracking sets
        this.isRemoving.clear();
        this.animationTimeouts.clear();
        
        // Clear array
        this.activeMessages = [];
        
        // Update display
        this.updateDisplay();
    }
}

// Make it globally available and auto-initialize
window.AchievementPopupPanel = AchievementPopupPanel;

// Auto-initialize if the container exists
if (document.getElementById('achievement-popup-panel')) {
    const achievementPanel = new AchievementPopupPanel();
    achievementPanel.initialize('achievement-popup-panel');
} else {
    // Create container if it doesn't exist
    const container = document.createElement('div');
    container.id = 'achievement-popup-panel';
    document.body.appendChild(container);
    
    const achievementPanel = new AchievementPopupPanel();
    achievementPanel.initialize('achievement-popup-panel');
}