/**
 * Mobile Block Inventory Panel - Touch-optimized inventory designed specifically for mobile devices
 * Features larger touch targets, simplified layout, and mobile-first design
 */
class MobileBlockInventoryPanel {
    constructor() {
        this.inventoryElement = null;
        this.inventoryOpen = false;
        this.selectedBlock = null;
        this.selectedHotbarSlot = 2; // Start with slot 2 (first editable slot)
        this.heldBlock = null;
        this.mouseFollower = null;
        
        // Data
        this.availableBlocks = [];
        this.availableObstacles = [];
        this.availableBeams = [];
        this.availablePlatforms = [];
        this.currentMechanicalCategory = 'beams';
        
        // State tracking
        this.currentPlayerState = 'LOBBY';
        this.playerLevel = 1;
        this.currentActiveTab = 'blocks';
    }

    initialize(containerId) {
        console.log('[MobileBlockInventoryPanel] Initializing mobile inventory');
        
        this.createMobileInventoryUI(containerId);
        this.addMobileStyles();
        this.setupEventListeners();
        
        // Listen for game data
        if (window.hytopia && window.hytopia.onData) {
            window.hytopia.onData((data) => {
                this.handleGameData(data);
            });
        }
        
        console.log('[MobileBlockInventoryPanel] Mobile inventory initialized');
    }

