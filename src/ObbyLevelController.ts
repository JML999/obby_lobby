import { World, Player, Vector3, EntityEvent } from 'hytopia';
import type { Vector3Like, EventPayloads } from 'hytopia';
import { ObbyPlayerEntity } from './ObbyPlayerEntity';
import { PlotBuildManager } from './PlotBuildManager';
import type { IObbyPlayManager } from './PlayerObbySession';

export class ObbyLevelController {
    private world: World;
    private plotId: string;
    private playManager: IObbyPlayManager;
    private plotBuildManager: PlotBuildManager;
    
    // Course settings
    private fallThreshold: number = -10; // Y position below which player "falls"
    private startPosition: Vector3Like | null = null;
    private goalPositions: Vector3Like[] = [];
    private isActive: boolean = false;
    
    // Player tracking
    private currentPlayer: Player | null = null;
    private playerEntity: ObbyPlayerEntity | null = null;
    private lastValidPosition: Vector3Like | null = null;
    
    constructor(world: World, plotId: string, playManager: IObbyPlayManager) {
        this.world = world;
        this.plotId = plotId;
        this.playManager = playManager;
        this.plotBuildManager = PlotBuildManager.getInstance();
        
        // Initialization is now done separately via initialize() method
    }

    /**
     * Initialize the level controller - must be called after construction
     */
    public async initialize(): Promise<void> {
        await this.initializeCourse();
    }

    /**
     * Initialize the course by finding start/goal positions and setting up fall detection
     */
    private async initializeCourse(): Promise<void> {
        console.log(`[ObbyLevelController] Initializing course for plot ${this.plotId}`);
        
        const plotBoundaries = this.plotBuildManager.getPlotBoundaries(this.plotId);
        if (!plotBoundaries) {
            console.error(`[ObbyLevelController] No boundaries found for plot ${this.plotId}`);
            return;
        }

        // Find start and goal blocks
        await this.findStartAndGoalBlocks(plotBoundaries);
        
        // Set fall threshold relative to plot minimum Y
        this.fallThreshold = plotBoundaries.minY - 5;
        
        console.log(`[ObbyLevelController] Course initialized - Start: ${this.startPosition ? 'Found' : 'None'}, Goals: ${this.goalPositions.length}, Fall threshold: ${this.fallThreshold}`);
    }

    /**
     * Find start and goal blocks using user-placed blocks instead of tracked blocks
     */
    private async findStartAndGoalBlocks(plotBoundaries: any): Promise<void> {
        this.startPosition = null;
        this.goalPositions = [];

        // Get user-placed blocks from PlotSaveManager (same source as save system)
        const plotSaveManager = (await import('./PlotSaveManager')).PlotSaveManager.getInstance();
        const userPlacedBlocks = plotSaveManager.getUserPlacedBlocksInPlot(this.world, this.plotId);

        console.log(`[ObbyLevelController] Searching through ${userPlacedBlocks.length} user-placed blocks for start and goal blocks`);

        for (const block of userPlacedBlocks) {
            if (block.blockTypeId === 100 && !this.startPosition) {
                // First start block found - center player on the block and add vertical clearance
                this.startPosition = { 
                    x: block.position.x + 0.5, // Center of block (blocks are 1x1x1)
                    y: block.position.y + 1.8, // Slightly above the block for clearance
                    z: block.position.z + 0.5  // Center of block
                };
                console.log(`[ObbyLevelController] Found start block at ${block.position.x}, ${block.position.y}, ${block.position.z}`);
                console.log(`[ObbyLevelController] Start position centered at ${this.startPosition.x}, ${this.startPosition.y}, ${this.startPosition.z}`);
            } else if (block.blockTypeId === 101) {
                // Goal block found
                this.goalPositions.push({ 
                    x: block.position.x + 0.5, // Center of block
                    y: block.position.y + 1, 
                    z: block.position.z + 0.5  // Center of block
                });
                console.log(`[ObbyLevelController] Found goal block at ${block.position.x}, ${block.position.y}, ${block.position.z}`);
            }
        }
    }

