import { SmartBlockEntity } from './SmartBlockEntity';
import { World, Vector3, Player, PlayerEntity, SceneUI, ColliderShape, EntityEvent, RigidBodyType } from 'hytopia';
import { BlockPlacementManager } from '../BlockPlacementManager';
import { PlayerStateManager, PlayerGameState } from '../PlayerGameState';
import { PlotBuildManager } from '../PlotBuildManager';
import { PlotSaveManager } from '../PlotSaveManager';
import { ObbyPlayManager } from '../ObbyPlayManager';
import { CollisionGroups } from '../CollisionGroups';
import { MobileDetectionManager } from '../MobileDetectionManager';

// Store open SceneUI per player
const playerSceneUIs: Map<string, SceneUI> = new Map();

interface PlotEntranceOptions {
    plotIndex: number;
    plotName: string;
    owner?: string; // Player ID who owns this plot
}

export class PlotEntranceEntity extends SmartBlockEntity {
    private plotIndex: number;
    private plotName: string;
    private owner?: string;
    private isOccupied: boolean = false;
    private playerStateManager: PlayerStateManager;
    private plotBuildManager: PlotBuildManager;
    private plotSaveManager: PlotSaveManager;
    private obbyPlayManager: ObbyPlayManager;
    private nearbyPlayers: Set<string> = new Set(); // Track players near this entrance
    private currentOptions: Map<string, string[]> = new Map(); // Store current options for each player
    
    // Cooldown system to prevent option spamming
    private playerCooldowns: Map<string, Map<string, number>> = new Map(); // playerId -> optionType -> timestamp
    private readonly OPTION_COOLDOWNS = {
        'Play': 3000,           // 3 seconds for play
        'Build': 2000,          // 2 seconds for build 
        'Clear Plot': 5000,     // 5 seconds for clear (more destructive)
        'Exit Play Mode': 1000, // 1 second for exit
        'Exit Build Mode': 1000 // 1 second for exit
    };

    constructor(options: PlotEntranceOptions) {
        super({
            modelUri: 'models/misc/selection-indicator.gltf',
            scale: { x: 0.5, y: 0.5, z: 0.5 },
            rigidBodyOptions: {
                type: RigidBodyType.FIXED,
                isSensor: true,
            },
        });
        
        this.plotIndex = options.plotIndex;
        this.plotName = options.plotName;
        this.owner = options.owner;
        this.playerStateManager = PlayerStateManager.getInstance();
        this.plotBuildManager = PlotBuildManager.getInstance();
        this.plotSaveManager = PlotSaveManager.getInstance();
        this.obbyPlayManager = ObbyPlayManager.getInstance();
    }

    // Helper method to convert plot index to clockwise display number
    private getDisplayNumber(): number {
        // Same logic as PlotManager.getClockwiseDisplayNumber()
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
        
        return clockwiseMap[this.plotIndex] || this.plotIndex + 1;
    }

    // Get the current plot name using the display number
    private getCurrentPlotName(): string {
        const displayNumber = this.getDisplayNumber();
        return `Plot ${displayNumber}`;
    }

    // Update the plot name to use the correct display number
    public updatePlotName(): void {
        this.plotName = this.getCurrentPlotName();
    }

    override spawnWithCollider(world: World, position: Vector3) {
        const displayNumber = this.getDisplayNumber();
        this.spawn(world, position);
        
        // Set up input handling for Q, E, R keys
        this.setupInputHandling();
        
        this.createAndAddChildCollider({
            shape: ColliderShape.CYLINDER,
            radius: 1,
            halfHeight: 1,
            isSensor: true,
            collisionGroups: {
                belongsTo: [CollisionGroups.PLOT_ENTRANCE],
                collidesWith: [CollisionGroups.PLAYER], // Only detect players, exclude FLY group
            },
            onCollision: (other: any, started: boolean) => {
                if (other instanceof PlayerEntity) {
                    const player = other.player;
                    if (started) {
                        this.nearbyPlayers.add(player.id);
                        this.plotBuildManager.setPlayerNearPlot(player.id, this.plotIndex);
                        this.onPlayerInteract(player);
                    } else {
                        this.nearbyPlayers.delete(player.id);
                        this.currentOptions.delete(player.id);
                        this.playerCooldowns.delete(player.id); // Clear cooldowns when player leaves
                        this.plotBuildManager.setPlayerNearPlot(player.id, null);
                        
                        // Clean up UI for both desktop and mobile
                        const ui = playerSceneUIs.get(player.id);
                        if (ui) {
                            try { ui.unload(); } catch (e) {}
                            playerSceneUIs.delete(player.id);
                        }
                        
                        // Hide mobile plot options if mobile player
                        const isMobile = MobileDetectionManager.getInstance().isPlayerMobile(player.id);
                        if (isMobile) {
                            player.ui.sendData({
                                type: 'plotInteractionEnded'
                            });
                        }
                    }
                }
            },
        });
    }

