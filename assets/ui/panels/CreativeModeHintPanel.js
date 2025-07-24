class CreativeModeHintPanel {
    static initialize(containerId = 'creative-mode-hint-panel') {
        this.container = document.getElementById(containerId);
        console.log('[CreativeModeHintPanel] initialize called. Container:', this.container);
        if (!this.container) return;
        // Only show on desktop
        if (/Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
            this.container.style.display = 'none';
            console.log('[CreativeModeHintPanel] Not desktop, hiding panel.');
            return;
        }
        this.container.style.display = 'none';
        this.container.style.position = 'fixed';
        this.container.style.bottom = '32px';
        this.container.style.left = '32px';
        this.container.style.background = '#e6f7ff';
        this.container.style.border = '2px solid #1890ff';
        this.container.style.borderRadius = '12px';
        this.container.style.padding = '12px 20px';
        this.container.style.fontFamily = "'Comic Neue', 'Comic Sans MS', 'Arial Rounded MT Bold', sans-serif";
        this.container.style.fontSize = '18px';
        this.container.style.fontWeight = 'bold';
        this.container.style.color = '#0050b3';
        this.container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
        this.container.style.zIndex = '2000';
        console.log('[CreativeModeHintPanel] Initialized styles.');
    }
    static show() {
        if (!this.container) { console.log('[CreativeModeHintPanel] show called but no container'); return; }
        this.container.textContent = 'F: Toggle Creative Mode';
        this.container.style.display = 'block';
        console.log('[CreativeModeHintPanel] show called, panel should be visible.');
    }
    static hide() {
        if (!this.container) { console.log('[CreativeModeHintPanel] hide called but no container'); return; }
        this.container.style.display = 'none';
        console.log('[CreativeModeHintPanel] hide called, panel should be hidden.');
    }
}
window.CreativeModeHintPanel = CreativeModeHintPanel;
// Auto-initialize if the container exists
if (document.getElementById('creative-mode-hint-panel')) {
    CreativeModeHintPanel.initialize();
} 