    /**
     * Start the level for the current player
     */
    public startPlaying(): void {
        this.isActive = true;
        this.currentPlayer = this.playManager.getCurrentPlayer();
        
        if (!this.currentPlayer) {
            console.error('[ObbyLevelController] No current player to start playing');
            return;
        }

        console.log(`[ObbyLevelController] Starting playing for player ${this.currentPlayer.id}`);

        // Get the player entity with better error handling using more reliable method
        const allPlayerEntities = this.world.entityManager.getAllPlayerEntities();
        console.log(`[ObbyLevelController] All player entities:`, allPlayerEntities.length);
        allPlayerEntities.forEach((entity, index) => {
            console.log(`[ObbyLevelController] Player entity ${index}: ID=${entity.player.id}, spawned=${entity.isSpawned}, constructor=${entity.constructor.name}`);
        });
        
        const playerEntity = allPlayerEntities.find(entity => entity.player.id === this.currentPlayer!.id);
        console.log(`[ObbyLevelController] Looking for player ID: ${this.currentPlayer!.id}`);
        console.log(`[ObbyLevelController] Found player entity for player ${this.currentPlayer!.id}:`, !!playerEntity);
        
        if (!playerEntity) {
            console.error('[ObbyLevelController] No player entity found - retrying in 500ms');
            // Retry after a short delay in case of timing issues
            setTimeout(() => {
                const retryAllEntities = this.world.entityManager.getAllPlayerEntities();
                console.log(`[ObbyLevelController] Retry - All player entities:`, retryAllEntities.length);
                retryAllEntities.forEach((entity, index) => {
                    console.log(`[ObbyLevelController] Retry - Player entity ${index}: ID=${entity.player.id}, spawned=${entity.isSpawned}, constructor=${entity.constructor.name}`);
                });
                
                const retryEntity = retryAllEntities.find(entity => entity.player.id === this.currentPlayer!.id);
                console.log(`[ObbyLevelController] Retry - Looking for player ID: ${this.currentPlayer!.id}`);
                
                if (retryEntity) {
                    console.log(`[ObbyLevelController] Found player entity on retry`);
                    this.playerEntity = retryEntity as ObbyPlayerEntity;
                    this.continueStartPlaying();
                } else {
                    console.error('[ObbyLevelController] Still no player entity found after retry');
                    this.playManager.handlePlayerFailed('Player entity not found');
                }
            }, 500);
            return;
        }

        this.playerEntity = playerEntity as ObbyPlayerEntity;
        this.continueStartPlaying();
    }

    /**
     * Continue the start playing process once player entity is found
     */
    private continueStartPlaying(): void {
        if (!this.playerEntity || !this.currentPlayer) return;
        
        // Set initial checkpoint at start position
        if (this.startPosition) {
            this.lastValidPosition = { ...this.startPosition };
            this.setPlayerCheckpoint(this.startPosition);
        }

        // Set up fall detection
        this.setupFallDetection();

        // Set up goal detection
        this.setupGoalDetection();

        console.log(`[ObbyLevelController] Started playing for player ${this.currentPlayer.id}`);
    }

    /**
     * Set up fall detection for the player
     */
    private setupFallDetection(): void {
        if (!this.playerEntity) return;

        // Set fall threshold on the player controller
        const controller = this.playerEntity.controller;
        if (controller && 'setFallThreshold' in controller) {
            (controller as any).setFallThreshold(this.fallThreshold);
            (controller as any).setFallDetectionEnabled(true);
        }

        // Listen for tick events to check for falls
        this.playerEntity.on(EntityEvent.TICK, this.checkPlayerFall.bind(this));
    }

    /**
     * Set up goal detection (collision with goal blocks)
     */
    private setupGoalDetection(): void {
        if (!this.playerEntity) return;

        // Listen for block collisions
        this.playerEntity.on(EntityEvent.BLOCK_COLLISION, this.handleBlockCollision.bind(this));
    }

    /**
     * Check if player has fallen below the threshold
     */
    private checkPlayerFall(payload: EventPayloads[EntityEvent.TICK]): void {
        if (!this.isActive || !this.playerEntity) return;

        const entity = payload.entity as ObbyPlayerEntity;
        if (!entity || !entity.isSpawned) return;

        // Check if player fell below threshold
        if (entity.position.y < this.fallThreshold) {
            console.log(`[ObbyLevelController] Player fell below threshold (${this.fallThreshold})`);
            this.handlePlayerFall();
        } else {
            // Update last valid position (only if not too close to fall threshold)
            if (entity.position.y > this.fallThreshold + 2) {
                this.lastValidPosition = { ...entity.position };
            }
        }
    }

    /**
     * Handle block collision events
     */
    private handleBlockCollision(payload: EventPayloads[EntityEvent.BLOCK_COLLISION]): void {
        if (!this.isActive || !this.playerEntity) return;

        const entity = payload.entity as ObbyPlayerEntity;
        const blockType = payload.blockType;

        // Get the block position by finding the nearest block to the player
        const playerPos = entity.position;
        const blockPos = {
            x: Math.floor(playerPos.x),
            y: Math.floor(playerPos.y),
            z: Math.floor(playerPos.z)
        };

        // Check blocks around the player position to find the specific block
        const checkPositions = [
            blockPos,
            { x: blockPos.x, y: blockPos.y - 1, z: blockPos.z }, // Block below
            { x: blockPos.x + 1, y: blockPos.y, z: blockPos.z }, // Block to the right
            { x: blockPos.x - 1, y: blockPos.y, z: blockPos.z }, // Block to the left
            { x: blockPos.x, y: blockPos.y, z: blockPos.z + 1 }, // Block forward
            { x: blockPos.x, y: blockPos.y, z: blockPos.z - 1 }  // Block backward
        ];

        for (const checkPos of checkPositions) {
            const blockId = this.world.chunkLattice.getBlockId(checkPos);
            
            // Check if player hit a goal block
            if (blockId === 101) {
                console.log('[ObbyLevelController] Player reached goal block!');
                this.handlePlayerFinish();
                return;
            }
            // Check if player hit a start block (respawn checkpoint)
            else if (blockId === 100) {
                this.setPlayerCheckpoint({ x: checkPos.x + 0.5, y: checkPos.y + 1.8, z: checkPos.z + 0.5 });
                console.log(`[ObbyLevelController] Checkpoint updated at start block (centered)`);
                return;
            }
            // Check if player hit a dangerous block (lava, etc.)
            else if (blockId === 10) { // Lava block
                console.log('[ObbyLevelController] Player hit lava block!');
                this.handlePlayerFall();
                return;
            }
        }
    }