    override async onPlayerInteract(player: Player) {
        const world = this.world;
        if (!world) return;

        // Get player's current state to determine available options
        const currentState = this.playerStateManager.getCurrentState(player.id);
        const playerData = this.playerStateManager.getPlayerState(player.id);

        // Determine options based on ownership and current state
        let options: string[] = [];
        let contextualInfo = '';

        if (this.owner === player.id) {
            // Player owns this plot - show basic options for now
            if (currentState === PlayerGameState.BUILDING && playerData?.plotIndex === this.plotIndex) {
                // Already building this plot - show exit option only (can't play while building)
                options = ['Exit Build Mode'];
                contextualInfo = 'Currently building this plot';
            } else if (currentState === PlayerGameState.PLAYING && playerData?.plotIndex === this.plotIndex) {
                // Already playing this plot - show exit option
                options = ['Exit Play Mode', 'Build'];
                contextualInfo = 'Currently playing this plot';
            } else {
                // Not actively engaged with this plot - show basic options
                // Always show Clear Plot for owners (they might want to clear unsaved blocks)
                options = ['Play', 'Build', 'Clear Plot'];
                contextualInfo = `Your plot: ${this.getCurrentPlotName()}`;
            }
        } else {
            // Player doesn't own this plot
            if (currentState === PlayerGameState.PLAYING && playerData?.plotIndex === this.plotIndex) {
                // Already playing this plot - show exit option
                options = ['Exit Play Mode'];
                contextualInfo = 'Currently playing this plot';
            } else {
                // Not actively engaged - only show play option
                options = ['Play'];
                // For pool maps, just show the plot name without any ownership info
                // This keeps it clean and focuses on the leaderboard aspect
                contextualInfo = this.getCurrentPlotName();
            }
        }

        // Get player entity
        const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
        if (!playerEntities || playerEntities.length === 0) {
            console.warn('[PlotEntranceEntity] No player entity found for player', player.id);
            return;
        }
        const playerEntity = playerEntities[0];

        // Use MobileDetectionManager for mobile check
        const isMobile = MobileDetectionManager.getInstance().isPlayerMobile(player.id);

        if (isMobile) {
            // Send a custom message for mobile UI
            player.ui.sendData({
                type: 'showMobilePlayerOptions',
                options,
                plotIndex: this.plotIndex,
                owningPlayerId: player.id,
                contextualInfo,
                currentState
            });
        } else {
            // Use SceneUI for desktop
            // Unload any previous UI for this player
            const prevUI = playerSceneUIs.get(player.id);
            if (prevUI) {
                try { prevUI.unload(); } catch (e) {}
            }
            const sceneUI = new SceneUI({
                templateId: 'player-options',
                attachedToEntity: playerEntity,
                offset: { x: 0, y: -0.5, z: 0 },
                state: { 
                    options, 
                    owningPlayerId: player.id, 
                    plotIndex: this.plotIndex,
                    contextualInfo,
                    currentState
                }
            });
            sceneUI.load(world);
            playerSceneUIs.set(player.id, sceneUI);
        }
        
        // Store current options for this player to handle Q, E, R input mapping
        this.currentOptions.set(player.id, options);
    }

    /**
     * Set up input handling for Q, E, R keys to select player options
     */
    private setupInputHandling() {
        this.on(EntityEvent.TICK, () => {
            // Check for Q, E, R key inputs from nearby players
            this.nearbyPlayers.forEach(playerId => {
                const player = this.world?.entityManager.getAllPlayerEntities()
                    .find(playerEntity => playerEntity.player.id === playerId)?.player;
                
                if (!player || !player.input) return;
                
                const input = player.input;
                const options = this.currentOptions.get(playerId);
                
                if (!options || options.length === 0) return;
                
                // Map Q, E, R keys to option indices
                if (input.q && options.length > 0 && options[0]) {
                    this.onPlayerOptionSelected(player, options[0]);
                } else if (input.e && options.length > 1 && options[1]) {
                    this.onPlayerOptionSelected(player, options[1]);
                } else if (input.r && options.length > 2 && options[2]) {
                    this.onPlayerOptionSelected(player, options[2]);
                }
            });
        });
    }