    createMobileInventoryUI(containerId) {
        // Create main overlay
        this.inventoryElement = document.createElement('div');
        this.inventoryElement.id = containerId;
        this.inventoryElement.className = 'mobile-inventory-overlay';
        
        this.inventoryElement.innerHTML = `
            <!-- Mobile Inventory Container -->
            <div class="mobile-inventory-container">
                <!-- Header -->
                <div class="mobile-inventory-header">
                    <div class="mobile-inventory-title">
                        <span class="mobile-inventory-icon">🎒</span>
                        <span>Building Kit</span>
                    </div>
                    <button class="mobile-inventory-close" id="mobile-inventory-close">✕</button>
                </div>
                
                <!-- Tab Navigation -->
                <div class="mobile-inventory-tabs">
                    <button class="mobile-tab active" data-tab="blocks">
                        <span class="mobile-tab-icon">🧱</span>
                        <span class="mobile-tab-label">Blocks</span>
                    </button>
                    <button class="mobile-tab" data-tab="obstacles">
                        <span class="mobile-tab-icon">⚡</span>
                        <span class="mobile-tab-label">Prefabs</span>
                    </button>
                </div>
                
                <!-- Content Area -->
                <div class="mobile-inventory-content">
                    <!-- Blocks Grid -->
                    <div class="mobile-inventory-grid active" id="mobile-blocks-grid">
                        <!-- Will be populated by populateBlocks() -->
                    </div>
                    
                    <!-- Obstacles Grid -->
                    <div class="mobile-inventory-grid" id="mobile-obstacles-grid">
                        <!-- Will be populated by populateObstacles() -->
                    </div>
                </div>
                
                <!-- Hotbar -->
                <div class="mobile-inventory-hotbar">
                    <div class="mobile-hotbar-title">Hotbar</div>
                    <div class="mobile-hotbar-slots" id="mobile-hotbar-slots">
                        <!-- Will be populated by updateHotbarPreview() -->
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.inventoryElement);
    }

    addMobileStyles() {
        const style = document.createElement('style');
        style.id = 'mobile-inventory-styles';
        style.textContent = `
            .mobile-inventory-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.85);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                font-family: 'Inter', Arial, sans-serif;
                user-select: none;
                padding: 20px;
            }

            .mobile-inventory-container {
                width: 90vw;
                max-width: 400px;
                height: 80vh;
                max-height: 600px;
                background: linear-gradient(145deg, #2a2a2a, #1e1e1e);
                border: 2px solid #444;
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.9);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            /* Header */
            .mobile-inventory-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                background: linear-gradient(135deg, #3a3a3a, #2d2d2d);
                border-bottom: 1px solid #444;
            }

            .mobile-inventory-title {
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 18px;
                font-weight: 600;
                color: white;
            }

            .mobile-inventory-icon {
                font-size: 24px;
            }

            .mobile-inventory-close {
                width: 32px;
                height: 32px;
                background: rgba(255, 0, 0, 0.2);
                border: 1px solid rgba(255, 0, 0, 0.3);
                border-radius: 8px;
                color: #ff6b6b;
                font-size: 18px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .mobile-inventory-close:hover {
                background: rgba(255, 0, 0, 0.3);
                transform: scale(1.05);
            }

            /* Tabs */
            .mobile-inventory-tabs {
                display: flex;
                background: rgba(0, 0, 0, 0.3);
                border-bottom: 1px solid #444;
            }

            .mobile-tab {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
                padding: 12px 8px;
                background: transparent;
                border: none;
                color: #ccc;
                cursor: pointer;
                transition: all 0.2s ease;
                border-bottom: 3px solid transparent;
            }

            .mobile-tab:hover {
                background: rgba(255, 255, 255, 0.1);
                color: white;
            }

            .mobile-tab.active {
                color: white;
                background: rgba(76, 175, 80, 0.2);
                border-bottom-color: #4CAF50;
            }

            .mobile-tab-icon {
                font-size: 20px;
            }

            .mobile-tab-label {
                font-size: 12px;
                font-weight: 600;
            }

            /* Content */
            .mobile-inventory-content {
                flex: 1;
                position: relative;
                overflow: hidden;
            }

            .mobile-inventory-grid {
                display: none;
                grid-template-columns: repeat(3, 1fr);
                gap: 12px;
                padding: 20px;
                height: 100%;
                overflow-y: auto;
                align-content: start;
            }

            .mobile-inventory-grid.active {
                display: grid;
            }

            /* Inventory Slots */
            .mobile-inventory-slot {
                aspect-ratio: 1;
                background: rgba(0, 0, 0, 0.6);
                border: 2px solid #333;
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
                box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.7);
                min-height: 80px;
            }

            .mobile-inventory-slot:hover {
                border-color: #555;
                background: rgba(0, 0, 0, 0.8);
                transform: translateY(-2px);
                box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.7), 0 4px 12px rgba(0, 0, 0, 0.5);
            }

            .mobile-inventory-slot.selected {
                border-color: #4CAF50;
                background: rgba(76, 175, 80, 0.2);
                box-shadow: 0 0 15px rgba(76, 175, 80, 0.5);
            }

            .mobile-slot-icon {
                width: 48px;
                height: 48px;
                object-fit: contain;
                image-rendering: pixelated;
                filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
                margin-bottom: 4px;
            }

            .mobile-slot-text {
                font-size: 10px;
                font-weight: 600;
                color: white;
                text-align: center;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
                line-height: 1.2;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Hotbar */
            .mobile-inventory-hotbar {
                background: rgba(0, 0, 0, 0.3);
                border-top: 1px solid #444;
                padding: 16px 20px;
            }

            .mobile-hotbar-title {
                font-size: 14px;
                font-weight: 600;
                color: white;
                margin-bottom: 12px;
                text-align: center;
            }

            .mobile-hotbar-slots {
                display: grid;
                grid-template-columns: repeat(6, 1fr);
                gap: 8px;
                justify-items: center;
            }

            .mobile-hotbar-slot {
                width: 40px;
                height: 40px;
                background: rgba(0, 0, 0, 0.6);
                border: 2px solid #333;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
            }

            .mobile-hotbar-slot:hover {
                border-color: #555;
                background: rgba(0, 0, 0, 0.8);
            }

            .mobile-hotbar-slot.selected {
                border-color: #4CAF50;
                background: rgba(76, 175, 80, 0.2);
                box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
            }

            .mobile-hotbar-slot.action-slot {
                background: rgba(0, 0, 0, 0.6);
                border-color: #444;
            }

            .mobile-hotbar-slot.backpack-slot {
                border-color: #4CAF50;
                background: rgba(76, 175, 80, 0.2);
            }

            .mobile-hotbar-slot.save-slot {
                border-color: #ff6b6b;
                background: rgba(255, 107, 107, 0.2);
            }

            .mobile-hotbar-icon {
                width: 28px;
                height: 28px;
                object-fit: contain;
                image-rendering: pixelated;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            .mobile-hotbar-action-icon {
                font-size: 18px;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            .mobile-hotbar-number {
                font-size: 14px;
                font-weight: 600;
                color: #888;
            }

            /* Scrollbar */
            .mobile-inventory-grid::-webkit-scrollbar {
                width: 6px;
            }

            .mobile-inventory-grid::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.3);
                border-radius: 3px;
            }

            .mobile-inventory-grid::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.3);
                border-radius: 3px;
            }

            .mobile-inventory-grid::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.5);
            }
        `;
        
        document.head.appendChild(style);
    }

    setupEventListeners() {
        // Close button
        const closeBtn = this.inventoryElement.querySelector('#mobile-inventory-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggle(false));
        }

        // Tab switching
        this.inventoryElement.querySelectorAll('.mobile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.inventoryOpen) {
                this.toggle(false);
            }
        });
    }

    switchTab(tabName) {
        // Update tab states
        this.inventoryElement.querySelectorAll('.mobile-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update grid visibility
        this.inventoryElement.querySelectorAll('.mobile-inventory-grid').forEach(grid => {
            grid.classList.toggle('active', grid.id === `mobile-${tabName}-grid`);
        });

        this.currentActiveTab = tabName;
        console.log('[MobileBlockInventoryPanel] Switched to tab:', tabName);
    }

    toggle(forceState) {
        // Only allow toggle when in build mode
        if (!this.isInBuildMode()) {
            console.log('[MobileBlockInventoryPanel] Toggle ignored - not in build mode');
            return;
        }
        
        if (typeof forceState === 'boolean') {
            this.inventoryOpen = forceState;
        } else {
            this.inventoryOpen = !this.inventoryOpen;
        }

        if (this.inventoryOpen) {
            this.inventoryElement.style.display = 'flex';
            this.populateInventory();
            this.updateHotbarPreview();
            
            // Hide main hotbar to prevent overlap
            if (window.HotbarPanel) {
                window.HotbarPanel.setVisible(false);
            }
            
            // Send unlock pointer data to game
            hytopia.sendData({
                type: 'disablePlayerInput'
            });
        } else {
            this.inventoryElement.style.display = 'none';
            
            // Show the main hotbar again when closing inventory
            if (window.HotbarPanel) {
                window.HotbarPanel.setVisible(true);
            }
            
            // Send lock pointer data to game
            hytopia.sendData({
                type: 'enablePlayerInput'
            });
        }

        console.log('[MobileBlockInventoryPanel] Mobile inventory:', this.inventoryOpen ? 'opened' : 'closed');
    }

    populateInventory() {
        this.populateBlocks();
        this.populateObstacles();
    }

    populateBlocks() {
        const grid = this.inventoryElement.querySelector('#mobile-blocks-grid');
        if (!grid || !this.availableBlocks.length) return;

        grid.innerHTML = '';
        
        this.availableBlocks.forEach(block => {
            const slot = document.createElement('div');
            slot.className = 'mobile-inventory-slot';
            slot.dataset.itemId = block.id;
            slot.dataset.itemName = block.name;
            slot.dataset.itemType = 'blocks';
            
            slot.innerHTML = `
                <img class="mobile-slot-icon" src="${this.getBlockIconPath(block)}" alt="${block.name}">
                <div class="mobile-slot-text">${block.name}</div>
            `;
            
            slot.addEventListener('click', () => this.selectItem(slot));
            grid.appendChild(slot);
        });
    }

    populateObstacles() {
        const grid = this.inventoryElement.querySelector('#mobile-obstacles-grid');
        if (!grid || !this.availableObstacles.length) return;

        grid.innerHTML = '';
        
        this.availableObstacles.forEach(obstacle => {
            const slot = document.createElement('div');
            slot.className = 'mobile-inventory-slot';
            slot.dataset.itemId = obstacle.id;
            slot.dataset.itemName = obstacle.name;
            slot.dataset.itemType = 'obstacles';
            
            slot.innerHTML = `
                <div class="mobile-slot-text">${obstacle.name}</div>
            `;
            
            slot.addEventListener('click', () => this.selectItem(slot));
            grid.appendChild(slot);
        });
    }

    selectItem(slot) {
        // Remove previous selection
        this.inventoryElement.querySelectorAll('.mobile-inventory-slot.selected').forEach(s => {
            s.classList.remove('selected');
        });

        // Select new item
        slot.classList.add('selected');
        
        const itemId = slot.dataset.itemId;
        const itemName = slot.dataset.itemName;
        const itemType = slot.dataset.itemType;
        
        console.log('[MobileBlockInventoryPanel] Selecting item:', { itemId, itemName, itemType });

        let selectedItem = null;
        
        if (itemType === 'blocks') {
            selectedItem = this.availableBlocks.find(b => b.id == itemId);
            this.selectedBlock = {
                id: parseInt(itemId),
                name: itemName
            };
        } else {
            selectedItem = this.availableObstacles.find(o => o.id === itemId);
            this.selectedBlock = {
                id: itemId,
                name: itemName,
                type: selectedItem.type,
                size: selectedItem.sizeId
            };
        }

        // Auto-place in the locally selected hotbar slot
        if (window.HotbarPanel && selectedItem) {
            let hotbarItem;
            
            if (itemType === 'blocks') {
                hotbarItem = {
                    id: this.selectedBlock.id,
                    name: this.selectedBlock.name,
                    textureUri: selectedItem.textureUri
                };
            } else {
                hotbarItem = {
                    id: this.selectedBlock.id,
                    name: this.selectedBlock.name,
                    type: this.selectedBlock.type,
                    size: this.selectedBlock.size,
                    textureUri: this.getObstacleIconPath(selectedItem)
                };
            }
            
            // Update the hotbar slot
            window.HotbarPanel.setSlotBlock(this.selectedHotbarSlot, hotbarItem);
            window.HotbarPanel.selectSlot(this.selectedHotbarSlot);
            
            // Update the mobile hotbar preview
            this.updateHotbarPreview();
            
            console.log('[MobileBlockInventoryPanel] Updated hotbar slot', this.selectedHotbarSlot, 'with item:', hotbarItem);
        }

        // Send data to game
        if (itemType === 'blocks') {
            hytopia.sendData({
                type: 'selectBlock',
                blockId: this.selectedBlock.id
            });
        } else {
            hytopia.sendData({
                type: 'selectObstacle',
                obstacleId: this.selectedBlock.id,
                obstacleType: this.selectedBlock.type,
                obstacleSize: this.selectedBlock.size
            });
        }
    }

    updateHotbarPreview() {
        const slotsContainer = this.inventoryElement.querySelector('#mobile-hotbar-slots');
        if (!slotsContainer) return;

        slotsContainer.innerHTML = '';

        // Get current hotbar state
        const hotbarSlots = window.HotbarPanel ? window.HotbarPanel.getHotbarSlots() || [] : [];

        for (let i = 0; i < 6; i++) {
            const slot = document.createElement('div');
            slot.className = 'mobile-hotbar-slot';
            slot.dataset.hotbarIndex = i;

            // Special styling for different slot types
            if (i === 0) {
                slot.classList.add('action-slot', 'backpack-slot');
                slot.innerHTML = '<span class="mobile-hotbar-action-icon">🎒</span>';
            } else if (i === 1) {
                slot.classList.add('action-slot', 'save-slot');
                slot.innerHTML = '<span class="mobile-hotbar-action-icon">💾</span>';
            } else {
                // Editable slots (2-5)
                if (i === this.selectedHotbarSlot) {
                    slot.classList.add('selected');
                }
                
                const block = hotbarSlots[i];
                if (block) {
                    slot.innerHTML = `<img class="mobile-hotbar-icon" src="${this.getBlockIconPath(block)}" alt="${block.name}">`;
                } else {
                    slot.innerHTML = `<span class="mobile-hotbar-number">${i}</span>`;
                }
                
                // Add click handler for editable slots
                slot.addEventListener('click', () => this.selectHotbarSlot(i));
            }

            slotsContainer.appendChild(slot);
        }
    }

    selectHotbarSlot(slotIndex) {
        // Only allow selecting editable slots (2-5)
        if (slotIndex < 2) {
            console.log('[MobileBlockInventoryPanel] Cannot select action slot:', slotIndex);
            return;
        }
        
        this.selectedHotbarSlot = slotIndex;
        
        // Update visual selection
        this.inventoryElement.querySelectorAll('.mobile-hotbar-slot').forEach((slot, index) => {
            slot.classList.toggle('selected', index === slotIndex && index >= 2);
        });
        
        // Also update the actual hotbar selection
        if (window.HotbarPanel) {
            window.HotbarPanel.selectSlot(slotIndex);
        }
        
        console.log('[MobileBlockInventoryPanel] Selected hotbar slot:', slotIndex);
    }

    handleGameData(data) {
        switch (data.type) {
            case 'playerStateChanged':
                this.onPlayerStateChanged(data.state, data.plotIndex, data.level);
                break;
            case 'availableBlocksUpdate':
                this.availableBlocks = data.blocks || [];
                if (this.inventoryOpen) this.populateBlocks();
                break;
            case 'availableObstaclesUpdate':
                this.availableObstacles = data.obstacles || [];
                if (this.inventoryOpen) this.populateObstacles();
                break;
        }
    }

    onPlayerStateChanged(state, plotIndex, level) {
        console.log('[MobileBlockInventoryPanel] Player state changed to:', state, 'plotIndex:', plotIndex, 'level:', level);
        
        this.currentPlayerState = state;
        this.playerLevel = level || 1;
        
        if (state === 'BUILDING') {
            console.log('[MobileBlockInventoryPanel] Build mode activated - mobile inventory enabled');
        } else {
            console.log('[MobileBlockInventoryPanel] Exited build mode - mobile inventory disabled');
            if (this.inventoryOpen) {
                this.toggle(false);
            }
        }
    }

    isInBuildMode() {
        return this.currentPlayerState === 'BUILDING';
    }

    getAssetBaseUrl() {
        if (typeof window.CDN_ASSETS_URL !== 'undefined' && window.CDN_ASSETS_URL) {
            return window.CDN_ASSETS_URL;
        }
        
        const scriptTags = document.getElementsByTagName('script');
        for (let i = 0; i < scriptTags.length; i++) {
            const src = scriptTags[i].src;
            if (src && src.includes('/ui/panels/')) {
                const baseUrl = src.substring(0, src.indexOf('/ui/panels/'));
                return baseUrl;
            }
        }
        
        return window.location.origin;
    }

    getBlockIconPath(block) {
        const baseUrl = this.getAssetBaseUrl();
        
        if (block.textureUri) {
            if (block.textureUri.startsWith('/')) {
                return `${baseUrl}${block.textureUri}`;
            } else {
                return `${baseUrl}/${block.textureUri}`;
            }
        } else {
            return `${baseUrl}/blocks/dirt.png`;
        }
    }

    getObstacleIconPath(obstacle) {
        const baseUrl = this.getAssetBaseUrl();
        
        if (obstacle.icon) {
            if (obstacle.icon.startsWith('/')) {
                return `${baseUrl}${obstacle.icon}`;
            } else {
                return `${baseUrl}/${obstacle.icon}`;
            }
        } else {
            return `${baseUrl}/ui/icons/speed-icon.png`;
        }
    }
}

// Make it globally available as a singleton instance
window.MobileBlockInventoryPanel = new MobileBlockInventoryPanel();