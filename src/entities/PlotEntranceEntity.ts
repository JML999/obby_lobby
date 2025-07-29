import { SmartBlockEntity } from './SmartBlockEntity';
import { World, Vector3, Player, PlayerEntity, SceneUI, ColliderShape, EntityEvent, RigidBodyType } from 'hytopia';
import { BlockPlacementManager } from '../BlockPlacementManager';
import { PlayerStateManager, PlayerGameState } from '../PlayerGameState';
import { PlotBuildManager } from '../PlotBuildManager';
import { PlotSaveManager } from '../PlotSaveManager';
import { ObbyPlayManager } from '../ObbyPlayManager';
import { SystemManager } from '../SystemManager';
import type { WorldContext } from '../WorldContext';
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
        
        // Log WorldContext status for this plot
        this.logWorldContextStatus();
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
                world.chatManager.sendPlayerMessage(player, '❌ Could not start play mode!');
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
                world.chatManager.sendPlayerMessage(player, '❌ You can only build on plots you own!');
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
                world.chatManager.sendPlayerMessage(player, '❌ Failed to enter build mode!');
            }
        } else {
            // Send UI message to potentially show build tutorial
            player.ui.sendData({
                type: 'showBuildTutorial',
                plotIndex: this.plotIndex
            });
            
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
        
        // Set player state back to LOBBY with proper plot index
        console.log(`[PlotEntranceEntity] Exiting build mode for ${player.id}, returning to lobby for plot ${this.plotIndex}`);
        this.playerStateManager.setPlayerState(player.id, PlayerGameState.LOBBY, this.plotIndex, player);
        
        // Clear player's active build plot without teleporting
        this.plotBuildManager.setPlayerActiveBuildPlot(player.id, null);
        
        if (world) {
            world.chatManager.sendPlayerMessage(player, '🏠 Exited build mode - Welcome back to the lobby!');
        }
    }

    private async clearPlot(player: Player) {
        const world = this.world;
        if (!world) return;

        // Only allow owner to clear
        if (this.owner !== player.id) {
            if (world) {
                world.chatManager.sendPlayerMessage(player, '❌ You can only clear plots you own!');
            }
            return;
        }
        
        console.log(`[PlotEntranceEntity] Clearing plot ${this.plotIndex} for player ${player.id}`);
        
        const plotIdString = String(this.plotIndex);
        
        // Use the same working logic as PlotSaveManager.clearPlotWithBoundaries
        // This focuses on user-placed blocks, not boundary scanning
        
        try {
            const DELETE_BLOCK_ID = 106;
            let blocksCleared = 0;
            
            // Use WorldContext if available, fallback to direct manager access
            const context = this.getWorldContext();
            
            if (context) {
                console.log(`[PlotEntranceEntity] 🧹 WorldContext Plot Clearing - Plot: ${this.plotIndex} (${plotIdString})`);
                // Use context.saveSystem for clearing
                await context.saveSystem.clearPlotPhysicalContent(plotIdString);
                
                // Get cleared count from build manager through context
                const livePlacedBlocks = this.plotBuildManager.getPlotPlacedBlocks(this.plotIndex);
                blocksCleared = livePlacedBlocks.length;
                console.log(`[PlotEntranceEntity] ✅ WorldContext cleared ${blocksCleared} blocks from plot ${this.plotIndex}`);
                
                // Clear the build tracking data
                this.plotBuildManager.clearPlotBuildData(this.plotIndex);
            } else {
                console.log(`[PlotEntranceEntity] 🔧 Legacy Plot Clearing - Plot: ${this.plotIndex} (${plotIdString})`);
                // Legacy fallback - get blocks from live build tracking system
                const plotBuildManager = this.plotBuildManager;
                const livePlacedBlocks = plotBuildManager.getPlotPlacedBlocks(this.plotIndex);
                
                console.log(`[PlotEntranceEntity] Found ${livePlacedBlocks.length} live placed blocks to clear`);
                
                if (livePlacedBlocks.length > 0) {
                // Validate block IDs before processing to prevent crashes
                const { blockRegistry } = require('../BlockRegistry');
                const validBlocks = livePlacedBlocks.filter(block => {
                    const blockExists = blockRegistry.getBlock(block.blockId);
                    if (!blockExists) {
                        console.warn(`[PlotEntranceEntity] Skipping invalid block ID ${block.blockId} at position ${block.position.x},${block.position.y},${block.position.z}`);
                        return false;
                    }
                    return true;
                });
                
                // First loop: Set ALL blocks to delete_block
                for (const block of validBlocks) {
                    world.chunkLattice.setBlock(block.position, DELETE_BLOCK_ID);
                }
                
                // Wait 1 second before clearing to air
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Second loop: Set ALL blocks to air
                for (const block of validBlocks) {
                    world.chunkLattice.setBlock(block.position, 0);
                }
                
                blocksCleared = validBlocks.length;
                
                // Clear the build tracking data
                plotBuildManager.clearPlotBuildData(this.plotIndex);
                }
            }
            
            // Clear obstacles and enemies (keeping current implementation for now)
            let obstaclesCleared = 0;
            let zombiesCleared = 0;
            
            // Clear obstacles using saved data (obstacles aren't in live build tracking)
            const playerObbyData = await this.plotSaveManager.getPlayerObby(player);
            const plotData = playerObbyData?.plotData;
            if (plotData && plotData.obstacles.length > 0) {
                const plotCenter = plotData.plotCenter;
                
                // Convert saved obstacles to world positions
                const obstaclesToRemove = plotData.obstacles.map(savedObstacle => ({
                    position: {
                        x: plotCenter.x + savedObstacle.relativePos.x,
                        y: plotCenter.y + savedObstacle.relativePos.y,
                        z: plotCenter.z + savedObstacle.relativePos.z
                    },
                    type: savedObstacle.type,
                    id: savedObstacle.id
                }));
                
                // Despawn the actual obstacle entities
                for (const obstacle of obstaclesToRemove) {
                    const obstacles = world.entityManager.getEntitiesByTag('obstacle');
                    for (const entity of obstacles) {
                        const entityPos = entity.position;
                        const obstaclePos = obstacle.position;
                        const distance = Math.sqrt(
                            Math.pow(entityPos.x - obstaclePos.x, 2) +
                            Math.pow(entityPos.y - obstaclePos.y, 2) +
                            Math.pow(entityPos.z - obstaclePos.z, 2)
                        );
                        
                        if (distance <= 2) { // Close enough to be the same obstacle
                            entity.despawn();
                            obstaclesCleared++;
                            break;
                        }
                    }
                }
            }
            
            // Clear from collision manager tracking (fallback for any tracked obstacles)
            const { ObstacleCollisionManager } = await import('../ObstacleCollisionManager');
            const obstacleCollisionManager = ObstacleCollisionManager.getInstance();
            obstacleCollisionManager.clearPlotObstacles(plotIdString);
            
            // Clear zombies using saved data
            if (plotData && plotData.enemies && plotData.enemies.length > 0) {
                const plotCenter = plotData.plotCenter;
                
                // Convert saved enemies to world positions
                const enemiesToRemove = plotData.enemies.map(savedEnemy => ({
                    position: {
                        x: plotCenter.x + savedEnemy.relativePos.x,
                        y: plotCenter.y + savedEnemy.relativePos.y,
                        z: plotCenter.z + savedEnemy.relativePos.z
                    },
                    type: savedEnemy.type,
                    variant: savedEnemy.variant
                }));
                
                // Despawn the actual zombie entities
                const allEntities = world.entityManager.getAllEntities();
                const zombies = allEntities.filter(entity => entity.constructor.name === 'ZombieEntity');
                
                for (const enemy of enemiesToRemove) {
                    for (const zombie of zombies) {
                        const zombiePos = zombie.position;
                        const enemyPos = enemy.position;
                        const distance = Math.sqrt(
                            Math.pow(zombiePos.x - enemyPos.x, 2) +
                            Math.pow(zombiePos.y - enemyPos.y, 2) +
                            Math.pow(zombiePos.z - enemyPos.z, 2)
                        );
                        
                        if (distance <= 2) { // Close enough to be the same zombie
                            zombie.despawn();
                            zombiesCleared++;
                            break;
                        }
                    }
                }
            } else {
                // Fallback: use boundary-based clearing
                const { EnemyPlacementManager } = await import('../EnemyPlacementManager');
                const enemyPlacementManager = EnemyPlacementManager.getInstance();
                zombiesCleared = enemyPlacementManager.clearPlotEnemies(plotIdString);
            }
            
            console.log(`[PlotEntranceEntity] Cleared ${zombiesCleared} zombies from plot ${this.plotIndex}`);
            
            // Clear the player's saved obby data (if any)
            await this.plotSaveManager.clearPlayerObby(player, plotIdString);
            
            // Clear the scoreboard for this plot
            const { ScoreboardManager } = await import('../ScoreboardManager');
            const scoreboardManager = ScoreboardManager.getInstance();
            scoreboardManager.clearPlotScoreboard(plotIdString, world);
            
            world.chatManager.sendPlayerMessage(player, `🗑️ Plot cleared! All blocks and obby data for ${this.getCurrentPlotName()} have been removed. (${blocksCleared} blocks, ${obstaclesCleared} obstacles, ${zombiesCleared} zombies cleared)`, 'FF0000');
            console.log(`[PlotEntranceEntity] Successfully cleared plot ${this.plotIndex}: ${blocksCleared} blocks, ${obstaclesCleared} obstacles, ${zombiesCleared} zombies`);
            
        } catch (error) {
            console.error(`[PlotEntranceEntity] Error clearing plot ${this.plotIndex}:`, error);
            world.chatManager.sendPlayerMessage(player, '❌ Error occurred while clearing plot!', 'FF0000');
        }
    }

    private isPlayerOnCooldown(playerId: string, option: string): boolean {
        const playerCooldowns = this.playerCooldowns.get(playerId);
        if (!playerCooldowns) return false;
        const cooldownEndTime = playerCooldowns.get(option);
        if (!cooldownEndTime) return false;
        const now = Date.now();
        return now < cooldownEndTime;
    }

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

    public setOwner(ownerId: string): void {
        this.owner = ownerId;
        console.log(`[PlotEntranceEntity] Plot ${this.plotIndex} ownership set to player ${ownerId}`);
    }

    public getOwner(): string | undefined {
        return this.owner;
    }

    public getPlotIndex(): number {
        return this.plotIndex;
    }

    /**
     * Get the WorldContext for this plot's world (Phase 1 migration)
     */
    private getWorldContext(): WorldContext | null {
        if (!this.world) return null;
        return SystemManager.getInstance().getWorldContext(this.world) as WorldContext;
    }

    /**
     * Log WorldContext integration status for this plot
     */
    private logWorldContextStatus(): void {
        // We can't check world context until spawned since this.world is not set yet
        setTimeout(() => {
            const context = this.getWorldContext();
            if (context) {
                const systemType = SystemManager.getInstance().getWorldSystemType(this.world?.name || 'unknown');
                console.log(`[PlotEntranceEntity] ✅ Plot ${this.plotIndex} - WorldContext active - System: ${systemType}`);
                console.log(`[PlotEntranceEntity] 🏡 Plot ${this.plotIndex} systems - Save: ${!!context.saveSystem}, Plot: ${!!context.plotManager}`);
            } else {
                console.log(`[PlotEntranceEntity] ⚠️ Plot ${this.plotIndex} - WorldContext not available, using legacy systems`);
            }
        }, 100); // Small delay to ensure world is set
    }
}