    /**
     * Handle player's option selection from UI
     */
    async onPlayerOptionSelected(player: Player, option: string) {
        const displayNumber = this.getDisplayNumber();
        
        // Check cooldown for this option
        if (this.isPlayerOnCooldown(player.id, option)) {
            return;
        }
        
        // Set cooldown for this option
        this.setPlayerCooldown(player.id, option);
        
        switch (option) {
            case 'Play':
                await this.startPlayMode(player);
                break;
            case 'Build':
                await this.startBuildMode(player);
                break;
            case 'Clear Plot':
                await this.clearPlot(player);
                break;
            case 'Exit Play Mode':
                this.exitPlayMode(player);
                break;
            case 'Exit Build Mode':
                this.exitBuildMode(player);
                break;
            default:
                console.warn(`[PlotEntranceEntity] Unknown option selected: ${option}`);
        }

        // Close the UI after selection
        const ui = playerSceneUIs.get(player.id);
        if (ui) {
            try { ui.unload(); } catch (e) {}
            playerSceneUIs.delete(player.id);
        }
    }

    private async startPlayMode(player: Player) {
        const world = this.world;
        if (!world) return;

        // Use ObbyPlayManager to start the game
        const success = await this.obbyPlayManager.startObbyPlay(player, this.plotIndex);
        if (!success) {
            // Play mode failed to start - send error message
            if (world) {
                world.chatManager.sendPlayerMessage(player, '❌ Could not start play mode!', 'FF0000');
            }
            return;
        }
        // Success message is handled by ObbyPlayManager
    }

    private async startBuildMode(player: Player) {
        const world = this.world;
        if (!world) return;
        
        // Only allow owner to build
        if (this.owner !== player.id) {
            if (world) {
                world.chatManager.sendPlayerMessage(player, '❌ You can only build on plots you own!', 'FF0000');
            }
            return;
        }
        
        // Set player state to BUILDING
        this.playerStateManager.setPlayerState(player.id, PlayerGameState.BUILDING, this.plotIndex, player);
        
        // Initialize plot for building without teleporting
        const success = await this.plotBuildManager.activateBuildMode(player, this.plotIndex);
        
        if (!success) {
            // Reset state if build mode activation failed
            this.playerStateManager.setPlayerState(player.id, PlayerGameState.LOBBY, undefined, player);
            if (world) {
                world.chatManager.sendPlayerMessage(player, '❌ Failed to enter build mode!', 'FF0000');
            }
        } else {
            // Send UI message to potentially show build tutorial
            player.ui.sendData({
                type: 'showBuildTutorial',
                plotIndex: this.plotIndex
            });
            
            if (world) {
                world.chatManager.sendPlayerMessage(player, `🔨 Build mode activated! Start creating your obby course!`, '00FF00');
                world.chatManager.sendPlayerMessage(player, `💡 Tip: Press F to toggle fly mode, press 2 to undo`, 'FFFF00');
            }
        }
    }

    private exitPlayMode(player: Player) {
        const world = this.world;
        if (!world) return;

        // Use ObbyPlayManager to force quit this specific player's session
        this.obbyPlayManager.forceQuitPlayer(player.id);
        
        // ObbyPlayManager handles state cleanup and messaging
    }

    private exitBuildMode(player: Player) {
        const world = this.world;
        if (!world) return;
        
        // Disable fly mode before exiting build mode
        this.plotBuildManager.disablePlayerFlyMode(player);
        
        // Set player state back to LOBBY
        this.playerStateManager.setPlayerState(player.id, PlayerGameState.LOBBY, undefined, player);
        
        // Clear player's active build plot without teleporting
        this.plotBuildManager.setPlayerActiveBuildPlot(player.id, null);
        
        if (world) {
            world.chatManager.sendPlayerMessage(player, '🏠 Exited build mode', 'FFFF00');
        }
    }

