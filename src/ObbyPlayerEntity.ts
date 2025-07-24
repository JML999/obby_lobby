import { Player, PlayerEntity, Vector3, PlayerUIEvent, EntityEvent, DefaultPlayerEntity, RigidBodyType, ColliderShape } from 'hytopia';
import type { PlayerInput, World, PlayerCameraOrientation, DefaultPlayerEntityController } from 'hytopia';
import { BlockPlacementManager } from './BlockPlacementManager';
import { ObbyPlayerController } from './ObbyPlayerController';
import { PlotBuildManager } from './PlotBuildManager';
import { PlayerStateManager, PlayerGameState } from './PlayerGameState';
import { PlotSaveManager } from './PlotSaveManager';
import { CashCalculator } from './CashCalculator';
import { CollisionGroups } from './CollisionGroups';
import { MobileDetectionManager } from './MobileDetectionManager';

export class ObbyPlayerEntity extends DefaultPlayerEntity {
    private blockPlacementManager: BlockPlacementManager;
    private plotBuildManager: PlotBuildManager;
    private playerStateManager: PlayerStateManager;
    private plotSaveManager: PlotSaveManager;
    private selectedBlockId: number | null = null;
    private selectedObstacle: { id: string; type: string; size: string } | null = null;
    
    // Fly mode properties
    public isFlying: boolean = false;
    public currentFlyEntity: any = null; // FlyEntity reference
    
    private hasShownBuildTutorialThisSession: boolean = false; // Track tutorial shown this session
    
    constructor(player: Player, world: World, controller: ObbyPlayerController) {
        super({
            player,
            name: "ObbyPlayer",
            modelUri: "models/players/player.gltf",
            modelScale: 1,
            modelLoopedAnimations: ["idle"],
            controller: controller,
            rigidBodyOptions: {
                type: RigidBodyType.DYNAMIC,
                colliders: [{
                    shape: ColliderShape.CAPSULE,
                    halfHeight: 0.6,
                    radius: 0.4,
                    collisionGroups: {
                        belongsTo: [CollisionGroups.PLAYER],
                        collidesWith: [
                            CollisionGroups.ENTITY_SENSOR,
                            CollisionGroups.PLAYER,
                            CollisionGroups.PLOT_ENTRANCE, // Allow collision with plot entrances
                            CollisionGroups.OBSTACLE,
                            CollisionGroups.BLOCK
                        ]
                    }
                }]
            }
        });

        this.blockPlacementManager = BlockPlacementManager.getInstance();
        this.plotBuildManager = PlotBuildManager.getInstance();
        this.playerStateManager = PlayerStateManager.getInstance();
        this.plotSaveManager = PlotSaveManager.getInstance();
        this.setupEventHandlers();
        this.setupUIHandlers();
        this.setupInitialState();
        
        // Set collision groups for sensor colliders to ensure compatibility
        this.setCollisionGroupsForSensorColliders({
            belongsTo: [CollisionGroups.PLAYER],
            collidesWith: [
                CollisionGroups.ENTITY,
                CollisionGroups.ENTITY_SENSOR,
                CollisionGroups.PLAYER,
                CollisionGroups.BLOCK,
                CollisionGroups.PLOT_ENTRANCE
            ]
        });
        
        // Load the UI
        try {
            player.ui.load("ui/index.html");
        } catch (error) {
            console.error(`[ObbyPlayerEntity] Error loading UI for player: ${player.id}:`, error);
        }
    }

    /**
     * Update the player's cash display in the UI
     */
    private updatePlayerCashUI(player: Player, newCash: number): void {
        try {
            // Send cash update to the UI
            player.ui.sendData({
                type: 'cashUpdate',
                cash: newCash,
                maxCash: CashCalculator.DEFAULT_STARTING_CASH
            });
        } catch (error) {
            console.error(`[ObbyPlayerEntity] Error updating cash UI for player ${player.id}:`, error);
        }
    }

    private setupEventHandlers(): void {
        // Handle tick for input processing
        this.on(EntityEvent.TICK, this.handleTickInput);
    }

    private setupUIHandlers() {
        this.player.ui.on(PlayerUIEvent.DATA, ({ playerUI, data }) => {
            this.handleUIEvent(this.player, data);
        });
    }

    private setupInitialState() {
        // Start with no selected block - let player choose from inventory
        this.selectedBlockId = null;
        this.selectedObstacle = null;
    }

