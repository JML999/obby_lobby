class BlockInventoryPanel {
    constructor() {
        this.container = null;
        this.inventoryOpen = false;
        this.inventoryElement = null;
        this.selectedBlock = null;
        this.availableBlocks = [];
        this.availableObstacles = [];
        this.mouseFollower = null;
        this.heldBlock = null;
        this.selectedHotbarSlot = 1; // Start with first editable slot
        this.currentTab = 'blocks'; // 'blocks' or 'obstacles'
        
        // State management
        this.currentPlayerState = 'LOBBY';
        this.isEnabled = false;
        
        // Define available blocks and obstacles
        this.initializeBlocks();
        this.initializeObstacles();
    }

    initialize(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`[BlockInventoryPanel] Container with ID '${containerId}' not found.`);
            return;
        }

        this.createInventoryUI();
        this.addStyles();
        this.setupEventListeners();
        this.createMouseFollower();
        
        // Initially disabled (only enabled in build mode)
        this.setEnabled(false);
        
        // Listen for state changes
        if (window.hytopia && window.hytopia.onData) {
            window.hytopia.onData((data) => {
                if (data.type === 'playerStateChanged') {
                    this.onPlayerStateChanged(data.state, data.plotIndex, data.isMobile, data.mobileControls);
                }
            });
        }
        
        console.log('[BlockInventoryPanel] Initialized successfully.');
    }

    onPlayerStateChanged(newState, plotIndex, isMobile, mobileControls) {
        console.log('[BlockInventoryPanel] Player state changed to:', newState, 'plotIndex:', plotIndex, 'isMobile:', isMobile);
        this.currentPlayerState = newState;
        
        // Only enable inventory when in building mode
        if (newState === 'BUILDING') {
            this.setEnabled(true);
            
            // Update mobile-specific styling
            if (isMobile) {
                this.inventoryElement.classList.add('mobile-inventory');
                console.log('[BlockInventoryPanel] Mobile styling applied to inventory');
            } else {
                this.inventoryElement.classList.remove('mobile-inventory');
            }
            
            console.log('[BlockInventoryPanel] Build mode activated - inventory enabled');
        } else {
            this.setEnabled(false);
            // Close inventory if it's open when exiting build mode
            if (this.inventoryOpen) {
                this.toggle(false);
            }
            console.log('[BlockInventoryPanel] Exited build mode - inventory disabled');
        }
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
        // Visual indicator could be added here if desired
    }

    isInBuildMode() {
        return this.currentPlayerState === 'BUILDING' && this.isEnabled;
    }

    initializeBlocks() {
        // Obbys Creator Block Types with point costs
        this.availableBlocks = [
            // Required blocks (0 points)
            { id: 100, name: 'start', textureUri: 'blocks/start.png', cost: 0, type: 'start' },
            { id: 101, name: 'goal', textureUri: 'blocks/goal.png', cost: 0, type: 'goal' },
            
            // Basic movement blocks (1 point each)
            { id: 1, name: 'platform', textureUri: 'blocks/stone-bricks.png', cost: 1, type: 'platform' },
            { id: 9, name: 'ice', textureUri: 'blocks/ice.png', cost: 1, type: 'ice' },
            { id: 17, name: 'sand', textureUri: 'blocks/sand.png', cost: 1, type: 'sand' },
            { id: 15, name: 'vines', textureUri: 'blocks/oak-planks-leafyerer.png', cost: 1, type: 'vines' },
            
            // Hazard blocks (2 points each)
            { id: 21, name: 'lava', textureUri: 'blocks/lava.png', cost: 2, type: 'void-sand' },
            
            // Conveyor blocks (2 points each) - relative to player facing
            { id: 104, name: 'conveyor backward', textureUri: 'blocks/conveyor-z-', cost: 2, type: 'conveyor-backward' },
            { id: 105, name: 'conveyor forward', textureUri: 'blocks/conveyor-z+', cost: 2, type: 'conveyor-forward' },
            { id: 109, name: 'conveyor left', textureUri: 'blocks/conveyor-x-', cost: 2, type: 'conveyor-left' },
            { id: 110, name: 'conveyor right', textureUri: 'blocks/conveyor-x+', cost: 2, type: 'conveyor-right' },
            
            // Special blocks (3 points each)
            { id: 6, name: 'glass', textureUri: 'blocks/glass.png', cost: 3, type: 'glass' }
        ];
    }

    initializeObstacles() {
        // Define obstacles with size variants
        this.availableObstacles = [
            // Jump Pad (renamed from Bounce Pad, only small size)
            { id: 'bounce_pad_small', name: 'Jump Pad', size: '', type: 'bounce_pad', sizeId: 'small', icon: 'ui/icons/speed-icon.png' },
            
            // Rotating Beam (only small size for now)
            { id: 'rotating_beam_small', name: 'Rotating Beam', size: '', type: 'rotating_beam', sizeId: 'small', icon: 'ui/icons/speed-icon.png' },
            
            // Enemies - Zombies (using size field to store variant)
            { id: 'zombie_normal', name: 'Zombie', size: 'normal', type: 'zombie', sizeId: 'normal', icon: 'ui/icons/target.png' },
            { id: 'zombie_fast', name: 'Fast Zombie', size: 'fast', type: 'zombie', sizeId: 'fast', icon: 'ui/icons/target.png' },
            { id: 'zombie_strong', name: 'Strong Zombie', size: 'strong', type: 'zombie', sizeId: 'strong', icon: 'ui/icons/target.png' }
        ];
    }

    createInventoryUI() {
        this.inventoryElement = document.createElement('div');
        this.inventoryElement.id = 'block-inventory-ui';
        this.inventoryElement.className = 'backpack-overlay';
        this.inventoryElement.style.display = 'none';

        this.inventoryElement.innerHTML = `
            <!-- Main Container -->
            <div class="backpack-container">
                <div class="backpack-header">
                    <div class="backpack-info">
                        <div class="backpack-icon">🎒</div>
                        <div class="backpack-details">
                            <div class="backpack-name">Building Kit</div>
                        </div>
                    </div>
                    <button class="backpack-close">×</button>
                </div>
                
                <div class="backpack-content">
                    <!-- Left Navigation Tabs -->
                    <div class="backpack-nav">
                        <button class="backpack-tab active" data-tab="blocks" title="Blocks">
                            <div class="tab-icon">🔲</div>
                            <div class="tab-label">Blocks</div>
                        </button>
                        <button class="backpack-tab" data-tab="obstacles" title="Obstacles">
                            <div class="tab-icon">⚡</div>
                            <div class="tab-label">Obstacles</div>
                        </button>
                    </div>

                    <!-- Main Grid Container -->
                    <div class="backpack-main">
                        <div class="backpack-grid-container">
                            <div class="backpack-grid" id="block-inventory-grid">
                                <!-- Grid slots will be generated by JavaScript -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Hotbar Container -->
            <div class="backpack-hotbar-container">
                <div class="backpack-hotbar-header">
                    <h3 class="backpack-hotbar-title">Hotbar</h3>
                </div>
                <div class="backpack-hotbar-grid" id="backpack-hotbar-grid">
                    <!-- Hotbar slots will be generated by JavaScript -->
                </div>
            </div>
        `;

        this.container.appendChild(this.inventoryElement);
        this.generateBlockGrid();
        this.generateHotbarPreview();
    }

    generateBlockGrid() {
        const grid = document.getElementById('block-inventory-grid');
        grid.innerHTML = '';

        const items = this.currentTab === 'blocks' ? this.availableBlocks : this.availableObstacles;

        items.forEach((item, index) => {
            const slot = document.createElement('div');
            slot.className = 'backpack-slot';
            slot.dataset.itemId = item.id;
            slot.dataset.itemName = item.name;
            slot.dataset.itemType = this.currentTab;
            slot.title = item.name;

            const content = document.createElement('div');
            content.className = 'backpack-slot-content';

            if (this.currentTab === 'blocks') {
                // Block display
                const blockImage = document.createElement('img');
                blockImage.className = 'backpack-item-icon';
                blockImage.src = this.getBlockIconPath(item);
                blockImage.alt = item.name;
                content.appendChild(blockImage);
            } else {
                // Obstacle display with text name instead of image
                const obstacleText = document.createElement('div');
                obstacleText.className = 'backpack-obstacle-text';
                obstacleText.textContent = item.name;
                content.appendChild(obstacleText);
            }

            slot.appendChild(content);
            grid.appendChild(slot);
        });
    }

    generateHotbarPreview() {
        const grid = document.getElementById('backpack-hotbar-grid');
        grid.innerHTML = '';

        // Get the permanent actions from the main hotbar - only save now
        const permanentActions = [
            { id: 'save', icon: '💾', label: 'Save' }
        ];

        for (let i = 0; i < 6; i++) {
            const slot = document.createElement('div');
            slot.className = 'backpack-hotbar-slot';
            slot.dataset.hotbarIndex = i;
            
            // Mark currently selected slot
            if (i === this.selectedHotbarSlot) {
                slot.classList.add('selected');
            }

            const content = document.createElement('div');
            content.className = 'backpack-hotbar-slot-content';
            
            // Only slot 0 is permanent action (save)
            if (i === 0) {
                const action = permanentActions[0];
                const actionIcon = document.createElement('span');
                actionIcon.className = 'backpack-action-icon';
                actionIcon.textContent = action.icon;
                actionIcon.title = action.label;
                content.appendChild(actionIcon);
            } else {
                content.textContent = i + 1;
            }

            slot.appendChild(content);
            grid.appendChild(slot);
        }
    }

    createMouseFollower() {
        this.mouseFollower = document.createElement('div');
        this.mouseFollower.id = 'block-mouse-follower';
        this.mouseFollower.style.cssText = `
            position: fixed;
            width: 40px;
            height: 40px;
            pointer-events: none;
            z-index: 10000;
            display: none;
            border: 2px solid #ffffff;
            border-radius: 4px;
            background-size: cover;
            background-position: center;
        `;
        document.body.appendChild(this.mouseFollower);
    }

    setupEventListeners() {
        // Close button
        const closeBtn = this.inventoryElement.querySelector('.backpack-close');
        closeBtn.addEventListener('click', () => this.toggle(false));

        // Tab switching
        const tabButtons = this.inventoryElement.querySelectorAll('.backpack-tab');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Block selection from backpack grid
        const grid = document.getElementById('block-inventory-grid');
        grid.addEventListener('click', (e) => {
            const slot = e.target.closest('.backpack-slot');
            if (slot) {
                this.selectItem(slot);
            }
        });

        // Hotbar preview interaction (drag from backpack to hotbar)
        const hotbarGrid = document.getElementById('backpack-hotbar-grid');
        
        // Hotbar slot selection
        hotbarGrid.addEventListener('click', (e) => {
            const slot = e.target.closest('.backpack-hotbar-slot');
            if (slot) {
                this.selectHotbarSlot(parseInt(slot.dataset.hotbarIndex));
            }
        });
        
        // Mouse events for drag and drop
        grid.addEventListener('mousedown', (e) => {
            const slot = e.target.closest('.backpack-slot');
            if (slot) {
                this.startDrag(slot, e);
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.heldBlock) {
                this.updateMouseFollower(e);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (this.heldBlock) {
                this.endDrag(e);
            }
        });

        // Toggle inventory with 'E' key
        document.addEventListener('keydown', (e) => {
            console.log('[BlockInventoryPanel] Key pressed:', e.key, 'isInputActive:', this.isInputElementActive(), 'isInBuildMode:', this.isInBuildMode());
            // Only respond to keys when in build mode
            if (!this.isInBuildMode() || this.isInputElementActive()) return;
            if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                console.log('[BlockInventoryPanel] E key detected - toggling inventory');
                e.preventDefault();
                this.toggle();
            } else if (e.key === 'Escape' && this.inventoryOpen) {
                console.log('[BlockInventoryPanel] Escape key detected - closing inventory');
                e.preventDefault();
                this.toggle(false);
            }
        });
        // Listen for hytopia input (for mobile inventory button)
        if (window.hytopia && window.hytopia.onInput) {
            window.hytopia.onInput((input) => {
                if (this.isInBuildMode() && input.e) {
                    console.log('[BlockInventoryPanel] hytopia input.e detected - toggling inventory');
                    this.toggle();
                }
            });
        }
        // Listen for showInventoryPanel messages from the server
        if (window.hytopia && window.hytopia.onData) {
            window.hytopia.onData((data) => {
                if (data.type === 'showInventoryPanel') {
                    if (this.isInBuildMode()) {
                        console.log('[BlockInventoryPanel] Received showInventoryPanel from server - opening inventory');
                        this.toggle(true);
                    }
                }
            });
        }
    }

    switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('.backpack-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        this.currentTab = tabName;
        this.generateBlockGrid();
        console.log(`[BlockInventoryPanel] Switched to ${tabName} tab`);
    }

    selectItem(slot) {
        // Remove previous selection
        const previousSelected = this.inventoryElement.querySelector('.backpack-slot.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }

        // Select new item
        slot.classList.add('selected');
        
        const itemId = slot.dataset.itemId;
        const itemName = slot.dataset.itemName;
        const itemType = slot.dataset.itemType;

        if (itemType === 'blocks') {
            this.selectedBlock = {
                id: parseInt(itemId),
                name: itemName
            };
        } else {
            // For obstacles, find the full item data
            const obstacle = this.availableObstacles.find(o => o.id === itemId);
            this.selectedBlock = {
                id: itemId,
                name: itemName,
                type: obstacle.type,
                size: obstacle.sizeId
            };
        }

        // Auto-place in the locally selected hotbar slot
        if (window.HotbarPanel) {
            const hotbarItem = itemType === 'blocks' ? {
                id: this.selectedBlock.id,
                name: this.selectedBlock.name,
                textureUri: this.availableBlocks.find(b => b.id === this.selectedBlock.id)?.textureUri
            } : {
                id: this.selectedBlock.id,
                name: this.selectedBlock.name,
                type: this.selectedBlock.type,
                size: this.selectedBlock.size,
                textureUri: this.getObstacleIconPath(this.availableObstacles.find(o => o.id === this.selectedBlock.id))
            };
            
            // Update the hotbar slot
            window.HotbarPanel.setSlotBlock(this.selectedHotbarSlot, hotbarItem);
            
            // Also select this slot in the hotbar
            window.HotbarPanel.selectSlot(this.selectedHotbarSlot);
            
            // Update the inventory preview
            this.updateHotbarPreview();
            
            console.log('[BlockInventoryPanel] Updated hotbar slot', this.selectedHotbarSlot, 'with item:', hotbarItem);
        }

        // Send data to game based on item type
        if (itemType === 'blocks') {
            // Send block selection data
            hytopia.sendData({
                type: 'selectBlock',
                blockId: this.selectedBlock.id
            });
        } else {
            // Send obstacle selection data
            hytopia.sendData({
                type: 'selectObstacle',
                obstacleId: this.selectedBlock.id,
                obstacleType: this.selectedBlock.type,
                obstacleSize: this.selectedBlock.size
            });
        }

        console.log('[BlockInventoryPanel] Selected item:', this.selectedBlock);
    }

    selectHotbarSlot(slotIndex) {
        // Only allow selecting editable slots (1-5)
        if (slotIndex === 0 || slotIndex >= 6) {
            console.log('[BlockInventoryPanel] Cannot select permanent or invalid slot:', slotIndex);
            return;
        }

        // Update UI selection
        const previousSelected = this.inventoryElement.querySelector('.backpack-hotbar-slot.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }

        const newSelected = this.inventoryElement.querySelector(`[data-hotbar-index="${slotIndex}"]`);
        if (newSelected) {
            newSelected.classList.add('selected');
            this.selectedHotbarSlot = slotIndex;
            console.log('[BlockInventoryPanel] Selected hotbar slot:', slotIndex);
        }
    }

    updateHotbarPreview() {
        // Get hotbar slots from the main hotbar panel
        const hotbarSlots = window.HotbarPanel ? window.HotbarPanel.hotbarSlots : [];
        
        // Update each slot in the inventory hotbar preview
        for (let i = 0; i < 6; i++) {
            const hotbarSlot = this.inventoryElement.querySelector(`[data-hotbar-index="${i}"]`);
            if (hotbarSlot) {
                const content = hotbarSlot.querySelector('.backpack-hotbar-slot-content');
                
                // Mark selected slot
                if (i === this.selectedHotbarSlot) {
                    hotbarSlot.classList.add('selected');
                } else {
                    hotbarSlot.classList.remove('selected');
                }
                
                // Only slot 0 is permanent action (save)
                if (i === 0) {
                    const action = { id: 'save', icon: '💾', label: 'Save' };
                    content.innerHTML = '';
                    const actionIcon = document.createElement('span');
                    actionIcon.className = 'backpack-action-icon';
                    actionIcon.textContent = action.icon;
                    actionIcon.title = action.label;
                    content.appendChild(actionIcon);
                } else {
                    // Slots 1-5 show blocks/obstacles if present, otherwise show slot number
                    const block = hotbarSlots[i];
                    content.innerHTML = '';
                    if (block) {
                        if (block.type) {
                            // Obstacle display - use text like inventory
                            const obstacleText = document.createElement('div');
                            obstacleText.className = 'backpack-hotbar-obstacle-text';
                            obstacleText.textContent = block.name;
                            content.appendChild(obstacleText);
                        } else {
                            // Block display - use image like inventory
                            const blockImage = document.createElement('img');
                            blockImage.className = 'backpack-hotbar-slot-icon';
                            blockImage.src = this.getBlockIconPath(block);
                            blockImage.alt = block.name;
                            content.appendChild(blockImage);
                        }
                    } else {
                        content.textContent = i + 1;
                    }
                }
            }
        }
    }

    startDrag(slot, event) {
        event.preventDefault();
        
        const itemId = slot.dataset.itemId;
        const itemName = slot.dataset.itemName;
        const itemType = slot.dataset.itemType;

        if (itemType === 'blocks') {
            this.heldBlock = {
                id: parseInt(itemId),
                name: itemName,
                textureUri: this.availableBlocks.find(b => b.id === parseInt(itemId))?.textureUri
            };
        } else {
            const obstacle = this.availableObstacles.find(o => o.id === itemId);
            this.heldBlock = {
                id: itemId,
                name: itemName,
                type: obstacle.type,
                size: obstacle.sizeId,
                textureUri: this.getObstacleIconPath(obstacle)
            };
        }

        // Set up mouse follower
        this.mouseFollower.style.backgroundImage = `url('${this.heldBlock.textureUri}')`;
        this.mouseFollower.style.display = 'block';
        this.updateMouseFollower(event);
    }

    updateMouseFollower(event) {
        this.mouseFollower.style.left = (event.clientX - 20) + 'px';
        this.mouseFollower.style.top = (event.clientY - 20) + 'px';
    }

    endDrag(event) {
        if (!this.heldBlock) return;

        // Check if dropping on hotbar slot in inventory preview
        const hotbarSlot = document.elementFromPoint(event.clientX, event.clientY)?.closest('.backpack-hotbar-slot');
        if (hotbarSlot) {
            const hotbarIndex = parseInt(hotbarSlot.dataset.hotbarIndex);
            
            // Only allow dropping on editable slots (1-5)
            if (hotbarIndex === 0 || hotbarIndex >= 6) {
                console.log('[BlockInventoryPanel] Cannot drop on permanent or invalid slot:', hotbarIndex);
                return;
            }

            const itemId = this.heldBlock.id;
            const itemName = this.heldBlock.name;
            
            // Update hotbar slot visually
            const content = hotbarSlot.querySelector('.backpack-hotbar-slot-content');
            content.innerHTML = '';
            
            if (this.heldBlock.type) {
                // Obstacle display - use text like inventory
                const obstacleText = document.createElement('div');
                obstacleText.className = 'backpack-hotbar-obstacle-text';
                obstacleText.textContent = this.heldBlock.name;
                content.appendChild(obstacleText);
            } else {
                // Block display - use image
                const blockImage = document.createElement('img');
                blockImage.className = 'backpack-hotbar-slot-icon';
                blockImage.src = this.heldBlock.textureUri;
                blockImage.alt = itemName;
                content.appendChild(blockImage);
            }
            
            // Notify the actual hotbar panel if it exists
            if (window.HotbarPanel) {
                window.HotbarPanel.setSlotBlock(hotbarIndex, this.heldBlock);
                // Also select this slot
                window.HotbarPanel.selectSlot(hotbarIndex);
                // Update the inventory preview
                this.updateHotbarPreview();
            }
        }

        // Clean up
        this.heldBlock = null;
        this.mouseFollower.style.display = 'none';
    }

    toggle(forceState) {
        // Only allow toggle when in build mode
        if (!this.isInBuildMode()) {
            console.log('[BlockInventoryPanel] Toggle ignored - not in build mode');
            return;
        }
        
        if (typeof forceState === 'boolean') {
            this.inventoryOpen = forceState;
        } else {
            this.inventoryOpen = !this.inventoryOpen;
        }

        if (this.inventoryOpen) {
            this.inventoryElement.style.display = 'flex';
            // Sync local hotbar selection with game hotbar when opening
            if (window.HotbarPanel) {
                this.selectedHotbarSlot = window.HotbarPanel.getSelectedSlotIndex();
                // Update hotbar preview to sync with current state
                this.updateHotbarPreview();
                // Hide the main hotbar to prevent overlap
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

        console.log('[BlockInventoryPanel] Inventory:', this.inventoryOpen ? 'opened' : 'closed');
    }

    isInputElementActive() {
        const activeElement = document.activeElement;
        return activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );
    }

    getAssetBaseUrl() {
        // Check if we're in a Hytopia environment with CDN_ASSETS_URL available
        if (typeof window.CDN_ASSETS_URL !== 'undefined' && window.CDN_ASSETS_URL) {
            return window.CDN_ASSETS_URL;
        }
        
        // Try to extract it from a script tag's src attribute
        const scriptTags = document.getElementsByTagName('script');
        for (let i = 0; i < scriptTags.length; i++) {
            const src = scriptTags[i].src;
            if (src && src.includes('/ui/panels/')) {
                const baseUrl = src.substring(0, src.indexOf('/ui/panels/'));
                return baseUrl;
            }
        }
        
        // Fallback to current origin
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
            // Fallback to a default block icon
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
            // Fallback to speed icon
            return `${baseUrl}/ui/icons/speed-icon.png`;
        }
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @font-face {
                font-family: 'Inter-ExtraBold';
                src: url('${this.getAssetBaseUrl()}/ui/fonts/Inter-ExtraBold.ttf') format('truetype');
                font-weight: 800;
                font-display: swap;
            }

            :root {
                --backpack-slot-size: 38px;
                --backpack-hotbar-size: 34px;
                --backpack-icon-size: 26px;
                --backpack-gap: 4px;
                --backpack-padding: 7px;
                --backpack-font: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            }

            .backpack-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.8);
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                font-family: var(--backpack-font);
                user-select: none;
                gap: 10px;
                padding: 0;
            }

            .backpack-container {
                background: linear-gradient(145deg, #2a2a2a, #1e1e1e);
                border: 1px solid #444;
                border-radius: 10px;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                width: 320px;
                height: 220px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .backpack-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 7px 12px;
                background: linear-gradient(135deg, #3a3a3a, #2d2d2d);
                border-bottom: 1px solid #444;
                border-radius: 10px 10px 0 0;
            }
            .backpack-info {
                display: flex;
                align-items: center;
                gap: 7px;
            }
            .backpack-icon {
                width: 22px;
                height: 22px;
                background: rgba(0, 0, 0, 0.6);
                border: 1px solid #444;
                border-radius: 5px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 13px;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
            }
            .backpack-details {
                display: flex;
                flex-direction: column;
            }
            .backpack-name {
                font-size: 12px;
                font-weight: 600;
                color: #fff;
                text-shadow: 0 1px 2px rgba(0,0,0,0.9);
                line-height: 1;
            }
            .backpack-close {
                background: rgba(255, 0, 0, 0.2);
                border: 1px solid rgba(255, 0, 0, 0.3);
                border-radius: 5px;
                color: #ff6b6b;
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .backpack-close:hover {
                background: rgba(255, 0, 0, 0.3);
                transform: scale(1.05);
            }
            .backpack-content {
                display: flex;
                flex: 1;
                overflow: hidden;
            }
            .backpack-nav {
                width: 38px;
                background: linear-gradient(135deg, #3a3a3a, #2d2d2d);
                border-right: 1px solid #444;
                display: flex;
                flex-direction: column;
                padding: 3px;
                gap: 3px;
            }
            .backpack-tab {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 3px 3px;
                background: transparent;
                border: 1px solid transparent;
                border-radius: 5px;
                cursor: pointer;
                transition: all 0.2s ease;
                width: 28px;
                height: 28px;
                gap: 2px;
            }
            .tab-icon {
                font-size: 11px;
                opacity: 0.7;
                transition: opacity 0.2s ease;
            }
            .tab-label {
                font-size: 5px;
                font-weight: 600;
                color: #ccc;
                text-align: center;
                line-height: 1;
            }
            .backpack-tab.active {
                background: rgba(0, 0, 0, 0.6);
                border-color: #4CAF50;
                box-shadow: 0 0 0 1.5px rgba(76, 175, 80, 0.3);
            }
            .backpack-main {
                flex: 1;
                padding: 7px;
                overflow: hidden;
            }
            .backpack-grid-container {
                width: 100%;
                height: 100%;
            }
            .backpack-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                grid-auto-rows: max-content;
                gap: var(--backpack-gap);
                background: rgba(0, 0, 0, 0.3);
                padding: var(--backpack-padding);
                border: 1px solid #444;
                border-radius: 6px;
                box-shadow: inset 0 1.5px 6px rgba(0,0,0,0.5);
                max-height: 120px;
                overflow-y: auto;
                align-content: start;
            }
            .backpack-slot {
                width: var(--backpack-slot-size);
                height: var(--backpack-slot-size);
                background: rgba(0, 0, 0, 0.6);
                border: 1.5px solid #333;
                border-radius: 5px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
                box-shadow: inset 0 1px 2.5px rgba(0,0,0,0.7);
            }
            .backpack-slot-content {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                color: #ccc;
                position: relative;
            }
            .backpack-item-icon {
                width: var(--backpack-icon-size);
                height: var(--backpack-icon-size);
                object-fit: contain;
                image-rendering: pixelated;
                filter: drop-shadow(0 1px 2px rgba(0,0,0,0.8));
            }
            .backpack-obstacle-text {
                font-family: 'Inter-ExtraBold', var(--backpack-font);
                font-weight: 800;
                font-size: 10px;
                color: #fff;
                text-align: center;
                text-shadow: 0 1px 2px rgba(0,0,0,0.9);
                line-height: 1.1;
                padding: 2px 4px;
                text-transform: uppercase;
                letter-spacing: 0.2px;
                word-wrap: break-word;
                hyphens: auto;
                max-width: 40px;
                max-height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .backpack-hotbar-container {
                background: linear-gradient(145deg, #2a2a2a, #1e1e1e);
                border: 1px solid #444;
                border-radius: 10px;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255,255,255,0.1);
                width: 99%;
                max-width: 260px;
                margin: 0 auto;
            }
            .backpack-hotbar-header {
                justify-content: flex-start;
            }
            .backpack-hotbar-title {
                margin: 0;
                font-size: 11px;
                font-weight: 600;
                color: #fff;
                text-shadow: 0 1px 2px rgba(0,0,0,0.9);
                letter-spacing: 0.2px;
            }
            .backpack-hotbar-grid {
                display: grid;
                grid-template-columns: repeat(6, 1fr);
                gap: 4px;
                background: rgba(0, 0, 0, 0.3);
                padding: 4px;
                border-radius: 0 0 6px 6px;
                box-shadow: inset 0 1.5px 6px rgba(0,0,0,0.5);
                justify-items: center;
                max-width: 100%;
            }
            .backpack-hotbar-slot {
                width: var(--backpack-hotbar-size);
                height: var(--backpack-hotbar-size);
                background: rgba(0, 0, 0, 0.6);
                border: 1.5px solid #333;
                border-radius: 5px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
                box-shadow: inset 0 1px 2.5px rgba(0,0,0,0.7);
            }
            .backpack-hotbar-slot-content {
                font-size: 5px;
                font-weight: 600;
                color: #888;
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .backpack-hotbar-slot-icon {
                width: 18px;
                height: 18px;
                object-fit: contain;
                image-rendering: pixelated;
                filter: drop-shadow(0 1px 2px rgba(0,0,0,0.8));
            }
            .backpack-hotbar-slot.selected {
                border-color: #4CAF50 !important;
                background: rgba(76, 175, 80, 0.2) !important;
                box-shadow: 0 0 10px rgba(76, 175, 80, 0.5) !important;
            }
            @media (max-width: 768px) {
                :root {
                    --backpack-slot-size: 24px;
                    --backpack-hotbar-size: 16px;
                    --backpack-icon-size: 11px;
                    --backpack-gap: 1px;
                    --backpack-padding: 2px;
                }
                .backpack-overlay {
                    gap: 3px;
                    padding: 5px;
                }
                .backpack-container {
                    width: 95vw;
                    max-width: 160px;
                    height: 180px;
                    border-radius: 6px;
                }
                .backpack-header {
                    padding: 2px 3px;
                }
                .backpack-icon {
                    width: 8px;
                    height: 8px;
                    font-size: 6px;
                }
                .backpack-name {
                    font-size: 6px;
                }
                .backpack-nav {
                    width: 30px;
                    padding: 2px;
                    gap: 2px;
                }
                .backpack-tab {
                    width: 24px;
                    height: 24px;
                    padding: 1px;
                }
                .tab-icon {
                    font-size: 7.5px;
                }
                .backpack-main {
                    padding: 4px;
                }
                .backpack-grid {
                    max-height: 100px;
                    padding: 2px;
                    gap: 1px;
                }
                .backpack-hotbar-container {
                    width: 95vw;
                    max-width: 160px;
                }
                .backpack-hotbar-title {
                    font-size: 6px;
                    padding: 2px 4px;
                }
                .backpack-hotbar-grid {
                    gap: 1px;
                    padding: 2px;
                }
                .backpack-hotbar-slot {
                    width: var(--backpack-hotbar-size);
                    height: var(--backpack-hotbar-size);
                }
                .backpack-hotbar-slot-icon {
                    width: 7px;
                    height: 7px;
                }
                .backpack-hotbar-slot-content {
                    font-size: 5px;
                }
                .backpack-obstacle-text {
                    font-size: 5px !important;
                    padding: 0 1px !important;
                    max-width: 100% !important;
                    max-height: 10px !important;
                    white-space: nowrap !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    text-align: center !important;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .backpack-slot-content {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden !important;
                }
            }
        `;
        style.textContent += `
            /* --- FORCE 4 COLUMNS ON MOBILE, HIGHEST SPECIFICITY --- */
            @media (max-width: 768px) {
                #block-inventory-ui .backpack-grid,
                .backpack-overlay .backpack-grid,
                .backpack-container .backpack-grid {
                    grid-template-columns: repeat(4, 1fr) !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Make it globally available as a singleton instance
window.BlockInventoryPanel = new BlockInventoryPanel(); 