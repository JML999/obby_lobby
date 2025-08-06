class PersistentLevelPanel {
    static initialize() {
        // Create persistent level display element that shows across all game states
        this.levelContainer = document.createElement('div');
        this.levelContainer.style.position = 'fixed';
        this.levelContainer.style.bottom = '32px'; // Match plot panel position
        this.levelContainer.style.right = '32px'; // Match plot panel position
        this.levelContainer.style.background = '#fffbe6'; // Match plot panel background
        this.levelContainer.style.border = '2px solid #ffb300'; // Match plot panel border
        this.levelContainer.style.borderRadius = '12px'; // Match plot panel border radius
        this.levelContainer.style.padding = '8px 12px'; // Smaller padding
        this.levelContainer.style.fontFamily = "'Comic Neue', 'Comic Sans MS', 'Arial Rounded MT Bold', sans-serif"; // Match plot panel font
        this.levelContainer.style.fontSize = '14px'; // Smaller font size
        this.levelContainer.style.fontWeight = 'bold'; // Match plot panel font weight
        this.levelContainer.style.color = '#333'; // Match plot panel text color
        this.levelContainer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'; // Match plot panel shadow
        this.levelContainer.style.zIndex = '2001';
        this.levelContainer.style.display = 'block';
        document.body.appendChild(this.levelContainer);
        
        // Initialize level data
        this.currentLevel = 1;
        this.currentXP = 0;
        this.nextLevelXP = 50;
        
        // Show initial level display
        this.updateLevelDisplay({
            level: this.currentLevel,
            currentXP: this.currentXP,
            nextLevelXP: this.nextLevelXP
        });
        
        // Listen for level updates from the server
        if (window.hytopia && window.hytopia.onData) {
            window.hytopia.onData((data) => {
                if (data.type === 'levelUpdate') {
                    this.updateLevelDisplay(data);
                } else if (data.type === 'levelUp') {
                    this.showLevelUpCelebration(data);
                } else if (data.type === 'displayBuildTutorial') {
                    // Hide level UI when tutorial is shown
                    this.hide();
                } else if (data.type === 'playerStateChanged') {
                    // Show level UI when returning to lobby, hide in building mode
                    if (data.state === 'LOBBY') {
                        this.show();
                    } else if (data.state === 'BUILDING') {
                        // Level UI is hidden in building mode (mechanical config hides it)
                        // but we should ensure it's shown when not in mechanical config
                        this.show();
                    } else if (data.state === 'PLAYING') {
                        this.show();
                    }
                }
            });
        }
        
        console.log('[PersistentLevelPanel] Initialized - level display will persist across all game states');
    }
    
    static updateLevelDisplay(data) {
        if (!this.levelContainer) return;
        
        this.currentLevel = data.level || 1;
        this.currentXP = data.currentXP || 0;
        this.nextLevelXP = data.nextLevelXP || 50;
        
        const progressPercentage = this.nextLevelXP > 0 ? Math.min((this.currentXP / this.nextLevelXP) * 100, 100) : 100;
        
        // Create level display matching plot panel style but smaller
        this.levelContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
                <span>Lv.${this.currentLevel}</span>
                <div style="width: 60px; height: 6px; background: rgba(0,0,0,0.2); border-radius: 3px; overflow: hidden; border: 1px solid #ccc;">
                    <div style="width: ${progressPercentage}%; height: 100%; background: linear-gradient(90deg, #4CAF50, #45a049); transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
        
        console.log('[PersistentLevelPanel] Level display updated:', data);
    }
    
    static showLevelUpCelebration(data) {
        console.log('[PersistentLevelPanel] Level up celebration:', data);
        
        // Update the level display first
        this.updateLevelDisplay({
            level: data.newLevel,
            currentXP: 0, // Reset XP on level up
            nextLevelXP: data.nextLevelXP || 50
        });
        
        // Add celebration animation
        if (this.levelContainer) {
            this.levelContainer.style.transform = 'scale(1.2)';
            this.levelContainer.style.boxShadow = '0 0 20px rgba(76, 175, 80, 0.8)';
            
            setTimeout(() => {
                this.levelContainer.style.transform = 'scale(1)';
                this.levelContainer.style.boxShadow = 'none';
            }, 1000);
        }
    }
    
    static hide() {
        // Hide level UI (e.g. when tutorial is shown)
        if (this.levelContainer) {
            this.levelContainer.style.display = 'none';
        }
        console.log('[PersistentLevelPanel] Level display hidden');
    }
    
    static show() {
        // Show level UI
        if (this.levelContainer) {
            this.levelContainer.style.display = 'block';
        }
        console.log('[PersistentLevelPanel] Level display shown');
    }
}

// Make available globally
window.PersistentLevelPanel = PersistentLevelPanel;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        PersistentLevelPanel.initialize();
    });
} else {
    PersistentLevelPanel.initialize();
}