    private handleUIEvent(player: Player, data: Record<string, any>): void {
        
        switch (data.type) {
            case 'uiReady':
                // Register mobile status if provided
                if (typeof data.isMobile === 'boolean') {
                    MobileDetectionManager.getInstance().setPlayerMobile(player.id, data.isMobile);
                }
                this.onUIReady(player, data.isMobile || false);
                break;
            case 'uiReadyMobile':
                // Register as mobile player
                MobileDetectionManager.getInstance().setPlayerMobile(player.id, true);
                this.onUIReady(player, true);
                break;
            case 'showInventoryPanel':
                // Respond by telling the UI to show the inventory panel
                player.ui.sendData({ type: 'showInventoryPanel' });
                break;
            case 'walkTogglePressed':
                // Simulate pressing the 'f' key for walk/create toggle (fly mode toggle)
                this.handleWalkToggle(player);
                break;
            case 'selectBlock':
                this.setSelectedBlock(data.blockId);
                this.selectedObstacle = null; // Clear obstacle selection when block is selected
                break;
            case 'selectObstacle':
                this.setSelectedObstacle(data.obstacleId, data.obstacleType, data.obstacleSize);
                this.selectedBlockId = null; // Clear block selection when obstacle is selected
                break;
            case 'requestBuildMode':
                this.handleRequestBuildMode(player);
                break;
            case 'requestPlayMode':
                this.handleRequestPlayMode(player);
                break;
            case 'disablePlayerInput':
                player.ui.lockPointer(false);
                break;
            case 'saveCourse':
                this.handleSaveCourse(player);
                break;
            case 'enablePlayerInput':
                player.ui.lockPointer(true);
                break;
            case 'npcOptionSelected':
                this.handleNpcOptionSelected(player, data.optionIndex);
                break;
            case 'getTutorialPreferences':
                this.handleGetTutorialPreferences(player);
                break;
            case 'saveTutorialPreference':
                this.handleSaveTutorialPreference(player, data.preference, data.value);
                break;
            case 'showBuildTutorial':
                this.handleShowBuildTutorial(player);
                break;
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
            case '0':
                // Handle number key hotbar selection
                const hotbarSlot = parseInt(data.type);
                if (hotbarSlot >= 1 && hotbarSlot <= 9) {
                }
                break;
            default:
                console.warn(`[ObbyPlayerEntity] Unknown UI event type: ${data.type}`);
        }
    }

