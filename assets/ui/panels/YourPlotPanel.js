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
    static show(plotNumber) {
        if (!this.container) return;
        this.plotNumber = plotNumber;
        this.container.textContent = `Your Plot: ${plotNumber}`;
        this.container.style.display = 'block';
        
        // Also show level container if we have level data
        if (this.levelContainer && this.currentLevel > 1) {
            this.updateLevelDisplay({
                level: this.currentLevel,
                currentXP: this.currentXP,
                nextLevelXP: this.nextLevelXP
            });
        }
    }
    
    static hide() {
        if (!this.container) return;
        this.container.style.display = 'none';
        if (this.levelContainer) {
            this.levelContainer.style.display = 'none';
        }
    }
    
    static updateLevelDisplay(data) {
        if (!this.levelContainer) return;
        
        this.currentLevel = data.level || 1;
        this.currentXP = data.currentXP || 0;
        this.nextLevelXP = data.nextLevelXP || 50;
        
        const progressPercentage = this.nextLevelXP > 0 ? Math.min((this.currentXP / this.nextLevelXP) * 100, 100) : 100;
        
        // Create level display with XP progress bar
        this.levelContainer.innerHTML = `
            <div style="background: rgba(255, 255, 255, 0.3); border: 2px solid rgba(76, 175, 80, 0.8); border-radius: 8px; padding: 6px 10px; display: inline-block;">
                <div style="font-size: 12px; margin-bottom: 2px; color: #333; font-weight: bold;">Level ${this.currentLevel}</div>
                <div style="width: 120px; height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${progressPercentage}%; height: 100%; background: linear-gradient(90deg, #4CAF50, #45a049); transition: width 0.3s ease;"></div>
                </div>
                <div style="font-size: 10px; color: #333; margin-top: 2px; font-weight: bold;">${this.currentXP}/${this.nextLevelXP} XP</div>
            </div>
        `;
        
        this.levelContainer.style.display = 'block';
        console.log('[YourPlotPanel] Level display updated:', data);
    }
    
    static showLevelUpCelebration(data) {
        console.log('[YourPlotPanel] Level up celebration:', data);
        
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
}
window.YourPlotPanel = YourPlotPanel;
// Auto-initialize if the container exists
if (document.getElementById('your-plot-panel')) {
    YourPlotPanel.initialize();
} 