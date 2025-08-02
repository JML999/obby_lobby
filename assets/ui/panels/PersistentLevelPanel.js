class PersistentLevelPanel {
    static initialize() {
        // Create persistent level display element that shows across all game states
        this.levelContainer = document.createElement('div');
        this.levelContainer.style.position = 'fixed';
        this.levelContainer.style.bottom = '32px'; // Same level as plot panel
        this.levelContainer.style.right = '32px'; // Right side to not conflict with plot panel
        this.levelContainer.style.fontFamily = "'Comic Neue', 'Comic Sans MS', 'Arial Rounded MT Bold', sans-serif";
        this.levelContainer.style.fontSize = '14px';
        this.levelContainer.style.fontWeight = 'bold';
        this.levelContainer.style.color = '#333';
        this.levelContainer.style.zIndex = '2001';
        this.levelContainer.style.display = 'block'; // Always visible
        this.levelContainer.style.textShadow = '1px 1px 2px rgba(255,255,255,0.8)';
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
        
        // Create level display with XP progress bar
        this.levelContainer.innerHTML = `
            <div style="background: rgba(255, 255, 255, 0.9); border: 2px solid #4CAF50; border-radius: 8px; padding: 6px 10px; display: inline-block;">
                <div style="font-size: 12px; margin-bottom: 2px;">Level ${this.currentLevel}</div>
                <div style="width: 120px; height: 6px; background: rgba(0,0,0,0.2); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${progressPercentage}%; height: 100%; background: linear-gradient(90deg, #4CAF50, #45a049); transition: width 0.3s ease;"></div>
                </div>
                <div style="font-size: 10px; color: #666; margin-top: 2px;">${this.currentXP}/${this.nextLevelXP} XP</div>
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
        // Never hide - this panel persists across all game states
        // This method exists for consistency but does nothing
        console.log('[PersistentLevelPanel] Hide called but level display persists across all states');
    }
    
    static show() {
        // Always visible - this method exists for consistency
        if (this.levelContainer) {
            this.levelContainer.style.display = 'block';
        }
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