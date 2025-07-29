class CompletionLeaderboardPanel {
    constructor() {
        this.container = null;
        this.overlay = null;
        this.titleText = null;
        this.metricsContainer = null;
        this.leaderboardContainer = null;
        this.playerScoreContainer = null;
        this.isOpen = false;
        this.currentTimeout = null;
        
        this.init();
        this.addEventListeners();
        console.log('[CompletionLeaderboardPanel] Initialized');
    }

    init() {
        // Get or create the container and elements
        this.container = document.getElementById('completion-leaderboard-panel');
        
        if (!this.container) {
            console.error('[CompletionLeaderboardPanel] Panel container not found in DOM');
            return;
        }
        
        this.overlay = document.getElementById('completion-leaderboard-overlay');
        this.titleText = document.querySelector('.completion-title-text');
        this.metricsHeader = document.querySelector('.completion-metrics-header');
        this.metricsContainer = document.querySelector('.completion-metrics');
        this.leaderboardContainer = document.querySelector('.completion-leaderboard');
        this.playerScoreContainer = document.querySelector('.completion-player-score');
        
        if (!this.overlay || !this.titleText || !this.metricsHeader || !this.metricsContainer || !this.leaderboardContainer) {
            console.error('[CompletionLeaderboardPanel] Required elements not found in DOM');
            return;
        }
        
        console.log('[CompletionLeaderboardPanel] Elements found and initialized');
    }

    addEventListeners() {
        if (typeof hytopia !== 'undefined') {
            hytopia.onData(data => {
                console.log('[CompletionLeaderboardPanel] Received data:', data);
                
                switch (data.type) {
                    case 'showCompletionLeaderboard':
                        this.showCompletionBoard(data.title, data.metrics, data.leaderboard, data.playerScore, data.duration);
                        break;
                    case 'hideCompletionLeaderboard':
                        this.hide();
                        break;
                }
            });
        } else {
            console.warn('[CompletionLeaderboardPanel] hytopia object not available');
        }
    }

    /**
     * Show the completion leaderboard with animated elements
     * @param {string} title - Main title ("HIGH SCORE!", "COMPLETED!", etc.)
     * @param {Object} metrics - Object with time, xp, level info
     * @param {Array} leaderboard - Array of top 3 players with position, name, time
     * @param {Object} playerScore - Player's score if not in top 3
     * @param {number} duration - Duration to show in milliseconds (default: 7000)
     */
    showCompletionBoard(title, metrics, leaderboard, playerScore = null, duration = 7000) {
        if (!this.overlay) {
            console.error('[CompletionLeaderboardPanel] Overlay not available');
            return;
        }

        console.log(`[CompletionLeaderboardPanel] Showing completion board: "${title}"`);
        console.log(`[CompletionLeaderboardPanel] DEBUG: Received data - metrics:`, metrics, `leaderboard:`, leaderboard, `playerScore:`, playerScore);
        
        // Clear any existing timeout
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        
        // Reset overlay classes
        this.overlay.className = 'completion-leaderboard-overlay';
        
        // Show the panel
        this.openPanel();
        this.overlay.classList.add('visible');
        
        // New animation flow:
        // 1. Title animates in left to right (0ms)
        this.animateTitle(title);
        
        // 2. Stats metrics scale in staggered (500ms) - removed header
        setTimeout(() => this.animateMetrics(metrics), 500);
        
        // 3. Leaderboard appears (800ms) - adjusted timing
        setTimeout(() => this.animateLeaderboard(leaderboard), 800);
        
        // 4. Player score if not in top 3 (1400ms) - adjusted timing
        if (playerScore) {
            setTimeout(() => this.animatePlayerScore(playerScore), 1400);
        }

        // Auto-hide after duration
        this.currentTimeout = setTimeout(() => {
            this.hide();
        }, duration);
    }

    /**
     * Animate the title sliding in from left to right
     * @param {string} title - Title text to display
     */
    animateTitle(title) {
        this.titleText.textContent = title;
        this.titleText.classList.remove('animate-in');
        
        // Force reflow to ensure classes are removed
        this.titleText.offsetHeight;
        
        // Add animation class
        this.titleText.classList.add('animate-in');
    }

    /**
     * Animate the metrics header
     */
    animateMetricsHeader() {
        this.metricsHeader.textContent = 'STATS';
        this.metricsHeader.classList.add('animate-in');
    }

    /**
     * Animate the metrics section with counters
     * @param {Object} metrics - Object with time, xp, level properties
     */
    animateMetrics(metrics) {
        // Clear existing metrics
        this.metricsContainer.innerHTML = '';
        
        // Create only XP and time metrics
        const xpMetric = this.createMetric('XP GAINED', metrics.xp || '0', 'xp-metric');
        const timeMetric = this.createMetric('TIME', metrics.time || '0:00', 'time-metric');
        
        // Add to container
        this.metricsContainer.appendChild(xpMetric);
        this.metricsContainer.appendChild(timeMetric);
        
        // Animate each metric with staggered timing
        setTimeout(() => xpMetric.classList.add('animate-in'), 0);
        setTimeout(() => timeMetric.classList.add('animate-in'), 200);
    }

    /**
     * Create a metric element
     * @param {string} label - Metric label
     * @param {string} value - Metric value
     * @param {string} className - CSS class name
     */
    createMetric(label, value, className) {
        const metric = document.createElement('div');
        metric.className = `completion-metric ${className}`;
        
        const labelElement = document.createElement('div');
        labelElement.className = 'metric-label';
        labelElement.textContent = label;
        
        const valueElement = document.createElement('div');
        valueElement.className = 'metric-value';
        valueElement.textContent = value;
        
        metric.appendChild(labelElement);
        metric.appendChild(valueElement);
        
        return metric;
    }

    /**
     * Animate the leaderboard tiles sliding in from left
     * @param {Array} leaderboard - Array of leaderboard entries
     */
    animateLeaderboard(leaderboard) {
        // Clear existing leaderboard
        this.leaderboardContainer.innerHTML = '';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'leaderboard-header';
        header.textContent = 'Leaderboard';
        this.leaderboardContainer.appendChild(header);
        
        // Animate header first
        setTimeout(() => header.classList.add('animate-in'), 0);
        
        // Create and animate tiles for top 3 with staggered left-to-right animation
        leaderboard.slice(0, 3).forEach((entry, index) => {
            const tile = this.createLeaderboardTile(entry, index + 1);
            this.leaderboardContainer.appendChild(tile);
            
            // Stagger the tile animations more for better left-to-right effect
            setTimeout(() => {
                tile.classList.add('animate-in');
            }, 200 + (index * 150));
        });
    }

    /**
     * Create a leaderboard tile
     * @param {Object} entry - Leaderboard entry with position, name, time
     * @param {number} position - Position number (1, 2, 3)
     */
    createLeaderboardTile(entry, position) {
        const tile = document.createElement('div');
        tile.className = `leaderboard-tile position-${position}`;
        
        // Medal/position indicator
        const positionElement = document.createElement('div');
        positionElement.className = 'tile-position';
        const medals = ['🥇', '🥈', '🥉'];
        positionElement.textContent = medals[position - 1] || position;
        
        // Player name
        const nameElement = document.createElement('div');
        nameElement.className = 'tile-name';
        nameElement.textContent = entry.name || `Player ${position}`;
        
        // Time
        const timeElement = document.createElement('div');
        timeElement.className = 'tile-time';
        timeElement.textContent = entry.time || '0:00';
        
        tile.appendChild(positionElement);
        tile.appendChild(nameElement);
        tile.appendChild(timeElement);
        
        return tile;
    }

    /**
     * Animate player's score if they're not in top 3
     * @param {Object} playerScore - Player's score info
     */
    animatePlayerScore(playerScore) {
        if (!playerScore || !this.playerScoreContainer) return;
        
        // Clear existing content
        this.playerScoreContainer.innerHTML = '';
        
        // Create player score tile
        const tile = document.createElement('div');
        tile.className = 'player-score-tile';
        
        const positionElement = document.createElement('div');
        positionElement.className = 'tile-position';
        positionElement.textContent = playerScore.position || '4+';
        
        const nameElement = document.createElement('div');
        nameElement.className = 'tile-name';
        nameElement.textContent = 'You';
        
        const timeElement = document.createElement('div');
        timeElement.className = 'tile-time';
        timeElement.textContent = playerScore.time || '0:00';
        
        tile.appendChild(positionElement);
        tile.appendChild(nameElement);
        tile.appendChild(timeElement);
        
        this.playerScoreContainer.appendChild(tile);
        
        // Animate in
        setTimeout(() => tile.classList.add('animate-in'), 0);
    }

    /**
     * Hide the completion leaderboard
     */
    hide() {
        console.log('[CompletionLeaderboardPanel] Hiding completion leaderboard');
        
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        
        if (this.overlay) {
            this.overlay.classList.add('animate-out');
            
            setTimeout(() => {
                this.closePanel();
                this.overlay.classList.remove('visible', 'animate-out');
                
                // Clear content
                if (this.titleText) this.titleText.textContent = '';
                if (this.metricsContainer) this.metricsContainer.innerHTML = '';
                if (this.leaderboardContainer) this.leaderboardContainer.innerHTML = '';
                if (this.playerScoreContainer) this.playerScoreContainer.innerHTML = '';
            }, 500);
        }
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

// Initialize the completion leaderboard panel when the page loads
let completionLeaderboardPanel;

function initializeCompletionLeaderboardPanel() {
    console.log('[CompletionLeaderboardPanel] Creating global instance');
    completionLeaderboardPanel = new CompletionLeaderboardPanel();
    
    // Make it globally accessible for debugging/testing
    window.CompletionLeaderboardPanel = completionLeaderboardPanel;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCompletionLeaderboardPanel);
} else {
    initializeCompletionLeaderboardPanel();
}

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CompletionLeaderboardPanel;
}