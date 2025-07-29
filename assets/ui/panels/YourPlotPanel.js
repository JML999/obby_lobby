class YourPlotPanel {
    static initialize(containerId = 'your-plot-panel') {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
        // Style the main plot panel
        this.container.style.display = 'none';
        this.container.style.position = 'fixed';
        this.container.style.bottom = '32px';
        this.container.style.left = '32px';
        this.container.style.background = '#fffbe6';
        this.container.style.border = '2px solid #ffb300';
        this.container.style.borderRadius = '12px';
        this.container.style.padding = '12px 20px';
        this.container.style.fontFamily = "'Comic Neue', 'Comic Sans MS', 'Arial Rounded MT Bold', sans-serif";
        this.container.style.fontSize = '18px';
        this.container.style.fontWeight = 'bold';
        this.container.style.color = '#333';
        this.container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
        this.container.style.zIndex = '2000';
        
        // Create separate level display element
        this.levelContainer = document.createElement('div');
        this.levelContainer.style.position = 'fixed';
        this.levelContainer.style.bottom = '92px'; // Stack above the plot panel
        this.levelContainer.style.left = '32px';
        this.levelContainer.style.fontFamily = "'Comic Neue', 'Comic Sans MS', 'Arial Rounded MT Bold', sans-serif";
        this.levelContainer.style.fontSize = '14px';
        this.levelContainer.style.fontWeight = 'bold';
        this.levelContainer.style.color = '#333';
        this.levelContainer.style.zIndex = '2001';
        this.levelContainer.style.display = 'none';
        this.levelContainer.style.textShadow = '1px 1px 2px rgba(255,255,255,0.8)'; // Subtle shadow for readability
        document.body.appendChild(this.levelContainer);
        
        // Initialize level data
        this.currentLevel = 1;
        this.currentXP = 0;
        this.nextLevelXP = 50;
        this.plotNumber = null;
        
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
    }
    
    static updateLevelDisplay(levelData) {
        this.currentLevel = levelData.level || 1;
        this.currentXP = levelData.xp || 0;
        this.nextLevelXP = levelData.nextLevelXP || 50;
        this.updateContent();
    }
    
    static showLevelUpCelebration(levelUpData) {
        // Update level data
        this.currentLevel = levelUpData.newLevel || this.currentLevel;
        
        // Show celebration in the level container
        if (this.levelContainer) {
            this.levelContainer.innerHTML = `
                <div style="color: #ff6b35; animation: pulse 0.5s ease-in-out; text-align: center; background: rgba(255,255,255,0.9); padding: 8px 12px; border-radius: 8px; border: 2px solid #ffb300;">
                    🎉 LEVEL UP! 🎉<br>
                    Level ${levelUpData.newLevel}!<br>
                    <span style="font-size: 12px;">Cash: ${levelUpData.newCash}</span>
                </div>
            `;
            
            // Add pulse animation
            const style = document.createElement('style');
            style.textContent = `
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); }
                }
            `;
            document.head.appendChild(style);
            
            // Return to normal display after 3 seconds
            setTimeout(() => {
                this.updateLevelContent();
                document.head.removeChild(style);
            }, 3000);
        }
    }
    
    static updateContent() {
        this.updateLevelContent();
        this.updatePlotContent();
    }
    
    static updateLevelContent() {
        if (!this.levelContainer) return;
        
        const progressPercentage = this.nextLevelXP > 0 ? (this.currentXP / this.nextLevelXP) * 100 : 0;
        const progressBarWidth = Math.min(progressPercentage, 100);
        
        this.levelContainer.innerHTML = `
            <div style="margin-bottom: 4px;">
                <span style="color: #4a90e2; font-size: 14px;">Level ${this.currentLevel}</span>
                <span style="float: right; color: #666; font-size: 12px; margin-left: 10px;">${this.currentXP}/${this.nextLevelXP} XP</span>
            </div>
            <div style="background: #e0e0e0; height: 6px; border-radius: 3px; overflow: hidden; width: 140px;">
                <div style="background: linear-gradient(90deg, #4a90e2, #50c878); height: 100%; width: ${progressBarWidth}%; transition: width 0.3s ease;"></div>
            </div>
        `;
    }
    
    static updatePlotContent() {
        if (!this.container) return;
        
        this.container.innerHTML = this.plotNumber ? `Your Plot: ${this.plotNumber}` : '';
    }
    
    static show(plotNumber) {
        if (!this.container) return;
        this.plotNumber = plotNumber;
        this.updateContent();
        this.container.style.display = 'block';
        if (this.levelContainer) {
            this.levelContainer.style.display = 'block';
        }
    }
    
    static hide() {
        if (!this.container) return;
        this.container.style.display = 'none';
        if (this.levelContainer) {
            this.levelContainer.style.display = 'none';
        }
    }
}
window.YourPlotPanel = YourPlotPanel;
// Auto-initialize if the container exists
if (document.getElementById('your-plot-panel')) {
    YourPlotPanel.initialize();
} 