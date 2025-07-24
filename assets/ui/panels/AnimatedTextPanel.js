class AnimatedTextPanel {
    constructor() {
        this.container = null;
        this.overlay = null;
        this.line1 = null;
        this.line2 = null;
        this.isOpen = false;
        this.currentTimeout = null;
        
        this.init();
        this.addEventListeners();
        console.log('[AnimatedTextPanel] Initialized');
    }

    init() {
        // Get the container and elements
        this.container = document.getElementById('animated-text-panel');
        this.overlay = document.getElementById('animated-text-overlay');
        this.line1 = document.querySelector('.animated-text-line.line-1');
        this.line2 = document.querySelector('.animated-text-line.line-2');
        
        if (!this.container || !this.overlay || !this.line1 || !this.line2) {
            console.error('[AnimatedTextPanel] Required elements not found in DOM');
            return;
        }
        
        console.log('[AnimatedTextPanel] Elements found and initialized');
    }

    addEventListeners() {
        if (typeof hytopia !== 'undefined') {
            hytopia.onData(data => {
                console.log('[AnimatedTextPanel] Received data:', data);
                
                switch (data.type) {
                    case 'showAnimatedText':
                        this.showText(data.line1, data.line2, data.duration, data.style);
                        break;
                    case 'showCountdown':
                        this.showCountdown(data.number);
                        break;
                    case 'showGo':
                        this.showGo();
                        break;
                    case 'showSuccess':
                        this.showSuccess(data.line1, data.line2, data.duration);
                        break;
                    case 'showWarning':
                        this.showWarning(data.line1, data.line2, data.duration);
                        break;
                    case 'hideAnimatedText':
                        this.hide();
                        break;
                }
            });
        } else {
            console.warn('[AnimatedTextPanel] hytopia object not available');
        }
    }

    /**
     * Show animated text with optional styling
     * @param {string} line1 - Primary text line
     * @param {string} line2 - Secondary text line (optional)
     * @param {number} duration - Duration in milliseconds (default: 3000)
     * @param {string} style - Style variant: 'default', 'countdown', 'success', 'warning'
     */
    showText(line1 = '', line2 = '', duration = 3000, style = 'default') {
        if (!this.overlay) {
            console.error('[AnimatedTextPanel] Overlay not available');
            return;
        }

        console.log(`[AnimatedTextPanel] Showing text: "${line1}" / "${line2}" for ${duration}ms with style: ${style}`);
        
        // Clear any existing timeout
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        
        // Set primary text content
        this.line1.textContent = line1;
        
        // Handle secondary text - check if it's a leaderboard (contains line breaks)
        if (line2 && line2.includes('\n')) {
            // It's a leaderboard - render as multiple lines with colors
            this.renderLeaderboard(line2);
            this.overlay.classList.add('leaderboard-mode');
        } else {
            // Regular single line text
            this.line2.textContent = line2;
            this.overlay.classList.remove('leaderboard-mode');
        }
        
        // Reset classes
        this.overlay.className = 'animated-text-overlay';
        
        // Add style-specific classes
        if (style !== 'default') {
            this.overlay.classList.add(style);
        }
        
        // Add leaderboard mode if needed
        if (line2 && line2.includes('\n')) {
            this.overlay.classList.add('leaderboard-mode');
        }
        
        // Show and animate
        this.openPanel();
        this.overlay.classList.add('visible', 'animate-in');

        // Auto-hide after duration
        this.currentTimeout = setTimeout(() => {
            this.overlay.classList.add('animate-out');
            
            // Wait for fade out animation before hiding completely
            setTimeout(() => {
                this.closePanel();
                this.overlay.classList.remove('visible', 'animate-in', 'animate-out', 'leaderboard-mode');
            }, 500); // Matches animation duration
        }, duration);
    }

    /**
     * Render leaderboard as multiple colored lines
     * @param {string} leaderboardText - Multi-line leaderboard text
     */
    renderLeaderboard(leaderboardText) {
        // Clear existing content
        this.line2.innerHTML = '';
        
        // Split by line breaks
        const lines = leaderboardText.split('\n');
        
        lines.forEach((line, index) => {
            if (line.trim()) {
                const lineElement = document.createElement('div');
                lineElement.className = 'leaderboard-line';
                lineElement.textContent = line.trim();
                
                // Add color classes based on position
                if (index === 0) {
                    lineElement.classList.add('gold');
                } else if (index === 1) {
                    lineElement.classList.add('silver');
                } else if (index === 2) {
                    lineElement.classList.add('bronze');
                }
                
                this.line2.appendChild(lineElement);
            }
        });
    }

    /**
     * Show countdown number (3, 2, 1)
     * @param {number|string} number - The countdown number
     */
    showCountdown(number) {
        console.log(`[AnimatedTextPanel] Showing countdown: ${number}`);
        
        // Clear any existing timeout first to prevent overlap
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        
        // Force hide any existing text immediately
        if (this.overlay && this.overlay.classList.contains('visible')) {
            this.overlay.classList.remove('visible', 'animate-in', 'animate-out');
            this.closePanel();
        }
        
        // Show countdown with proper duration that matches the backend timing
        this.showText(number.toString(), '', 950, 'countdown');
    }

    /**
     * Show "GO!" message
     */
    showGo() {
        console.log('[AnimatedTextPanel] Showing GO!');
        
        // Clear any existing timeout first
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        
        // Set text content
        this.line1.textContent = 'GO!';
        this.line2.textContent = '';
        
        // Set special styling for GO! with both countdown and go classes
        this.overlay.className = 'animated-text-overlay countdown go';
        
        // Show and animate
        this.openPanel();
        this.overlay.classList.add('visible', 'animate-in');

        // Auto-hide after duration
        this.currentTimeout = setTimeout(() => {
            this.overlay.classList.add('animate-out');
            
            // Wait for fade out animation before hiding completely
            setTimeout(() => {
                this.closePanel();
                this.overlay.classList.remove('visible', 'animate-in', 'animate-out');
            }, 500); // Matches animation duration
        }, 1800);
    }

    /**
     * Show success message (like "CHECKPOINT!", "COMPLETED!")
     * @param {string} line1 - Primary success text
     * @param {string} line2 - Secondary text (optional)
     * @param {number} duration - Duration in milliseconds (default: 2000)
     */
    showSuccess(line1, line2 = '', duration = 2000) {
        console.log(`[AnimatedTextPanel] Showing success: ${line1}`);
        this.showText(line1, line2, duration, 'success');
    }

    /**
     * Show warning/error message (like "ELIMINATED!", "FAILED!")
     * @param {string} line1 - Primary warning text
     * @param {string} line2 - Secondary text (optional)
     * @param {number} duration - Duration in milliseconds (default: 2000)
     */
    showWarning(line1, line2 = '', duration = 2000) {
        console.log(`[AnimatedTextPanel] Showing warning: ${line1}`);
        this.showText(line1, line2, duration, 'warning');
    }

    /**
     * Immediately hide the animated text
     */
    hide() {
        console.log('[AnimatedTextPanel] Hiding text immediately');
        
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        
        if (this.overlay) {
            this.overlay.classList.remove('visible', 'animate-in');
            this.overlay.classList.add('animate-out');
            
            setTimeout(() => {
                this.closePanel();
                this.overlay.classList.remove('animate-out');
            }, 300);
        }
    }

    /**
     * Run a full countdown sequence (3, 2, 1, GO!)
     * @param {Function} onComplete - Callback when countdown finishes
     */
    async runCountdownSequence(onComplete) {
        console.log('[AnimatedTextPanel] Starting countdown sequence');
        
        // Show "3"
        this.showCountdown(3);
        await this.delay(1000);
        
        // Show "2"
        this.showCountdown(2);
        await this.delay(1000);
        
        // Show "1"
        this.showCountdown(1);
        await this.delay(1000);
        
        // Show "GO!"
        this.showGo();
        await this.delay(1500);
        
        console.log('[AnimatedTextPanel] Countdown sequence complete');
        if (onComplete) {
            onComplete();
        }
    }

    /**
     * Utility method for delays
     * @param {number} ms - Milliseconds to wait
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Show the panel container
     */
    openPanel() {
        if (this.container) {
            this.container.style.display = 'block';
            this.isOpen = true;
        }
    }

    /**
     * Hide the panel container
     */
    closePanel() {
        if (this.container) {
            this.container.style.display = 'none';
            this.isOpen = false;
        }
    }

    /**
     * Check if panel is currently open
     */
    isVisible() {
        return this.isOpen;
    }
}

// Initialize the animated text panel when the page loads
let animatedTextPanel;

function initializeAnimatedTextPanel() {
    console.log('[AnimatedTextPanel] Creating global instance');
    animatedTextPanel = new AnimatedTextPanel();
    
    // Make it globally accessible for debugging/testing
    window.AnimatedTextPanel = animatedTextPanel;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAnimatedTextPanel);
} else {
    initializeAnimatedTextPanel();
}

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnimatedTextPanel;
} 