    private async clearPlot(player: Player) {
        const world = this.world;
        if (!world) return;

        // Only allow owner to clear
        if (this.owner !== player.id) {
            if (world) {
                world.chatManager.sendPlayerMessage(player, '❌ You can only clear plots you own!', 'FF0000');
            }
            return;
        }
        
        // Get plot boundaries from PlotBuildManager
        const plotBoundaries = this.plotBuildManager.getPlotBoundaries(this.plotIndex);
        
        if (!plotBoundaries) {
            if (world) {
                world.chatManager.sendPlayerMessage(player, '❌ Could not get plot boundaries!', 'FF0000');
            }
            return;
        }
        
        // Convert plot boundaries to the format expected by PlotSaveManager
        // Use the actual properties from plotBoundaries instead of non-existent ones
        const clearBoundaries = {
            minX: plotBoundaries.minX,
            maxX: plotBoundaries.maxX,
            minY: plotBoundaries.minY,
            maxY: plotBoundaries.maxY,
            minZ: plotBoundaries.minZ,
            maxZ: plotBoundaries.maxZ
        };
        
        // Clear the player's saved obby data (if any)
        await this.plotSaveManager.clearPlayerObby(player, this.plotIndex);
        
        // Clear the physical plot blocks using boundaries
        await this.plotSaveManager.clearPlotWithBoundaries(player, clearBoundaries, this.plotIndex);
        
        // Clear the scoreboard for this plot
        const { ScoreboardManager } = await import('../ScoreboardManager');
        const scoreboardManager = ScoreboardManager.getInstance();
        scoreboardManager.clearPlotScoreboard(this.plotIndex, world);
        
        // Don't change player state or teleport - just clear the plot
        // The player can choose to enter build mode manually if they want
        
        if (world) {
            world.chatManager.sendPlayerMessage(player, `🧹 Plot cleared successfully! You can now build a new course.`, '00FF00');
        }
    }

    // Method to check if player can build in this plot
    canPlayerBuild(player: Player): boolean {
        return this.owner === player.id && this.playerStateManager.isPlayerInState(player.id, PlayerGameState.BUILDING);
    }

    // Method to get plot boundaries
    getPlotBoundaries(): { xStart: number; xEnd: number; zStart: number; zEnd: number } {
        // Import the helper function dynamically to avoid circular imports
        const { getPlotCoordinates } = require('../generateObbyHubMap');
        return getPlotCoordinates(this.plotIndex);
    }

    // Method to release plot ownership
    releasePlot() {
        this.owner = undefined;
        this.isOccupied = false;
    }

    // Get plot index
    getPlotIndex(): number {
        return this.plotIndex;
    }

    // Set plot owner
    setOwner(ownerId: string | null) {
        this.owner = ownerId || undefined;
    }

    // Get plot owner
    getOwner(): string | undefined {
        return this.owner;
    }

    /**
     * Check if a player is on cooldown for a specific option
     */
    private isPlayerOnCooldown(playerId: string, option: string): boolean {
        const playerCooldowns = this.playerCooldowns.get(playerId);
        if (!playerCooldowns) return false;
        
        const cooldownEndTime = playerCooldowns.get(option);
        if (!cooldownEndTime) return false;
        
        const now = Date.now();
        return now < cooldownEndTime;
    }

    /**
     * Get remaining cooldown time in milliseconds
     */
    private getRemainingCooldown(playerId: string, option: string): number {
        const playerCooldowns = this.playerCooldowns.get(playerId);
        if (!playerCooldowns) return 0;
        
        const cooldownEndTime = playerCooldowns.get(option);
        if (!cooldownEndTime) return 0;
        
        const now = Date.now();
        return Math.max(0, cooldownEndTime - now);
    }

    /**
     * Set cooldown for a player's option
     */
    private setPlayerCooldown(playerId: string, option: string): void {
        const cooldownDuration = this.OPTION_COOLDOWNS[option as keyof typeof this.OPTION_COOLDOWNS];
        if (!cooldownDuration) return;
        
        if (!this.playerCooldowns.has(playerId)) {
            this.playerCooldowns.set(playerId, new Map());
        }
        
        const playerCooldowns = this.playerCooldowns.get(playerId)!;
        const cooldownEndTime = Date.now() + cooldownDuration;
        playerCooldowns.set(option, cooldownEndTime);
    }


} 