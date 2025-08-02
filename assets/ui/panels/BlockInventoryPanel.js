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
                    this.onPlayerStateChanged(data.state, data.plotIndex, data.playerLevel);
                }
            });
        }
        
        console.log('[BlockInventoryPanel] Initialized successfully.');
    }


    onPlayerStateChanged(newState, plotIndex, playerLevel) {
        console.log('[BlockInventoryPanel] Player state changed to:', newState, 'plotIndex:', plotIndex, 'level:', playerLevel);
        this.currentPlayerState = newState;
        this.playerLevel = playerLevel; // Store the player level
        
        // Only enable inventory when in building mode
        if (newState === 'BUILDING') {
            this.setEnabled(true);
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
            
            // Mechanical blocks (5 points each)
            { id: 115, name: 'mechanical', textureUri: 'blocks/iron-ore.png', cost: 5, type: 'mechanical' }
        ];
    }

    initializeObstacles() {
        // Keep old obstacles for compatibility - renamed from legacy to prefabs
        this.availableObstacles = [
            { id: 'bounce_pad_small', name: 'Bounce Pad', size: 'Small', type: 'bounce_pad', sizeId: 'small', icon: 'ui/icons/speed-icon.png', category: 'prefab' },
            { id: 'rotating_beam_small', name: 'Rotating Beam', size: 'Small', type: 'rotating_beam', sizeId: 'small', icon: 'ui/icons/speed-icon.png', category: 'prefab' },
            { id: 'seesaw', name: 'Seesaw', size: 'Standard', type: 'seesaw', sizeId: 'standard', icon: 'ui/icons/speed-icon.png', category: 'prefab' }
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
                            <div class="backpack-subtitle">Blocks & Obstacles</div>
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
                        <button class="backpack-tab" data-tab="obstacles" title="Prefabs">
                            <div class="tab-icon">⚡</div>
                            <div class="tab-label">Prefabs</div>
                        </button>
                    </div>

                    <!-- Main Content Area with Grid and Description Panel -->
                    <div class="backpack-main">
                        <div class="backpack-content-wrapper">
                            <!-- Block Grid -->
                            <div class="backpack-grid-container">
                                <div class="backpack-grid" id="block-inventory-grid">
                                    <!-- Grid slots will be generated by JavaScript -->
                                </div>
                            </div>
                            
                            <!-- Description Panel -->
                            <div class="backpack-description-panel" id="block-description-panel">
                                <div class="description-header">
                                    <h3>Select a Block</h3>
                                </div>
                                <div class="description-content">
                                    <p>Choose a block from the grid to see its description and usage information.</p>
                                </div>
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
        
        console.log(`[DEBUG] Current tab: ${this.currentTab}`);
        console.log(`[DEBUG] Player level: ${this.playerLevel}`);
        console.log(`[DEBUG] Total items to process: ${items.length}`);
        console.log(`[DEBUG] All items:`, items);

        // Show all items (no limit - grid will auto-expand with auto rows)
        items.forEach((item, index) => {
            console.log(`[DEBUG] Processing item ${index}:`, item);
            
            // All blocks and mechanical blocks are available to all players at all levels
            const isUnlocked = true;
            
            const slot = document.createElement('div');
            slot.className = `backpack-slot ${!isUnlocked ? 'locked' : ''}`;
            slot.dataset.itemId = item.id;
            slot.dataset.itemName = item.name;
            slot.dataset.itemType = this.currentTab;
            slot.title = item.name; // All blocks available at all levels
            
            console.log(`[DEBUG] Slot created with dataset:`, slot.dataset);

            const content = document.createElement('div');
            content.className = 'backpack-slot-content';

            if (this.currentTab === 'blocks') {
                // Traditional block display
                const blockImage = document.createElement('img');
                blockImage.className = `backpack-item-icon ${!isUnlocked ? 'locked-icon' : ''}`;
                blockImage.src = this.getBlockIconPath(item);
                blockImage.alt = item.name;
                content.appendChild(blockImage);
                
                // Add lock overlay for locked items
                if (!isUnlocked) {
                    const lockOverlay = document.createElement('div');
                    lockOverlay.className = 'lock-overlay';
                    lockOverlay.innerHTML = '🔒';
                    content.appendChild(lockOverlay);
                }
            } else if (this.currentTab === 'beams' || this.currentTab === 'platforms') {
                // New colored block display for mechanical items
                const coloredBlock = document.createElement('div');
                coloredBlock.className = 'mechanical-block-icon';
                coloredBlock.style.backgroundColor = item.blockColor;
                
                // Add movement symbol
                const symbol = document.createElement('div');
                symbol.className = 'block-symbol';
                symbol.textContent = item.symbol;
                coloredBlock.appendChild(symbol);
                
                content.appendChild(coloredBlock);
            } else {
                // Legacy obstacle display with text name
                const obstacleText = document.createElement('div');
                obstacleText.className = 'backpack-obstacle-text';
                obstacleText.textContent = item.name;
                content.appendChild(obstacleText);

                // Add size label for obstacles
                const sizeLabel = document.createElement('div');
                sizeLabel.className = 'obstacle-size-label';
                sizeLabel.textContent = item.size || 'STD';
                content.appendChild(sizeLabel);
            }

            slot.appendChild(content);
            grid.appendChild(slot);
            
            console.log(`[DEBUG] Successfully added slot to grid for ${item.name} (ID: ${item.id}) at index ${index}`);
            console.log(`[DEBUG] Slot position in grid: row ${Math.floor(index / 6) + 1}, column ${(index % 6) + 1}`);
        });
        
        console.log(`[DEBUG] Grid generation complete. Total DOM children in grid: ${grid.children.length}`);
        console.log(`[DEBUG] Grid children details:`, Array.from(grid.children).map(child => ({
            className: child.className,
            itemId: child.dataset.itemId,
            itemName: child.dataset.itemName
        })));
    }

    generateHotbarPreview() {
        const grid = document.getElementById('backpack-hotbar-grid');
        grid.innerHTML = '';

        for (let i = 0; i < 6; i++) {
            const slot = document.createElement('div');
            slot.className = 'backpack-hotbar-slot';
            slot.dataset.hotbarIndex = i;
            
            // Mark currently selected slot (only for editable slots 2-5)
            if (i === this.selectedHotbarSlot && i >= 2) {
                slot.classList.add('selected');
            }

            const content = document.createElement('div');
            content.className = 'backpack-hotbar-slot-content';
            
            // Slot 0 is for backpack action (toggle inventory)
            if (i === 0) {
                slot.classList.add('backpack-action-slot', 'backpack-toggle-slot');
                const actionIcon = document.createElement('span');
                actionIcon.className = 'backpack-action-icon';
                actionIcon.textContent = '🎒';
                actionIcon.title = 'Toggle Inventory';
                content.appendChild(actionIcon);
            }
            // Slot 1 is for save action
            else if (i === 1) {
                slot.classList.add('backpack-action-slot', 'save-action-slot');
                const actionIcon = document.createElement('span');
                actionIcon.className = 'backpack-action-icon';
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
            console.log('[DEBUG] Grid click detected, target:', e.target);
            console.log('[DEBUG] Target className:', e.target.className);
            console.log('[DEBUG] Target tagName:', e.target.tagName);
            console.log('[DEBUG] Target parent:', e.target.parentElement);
            console.log('[DEBUG] Click coordinates:', e.clientX, e.clientY);
            
            const slot = e.target.closest('.backpack-slot');
            console.log('[DEBUG] Found slot:', slot);
            
            if (slot) {
                console.log('[DEBUG] Slot dataset:', slot.dataset);
                console.log('[DEBUG] Slot itemId:', slot.dataset.itemId);
                console.log('[DEBUG] Slot itemName:', slot.dataset.itemName);
                console.log('[DEBUG] Calling selectItem for slot:', slot.dataset);
                this.selectItem(slot);
            } else {
                console.log('[DEBUG] No slot found for click target');
                console.log('[DEBUG] All grid children:', grid.children);
                console.log('[DEBUG] Grid innerHTML length:', grid.innerHTML.length);
            }
        });

        // Hotbar preview interaction (drag from backpack to hotbar)
        const hotbarGrid = document.getElementById('backpack-hotbar-grid');
        
        // Hotbar slot selection
        hotbarGrid.addEventListener('click', (e) => {
            const slot = e.target.closest('.backpack-hotbar-slot');
            if (slot) {
                const slotIndex = parseInt(slot.dataset.hotbarIndex);
                
                // Handle action slots
                if (slotIndex === 0) {
                    // Backpack toggle action
                    console.log('[BlockInventoryPanel] Backpack toggle clicked');
                    this.toggle();
                    return;
                } else if (slotIndex === 1) {
                    // Save action
                    console.log('[BlockInventoryPanel] Save action clicked');
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
    }

    switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('.backpack-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        this.currentTab = tabName;
        
        // Track mechanical category preference for ML/MR resize system
        if (tabName === 'beams') {
            this.currentMechanicalCategory = 'beam';
            console.log(`[BlockInventoryPanel] Set mechanical preference to BEAM`);
        } else if (tabName === 'platforms') {
            this.currentMechanicalCategory = 'platform';
            console.log(`[BlockInventoryPanel] Set mechanical preference to PLATFORM`);
        }
        
        this.generateBlockGrid();
        console.log(`[BlockInventoryPanel] Switched to ${tabName} tab`);
    }

    selectItem(slot) {
        // Debug logging
        console.log('[DEBUG] selectItem called with slot:', slot);
        console.log('[DEBUG] slot dataset:', slot.dataset);
        
        // Check if item is locked
        if (slot.classList.contains('locked')) {
            console.log('[BlockInventoryPanel] Cannot select locked item');
            return;
        }
        
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
        
        console.log('[DEBUG] Selecting item:', { itemId, itemName, itemType });

        // Update description panel
        this.updateDescriptionPanel(itemId, itemType);

        let selectedItem = null;
        
        if (itemType === 'blocks') {
            selectedItem = this.availableBlocks.find(b => b.id == itemId);
            this.selectedBlock = {
                id: parseInt(itemId),
                name: itemName
            };
        } else if (itemType === 'beams') {
            selectedItem = this.availableBeams.find(b => b.id === itemId);
            this.selectedBlock = {
                id: itemId,
                name: itemName,
                type: selectedItem.type,
                size: selectedItem.sizeId,
                category: selectedItem.category
            };
        } else if (itemType === 'platforms') {
            selectedItem = this.availablePlatforms.find(p => p.id === itemId);
            this.selectedBlock = {
                id: itemId,
                name: itemName,
                type: selectedItem.type,
                size: selectedItem.sizeId,
                category: selectedItem.category
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
            } else if (itemType === 'beams' || itemType === 'platforms') {
                // Use coral texture and add clear category prefix for hotbar
                const categoryPrefix = selectedItem.category.toUpperCase();
                hotbarItem = {
                    id: this.selectedBlock.id,
                    name: `${categoryPrefix}: ${this.selectedBlock.name}`,
                    type: this.selectedBlock.type,
                    size: this.selectedBlock.size,
                    textureUri: selectedItem.textureUri,
                    category: selectedItem.category,
                    mechanicalCategory: selectedItem.category // Store beam/platform preference with hotbar item
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
                obstacleSize: this.selectedBlock.size,
                mechanicalCategory: this.selectedBlock.category || this.currentMechanicalCategory // Pass beam/platform preference
            });
        }

        console.log('[BlockInventoryPanel] Selected item:', this.selectedBlock);
    }

    selectHotbarSlot(slotIndex) {
        // Only allow selecting editable slots (2-5)
        if (slotIndex < 2) {
            console.log('[BlockInventoryPanel] Cannot select action slot:', slotIndex);
            return;
        }
        
        // Update local selection
        this.selectedHotbarSlot = slotIndex;
        
        // Update visual selection in inventory hotbar preview
        const hotbarSlots = this.inventoryElement.querySelectorAll('.backpack-hotbar-slot');
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
        
        console.log('[BlockInventoryPanel] Selected hotbar slot:', slotIndex);
    }

    updateHotbarPreview() {
        if (!window.HotbarPanel) return;

        // Get current hotbar state - use a safer method
        const hotbarSlots = window.HotbarPanel.getHotbarSlots() || [];

        // Update each hotbar slot in the inventory preview
        for (let i = 0; i < 6; i++) {
            const hotbarSlot = this.inventoryElement.querySelector(`[data-hotbar-index="${i}"]`);
            if (hotbarSlot) {
                const content = hotbarSlot.querySelector('.backpack-hotbar-slot-content');
                content.innerHTML = '';

                // Update selection indicator based on locally selected slot (only for editable slots 2-5)
                if (i === this.selectedHotbarSlot && i >= 2) {
                    hotbarSlot.classList.add('selected');
                } else {
                    hotbarSlot.classList.remove('selected');
                }

                // Slot 0 is for backpack action (toggle inventory)
                if (i === 0) {
                    hotbarSlot.classList.add('backpack-action-slot', 'backpack-toggle-slot');
                    const actionIcon = document.createElement('span');
                    actionIcon.className = 'backpack-action-icon';
                    actionIcon.textContent = '🎒';
                    actionIcon.title = 'Toggle Inventory';
                    content.appendChild(actionIcon);
                }
                // Slot 1 is for save action
                else if (i === 1) {
                    hotbarSlot.classList.add('backpack-action-slot', 'save-action-slot');
                    const actionIcon = document.createElement('span');
                    actionIcon.className = 'backpack-action-icon';
                    actionIcon.textContent = '💾';
                    actionIcon.title = 'Save';
                    content.appendChild(actionIcon);
                } else {
                    // Slots 2-5 show blocks if present, otherwise show slot number
                    const block = hotbarSlots[i];
                    if (block) {
                        const blockImage = document.createElement('img');
                        blockImage.className = 'backpack-hotbar-slot-icon';
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
            
            // Only allow dropping on editable slots (2-5)
            if (hotbarIndex < 2) {
                console.log('[BlockInventoryPanel] Cannot drop on action slot:', hotbarIndex);
                return;
            }

            const itemId = this.heldBlock.id;
            const itemName = this.heldBlock.name;
            
            // Update hotbar slot visually
            const content = hotbarSlot.querySelector('.backpack-hotbar-slot-content');
            content.innerHTML = '';
            
            const blockImage = document.createElement('img');
            blockImage.className = 'backpack-hotbar-slot-icon';
            blockImage.src = this.heldBlock.textureUri;
            blockImage.alt = itemName;
            
            content.appendChild(blockImage);
            
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
                
                // Check if we should prefill hotbar for new player
                this.checkAndPrefillHotbar();
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

    updateDescriptionPanel(itemId, itemType) {
        const descriptionPanel = document.getElementById('block-description-panel');
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
                <div class="description-header">
                    <h3>Item Not Found</h3>
                </div>
                <div class="description-content">
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
                <div class="description-header">
                    <div class="description-title-row">
                        <div class="description-block-preview">
                            <img src="${this.getBlockIconPath(item)}" alt="${item.name}">
                        </div>
                        <div class="description-title-info">
                            <h3>${item.name}</h3>
                            <div class="description-category">BLOCK • ${item.cost} POINTS</div>
                        </div>
                    </div>
                </div>
                <div class="description-content">
                    <div class="description-text">
                        <p>${blockDescription}</p>
                    </div>
                </div>
            `;
        } else {
            // Prefab obstacles
            descriptionHTML = `
                <div class="description-header">
                    <h3>${item.name}</h3>
                    <div class="description-category">PREFAB • ${item.size}</div>
                </div>
                <div class="description-content">
                    <div class="description-text">
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
            'platform': 'A solid stone platform. The most basic building block for creating paths and structures.',
            'sand': 'A sandy platform with slightly different texture. Good for desert-themed sections.',
            'ice': 'A slippery ice block. Players will slide when walking on this surface, adding challenge.',
            'lava': 'A dangerous lava block. Players will be eliminated if they touch this hazard!',
            'vines': 'Climbable vines on wooden planks. Players can climb up these surfaces.',
            'glass': 'Transparent glass blocks. Perfect for invisible platforms and advanced parkour tricks.'
        };
        
        return descriptions[block.name] || 'A building block for your obby course.';
    }

    checkAndPrefillHotbar() {
        // Check if player is under level 3 and hotbar is empty
        if (this.currentPlayerState === 'BUILDING' && this.playerLevel < 3) {
            console.log(`[BlockInventoryPanel] Checking hotbar prefill for level ${this.playerLevel} player`);
            
            // Check if hotbar is empty (slots 2-5)
            const hotbarSlots = window.HotbarPanel ? window.HotbarPanel.getHotbarSlots() : [];
            const isEmpty = hotbarSlots.slice(2).every(slot => slot === null);
            
            if (isEmpty) {
                console.log('[BlockInventoryPanel] Hotbar is empty, prefilling with essential blocks');
                this.prefillWithEssentialBlocks();
            } else {
                console.log('[BlockInventoryPanel] Hotbar not empty, skipping prefill');
            }
        } else {
            console.log(`[BlockInventoryPanel] Player level ${this.playerLevel} >= 3 or not in build mode, skipping prefill`);
        }
    }

    prefillWithEssentialBlocks() {
        console.log('[BlockInventoryPanel] Prefilling hotbar with essential blocks for new player');
        
        // Define essential blocks for new players
        const essentialBlocks = [
            { id: 100, name: 'start', textureUri: 'blocks/start.png' },      // Slot 2: Start block
            { id: 1, name: 'platform', textureUri: 'blocks/stone.png' },     // Slot 3: Stone platform
            { id: 9, name: 'ice', textureUri: 'blocks/ice.png' },            // Slot 4: Ice block
            { id: 101, name: 'goal', textureUri: 'blocks/goal.png' }         // Slot 5: Goal block
        ];
        
        // Fill slots 2-5 with essential blocks
        for (let i = 0; i < essentialBlocks.length; i++) {
            const slotIndex = i + 2; // Slots 2, 3, 4, 5
            const block = essentialBlocks[i];
            
            if (window.HotbarPanel) {
                window.HotbarPanel.setSlotBlock(slotIndex, block);
                console.log(`[BlockInventoryPanel] Prefilled slot ${slotIndex} with ${block.name}`);
            }
        }
        
        // Select the first editable slot (slot 2)
        if (window.HotbarPanel) {
            window.HotbarPanel.selectSlot(2);
        }
        this.selectedHotbarSlot = 2;
        
        // Update the inventory preview
        this.updateHotbarPreview();
        
        // Send a helpful message to the player
        if (window.hytopia && window.hytopia.sendData) {
            window.hytopia.sendData({
                type: 'showMessage',
                message: '🎯 Your hotbar has been prefilled with essential blocks! Start with the green start block, then add platforms, ice, and finish with the red goal block.',
                color: '00FF00',
                duration: 8000
            });
        }
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
                --backpack-slot-size: 48px;
                --backpack-hotbar-size: 40px;
                --backpack-icon-size: 36px;
                --backpack-hotbar-icon-size: 28px;
                --backpack-gap: 6px;
                --backpack-padding: 10px;
                --backpack-font: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            }

            .backpack-overlay {
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
                z-index: 1000;
                font-family: var(--backpack-font);
                user-select: none;
                gap: 8px;
                padding: 20px;
                overflow-y: auto;
            }

            /* Container Styles */
            .backpack-container {
                background: linear-gradient(145deg, #2a2a2a, #1e1e1e);
                border: 2px solid #444;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                width: 590px;
                height: 350px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                margin-bottom: 8px;
            }

            .backpack-hotbar-container {
                background: linear-gradient(145deg, #2a2a2a, #1e1e1e);
                border: 2px solid #444;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                width: 590px;
                padding: 8px;
            }

            /* Header Styles */
            .backpack-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: linear-gradient(135deg, #3a3a3a, #2d2d2d);
                border-bottom: 1px solid #444;
                border-radius: 10px 10px 0 0;
            }

            .backpack-info {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .backpack-icon {
                width: 32px;
                height: 32px;
                background: rgba(0, 0, 0, 0.6);
                border: 2px solid #444;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
            }

            .backpack-details {
                display: flex;
                flex-direction: column;
            }

            .backpack-name {
                font-size: 12px;
                font-weight: 600;
                color: #ffffff;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
                line-height: 1;
            }

            .backpack-subtitle {
                font-size: 10px;
                font-weight: 500;
                color: #cccccc;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
                margin-top: 1px;
                letter-spacing: 0.3px;
            }

            .backpack-hotbar-header {
                justify-content: flex-start;
            }

            .backpack-title,
            .backpack-hotbar-title {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: #ffffff;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
                letter-spacing: 0.3px;
            }

            .backpack-close {
                background: rgba(255, 0, 0, 0.2);
                border: 1px solid rgba(255, 0, 0, 0.3);
                border-radius: 4px;
                color: #ff6b6b;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .backpack-close:hover {
                background: rgba(255, 0, 0, 0.3);
                transform: scale(1.05);
            }

            /* Content Layout */
            .backpack-content {
                display: flex;
                flex: 1;
                overflow: hidden;
            }

            /* Navigation Tabs - Vertical sidebar */
            .backpack-nav {
                background: linear-gradient(135deg, #3a3a3a, #2d2d2d);
                border-right: 1px solid #444;
                display: flex;
                flex-direction: column;
                padding: 4px 3px;
                gap: 2px;
                width: 50px;
                flex-shrink: 0;
            }

            .backpack-tab {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 4px 2px;
                background: transparent;
                border: 1px solid transparent;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s ease;
                gap: 1px;
            }

            .backpack-tab:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: #555;
            }

            .backpack-tab.active {
                background: rgba(0, 0, 0, 0.6);
                border-color: #4CAF50;
                box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.3);
            }

            .tab-icon {
                font-size: 12px;
                opacity: 0.7;
                transition: opacity 0.2s ease;
            }

            .tab-label {
                font-size: 6px;
                font-weight: 600;
                color: #cccccc;
                text-align: center;
                line-height: 1;
            }

            .backpack-tab:hover .tab-icon,
            .backpack-tab.active .tab-icon {
                opacity: 1;
            }

            .backpack-tab.active .tab-label {
                color: #4CAF50;
            }

            /* Main Content */
            .backpack-main {
                flex: 1;
                padding: 12px;
                overflow: hidden;
            }

            .backpack-content-wrapper {
                display: flex;
                gap: 10px;
                height: 100%;
            }

            .backpack-grid-container {
                flex: 2;
                height: 100%;
                min-height: 180px;
            }

            /* Description Panel */
            .backpack-description-panel {
                width: 280px;
                background: rgba(15, 15, 30, 0.95);
                border: 1px solid #555;
                border-radius: 6px;
                padding: 0;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.6);
                max-height: 200px;
            }

            .description-header {
                background: linear-gradient(135deg, #4a4a4a, #3d3d3d);
                padding: 8px 10px;
                border-bottom: 1px solid #555;
            }

            .description-title-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .description-icon {
                width: 40px;
                height: 40px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            }

            .description-symbol {
                font-size: 16px;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            .description-block-preview {
                width: 28px;
                height: 28px;
                background: rgba(0, 0, 0, 0.6);
                border: 1px solid #444;
                border-radius: 3px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.7);
            }

            .description-block-preview img {
                width: 22px;
                height: 22px;
                object-fit: contain;
                image-rendering: pixelated;
            }

            .description-title-info h3 {
                margin: 0;
                font-size: 12px;
                font-weight: 600;
                color: #ffffff;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
                letter-spacing: 0.2px;
            }

            .description-category {
                font-size: 8px;
                font-weight: 600;
                color: #64B5F6;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
                margin-top: 1px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }

            .description-content {
                flex: 1;
                padding: 8px 10px;
                overflow-y: auto;
                background: rgba(0, 0, 0, 0.1);
            }

            .description-text {
                margin-bottom: 12px;
                line-height: 1.4;
            }

            .description-text p {
                margin: 0;
                font-size: 10px;
                line-height: 1.3;
                color: #cccccc;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
            }

            .description-details {
                border-top: 2px solid rgba(255, 255, 255, 0.15);
                padding-top: 20px;
                background: rgba(0, 0, 0, 0.1);
                border-radius: 6px;
                padding: 16px;
                margin-top: 16px;
            }

            .description-detail {
                margin-bottom: 12px;
                font-size: 14px;
                color: #c0c0c0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .description-detail strong {
                color: #ffffff;
                font-weight: 700;
                min-width: 80px;
                text-align: left;
            }

            /* Grid Styles */
            .backpack-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                grid-template-rows: auto;
                gap: var(--backpack-gap);
                background: rgba(0, 0, 0, 0.3);
                padding: var(--backpack-padding);
                border: 1px solid #444;
                border-radius: 8px;
                box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.5);
                min-height: 180px;
                height: fit-content;
                align-content: start;
            }

            .backpack-hotbar-grid {
                display: grid;
                grid-template-columns: repeat(6, 1fr);
                gap: 6px;
                background: rgba(0, 0, 0, 0.3);
                padding: 10px;
                border-radius: 0 0 8px 8px;
                box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.5);
                justify-items: center;
                max-width: 100%;
            }

            /* Slot Styles */
            .backpack-slot {
                width: var(--backpack-slot-size);
                height: var(--backpack-slot-size);
                background: rgba(0, 0, 0, 0.6);
                border: 2px solid #333;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.7);
            }

            .backpack-hotbar-slot {
                width: var(--backpack-hotbar-size);
                height: var(--backpack-hotbar-size);
                background: rgba(0, 0, 0, 0.6);
                border: 2px solid #333;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.7);
            }

            /* Slot Hover & Highlight States */
            .backpack-slot:hover,
            .backpack-hotbar-slot:hover {
                border-color: #555;
                background: rgba(0, 0, 0, 0.8);
                transform: translateY(-1px);
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.7), 0 2px 8px rgba(0, 0, 0, 0.5);
            }

            .backpack-slot.selected,
            .backpack-hotbar-slot.selected {
                border-color: #4CAF50 !important;
                background: rgba(76, 175, 80, 0.2) !important;
                box-shadow: 0 0 10px rgba(76, 175, 80, 0.5) !important;
            }

            .backpack-slot.locked {
                background: rgba(139, 69, 19, 0.3);
                border-color: #8B4513;
                cursor: not-allowed;
                opacity: 0.7;
            }

            .backpack-item-icon.locked-icon {
                opacity: 0.4;
                filter: grayscale(100%) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            .lock-overlay {
                position: absolute;
                top: 2px;
                right: 2px;
                font-size: 8px;
                color: #FFD700;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
                z-index: 1;
            }

            /* Content Styles */
            .backpack-slot-content,
            .backpack-hotbar-slot-content {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: #ccc;
                position: relative;
            }

            .backpack-hotbar-slot-content {
                font-size: 14px;
                font-weight: 600;
                color: #888;
            }

            .backpack-item-icon {
                width: var(--backpack-icon-size);
                height: var(--backpack-icon-size);
                object-fit: contain;
                image-rendering: pixelated;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            .backpack-obstacle-text {
                font-family: 'Inter-ExtraBold', var(--backpack-font);
                font-weight: 800;
                font-size: 9px;
                color: #ffffff;
                text-align: center;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
                line-height: 1.1;
                padding: 1px 2px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
                word-wrap: break-word;
                hyphens: auto;
                max-width: 48px;
                max-height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .backpack-hotbar-slot-icon {
                width: var(--backpack-hotbar-icon-size);
                height: var(--backpack-hotbar-icon-size);
                object-fit: contain;
                image-rendering: pixelated;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
            }

            /* Mechanical Block Icons */
            .mechanical-block-icon {
                width: var(--backpack-icon-size);
                height: var(--backpack-icon-size);
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                border: 2px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                position: relative;
                gap: 4px;
                cursor: pointer;
                transition: transform 0.1s ease;
            }
            
            .mechanical-block-icon:hover {
                transform: scale(1.05);
            }"

            .block-symbol {
                font-size: 14px;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
                line-height: 1;
            }

            .block-category-label {
                font-size: 7px;
                font-weight: 700;
                color: rgba(255, 255, 255, 0.9);
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
                letter-spacing: 0.5px;
                line-height: 1;
                text-align: center;
            }

            /* Obstacle Size Label */
            .obstacle-size-label {
                position: absolute;
                bottom: 2px;
                right: 2px;
                background: rgba(0, 0, 0, 0.8);
                color: #ffffff;
                font-weight: 700;
                font-size: 8px;
                padding: 1px 3px;
                border-radius: 3px;
                line-height: 1;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.2);
                min-width: 10px;
                text-align: center;
                pointer-events: none;
            }

            /* Action Icon Styling for Hotbar Preview */
            .backpack-action-icon {
                font-size: 20px;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
                pointer-events: none;
            }

            /* Special Slots for Hotbar Preview */
            .backpack-action-slot {
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

            .backpack-action-slot:hover {
                border-color: #555;
                background: rgba(0, 0, 0, 0.8);
                transform: translateY(-1px);
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.7), 0 2px 8px rgba(0, 0, 0, 0.5);
            }

            .backpack-toggle-slot {
                border-color: #4CAF50;
                background: rgba(76, 175, 80, 0.2);
                box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
            }

            .save-action-slot {
                border-color: #ff6b6b;
                background: rgba(255, 107, 107, 0.2);
                box-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
            }

            /* Mouse Follower */
            #block-mouse-follower {
                position: fixed;
                width: 56px;
                height: 56px;
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

            #block-mouse-follower img {
                width: 48px;
                height: 48px;
                object-fit: contain;
                image-rendering: pixelated;
                filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
            }

            /* Mobile Styles */
            @media (max-width: 768px) {
                :root {
                    --backpack-slot-size: 44px;
                    --backpack-hotbar-size: 44px;
                    --backpack-icon-size: 36px;
                    --backpack-gap: 4px;
                    --backpack-padding: 8px;
                }

                .backpack-overlay {
                    gap: 12px;
                    padding: 8px;
                }

                .backpack-container {
                    width: 95%;
                    max-width: 500px;
                    border-radius: 8px;
                    height: 400px;
                }

                .backpack-hotbar-container {
                    width: 95%;
                    max-width: 500px;
                    border-radius: 8px;
                }

                .backpack-header {
                    padding: 8px 12px;
                    border-radius: 8px 8px 0 0;
                }

                .backpack-title,
                .backpack-hotbar-title {
                    font-size: 14px;
                }

                .backpack-main {
                    padding: 12px;
                }

                .backpack-content-wrapper {
                    flex-direction: column;
                    gap: 12px;
                }

                .backpack-description-panel {
                    width: 100%;
                    height: 150px;
                    order: -1; /* Show description at top on mobile */
                }

                .description-content {
                    padding: 16px;
                }

                .description-text p {
                    font-size: 14px;
                }

                .backpack-grid {
                    padding: 8px;
                    border-radius: 6px;
                    grid-template-columns: repeat(4, 1fr);
                }

                .backpack-hotbar-grid {
                    padding: 12px;
                    border-radius: 0 0 6px 6px;
                }

                .backpack-hotbar-slot-icon {
                    width: 40px;
                    height: 40px;
                }

                .backpack-obstacle-text {
                    font-size: 7px;
                    padding: 1px;
                    letter-spacing: 0.2px;
                    max-width: 36px;
                    max-height: 32px;
                    line-height: 1.0;
                }

                #block-mouse-follower {
                    width: 44px;
                    height: 44px;
                }

                #block-mouse-follower img {
                    width: 36px;
                    height: 36px;
                }

                .backpack-nav {
                    padding: 8px;
                    gap: 6px;
                }

                .backpack-tab {
                    min-width: 80px;
                    padding: 6px 12px;
                }

                .tab-icon {
                    font-size: 16px;
                }

                .tab-label {
                    font-size: 9px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Make it globally available as a singleton instance
window.BlockInventoryPanel = new BlockInventoryPanel(); 