    /**
     * Handle player falling/dying
     */
    private handlePlayerFall(): void {
        if (!this.isActive || !this.playerEntity || !this.currentPlayer) return;

        console.log('[ObbyLevelController] Handling player fall');

        // Stop the player
        this.playerEntity.setLinearVelocity({ x: 0, y: 0, z: 0 });
        this.playerEntity.setAngularVelocity({ x: 0, y: 0, z: 0 });

        // Respawn at last checkpoint
        const respawnPosition = this.lastValidPosition || this.startPosition;
        if (respawnPosition) {
            this.playerEntity.setPosition(respawnPosition);
            
            // Send respawn message
            this.world.chatManager.sendPlayerMessage(
                this.currentPlayer,
                '💀 You fell! Respawning at checkpoint...',
                'FF6B6B'
            );

            console.log(`[ObbyLevelController] Player respawned at ${respawnPosition.x}, ${respawnPosition.y}, ${respawnPosition.z}`);
        } else {
            console.error('[ObbyLevelController] No respawn position available!');
        }
    }

    /**
     * Handle player finishing the course
     */
    private handlePlayerFinish(): void {
        if (!this.isActive || !this.currentPlayer) return;

        console.log('[ObbyLevelController] Player finished the course!');

        // Stop the level
        this.isActive = false;

        // Notify the play manager
        this.playManager.handlePlayerFinished();
    }

    /**
     * Set a checkpoint position for the player
     */
    private setPlayerCheckpoint(position: Vector3Like): void {
        if (!this.playerEntity) return;

        const controller = this.playerEntity.controller;
        if (controller && 'setCheckpoint' in controller) {
            (controller as any).setCheckpoint(position);
        }

        // Update our internal checkpoint
        this.lastValidPosition = { ...position };
    }

    /**
     * Get the plot ID this level controller is managing
     */
    public getPlotId(): string {
        return this.plotId;
    }

    /**
     * Get the start position for the course
     */
    public getStartPosition(): Vector3Like | null {
        return this.startPosition;
    }

    /**
     * Get all goal positions for the course
     */
    public getGoalPositions(): Vector3Like[] {
        return [...this.goalPositions];
    }

    /**
     * Check if the course is currently active
     */
    public isLevelActive(): boolean {
        return this.isActive;
    }

    /**
     * Get the current fall threshold
     */
    public getFallThreshold(): number {
        return this.fallThreshold;
    }

    /**
     * Update the fall threshold
     */
    public setFallThreshold(threshold: number): void {
        this.fallThreshold = threshold;
        
        // Update player controller if available
        if (this.playerEntity) {
            const controller = this.playerEntity.controller;
            if (controller && 'setFallThreshold' in controller) {
                (controller as any).setFallThreshold(threshold);
            }
        }
    }

    /**
     * Cleanup the level controller
     */
    public cleanup(): void {
        console.log(`[ObbyLevelController] Cleaning up level for plot ${this.plotId}`);
        
        this.isActive = false;
        
        // Remove event listeners only if player entity still exists
        if (this.playerEntity && this.playerEntity.isSpawned) {
            this.playerEntity.off(EntityEvent.TICK, this.checkPlayerFall.bind(this));
            this.playerEntity.off(EntityEvent.BLOCK_COLLISION, this.handleBlockCollision.bind(this));
            
            // Disable fall detection but keep the player entity intact
            const controller = this.playerEntity.controller;
            if (controller && 'setFallDetectionEnabled' in controller) {
                (controller as any).setFallDetectionEnabled(false);
                console.log('[ObbyLevelController] Fall detection disabled');
            }
        }

        // Reset references but don't interfere with player entity
        this.currentPlayer = null;
        this.playerEntity = null; // Only remove our reference, don't touch the actual entity
        this.lastValidPosition = null;
        this.startPosition = null;
        this.goalPositions = [];
    }
} 