    private async handleRequestBuildMode(player: Player): Promise<void> {
        
        // Check if player is already in build mode
        const currentState = this.playerStateManager.getCurrentState(player.id);
        if (currentState === PlayerGameState.BUILDING) {
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, '⚠️ You are already in build mode!', 'FFAA00');
            }
            return;
        }
        
        // Find which plot entrance the player is currently near
        const nearbyPlotIndex = this.plotBuildManager.getPlayerNearPlot(player.id);
        
        if (nearbyPlotIndex === null) {
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, '❌ You must be near a plot entrance to enter build mode! Stand near a plot and try again.', 'FF0000');
            }
            return;
        }
        
        const playerOwnedPlotIndex = nearbyPlotIndex; // Use the plot entrance they're near
        
        if (player.world) {
            try {
                // Set player state to BUILDING
                this.playerStateManager.setPlayerState(player.id, PlayerGameState.BUILDING, playerOwnedPlotIndex, player);
                
                // Use PlotBuildManager to activate build mode without teleporting
                const success = await this.plotBuildManager.activateBuildMode(player, playerOwnedPlotIndex);
                
                if (success) {
                    const displayNumber = this.getDisplayNumber(playerOwnedPlotIndex);
                    player.world.chatManager.sendPlayerMessage(player, `🔨 Entered build mode for plot ${displayNumber}!`, '00FF00');
                } else {
                    // Reset state if build mode entry failed
                    this.playerStateManager.setPlayerState(player.id, PlayerGameState.LOBBY, undefined, player);
                    player.world.chatManager.sendPlayerMessage(player, '❌ Failed to enter build mode!', 'FF0000');
                }
            } catch (error) {
                console.error(`[ObbyPlayerEntity] Error entering build mode for player ${player.id}:`, error);
                this.playerStateManager.setPlayerState(player.id, PlayerGameState.LOBBY, undefined, player);
                if (player.world) {
                    player.world.chatManager.sendPlayerMessage(player, '❌ Error entering build mode!', 'FF0000');
                }
            }
        }
    }

    private async handleRequestPlayMode(player: Player): Promise<void> {
        
        // Check if player is already in play mode
        const currentState = this.playerStateManager.getCurrentState(player.id);
        if (currentState === PlayerGameState.PLAYING) {
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, '⚠️ You are already in play mode!', 'FFAA00');
            }
            return;
        }
        
        // Find which plot entrance the player is currently near
        const nearbyPlotIndex = this.plotBuildManager.getPlayerNearPlot(player.id);
        
        if (nearbyPlotIndex === null) {
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, '❌ You must be near a plot entrance to enter play mode! Stand near a plot and try again.', 'FF0000');
            }
            return;
        }
        
        
        if (player.world) {
            try {
                // Import ObbyPlayManager and start playing
                const { ObbyPlayManager } = await import('./ObbyPlayManager');
                const obbyPlayManager = ObbyPlayManager.getInstance();
                obbyPlayManager.initializeWorld(player.world);
                
                // Start the obby play with animated text countdown
                const success = await obbyPlayManager.startObbyPlay(player, nearbyPlotIndex);
                
                if (!success) {
                    // ObbyPlayManager will have already shown error messages
                    return;
                }
                
            } catch (error) {
                console.error(`[ObbyPlayerEntity] Error entering play mode for player ${player.id}:`, error);
                if (player.world) {
                    player.world.chatManager.sendPlayerMessage(player, '❌ Error entering play mode!', 'FF0000');
                }
            }
        }
    }

    private onUIReady(player: Player, isMobile: boolean = false) {
        
        // Send initial game state to UI
        this.updateUIState(player);
        
        // Send current player state with mobile controls if mobile
        const currentState = this.playerStateManager.getCurrentState(player.id);
        const playerData = this.playerStateManager.getPlayerState(player.id);
        
        // Get the player's assigned plot from PlotManager
        let assignedPlotIndex: number | undefined = playerData?.plotIndex;
        if (!assignedPlotIndex && currentState === PlayerGameState.LOBBY) {
            try {
                const { PlotManager } = require('./PlotManager');
                const plotManager = PlotManager.getInstance();
                const playerPlot = plotManager.getPlayerPlot(player.id);
                if (playerPlot) {
                    assignedPlotIndex = playerPlot.plotIndex;
                }
            } catch (error) {
                console.error(`[ObbyPlayerEntity] Error getting plot from PlotManager:`, error);
            }
        }
        
        // Force send player state change to initialize mobile UI
        setTimeout(() => {
            // Re-set the player state to trigger the notification with the correct plot index
            this.playerStateManager.setPlayerState(player.id, currentState, assignedPlotIndex, player);
        }, 100);
        
        // Lock pointer for game controls
        player.ui.lockPointer(true);
        
        // Send welcome message with plot information
        this.sendWelcomeMessage(player);
        
        // Add a delay to ensure UI is fully ready before allowing interactions
        setTimeout(() => {
        }, 1000);
    }

    private sendWelcomeMessage(player: Player): void {
        try {
            // Get the player's assigned plot from PlotManager
            const { PlotManager } = require('./PlotManager');
            const plotManager = PlotManager.getInstance();
            const playerPlot = plotManager.getPlayerPlot(player.id);
            
            if (playerPlot) {
                // Use the same clockwise display number logic as PlotManager
                const displayNumber = this.getDisplayNumber(playerPlot.plotIndex);
                
                // Show animated welcome message
                this.showAnimatedText(
                    `Welcome to OBBY LOBBY!`,
                    `You can build on Plot ${displayNumber}`,
                    3000,
                    'success'
                );
                
            } else {
                console.warn(`[ObbyPlayerEntity] No plot found for player ${player.id}, skipping welcome message`);
            }
        } catch (error) {
            console.error(`[ObbyPlayerEntity] Error sending welcome message to player ${player.id}:`, error);
        }
    }

    /**
     * Convert plot index to clockwise display number
     */
    private getDisplayNumber(plotIndex: number): number {
        const clockwiseMap: { [key: number]: number } = {
            0: 4, // Left top → 4
            1: 3, // Left middle-top → 3
            2: 2, // Left middle-bottom → 2
            3: 1, // Left bottom → 1
            4: 5, // Right top → 5
            5: 6, // Right middle-top → 6
            6: 7, // Right middle-bottom → 7
            7: 8  // Right bottom → 8
        };
        
        return clockwiseMap[plotIndex] || plotIndex + 1;
    }

    private updateUIState(player: Player) {
        // Update selected block in UI
        player.ui.sendData({
            type: 'selectedBlockChanged',
            block: this.getBlockInfo(this.selectedBlockId)
        });

        // Don't automatically update hotbar - let the UI handle it
        // Players will populate their hotbar from the inventory
    }

    public setSelectedBlock(blockId: number | null) {
        this.selectedBlockId = blockId;
        
        // Update the block placement manager
        if (blockId) {
            const success = this.blockPlacementManager.setSelectedBlock(this.player, blockId, this.world);
        }
        
        // Notify UI
        this.player.ui.sendData({
            type: 'selectedBlockChanged',
            block: this.getBlockInfo(blockId)
        });
    }

    public setSelectedObstacle(obstacleId: string, obstacleType: string, obstacleSize: string) {
        this.selectedObstacle = { id: obstacleId, type: obstacleType, size: obstacleSize };
        
        // Notify UI
        this.player.ui.sendData({
            type: 'selectedObstacleChanged',
            obstacle: this.selectedObstacle
        });
    }

    public getSelectedObstacle() {
        return this.selectedObstacle;
    }

    public getSelectedBlockId(): number | null {
        return this.selectedBlockId;
    }

    public isObstacleSelected(): boolean {
        return this.selectedObstacle !== null;
    }

    public isBlockSelected(): boolean {
        return this.selectedBlockId !== null;
    }

    // ===== Animated Text Methods =====

    /**
     * Show animated text to this player
     * @param line1 Primary text line
     * @param line2 Secondary text line (optional)
     * @param duration Duration in milliseconds (default: 3000)
     * @param style Style variant: 'default', 'countdown', 'success', 'warning'
     */
    public showAnimatedText(line1: string, line2: string = '', duration: number = 3000, style: string = 'default'): void {
        this.player.ui.sendData({
            type: 'showAnimatedText',
            line1,
            line2,
            duration,
            style
        });
    }

    /**
     * Show countdown number to this player
     * @param number The countdown number (3, 2, 1)
     */
    public showCountdown(number: number | string): void {
        this.player.ui.sendData({
            type: 'showCountdown',
            number
        });
    }

    /**
     * Show "GO!" message to this player
     */
    public showGo(): void {
        this.player.ui.sendData({
            type: 'showGo'
        });
    }

    /**
     * Show success message to this player (like "CHECKPOINT!", "COMPLETED!")
     * @param line1 Primary success text
     * @param line2 Secondary text (optional)
     * @param duration Duration in milliseconds (default: 2000)
     */
    public showSuccess(line1: string, line2: string = '', duration: number = 2000): void {
        this.player.ui.sendData({
            type: 'showSuccess',
            line1,
            line2,
            duration
        });
    }

    /**
     * Show warning/error message to this player (like "FAILED!", "OUT OF BOUNDS!")
     * @param line1 Primary warning text
     * @param line2 Secondary text (optional)
     * @param duration Duration in milliseconds (default: 2000)
     */
    public showWarning(line1: string, line2: string = '', duration: number = 2000): void {
        this.player.ui.sendData({
            type: 'showWarning',
            line1,
            line2,
            duration
        });
    }

    // ===== Tutorial Preference Methods =====

    /**
     * Handle request to get tutorial preferences from player persistence
     */
    private async handleGetTutorialPreferences(player: Player): Promise<void> {
        try {
            const persistedData = await player.getPersistedData();
            const tutorialPreferences = persistedData?.tutorialPreferences || {};
            
            // Send preferences to UI
            player.ui.sendData({
                type: 'tutorialPreferences',
                preferences: tutorialPreferences
            });
        } catch (error) {
            console.error(`[ObbyPlayerEntity] Error loading tutorial preferences for player ${player.id}:`, error);
            
            // Send empty preferences on error
            player.ui.sendData({
                type: 'tutorialPreferences',
                preferences: {}
            });
        }
    }

    /**
     * Handle saving a tutorial preference to player persistence
     */
    private async handleSaveTutorialPreference(player: Player, preference: string, value: any): Promise<void> {
        try {
            const persistedData: any = await player.getPersistedData() || {};
            
            // Ensure tutorialPreferences object exists
            if (!persistedData.tutorialPreferences) {
                persistedData.tutorialPreferences = {};
            }
            
            // Save the preference
            persistedData.tutorialPreferences[preference] = value;
            
            // Persist the data
            await player.setPersistedData(persistedData);
            
            // Confirm to UI that preference was saved
            player.ui.sendData({
                type: 'tutorialPreferenceSaved',
                preference,
                value
            });
        } catch (error) {
            console.error(`[ObbyPlayerEntity] Error saving tutorial preference for player ${player.id}:`, error);
            
            // Notify UI of error
            player.ui.sendData({
                type: 'tutorialPreferenceError',
                preference,
                error: 'Failed to save preference'
            });
        }
    }

    /**
     * Handle showing the build tutorial - only show once per session
     */
    private handleShowBuildTutorial(player: Player): void {
        // Only show tutorial if it hasn't been shown this session
        if (!this.hasShownBuildTutorialThisSession) {
            
            // Mark as shown for this session
            this.hasShownBuildTutorialThisSession = true;
            
            // Send tutorial display message to UI
            player.ui.sendData({
                type: 'displayBuildTutorial'
            });
        }
    }

    /**
     * Hide animated text immediately for this player
     */
    public hideAnimatedText(): void {
        this.player.ui.sendData({
            type: 'hideAnimatedText'
        });
    }

    /**
     * Run a full countdown sequence for this player (3, 2, 1, GO!)
     * @param onComplete Optional callback when countdown finishes
     */
    public async runCountdownSequence(onComplete?: () => void): Promise<void> {
        
        // Show "3"
        this.showCountdown(3);
        await this.delay(1000);
        
        // Show "2"
        this.showCountdown(2);
        await this.delay(1000);
        
        // Show "1"
        this.showCountdown(1);
        await this.delay(1000);
        
        // Show "GO!"
        this.showGo();
        await this.delay(1500);
        
        if (onComplete) {
            onComplete();
        }
    }

    /**
     * Utility method for delays
     * @param ms Milliseconds to wait
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private getBlockInfo(blockId: number | null) {
        if (!blockId) return null;
        
        // Map block IDs to block information (matching your map.json)
        const blockMap: Record<number, any> = {
            1: { id: 1, name: 'bricks', textureUri: 'blocks/stone-bricks.png' },
            2: { id: 2, name: 'clay', textureUri: 'blocks/clay.png' },
            3: { id: 3, name: 'diamond-ore', textureUri: 'blocks/diamond-ore.png' },
            4: { id: 4, name: 'dirt', textureUri: 'blocks/dirt.png' },
            5: { id: 5, name: 'dragons-stone', textureUri: 'blocks/dragons-stone.png' },
            6: { id: 6, name: 'glass', textureUri: 'blocks/glass.png' },
            7: { id: 7, name: 'grass', textureUri: 'blocks/grass' },
            8: { id: 8, name: 'gravel', textureUri: 'blocks/gravel.png' },
            9: { id: 9, name: 'ice', textureUri: 'blocks/ice.png' },
            15: { id: 15, name: 'vines', textureUri: 'blocks/oak-planks-leafyerer.png' },
            16: { id: 16, name: 'oak-planks', textureUri: 'blocks/oak-planks.png' },
            17: { id: 17, name: 'sand', textureUri: 'blocks/sand.png' },
            19: { id: 19, name: 'stone', textureUri: 'blocks/stone.png' },
            20: { id: 20, name: 'stone-bricks', textureUri: 'blocks/stone-bricks.png' },
            21: { id: 21, name: 'void-sand', textureUri: 'blocks/void-sand.png' },
            100: { id: 100, name: 'start', textureUri: 'blocks/start.png' },
            101: { id: 101, name: 'goal', textureUri: 'blocks/goal.png' },
            102: { id: 102, name: 'checkpoint', textureUri: 'blocks/emerald-block.png' }
        };

        return blockMap[blockId] || null;
    }

    private handleTickInput = (): void => {
        // The controller now handles all mouse input for building
        // This tick handler can be used for other entity-specific logic if needed
        if (!this.world || !this.player?.input) return;
        
        // Any additional entity-specific input handling can go here
    }

    // Public methods for external access

    public selectBlock(blockName: string): boolean {
        const success = this.blockPlacementManager.selectBlockByName(this.player, blockName, this.world);
        
        if (success) {
            // Find the block ID for this name from BlockPlacementManager's catalog
            const blockInfo = this.blockPlacementManager.BLOCK_CATALOG.find(block => 
                block.name.toLowerCase() === blockName.toLowerCase()
            );
            if (blockInfo) {
                this.selectedBlockId = blockInfo.id;
                this.updateUIState(this.player);
            }
        }
        
        return success;
    }

    private getBlockMap() {
        return {
            1: { id: 1, name: 'bricks', textureUri: 'blocks/stone-bricks.png' },
            2: { id: 2, name: 'clay', textureUri: 'blocks/clay.png' },
            3: { id: 3, name: 'diamond-ore', textureUri: 'blocks/diamond-ore.png' },
            4: { id: 4, name: 'dirt', textureUri: 'blocks/dirt.png' },
            5: { id: 5, name: 'dragons-stone', textureUri: 'blocks/dragons-stone.png' },
            6: { id: 6, name: 'glass', textureUri: 'blocks/glass.png' },
            7: { id: 7, name: 'grass', textureUri: 'blocks/grass' },
            8: { id: 8, name: 'gravel', textureUri: 'blocks/gravel.png' },
            9: { id: 9, name: 'ice', textureUri: 'blocks/ice.png' },
            15: { id: 15, name: 'vines', textureUri: 'blocks/oak-planks-leafyerer.png' },
            16: { id: 16, name: 'oak-planks', textureUri: 'blocks/oak-planks.png' },
            17: { id: 17, name: 'sand', textureUri: 'blocks/sand.png' },
            19: { id: 19, name: 'stone', textureUri: 'blocks/stone.png' },
            20: { id: 20, name: 'stone-bricks', textureUri: 'blocks/stone-bricks.png' },
            21: { id: 21, name: 'void-sand', textureUri: 'blocks/void-sand.png' },
            100: { id: 100, name: 'start', textureUri: 'blocks/start.png' },
            101: { id: 101, name: 'goal', textureUri: 'blocks/goal.png' },
            102: { id: 102, name: 'checkpoint', textureUri: 'blocks/emerald-block.png' }
        };
    }

    /**
     * Handle save course action from UI
     */
    private async handleSaveCourse(player: Player): Promise<void> {
        
        // Get player's current state to determine if they're in build mode
        const playerData = this.playerStateManager.getPlayerState(player.id);
        
        if (!playerData || playerData.state !== PlayerGameState.BUILDING) {
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, '❌ You must be in build mode to save!', 'FF0000');
            }
            return;
        }

        // Get the plot the player is building on
        const activeBuildPlot = this.plotBuildManager.getPlayerActiveBuildPlot(player.id);
        if (activeBuildPlot === null) {
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, '❌ No active plot to save!', 'FF0000');
            }
            return;
        }

        // Get plot boundaries from PlotBuildManager
        const plotId = this.plotBuildManager.getPlotId(activeBuildPlot);
        const plotBoundaries = this.plotBuildManager.getPlotBoundaries(plotId);
        
        if (!plotBoundaries) {
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, '❌ Could not get plot boundaries!', 'FF0000');
            }
            return;
        }

        // Plot boundaries are already in the format expected by PlotSaveManager
        const saveBoundaries = {
            minX: plotBoundaries.minX,
            maxX: plotBoundaries.maxX,
            minY: plotBoundaries.minY,
            maxY: plotBoundaries.maxY,
            minZ: plotBoundaries.minZ,
            maxZ: plotBoundaries.maxZ
        };

        // Validate course before saving
        const validationResult = await this.validateCourse(player, saveBoundaries);
        if (!validationResult.isValid) {
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, `❌ Course validation failed: ${validationResult.reason}`, 'FF0000');
                if (validationResult.suggestion) {
                    player.world.chatManager.sendPlayerMessage(player, `💡 ${validationResult.suggestion}`, 'FFAA00');
                }
            }
            return;
        }

        // Use PlotSaveManager to save with specific plot boundaries
        try {
            await this.plotSaveManager.savePlotWithBoundaries(player, saveBoundaries, plotId);
            // Success message is already sent by PlotSaveManager
        } catch (error) {
            console.error(`[ObbyPlayerEntity] Error during save operation for player ${player.id}:`, error);
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, '❌ Save operation failed! Please try again.', 'FF0000');
            }
        }
    }

    /**
     * Validate course before saving - check for required blocks and other constraints
     */
    private async validateCourse(player: Player, boundaries: any): Promise<{
        isValid: boolean;
        reason?: string;
        suggestion?: string;
    }> {
        const world = player.world;
        if (!world) {
            return { isValid: false, reason: "World not available" };
        }

        // Scan for start and goal blocks
        let startBlockCount = 0;
        let goalBlockCount = 0;
        let totalBlocks = 0;
        let deadlyBlockCount = 0;

        // Scan the plot area for blocks
        for (let x = Math.floor(boundaries.minX); x <= Math.ceil(boundaries.maxX); x++) {
            for (let y = Math.floor(boundaries.minY); y <= Math.ceil(boundaries.maxY); y++) {
                for (let z = Math.floor(boundaries.minZ); z <= Math.ceil(boundaries.maxZ); z++) {
                    const blockId = world.chunkLattice.getBlockId({ x, y, z });
                    
                    if (blockId === 0) continue; // Skip air blocks
                    
                    totalBlocks++;
                    
                    // Check for specific block types
                    switch (blockId) {
                        case 100: // Start block
                            startBlockCount++;
                            break;
                        case 101: // Goal block
                            goalBlockCount++;
                            break;
                        case 21: // Lava (deadly block)
                            deadlyBlockCount++;
                            break;
                    }
                }
            }
        }

        // Validation rules

        // 1. Must have at least one start block
        if (startBlockCount === 0) {
            return {
                isValid: false,
                reason: "Course must have at least one Start block (green block)",
                suggestion: "Place a Start block where players should spawn. Find it in the inventory under Special blocks."
            };
        }

        // 2. Must have at least one goal block
        if (goalBlockCount === 0) {
            return {
                isValid: false,
                reason: "Course must have at least one Goal block (red block)",
                suggestion: "Place a Goal block at the end of your course. Find it in the inventory under Special blocks."
            };
        }

        // 3. Minimum block count (prevent empty plots)
        if (totalBlocks < 5) {
            return {
                isValid: false,
                reason: "Course is too small - need at least 5 blocks total",
                suggestion: "Add more blocks to create a proper obstacle course."
            };
        }

        // 4. Maximum deadly block ratio (prevent griefing)
        const deadlyRatio = deadlyBlockCount / totalBlocks;
        if (deadlyRatio > 0.5) {
            return {
                isValid: false,
                reason: "Too many deadly blocks - max 50% of course can be lava/deadly",
                suggestion: "Remove some lava blocks and add more platform blocks to balance difficulty."
            };
        }

        // 5. Start block safety zone check
        const unsafeStartBlocks = await this.checkStartBlockSafety(world, boundaries);
        if (unsafeStartBlocks.length > 0) {
            return {
                isValid: false,
                reason: "Start block has deadly blocks too close - spawn killing not allowed",
                suggestion: "Remove lava/deadly blocks within 3 blocks of the start block to prevent spawn killing."
            };
        }

        // 6. Multiple start blocks warning (not an error, just info)
        if (startBlockCount > 1 && player.world) {
            player.world.chatManager.sendPlayerMessage(
                player, 
                `ℹ️ Found ${startBlockCount} start blocks. Players will spawn at a random one.`, 
                'FFFF00'
            );
        }

        // All validations passed
        return { isValid: true };
    }

    /**
     * Check if start blocks have deadly blocks too close (spawn kill protection)
     */
    private async checkStartBlockSafety(world: any, boundaries: any): Promise<Vector3[]> {
        const unsafeStartBlocks: Vector3[] = [];
        const safetyRadius = 3; // 3 block radius around start blocks
        const deadlyBlockIds = [21]; // Lava and other deadly blocks

        // Find all start blocks first
        const startBlocks: Vector3[] = [];
        for (let x = Math.floor(boundaries.minX); x <= Math.ceil(boundaries.maxX); x++) {
            for (let y = Math.floor(boundaries.minY); y <= Math.ceil(boundaries.maxY); y++) {
                for (let z = Math.floor(boundaries.minZ); z <= Math.ceil(boundaries.maxZ); z++) {
                    const blockId = world.chunkLattice.getBlockId({ x, y, z });
                    if (blockId === 100) { // Start block
                        startBlocks.push(new Vector3(x, y, z));
                    }
                }
            }
        }

        // Check safety zone around each start block
        for (const startBlock of startBlocks) {
            let hasDangerousNeighbor = false;

            // Check 3x3x3 area around start block
            for (let dx = -safetyRadius; dx <= safetyRadius; dx++) {
                for (let dy = -safetyRadius; dy <= safetyRadius; dy++) {
                    for (let dz = -safetyRadius; dz <= safetyRadius; dz++) {
                        const checkPos = {
                            x: startBlock.x + dx,
                            y: startBlock.y + dy,
                            z: startBlock.z + dz
                        };

                        const blockId = world.chunkLattice.getBlockId(checkPos);
                        if (deadlyBlockIds.includes(blockId)) {
                            hasDangerousNeighbor = true;
                            break;
                        }
                    }
                    if (hasDangerousNeighbor) break;
                }
                if (hasDangerousNeighbor) break;
            }

            if (hasDangerousNeighbor) {
                unsafeStartBlocks.push(startBlock);
            }
        }

        return unsafeStartBlocks;
    }

    private handleWalkToggle(player: Player): void {
        
        // Get the controller to call the fly mode toggle
        const controller = this.controller as any; // Cast to access the fly mode methods
        
        if (controller && typeof controller.handleFlyModeToggle === 'function') {
            // Create a mock input with f = true to simulate the key press
            const mockInput = { f: true } as any;
            controller.handleFlyModeToggle(this, mockInput);
        } else {
            console.error('[ObbyPlayerEntity] Could not access controller fly mode toggle method');
        }
    }

    private handleNpcOption(player: Player, option: number): void {
        
        // Find nearby NPCs and forward the option to them
        // This is a simple approach - in a more complex system you might want to track which NPC the player is interacting with
        const world = this.world;
        if (!world) return;

        // Get all entities and find NPCs
        const allEntities = world.entityManager.getAllEntities();
        for (const entity of allEntities) {
            // Check if this entity is a DialogNpc and the player is interacting with it
            if (entity && typeof (entity as any).handleOption === 'function') {
                // This is a simple check - in a real implementation you'd want to track which NPC the player is actually interacting with
                try {
                    (entity as any).handleOption(player, option - 1); // Convert 1-based to 0-based
                    break; // Only forward to the first NPC found
                } catch (error) {
                    console.error(`[ObbyPlayerEntity] Error forwarding NPC option:`, error);
                }
            }
        }
    }

    private handleNpcOptionSelected(player: Player, optionIndex: number): void {
        
        // Always use player.world (same as desktop NPC tick handler does)
        const searchWorld = player.world || this.world;
        if (!searchWorld) return;

        this.searchForNpcInWorld(player, optionIndex, searchWorld);
    }

    private searchForNpcInWorld(player: Player, optionIndex: number, world: any): void {
        
        // First, try to find NPCs using the global registry (this is the correct approach)
        const npcRegistry = (globalThis as any).npcRegistry;
        if (npcRegistry) {
            
            for (const [key, npc] of npcRegistry.entries()) {
                const [npcWorldName, npcId] = key.split(':');
                
                if (npcWorldName === world.name) {
                    
                    // Check if this NPC is currently interacting with the player
                    if (npc.interactingPlayers && npc.interactingPlayers.has(player.id)) {
                        
                        try {
                            npc.handleOption(player, optionIndex);
                            return; // Success!
                        } catch (error) {
                            console.error(`[ObbyPlayerEntity] Error calling handleOption on NPC ${npcId}:`, error);
                        }
                    } else {
                        if (npc.interactingPlayers) {
                            const interactingPlayerIds = Array.from(npc.interactingPlayers.keys());
                        }
                    }
                }
            }
        } else {
        }
        
        // Fallback: search entities (this won't work but keeping for debug)
        const allEntities = world.entityManager.getAllEntities();
        
        let entitiesWithHandleOption = 0;
        for (const entity of allEntities) {
            if (entity && typeof (entity as any).handleOption === 'function') {
                entitiesWithHandleOption++;
            }
        }
        
        console.error(`[ObbyPlayerEntity] Could not find any NPC currently interacting with player ${player.id} in world ${world.name}`);
    }


} 