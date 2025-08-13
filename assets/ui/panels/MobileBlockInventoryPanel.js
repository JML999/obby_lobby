/**
 * Mobile Block Inventory Panel - Mobile-scaled version of BlockInventoryPanel
 * EXACT same layout and functionality as desktop, just scaled down for mobile
 */
class MobileBlockInventoryPanel {
    constructor() {
        this.container = null;
        this.inventoryOpen = false;
        this.inventoryElement = null;
        this.selectedBlock = null;
        this.availableBlocks = [];
        this.availableObstacles = [];
        this.mouseFollower = null;
        this.heldBlock = null;
        this.selectedHotbarSlot = 2; // Start with first editable slot (slot 2 after backpack and save)
        this.currentTab = 'blocks'; // 'blocks', 'beams', 'platforms', or 'obstacles'
        this.selectedBlockDescription = null; // For description panel
        this.currentMechanicalCategory = 'beam'; // 'beam' or 'platform' - tracks last selected mechanical type
        
        // State management
        this.currentPlayerState = 'LOBBY';
        this.isEnabled = false;
        this.playerLevel = 1; // Store player level for prefill checks
        
        // Define available blocks and obstacles
        this.initializeBlocks();
        this.initializeObstacles();
    }

    initialize(containerId) {
        console.log('[MobileBlockInventoryPanel] Initializing mobile inventory');
        
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
                    this.onPlayerStateChanged(data.state, data.plotIndex, data.playerLevel);
                }
            });
        }
        
        console.log('[MobileBlockInventoryPanel] Mobile inventory initialized');
    }

    onPlayerStateChanged(newState, plotIndex, playerLevel) {
        console.log('[MobileBlockInventoryPanel] Player state changed to:', newState, 'plotIndex:', plotIndex, 'level:', playerLevel);
        this.currentPlayerState = newState;
        this.playerLevel = playerLevel; // Store the player level
        
        // Update prefab tab lock state based on level
        this.updatePrefabTabLock();
        
        // Only enable inventory when in building mode
        if (newState === 'BUILDING') {
            this.setEnabled(true);
            console.log('[MobileBlockInventoryPanel] Build mode activated - inventory enabled');
        } else {
            this.setEnabled(false);
            // Close inventory if it's open when exiting build mode
            if (this.inventoryOpen) {
                this.toggle(false);
            }
            console.log('[MobileBlockInventoryPanel] Exited build mode - inventory disabled');
        }
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
    }

    isInBuildMode() {
        return this.currentPlayerState === 'BUILDING' && this.isEnabled;
    }

    initializeBlocks() {
        // EXACT same blocks as desktop version
        this.availableBlocks = [
            // Required blocks (0 points)
            { id: 100, name: 'start', textureUri: 'blocks/start.png', cost: 0, type: 'start' },
            { id: 101, name: 'goal', textureUri: 'blocks/goal.png', cost: 0, type: 'goal' },
            
            // Basic movement blocks (1 point each)
            { id: 1, name: 'platform', textureUri: 'blocks/stone.png', cost: 1, type: 'platform' },
            { id: 17, name: 'sand', textureUri: 'blocks/sand.png', cost: 1, type: 'sand' },
            { id: 9, name: 'ice', textureUri: 'blocks/ice.png', cost: 1, type: 'ice' },
            
            // Hazard blocks (2 points each)
            { id: 21, name: 'lava', textureUri: 'blocks/lava.png', cost: 2, type: 'void-sand' },
            
            // Conveyor blocks (3 points each)
            { id: 104, name: 'conveyor-z-', textureUri: 'blocks/conveyor-z-.png', cost: 3, type: 'conveyor' },
            { id: 105, name: 'conveyor-z+', textureUri: 'blocks/conveyor-z+.png', cost: 3, type: 'conveyor' },
            { id: 109, name: 'conveyor-x-', textureUri: 'blocks/conveyor-x-.png', cost: 3, type: 'conveyor' },
            { id: 110, name: 'conveyor-x+', textureUri: 'blocks/conveyor-x+.png', cost: 3, type: 'conveyor' },
            
            // Special blocks (3 points each)
            { id: 15, name: 'vines', textureUri: 'blocks/oak-planks-leafyerer.png', cost: 1, type: 'vines' },
            { id: 6, name: 'glass', textureUri: 'blocks/glass.png', cost: 3, type: 'glass' },
            
            // Checkpoint block (5 points)
            { id: 102, name: 'checkpoint', textureUri: 'blocks/emerald-block.png', cost: 5, type: 'checkpoint' },
            
            // Mechanical blocks (5 points each)
            { id: 115, name: 'mechanical', textureUri: 'blocks/mechanical-wheel.png', cost: 5, type: 'mechanical' }
        ];
    }

    initializeObstacles() {
        // EXACT same obstacles as desktop version
        this.availableObstacles = [
            { id: 'bounce_pad_small', name: 'Bounce Pad', size: 'Small', type: 'bounce_pad', sizeId: 'small', icon: 'ui/icons/speed-icon.png', category: 'prefab' },
            { id: 'rotating_beam_small', name: 'Rotating Beam', size: 'Small', type: 'rotating_beam', sizeId: 'small', icon: 'ui/icons/speed-icon.png', category: 'prefab' },
            // Seesaw temporarily disabled for release
        ];
    }

    createInventoryUI() {
        this.inventoryElement = document.createElement('div');
        this.inventoryElement.id = 'mobile-block-inventory-ui';
        this.inventoryElement.className = 'mobile-backpack-overlay';
        this.inventoryElement.style.display = 'none';

        // EXACT same HTML structure as desktop version, just with "mobile-" prefix
        this.inventoryElement.innerHTML = `
            <!-- Main Container -->
            <div class="mobile-backpack-container">
                <div class="mobile-backpack-header">
                    <div class="mobile-backpack-info">
                        <div class="mobile-backpack-icon">🎒</div>
                        <div class="mobile-backpack-details">
                            <div class="mobile-backpack-name">Building Kit</div>
                            <div class="mobile-backpack-subtitle">Blocks & Obstacles</div>
                        </div>
                    </div>
                    <button class="mobile-backpack-close">×</button>
                </div>
                
                <div class="mobile-backpack-content">
                    <!-- Left Navigation Tabs -->
                    <div class="mobile-backpack-nav">
                        <button class="mobile-backpack-tab active" data-tab="blocks" title="Blocks">
                            <div class="mobile-tab-icon">🔲</div>
                            <div class="mobile-tab-label">Blocks</div>
                        </button>
                        <button class="mobile-backpack-tab" data-tab="obstacles" title="Prefabs">
                            <div class="mobile-tab-icon">⚡</div>
                            <div class="mobile-tab-label">Prefabs</div>
                        </button>
                    </div>

                    <!-- Main Content Area with Grid and Description Panel -->
                    <div class="mobile-backpack-main">
                        <div class="mobile-backpack-content-wrapper">
                            <!-- Block Grid -->
                            <div class="mobile-backpack-grid-container">
                                <div class="mobile-backpack-grid" id="mobile-block-inventory-grid">
                                    <!-- Grid slots will be generated by JavaScript -->
                                </div>
                            </div>
                            
                            <!-- Description Panel -->
                            <div class="mobile-backpack-description-panel" id="mobile-block-description-panel">
                                <div class="mobile-description-header">
                                    <h3>Select a Block</h3>
                                </div>
                                <div class="mobile-description-content">
                                    <p>Choose a block from the grid to see its description and usage information.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Hotbar Container -->
            <div class="mobile-backpack-hotbar-container">
                <div class="mobile-backpack-hotbar-header">
                    <h3 class="mobile-backpack-hotbar-title">Hotbar</h3>
                </div>
                <div class="mobile-backpack-hotbar-grid" id="mobile-backpack-hotbar-grid">
                    <!-- Hotbar slots will be generated by JavaScript -->
                </div>
            </div>
        `;

        document.body.appendChild(this.inventoryElement);
        this.generateBlockGrid();
        this.generateHotbarPreview();
    }

    generateBlockGrid() {
        const grid = document.getElementById('mobile-block-inventory-grid');
        grid.innerHTML = '';

        let items = [];
        switch (this.currentTab) {
            case 'blocks':
                items = this.availableBlocks;
                break;
            case 'obstacles':
                items = this.availableObstacles;
                break;
            default:
                items = this.availableBlocks;
        }

        // Show all items (no limit - grid will auto-expand with auto rows)
        items.forEach((item, index) => {
            // All blocks and mechanical blocks are available to all players at all levels
            const isUnlocked = true;
            
            const slot = document.createElement('div');
            slot.className = `mobile-backpack-slot ${!isUnlocked ? 'locked' : ''}`;
            slot.dataset.itemId = item.id;
            slot.dataset.itemName = item.name;
            slot.dataset.itemType = this.currentTab;
            slot.title = item.name;

            const content = document.createElement('div');
            content.className = 'mobile-backpack-slot-content';

            if (this.currentTab === 'blocks') {
                // Traditional block display
                const blockImage = document.createElement('img');
                blockImage.className = `mobile-backpack-item-icon ${!isUnlocked ? 'locked-icon' : ''}`;
                blockImage.src = this.getBlockIconPath(item);
                blockImage.alt = item.name;
                content.appendChild(blockImage);
                
                // Add lock overlay for locked items
                if (!isUnlocked) {
                    const lockOverlay = document.createElement('div');
                    lockOverlay.className = 'mobile-lock-overlay';
                    lockOverlay.innerHTML = '🔒';
                    content.appendChild(lockOverlay);
                }
            } else {
                // Legacy obstacle display with text name
                const obstacleText = document.createElement('div');
                obstacleText.className = 'mobile-backpack-obstacle-text';
                obstacleText.textContent = item.name;
                content.appendChild(obstacleText);

                // Add size label for obstacles
                const sizeLabel = document.createElement('div');
                sizeLabel.className = 'mobile-obstacle-size-label';
                sizeLabel.textContent = item.size || 'STD';
                content.appendChild(sizeLabel);
            }

            slot.appendChild(content);
            grid.appendChild(slot);
        });
    }

    generateHotbarPreview() {
        const grid = document.getElementById('mobile-backpack-hotbar-grid');
        grid.innerHTML = '';

        for (let i = 0; i < 6; i++) {
            const slot = document.createElement('div');
            slot.className = 'mobile-backpack-hotbar-slot';
            slot.dataset.hotbarIndex = i;
            
            // Mark currently selected slot (only for editable slots 2-5)
            if (i === this.selectedHotbarSlot && i >= 2) {
                slot.classList.add('selected');
            }

            const content = document.createElement('div');
            content.className = 'mobile-backpack-hotbar-slot-content';
            
            // Slot 0 is for backpack action (toggle inventory)
            if (i === 0) {
                slot.classList.add('mobile-backpack-action-slot', 'mobile-backpack-toggle-slot');
                const actionIcon = document.createElement('span');
                actionIcon.className = 'mobile-backpack-action-icon';
                actionIcon.textContent = '🎒';
                actionIcon.title = 'Toggle Inventory';
                content.appendChild(actionIcon);
            }
            // Slot 1 is for save action
            else if (i === 1) {
                slot.classList.add('mobile-backpack-action-slot', 'mobile-save-action-slot');
                const actionIcon = document.createElement('span');
                actionIcon.className = 'mobile-backpack-action-icon';
                actionIcon.textContent = '💾';
                actionIcon.title = 'Save';
                content.appendChild(actionIcon);
            } else {
                // Slots 2-5 are editable slots
                content.textContent = i;
            }

            slot.appendChild(content);
            grid.appendChild(slot);
        }
    }

    createMouseFollower() {
        this.mouseFollower = document.createElement('div');
        this.mouseFollower.id = 'mobile-block-mouse-follower';
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
        const closeBtn = this.inventoryElement.querySelector('.mobile-backpack-close');
        closeBtn.addEventListener('click', () => this.toggle(false));

        // Tab switching
        const tabButtons = this.inventoryElement.querySelectorAll('.mobile-backpack-tab');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Block selection from backpack grid (touch events for mobile)
        const grid = document.getElementById('mobile-block-inventory-grid');
        grid.addEventListener('click', (e) => {
            const slot = e.target.closest('.mobile-backpack-slot');
            if (slot) {
                this.selectItem(slot);
            }
        });

        // Hotbar preview interaction
        const hotbarGrid = document.getElementById('mobile-backpack-hotbar-grid');
        
        // Hotbar slot selection
        hotbarGrid.addEventListener('click', (e) => {
            const slot = e.target.closest('.mobile-backpack-hotbar-slot');
            if (slot) {
                const slotIndex = parseInt(slot.dataset.hotbarIndex);
                
                // Handle action slots
                if (slotIndex === 0) {
                    // Backpack toggle action
                    console.log('[MobileBlockInventoryPanel] Backpack toggle clicked');
                    this.toggle();
                    return;
                } else if (slotIndex === 1) {
                    // Save action
                    console.log('[MobileBlockInventoryPanel] Save action clicked');
                    if (window.HotbarPanel) {
                        window.HotbarPanel.handleActionButton('saveCourse');
                    }
                    return;
                }
                
                // Only allow selecting editable slots (2-5)
                if (slotIndex >= 2) {
                    this.selectHotbarSlot(slotIndex);
                }
            }
        });

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.inventoryOpen) {
                this.toggle(false);
            }
        });
    }

    switchTab(tabName) {
        // Check if trying to access prefabs tab without sufficient level
        if (tabName === 'obstacles' && this.playerLevel < 5) {
            // Show level requirement message
            if (window.hytopia && window.hytopia.sendData) {
                window.hytopia.sendData({
                    type: 'showMessage',
                    message: '🔒 Prefabs unlock at Level 5! Keep building courses to level up.',
                    color: 'FFD700',
                    duration: 3000
                });
            }
            return; // Prevent tab switch
        }
        
        // Update active tab
        document.querySelectorAll('.mobile-backpack-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        this.currentTab = tabName;
        this.generateBlockGrid();
        console.log(`[MobileBlockInventoryPanel] Switched to ${tabName} tab`);
    }

    updatePrefabTabLock() {
        const prefabTab = this.inventoryElement.querySelector('[data-tab="obstacles"]');
        if (!prefabTab) return;
        
        if (this.playerLevel < 5) {
            // Add lock styling
            prefabTab.classList.add('mobile-prefab-locked');
            prefabTab.title = 'Prefabs unlock at Level 5';
            
            // Add lock icon overlay
            if (!prefabTab.querySelector('.mobile-lock-overlay')) {
                const lockOverlay = document.createElement('div');
                lockOverlay.className = 'mobile-lock-overlay';
                lockOverlay.innerHTML = '🔒';
                prefabTab.appendChild(lockOverlay);
            }
            
            // Switch away from obstacles tab if currently selected
            if (this.currentTab === 'obstacles') {
                this.switchTab('blocks');
            }
        } else {
            // Remove lock styling
            prefabTab.classList.remove('mobile-prefab-locked');
            prefabTab.title = 'Prefabs';
            
            // Remove lock icon overlay
            const lockOverlay = prefabTab.querySelector('.mobile-lock-overlay');
            if (lockOverlay) {
                lockOverlay.remove();
            }
        }
    }

    selectItem(slot) {
        // Check if item is locked
        if (slot.classList.contains('locked')) {
            console.log('[MobileBlockInventoryPanel] Cannot select locked item');
            return;
        }
        
        // Remove previous selection
        const previousSelected = this.inventoryElement.querySelector('.mobile-backpack-slot.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }

        // Select new item
        slot.classList.add('selected');
        
        const itemId = slot.dataset.itemId;
        const itemName = slot.dataset.itemName;
        const itemType = slot.dataset.itemType;

        // Update description panel
        this.updateDescriptionPanel(itemId, itemType);

        let selectedItem = null;
        
        if (itemType === 'blocks') {
            selectedItem = this.availableBlocks.find(b => b.id == itemId);
            this.selectedBlock = {
                id: parseInt(itemId),
                name: itemName
            };
        } else {
            // Legacy obstacles
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
                // Legacy obstacles
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
            this.updateHotbarPreview();
            
            console.log('[MobileBlockInventoryPanel] Updated hotbar slot', this.selectedHotbarSlot, 'with item:', hotbarItem);
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

        console.log('[MobileBlockInventoryPanel] Selected item:', this.selectedBlock);
    }

    selectHotbarSlot(slotIndex) {
        // Only allow selecting editable slots (2-5)
        if (slotIndex < 2) {
            console.log('[MobileBlockInventoryPanel] Cannot select action slot:', slotIndex);
            return;
        }
        
        // Update local selection
        this.selectedHotbarSlot = slotIndex;
        
        // Update visual selection in inventory hotbar preview
        const hotbarSlots = this.inventoryElement.querySelectorAll('.mobile-backpack-hotbar-slot');
        hotbarSlots.forEach((slot, index) => {
            if (index === slotIndex) {
                slot.classList.add('selected');
            } else {
                slot.classList.remove('selected');
            }
        });
        
        // Also update the actual hotbar selection
        if (window.HotbarPanel) {
            window.HotbarPanel.selectSlot(slotIndex);
        }
        
        console.log('[MobileBlockInventoryPanel] Selected hotbar slot:', slotIndex);
    }

    updateHotbarPreview() {
        if (!window.HotbarPanel) return;

        // Get current hotbar state
        const hotbarSlots = window.HotbarPanel.getHotbarSlots() || [];

        // Update each hotbar slot in the inventory preview
        for (let i = 0; i < 6; i++) {
            const hotbarSlot = this.inventoryElement.querySelector(`[data-hotbar-index="${i}"]`);
            if (hotbarSlot) {
                const content = hotbarSlot.querySelector('.mobile-backpack-hotbar-slot-content');
                content.innerHTML = '';

                // Update selection indicator based on locally selected slot (only for editable slots 2-5)
                if (i === this.selectedHotbarSlot && i >= 2) {
                    hotbarSlot.classList.add('selected');
                } else {
                    hotbarSlot.classList.remove('selected');
                }

                // Slot 0 is for backpack action (toggle inventory)
                if (i === 0) {
                    hotbarSlot.classList.add('mobile-backpack-action-slot', 'mobile-backpack-toggle-slot');
                    const actionIcon = document.createElement('span');
                    actionIcon.className = 'mobile-backpack-action-icon';
                    actionIcon.textContent = '🎒';
                    actionIcon.title = 'Toggle Inventory';
                    content.appendChild(actionIcon);
                }
                // Slot 1 is for save action
                else if (i === 1) {
                    hotbarSlot.classList.add('mobile-backpack-action-slot', 'mobile-save-action-slot');
                    const actionIcon = document.createElement('span');
                    actionIcon.className = 'mobile-backpack-action-icon';
                    actionIcon.textContent = '💾';
                    actionIcon.title = 'Save';
                    content.appendChild(actionIcon);
                } else {
                    // Slots 2-5 show blocks if present, otherwise show slot number
                    const block = hotbarSlots[i];
                    if (block) {
                        const blockImage = document.createElement('img');
                        blockImage.className = 'mobile-backpack-hotbar-slot-icon';
                        blockImage.src = this.getBlockIconPath(block);
                        blockImage.alt = block.name;
                        content.appendChild(blockImage);
                    } else {
                        content.textContent = i;
                    }
                }
            }
        }
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
            // Sync local hotbar selection with game hotbar when opening
            if (window.HotbarPanel) {
                const gameSelectedSlot = window.HotbarPanel.getSelectedSlotIndex();
                // Ensure the selected slot is valid for our new layout (2-5)
                if (gameSelectedSlot >= 2) {
                    this.selectedHotbarSlot = gameSelectedSlot;
                } else {
                    // If the game has an invalid slot selected, default to slot 2
                    this.selectedHotbarSlot = 2;
                }
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

        console.log('[MobileBlockInventoryPanel] Mobile inventory:', this.inventoryOpen ? 'opened' : 'closed');
    }

    updateDescriptionPanel(itemId, itemType) {
        const descriptionPanel = document.getElementById('mobile-block-description-panel');
        if (!descriptionPanel) return;

        let item = null;
        
        // Find the item based on type and ID
        switch (itemType) {
            case 'blocks':
                item = this.availableBlocks.find(b => b.id == itemId);
                break;
            case 'obstacles':
                item = this.availableObstacles.find(o => o.id === itemId);
                break;
        }

        if (!item) {
            descriptionPanel.innerHTML = `
                <div class="mobile-description-header">
                    <h3>Item Not Found</h3>
                </div>
                <div class="mobile-description-content">
                    <p>Could not find information for this item.</p>
                </div>
            `;
            return;
        }

        // Create description content based on item type
        let descriptionHTML = '';
        
        if (itemType === 'blocks') {
            // Simple description for regular blocks
            const blockDescription = this.getBlockDescription(item);
            descriptionHTML = `
                <div class="mobile-description-header">
                    <div class="mobile-description-title-row">
                        <div class="mobile-description-block-preview">
                            <img src="${this.getBlockIconPath(item)}" alt="${item.name}">
                        </div>
                        <div class="mobile-description-title-info">
                            <h3>${item.name}</h3>
                            <div class="mobile-description-category">BLOCK • ${item.cost} POINTS</div>
                        </div>
                    </div>
                </div>
                <div class="mobile-description-content">
                    <div class="mobile-description-text">
                        <p>${blockDescription}</p>
                    </div>
                </div>
            `;
        } else {
            // Prefab obstacles
            descriptionHTML = `
                <div class="mobile-description-header">
                    <h3>${item.name}</h3>
                    <div class="mobile-description-category">PREFAB • ${item.size}</div>
                </div>
                <div class="mobile-description-content">
                    <div class="mobile-description-text">
                        <p>Prefab obstacle element that can be placed in your course.</p>
                    </div>
                </div>
            `;
        }

        descriptionPanel.innerHTML = descriptionHTML;
    }

    getBlockDescription(block) {
        const descriptions = {
            'start': 'The starting point for your obby course. Players spawn here when they begin or respawn.',
            'goal': 'The finish line! Players must reach this block to complete your obby course.',
            'checkpoint': 'A checkpoint block. Players can respawn here if they fall after touching it.',
            'platform': 'A solid stone platform. The most basic building block for creating paths and structures.',
            'sand': 'A sandy platform that slows down player movement. Good for creating challenging sections that require careful timing.',
            'ice': 'A slippery ice block. Players will slide when walking on this surface, adding challenge.',
            'lava': 'A dangerous lava block. Players will be eliminated if they touch this hazard!',
            'vines': 'Climbable vines on wooden planks. Players can climb up these surfaces.',
            'glass': 'Fragile transparent blocks that break after being touched once. Perfect for one-time-use platforms and advanced parkour tricks.',
            'conveyor-z-': 'Moves players backward automatically when stepped on.',
            'conveyor-z+': 'Moves players forward automatically when stepped on.',
            'conveyor-x-': 'Moves players left automatically when stepped on.',
            'conveyor-x+': 'Moves players right automatically when stepped on.',
            'mechanical': 'Place dynamic moving blocks in your course! Configure different movement types: elevators (up/down), carousels (rotating), side-to-side motion, pistons (extending/retracting), and wheels (spinning platforms). Players can ride and interact with these animated elements.'
        };
        
        return descriptions[block.name] || 'A building block for your obby course.';
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
        style.id = 'mobile-inventory-styles';
        style.textContent = `
            /* Mobile Block Inventory - Scaled down desktop version */
            .mobile-backpack-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 2000;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                user-select: none;
                gap: 6px;
                padding: 10px;
                overflow-y: auto;
            }

            /* Container Styles - Scaled down */
            .mobile-backpack-container {
                background: linear-gradient(145deg, #2a2a2a, #1e1e1e);
                border: 2px solid #444;
                border-radius: 8px;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                width: 90vw;
                max-width: 400px;
                height: 200px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                margin-bottom: 4px;
            }

            .mobile-backpack-hotbar-container {
                background: linear-gradient(145deg, #2a2a2a, #1e1e1e);
                border: 2px solid #444;
                border-radius: 8px;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                width: 90vw;
                max-width: 400px;
                padding: 4px;
            }

            /* Header Styles - Scaled down */
            .mobile-backpack-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 8px;
                background: linear-gradient(135deg, #3a3a3a, #2d2d2d);
                border-bottom: 1px solid #444;
                border-radius: 6px 6px 0 0;
            }

            .mobile-backpack-info {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .mobile-backpack-icon {
                width: 20px;
                height: 20px;
                background: rgba(0, 0, 0, 0.6);
                border: 1px solid #444;
                border-radius: 3px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
            }

            .mobile-backpack-details {
                display: flex;
                flex-direction: column;
            }

            .mobile-backpack-name {
                font-size: 9px;
                font-weight: 600;
                color: #ffffff;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
                line-height: 1;
            }

            .mobile-backpack-subtitle {
                font-size: 7px;
                font-weight: 500;
                color: #cccccc;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
                margin-top: 1px;
                letter-spacing: 0.2px;
            }

            .mobile-backpack-hotbar-title {
                margin: 0;
                font-size: 10px;
                font-weight: 600;
                color: #ffffff;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
                letter-spacing: 0.2px;
            }

            .mobile-backpack-close {
                background: rgba(255, 0, 0, 0.2);
                border: 1px solid rgba(255, 0, 0, 0.3);
                border-radius: 3px;
                color: #ff6b6b;
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .mobile-backpack-close:hover {
                background: rgba(255, 0, 0, 0.3);
                transform: scale(1.05);
            }

            /* Content Layout */
            .mobile-backpack-content {
                display: flex;
                flex: 1;
                overflow: hidden;
            }

            /* Navigation Tabs - Vertical sidebar (scaled down) */
            .mobile-backpack-nav {
                background: linear-gradient(135deg, #3a3a3a, #2d2d2d);
                border-right: 1px solid #444;
                display: flex;
                flex-direction: column;
                padding: 2px 1px;
                gap: 1px;
                width: 32px;
                flex-shrink: 0;
            }

            .mobile-backpack-tab {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 4px 2px;
                background: transparent;
                border: 1px solid transparent;
                border-radius: 3px;
                cursor: pointer;
                transition: all 0.2s ease;
                gap: 1px;
                min-height: 36px;
            }

            .mobile-backpack-tab:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: #555;
            }

            .mobile-backpack-tab.active {
                background: rgba(0, 0, 0, 0.6);
                border-color: #4CAF50;
                box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.3);
            }

            .mobile-tab-icon {
                font-size: 12px;
                opacity: 0.7;
                transition: opacity 0.2s ease;
            }

            .mobile-tab-label {
                font-size: 5px;
                font-weight: 600;
                color: #cccccc;
                text-align: center;
                line-height: 1;
            }

            .mobile-backpack-tab:hover .mobile-tab-icon,
            .mobile-backpack-tab.active .mobile-tab-icon {
                opacity: 1;
            }

            .mobile-backpack-tab.active .mobile-tab-label {
                color: #4CAF50;
            }

            /* Main Content */
            .mobile-backpack-main {
                flex: 1;
                padding: 6px;
                overflow: hidden;
            }

            .mobile-backpack-content-wrapper {
                display: flex;
                gap: 6px;
                height: 100%;
            }

            .mobile-backpack-grid-container {
                flex: 2;
                height: 100%;
                min-height: 80px;
            }

            /* Description Panel - Scaled down */
            .mobile-backpack-description-panel {
                width: 140px;
                background: rgba(15, 15, 30, 0.95);
                border: 1px solid #555;
                border-radius: 4px;
                padding: 0;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6);
                max-height: 90px;
            }

            .mobile-description-header {
                background: linear-gradient(135deg, #4a4a4a, #3d3d3d);
                padding: 4px 6px;
                border-bottom: 1px solid #555;
            }

            .mobile-description-title-row {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .mobile-description-block-preview {
                width: 18px;
                height: 18px;
                background: rgba(0, 0, 0, 0.6);
                border: 1px solid #444;
                border-radius: 2px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.7);
            }

            .mobile-description-block-preview img {
                width: 14px;
                height: 14px;
                object-fit: contain;
                image-rendering: pixelated;
            }

            .mobile-description-title-info h3 {
                margin: 0;
                font-size: 8px;
                font-weight: 600;
                color: #ffffff;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
                letter-spacing: 0.1px;
            }

            .mobile-description-category {
                font-size: 5px;
                font-weight: 600;
                color: #64B5F6;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
                margin-top: 1px;
                text-transform: uppercase;
                letter-spacing: 0.2px;
            }

            .mobile-description-content {
                flex: 1;
                padding: 4px 6px;
                overflow-y: auto;
                background: rgba(0, 0, 0, 0.1);
            }

            .mobile-description-text p {
                margin: 0;
                font-size: 6px;
                line-height: 1.3;
                color: #cccccc;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
            }

            /* Grid Styles - Scaled down */
            .mobile-backpack-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                grid-template-rows: auto;
                gap: 3px;
                background: rgba(0, 0, 0, 0.3);
                padding: 6px;
                border: 1px solid #444;
                border-radius: 6px;
                box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5);
                min-height: 80px;
                height: fit-content;
                align-content: start;
                overflow-y: auto;
            }

            .mobile-backpack-hotbar-grid {
                display: grid;
                grid-template-columns: repeat(6, 1fr);
                gap: 3px;
                background: rgba(0, 0, 0, 0.3);
                padding: 6px;
                border-radius: 0 0 6px 6px;
                box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5);
                justify-items: center;
                max-width: 100%;
            }

            /* Slot Styles - Touch-friendly sizes */
            .mobile-backpack-slot {
                width: 36px;
                height: 36px;
                background: rgba(0, 0, 0, 0.6);
                border: 1px solid #333;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
                box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.7);
            }

            .mobile-backpack-hotbar-slot {
                width: 36px;
                height: 36px;
                background: rgba(0, 0, 0, 0.6);
                border: 1px solid #333;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
                box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.7);
            }

            /* Slot Hover & Highlight States */
            .mobile-backpack-slot:hover,
            .mobile-backpack-hotbar-slot:hover {
                border-color: #555;
                background: rgba(0, 0, 0, 0.8);
                transform: translateY(-1px);
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.7), 0 2px 8px rgba(0, 0, 0, 0.5);
            }

            .mobile-backpack-slot.selected,
            .mobile-backpack-hotbar-slot.selected {
                border-color: #4CAF50 !important;
                background: rgba(76, 175, 80, 0.2) !important;
                box-shadow: 0 0 10px rgba(76, 175, 80, 0.5) !important;
            }

            .mobile-backpack-slot.locked {
                background: rgba(139, 69, 19, 0.3);
                border-color: #8B4513;
                cursor: not-allowed;
                opacity: 0.7;
            }

            .mobile-backpack-item-icon.locked-icon {
                opacity: 0.4;
                filter: grayscale(100%) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            .mobile-lock-overlay {
                position: absolute;
                top: 2px;
                right: 2px;
                font-size: 8px;
                color: #FFD700;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
                z-index: 1;
            }

            /* Content Styles */
            .mobile-backpack-slot-content,
            .mobile-backpack-hotbar-slot-content {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: #ccc;
                position: relative;
            }

            .mobile-backpack-hotbar-slot-content {
                font-size: 14px;
                font-weight: 600;
                color: #888;
            }

            .mobile-backpack-item-icon {
                width: 28px;
                height: 28px;
                object-fit: contain;
                image-rendering: pixelated;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            .mobile-backpack-obstacle-text {
                font-weight: 800;
                font-size: 6px;
                color: #ffffff;
                text-align: center;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
                line-height: 1.1;
                padding: 1px;
                text-transform: uppercase;
                letter-spacing: 0.2px;
                word-wrap: break-word;
                max-width: 32px;
                max-height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }

            .mobile-backpack-hotbar-slot-icon {
                width: 28px;
                height: 28px;
                object-fit: contain;
                image-rendering: pixelated;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            /* Obstacle Size Label */
            .mobile-obstacle-size-label {
                position: absolute;
                bottom: 2px;
                right: 2px;
                background: rgba(0, 0, 0, 0.8);
                color: #ffffff;
                font-weight: 700;
                font-size: 7px;
                padding: 1px 2px;
                border-radius: 2px;
                line-height: 1;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.2);
                min-width: 8px;
                text-align: center;
                pointer-events: none;
            }

            /* Action Icon Styling for Hotbar Preview */
            .mobile-backpack-action-icon {
                font-size: 16px;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
                pointer-events: none;
            }

            /* Special Slots for Hotbar Preview */
            .mobile-backpack-action-slot {
                background: rgba(0, 0, 0, 0.6);
                border: 2px solid #444;
                border-radius: 6px;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .mobile-backpack-action-slot:hover {
                border-color: #555;
                background: rgba(0, 0, 0, 0.8);
                transform: translateY(-1px);
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.7), 0 2px 8px rgba(0, 0, 0, 0.5);
            }

            .mobile-backpack-toggle-slot {
                border-color: #4CAF50;
                background: rgba(76, 175, 80, 0.2);
                box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
            }

            .mobile-save-action-slot {
                border-color: #ff6b6b;
                background: rgba(255, 107, 107, 0.2);
                box-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
            }

            /* Mouse Follower */
            #mobile-block-mouse-follower {
                position: fixed;
                width: 44px;
                height: 44px;
                pointer-events: none;
                z-index: 10000;
                display: none;
                align-items: center;
                justify-content: center;
                background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
                border: 2px solid #555;
                border-radius: 8px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.9);
                transform: translate(-50%, -50%);
            }

            /* Scrollbar */
            .mobile-backpack-grid::-webkit-scrollbar {
                width: 4px;
            }

            .mobile-backpack-grid::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.3);
                border-radius: 2px;
            }

            .mobile-backpack-grid::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.3);
                border-radius: 2px;
            }

            .mobile-backpack-grid::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.5);
            }
            
            /* Mobile Prefab Lock Styles */
            .mobile-backpack-tab.mobile-prefab-locked {
                opacity: 0.5;
                cursor: not-allowed;
                position: relative;
            }
            
            .mobile-backpack-tab.mobile-prefab-locked:hover {
                opacity: 0.6;
                transform: none;
            }
            
            .mobile-lock-overlay {
                position: absolute;
                top: 1px;
                right: 1px;
                font-size: 8px;
                color: #FFD700;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
                z-index: 10;
                pointer-events: none;
            }
        `;
        
        document.head.appendChild(style);
    }
}

// Make it globally available as a singleton instance
window.MobileBlockInventoryPanel = new MobileBlockInventoryPanel();