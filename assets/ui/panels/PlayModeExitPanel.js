// Simple exit button for play mode (similar to YourPlotPanel)
class PlayModeExitPanel {
    static initialize(containerId = 'play-mode-exit-panel') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            // Create container if it doesn't exist
            this.container = document.createElement('div');
            this.container.id = containerId;
            document.body.appendChild(this.container);
        }
        
        // Create both mobile button and desktop notification
        this.container.innerHTML = `
            <!-- Mobile Exit Button -->
            <div class="play-mode-exit-button" id="play-mode-exit-btn" style="
                display: none;
                position: fixed;
                bottom: 20px;
                left: 20px;
                background-color: rgba(255, 100, 100, 0.9);
                color: white;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 12px;
                padding: 10px 18px;
                font-family: 'Comic Neue', 'Comic Sans MS', 'Arial Rounded MT Bold', sans-serif;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
                z-index: 3000;
                transition: all 0.2s ease;
                backdrop-filter: blur(5px);
                user-select: none;
                -webkit-user-select: none;
                -webkit-tap-highlight-color: transparent;
            ">
                <span style="display: inline-block; margin-right: 4px;">🚪</span>
                Exit Course
            </div>
            
            <!-- Desktop Exit Hint (similar to YourPlotPanel) -->
            <div class="play-mode-exit-hint" id="play-mode-exit-hint" style="
                display: none;
                position: fixed;
                bottom: 32px;
                left: 32px;
                background: #f3e5f5;
                border: 2px solid #9c27b0;
                border-radius: 12px;
                padding: 12px 20px;
                font-family: 'Comic Neue', 'Comic Sans MS', 'Arial Rounded MT Bold', sans-serif;
                font-size: 18px;
                font-weight: bold;
                color: #4a148c;
                box-shadow: 0 2px 8px rgba(0,0,0,0.10);
                z-index: 2000;
            ">
                Press Q to exit course
            </div>
        `;
        
        this.button = document.getElementById('play-mode-exit-btn');
        this.hint = document.getElementById('play-mode-exit-hint');
        this.setupEventListeners();
        this.addHoverStyles();
        
        console.log('[PlayModeExitPanel] Initialized successfully');
    }
    
    static setupEventListeners() {
        if (!this.button) return;
        
        // Touch events for mobile
        this.button.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.button.style.transform = 'scale(0.95)';
        });
        
        this.button.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.button.style.transform = 'scale(1)';
            this.handleExit();
        });
        
        // Click for desktop
        this.button.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleExit();
        });
        
        // Mouse events for desktop hover
        this.button.addEventListener('mouseenter', () => {
            this.button.style.backgroundColor = 'rgba(255, 120, 120, 1)';
            this.button.style.transform = 'scale(1.05)';
        });
        
        this.button.addEventListener('mouseleave', () => {
            this.button.style.backgroundColor = 'rgba(255, 100, 100, 0.9)';
            this.button.style.transform = 'scale(1)';
        });
    }
    
    static addHoverStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 480px) {
                #play-mode-exit-btn {
                    bottom: 10px !important;
                    left: 10px !important;
                    padding: 8px 14px !important;
                    font-size: 14px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    static handleExit() {
        console.log('[PlayModeExitPanel] Exit button clicked');
        if (window.hytopia && window.hytopia.sendData) {
            window.hytopia.sendData({
                type: 'exitPlayMode'
            });
        }
    }
    
    static showMobile() {
        if (!this.button) return;
        this.button.style.display = 'block';
        if (this.hint) this.hint.style.display = 'none';
        console.log('[PlayModeExitPanel] Showing mobile exit button');
    }
    
    static showDesktop() {
        if (!this.hint) return;
        this.hint.style.display = 'block';
        if (this.button) this.button.style.display = 'none';
        console.log('[PlayModeExitPanel] Showing desktop exit hint');
    }
    
    static show() {
        // Backward compatibility - default to mobile
        this.showMobile();
    }
    
    static hide() {
        if (this.button) this.button.style.display = 'none';
        if (this.hint) this.hint.style.display = 'none';
        console.log('[PlayModeExitPanel] Hiding exit UI');
    }
}

// Register globally
window.PlayModeExitPanel = PlayModeExitPanel;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        PlayModeExitPanel.initialize();
    });
} else {
    PlayModeExitPanel.initialize();
}