class YourPlotPanel {
    static initialize(containerId = 'your-plot-panel') {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
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
    }
    static show(plotNumber) {
        if (!this.container) return;
        this.container.textContent = `Your Plot: ${plotNumber}`;
        this.container.style.display = 'block';
    }
    static hide() {
        if (!this.container) return;
        this.container.style.display = 'none';
    }
}
window.YourPlotPanel = YourPlotPanel;
// Auto-initialize if the container exists
if (document.getElementById('your-plot-panel')) {
    YourPlotPanel.initialize();
} 