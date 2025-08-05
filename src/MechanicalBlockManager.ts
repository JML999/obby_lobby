import { World, Vector3 } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import { MechanicalPistonEntity } from './entities/MechanicalPistonEntity';
import { MechanicalWheelEntity } from './entities/MechanicalWheelEntity';
import { MechanicalElevatorEntity } from './entities/MechanicalElevatorEntity';
import { ConfigurableMechanicalEntity } from './entities/ConfigurableMechanicalEntity';
import { MECHANICAL_BLOCK_IDS } from './BlockRegistry';
import { CashCalculator } from './CashCalculator';

/**
 * Manages mechanical block entities and their placement
 * Handles the entity-based approach for mechanical blocks (no actual blocks in chunk lattice)
 */
export interface PlotMechanicalEntity {
    id: string; // Unique identifier
    position: Vector3Like; // World position
    type: 'mechanical'; // Entity type for obstacle manager compatibility
    size: 'custom'; // Custom size for mechanical entities
    config: {
        entityType: 'static' | 'elevator' | 'carousel' | 'side-to-side' | 'front-to-back';
        dimensions: { x: number; y: number; z: number };
        speed: number;
        distance: number;
        rotationSpeed?: number;
    };
    cost: number; // Store the cost for refund when deleted
    entity?: ConfigurableMechanicalEntity; // Reference to the actual entity instance
}

export class MechanicalBlockManager {
    private static instance: MechanicalBlockManager;
    private world?: World;
    private pistonEntities: Map<string, MechanicalPistonEntity> = new Map();
    private wheelEntities: Map<string, MechanicalWheelEntity> = new Map();
    private elevatorEntities: Map<string, MechanicalElevatorEntity> = new Map();
    private configurableEntities: Map<string, ConfigurableMechanicalEntity> = new Map();
    

    /**
     * Initialize the manager with a world context
     */
    public initializeWorld(world: World): void {
        this.world = world;
        console.log(`[MechanicalBlockManager] Initialized with world: ${world.name}`);
    }

    /**
     * Register a mechanical entity with the ObstacleCollisionManager for proper persistence
     */
    private registerMechanicalEntityAsObstacle(
        plotId: string, 
        positionKey: string, 
        position: Vector3Like, 
        entity: ConfigurableMechanicalEntity,
        config?: any
    ): void {
        if (!this.world) return;
        
        const { ObstacleCollisionManager } = require('./ObstacleCollisionManager');
        const obstacleManager = ObstacleCollisionManager.getInstance();
        obstacleManager.initializeWorld(this.world);
        
        const success = obstacleManager.registerObstacle(
            plotId,
            positionKey,
            'mechanical', // type
            'custom', // size
            position,
            positionKey, // entityId
            config, // Pass full config
            entity // Pass entity reference for build mode control
        );
        
        if (success) {
            console.log(`[MechanicalBlockManager] 📋 Registered mechanical entity with ObstacleCollisionManager`);
        } else {
            console.warn(`[MechanicalBlockManager] ⚠️ Failed to register mechanical entity with ObstacleCollisionManager`);
        }
    }

    
    /**
     * Get all mechanical entities in a plot for saving - delegate to ObstacleCollisionManager
     */
    public getPlotMechanicalEntities(plotId: string): PlotMechanicalEntity[] {
        const { ObstacleCollisionManager } = require('./ObstacleCollisionManager');
        const obstacleManager = ObstacleCollisionManager.getInstance();
        const mechanicalEntities = obstacleManager.getPlotMechanicalEntities(plotId);
        
        console.log(`[MechanicalBlockManager] 💾 GET DEBUG - Found ${mechanicalEntities.length} mechanical entities for plot ${plotId} from ObstacleCollisionManager`);
        
        // Convert to PlotMechanicalEntity format if needed
        return mechanicalEntities.map(entity => ({
            id: entity.id,
            position: entity.position,
            type: entity.type,
            size: entity.size,
            config: entity.config,
            cost: entity.cost || entity.config?.cost || 2
        }));
    }
    
    /**
     * Clear all mechanical entities in a plot - delegate to ObstacleCollisionManager
     */
    public clearPlotMechanicalEntities(plotId: string): void {
        // Clear from local tracking first
        for (const [key, entity] of this.configurableEntities.entries()) {
            // Check if this entity belongs to the plot
            if (entity) {
                entity.despawn();
                this.configurableEntities.delete(key);
            }
        }
        
        // Delegate to ObstacleCollisionManager for main tracking
        const { ObstacleCollisionManager } = require('./ObstacleCollisionManager');
        const obstacleManager = ObstacleCollisionManager.getInstance();
        obstacleManager.clearPlotMechanicalEntities(plotId);
        
        console.log(`[MechanicalBlockManager] Cleared all mechanical entities for plot ${plotId} via ObstacleCollisionManager`);
    }
    
    /**
     * Remove a specific mechanical entity and refund its cost - delegate to ObstacleCollisionManager
     */
    public removeMechanicalEntity(plotId: string, entityId: string, player?: any): number {
        // Find and remove from local tracking
        const entity = this.configurableEntities.get(entityId);
        if (entity) {
            entity.despawn();
            this.configurableEntities.delete(entityId);
        }
        
        // Delegate to ObstacleCollisionManager for removal and get refund amount
        const { ObstacleCollisionManager } = require('./ObstacleCollisionManager');
        const obstacleManager = ObstacleCollisionManager.getInstance();
        const obstacles = obstacleManager.getPlotObstacles(plotId);
        
        // Find the obstacle to remove
        for (const obstacle of obstacles) {
            if (obstacle.id === entityId && obstacle.type === 'mechanical') {
                // Remove the obstacle
                const removed = obstacleManager.unregisterObstacle(plotId, obstacle.position);
                if (removed && removed.config) {
                    const refundAmount = removed.config.cost || 2;
                    console.log(`[MechanicalBlockManager] Removed mechanical entity ${entityId} from plot ${plotId}, refunding ${refundAmount} cash`);
                    return refundAmount;
                }
                break;
            }
        }
        
        return 0;
    }
    
    
    public static getInstance(): MechanicalBlockManager {
        if (!MechanicalBlockManager.instance) {
            MechanicalBlockManager.instance = new MechanicalBlockManager();
        }
        return MechanicalBlockManager.instance;
    }

    private constructor() {}

    public initializeWorld(world: World): void {
        this.world = world;
        console.log('[MechanicalBlockManager] Initialized with world');
    }

    /**
     * Handle placement of mechanical blocks by creating corresponding entities
     * Uses slot selection for orientation/position choice
     */
    public onMechanicalBlockPlaced(blockId: number, position: Vector3Like, slotIndex?: number, player?: any, plotId?: string): boolean {
        if (!this.world) {
            console.error('[MechanicalBlockManager] World not initialized');
            return false;
        }

        const positionKey = this.getPositionKey(position);
        
        // Check if this is a mechanical block
        if (blockId === MECHANICAL_BLOCK_IDS.GENERAL) {
            return this.showConfigPanel(position, positionKey, player);
        } else if (blockId === MECHANICAL_BLOCK_IDS.PISTON) {
            return this.placePistonEntity(position, positionKey, slotIndex);
        } else if (blockId === MECHANICAL_BLOCK_IDS.WHEEL) {
            return this.placeWheelEntity(position, positionKey, slotIndex);
        } else if (blockId === MECHANICAL_BLOCK_IDS.ELEVATOR) {
            return this.placeElevatorEntity(position, positionKey, slotIndex);
        }
        
        return false;
    }

    /**
     * Handle removal of mechanical blocks by despawning corresponding entities
     */
    public onMechanicalBlockRemoved(position: Vector3Like): boolean {
        const positionKey = this.getPositionKey(position);
        
        // Check for piston entity at this position
        if (this.pistonEntities.has(positionKey)) {
            const pistonEntity = this.pistonEntities.get(positionKey)!;
            pistonEntity.despawn();
            this.pistonEntities.delete(positionKey);
            console.log(`[MechanicalBlockManager] Removed piston entity at ${positionKey}`);
            return true;
        }
        
        // Check for wheel entity at this position
        if (this.wheelEntities.has(positionKey)) {
            const wheelEntity = this.wheelEntities.get(positionKey)!;
            wheelEntity.despawn();
            this.wheelEntities.delete(positionKey);
            console.log(`[MechanicalBlockManager] Removed wheel entity at ${positionKey}`);
            return true;
        }
        
        // Check for elevator entity at this position
        if (this.elevatorEntities.has(positionKey)) {
            const elevatorEntity = this.elevatorEntities.get(positionKey)!;
            elevatorEntity.despawn();
            this.elevatorEntities.delete(positionKey);
            console.log(`[MechanicalBlockManager] Removed elevator entity at ${positionKey}`);
            return true;
        }
        
        return false;
    }

    /**
     * Place a piston entity with constrained slot selection (3 linear slots: X, Y, Z)
     */
    private placePistonEntity(position: Vector3Like, positionKey: string, slotIndex?: number): boolean {
        try {
            // Determine piston axis from slot index (0=X, 1=Y, 2=Z) or default to X
            const pistonAxes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
            const axisIndex = (slotIndex !== undefined && slotIndex >= 0 && slotIndex < 3) ? slotIndex : 0;
            const pistonAxis = pistonAxes[axisIndex];
            
            // Create and spawn piston entity
            const pistonEntity = new MechanicalPistonEntity(this.world!, pistonAxis, position);
            pistonEntity.spawn(this.world!, position);
            
            // Store entity reference
            this.pistonEntities.set(positionKey, pistonEntity);
            
            console.log(`[MechanicalBlockManager] Placed ${pistonAxis}-axis piston at ${positionKey} (slot ${axisIndex})`);
            return true;
            
        } catch (error) {
            console.error(`[MechanicalBlockManager] Error placing piston entity:`, error);
            return false;
        }
    }

    /**
     * Place a wheel entity with constrained slot selection (8 radial slots: 1-8)
     */
    private placeWheelEntity(position: Vector3Like, positionKey: string, slotIndex?: number): boolean {
        try {
            // Determine wheel starting position from slot index (0-7 maps to positions 1-8) or default to 1
            const positionIndex = (slotIndex !== undefined && slotIndex >= 0 && slotIndex < 8) ? slotIndex : 0;
            const startingPosition = positionIndex + 1; // Convert 0-7 to 1-8
            
            // Create and spawn wheel entity (using placement position as center, default size 1, uniform growth)
            const wheelEntity = new MechanicalWheelEntity(this.world!, position, startingPosition, 1, 'both');
            wheelEntity.spawn(this.world!, position);
            
            // Store entity reference
            this.wheelEntities.set(positionKey, wheelEntity);
            
            console.log(`[MechanicalBlockManager] Placed wheel (position ${startingPosition}) at ${positionKey} (slot ${positionIndex})`);
            return true;
            
        } catch (error) {
            console.error(`[MechanicalBlockManager] Error placing wheel entity:`, error);
            return false;
        }
    }

    /**
     * Place an elevator entity (no slot selection needed - elevators only move vertically)
     */
    private placeElevatorEntity(position: Vector3Like, positionKey: string, slotIndex?: number): boolean {
        try {
            // Create and spawn elevator entity (no slot selection needed for vertical movement)
            const elevatorEntity = new MechanicalElevatorEntity(this.world!, position);
            elevatorEntity.spawn(this.world!, position);
            
            // Always activate elevator entities
            elevatorEntity.activate();
            
            // Store entity reference
            this.elevatorEntities.set(positionKey, elevatorEntity);
            
            console.log(`[MechanicalBlockManager] Placed elevator at ${positionKey}`);
            return true;
            
        } catch (error) {
            console.error(`[MechanicalBlockManager] Error placing elevator entity:`, error);
            return false;
        }
    }

    /**
     * Show configuration panel for general mechanical block
     */
    private showConfigPanel(position: Vector3Like, positionKey: string, player?: any, plotId?: string): boolean {
        try {
            if (!player) {
                console.error('[MechanicalBlockManager] No player provided for config panel');
                return false;
            }

            // No need to remove physical block since BlockPlacementManager no longer places one initially
            console.log(`[MechanicalBlockManager] Starting preview for general mechanical block at ${positionKey}`);
            console.log(`[MechanicalBlockManager] Received position from BlockPlacementManager: ${position.x}, ${position.y}, ${position.z}`);

            // Make sure to clean up any existing entities/blocks at this position first
            this.removePreviewEntity(position);

            // Create initial preview entity with default config
            const defaultConfig = {
                type: 'static' as const,
                sizeX: 1,
                sizeY: 1,
                sizeZ: 1
            };
            
            this.createPreviewEntity(position, positionKey, defaultConfig, plotId, player);

            player.ui.sendData({
                type: 'showMechanicalConfig',
                position: {
                    x: position.x,
                    y: position.y, 
                    z: position.z
                },
                config: defaultConfig,
                plotId: plotId // Include plotId for tracking
            });
            console.log(`[MechanicalBlockManager] Showed config panel to player ${player.id} for position ${positionKey} with initial preview`);
            
            return true;
            
        } catch (error) {
            console.error(`[MechanicalBlockManager] Error showing config panel:`, error);
            return false;
        }
    }

    /**
     * Register an elevator entity (called by elevator when spawned)
     */
    public registerElevatorEntity(position: Vector3Like, elevatorEntity: MechanicalElevatorEntity): void {
        const positionKey = this.getPositionKey(position);
        this.elevatorEntities.set(positionKey, elevatorEntity);
        console.log(`[MechanicalBlockManager] Registered elevator entity at ${positionKey}`);
    }

    /**
     * Check if block ID is a mechanical block (entity-only)
     */
    public isMechanicalBlock(blockId: number): boolean {
        return blockId === MECHANICAL_BLOCK_IDS.PISTON || 
               blockId === MECHANICAL_BLOCK_IDS.WHEEL ||
               blockId === MECHANICAL_BLOCK_IDS.ELEVATOR;
    }

    /**
     * Check if block ID is the general mechanical block (needs config panel)
     */
    public isGeneralMechanicalBlock(blockId: number): boolean {
        return blockId === MECHANICAL_BLOCK_IDS.GENERAL;
    }

    /**
     * Handle placement of general mechanical block (shows config panel)
     */
    public onGeneralMechanicalBlockPlaced(position: Vector3Like, player?: any, plotId?: string): boolean {
        if (!this.world) {
            console.error('[MechanicalBlockManager] World not initialized');
            return false;
        }

        const positionKey = this.getPositionKey(position);
        console.log(`[MechanicalBlockManager] General mechanical block placed at ${positionKey}, showing config panel`);
        
        return this.showConfigPanel(position, positionKey, player, plotId);
    }

    /**
     * Generate position key for entity mapping
     */
    private getPositionKey(position: Vector3Like): string {
        return `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;
    }

    /**
     * Get all active piston entities
     */
    public getPistonEntities(): Map<string, MechanicalPistonEntity> {
        return new Map(this.pistonEntities);
    }

    /**
     * Get all active wheel entities
     */
    public getWheelEntities(): Map<string, MechanicalWheelEntity> {
        return new Map(this.wheelEntities);
    }

    /**
     * Get piston entity at specific position
     */
    public getPistonEntityAt(position: Vector3Like): MechanicalPistonEntity | undefined {
        const positionKey = this.getPositionKey(position);
        return this.pistonEntities.get(positionKey);
    }

    /**
     * Get wheel entity at specific position
     */
    public getWheelEntityAt(position: Vector3Like): MechanicalWheelEntity | undefined {
        const positionKey = this.getPositionKey(position);
        return this.wheelEntities.get(positionKey);
    }

    /**
     * Get configurable mechanical entity at specific position
     */
    public getConfigurableEntityAt(position: Vector3Like): ConfigurableMechanicalEntity | undefined {
        const positionKey = this.getPositionKey(position);
        return this.configurableEntities.get(positionKey);
    }

    /**
     * Remove entity from local tracking only (used by BlockPlacementManager)
     */
    public removeFromLocalTracking(positionKey: string): void {
        this.configurableEntities.delete(positionKey);
    }

    /**
     * Clear all mechanical entities (for cleanup)
     */
    public clearAllEntities(): void {
        console.log(`[MechanicalBlockManager] Clearing ${this.pistonEntities.size} pistons and ${this.wheelEntities.size} wheels`);
        
        // Despawn all piston entities
        for (const pistonEntity of this.pistonEntities.values()) {
            pistonEntity.despawn();
        }
        this.pistonEntities.clear();
        
        // Despawn all wheel entities
        for (const wheelEntity of this.wheelEntities.values()) {
            wheelEntity.despawn();
        }
        this.wheelEntities.clear();
        
        // Clear configurable entities
        for (const entity of this.configurableEntities.values()) {
            entity.despawn();
        }
        this.configurableEntities.clear();
    }

    /**
     * Clear all mechanical entities in a specific plot - delegate to clearPlotMechanicalEntities
     */
    public clearAllEntitiesInPlot(plotId: string): void {
        this.clearPlotMechanicalEntities(plotId);
    }

    /**
     * Register an existing wheel entity (called when wheel is spawned via ObstaclePlacementManager)
     */
    public registerWheelEntity(position: Vector3Like, wheelEntity: MechanicalWheelEntity): void {
        const positionKey = this.getPositionKey(position);
        this.wheelEntities.set(positionKey, wheelEntity);
        console.log(`[MechanicalBlockManager] Registered wheel entity at ${positionKey}`);
    }

    /**
     * Register an existing piston entity (called when piston is spawned via ObstaclePlacementManager)
     */
    public registerPistonEntity(position: Vector3Like, pistonEntity: MechanicalPistonEntity): void {
        const positionKey = this.getPositionKey(position);
        this.pistonEntities.set(positionKey, pistonEntity);
        console.log(`[MechanicalBlockManager] Registered piston entity at ${positionKey}`);
    }

    /**
     * Get total count of active mechanical entities
     */
    public getEntityCount(): { pistons: number; wheels: number; total: number } {
        const pistons = this.pistonEntities.size;
        const wheels = this.wheelEntities.size;
        return {
            pistons,
            wheels,
            total: pistons + wheels
        };
    }



    /**
     * Handle mechanical config panel confirmation
     */
    public onMechanicalConfigConfirmed(position: Vector3Like, config: {
        type: 'static' | 'elevator' | 'carousel' | 'side-to-side' | 'front-to-back';
        sizeX: number;
        sizeY: number;
        sizeZ: number;
        speed?: number;
        distance?: number;
    }, plotId?: string, player?: any): boolean {
        if (!this.world) {
            console.error('[MechanicalBlockManager] World not initialized');
            return false;
        }

        const positionKey = this.getPositionKey(position);
        console.log(`[MechanicalBlockManager] Confirming ${config.type} mechanical entity at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ} - keeping existing entity`);

        // Remove the preview entity and create a new one with the confirmed configuration
        this.removePreviewEntity(position);
        
        // Create the final entity with the confirmed configuration
        const created = this.createPreviewEntity(position, positionKey, config, plotId, player);
        if (!created) {
            console.error(`[MechanicalBlockManager] Failed to create confirmed entity at ${positionKey}`);
            return false;
        }
        
        // Verify the entity was created and track it for saving
        if (this.configurableEntities.has(positionKey)) {
            // If plotId is provided, check cash and track this entity for saving
            if (plotId && player) {
                // Calculate cost based on dimensions
                const dimensions = { x: config.sizeX, y: config.sizeY, z: config.sizeZ };
                const cost = CashCalculator.getMechanicalEntityCost(dimensions);
                
                // Check if player has enough cash
                const { PlotSaveManager } = require('./PlotSaveManager');
                const plotSaveManager = PlotSaveManager.getInstance();
                const currentCash = plotSaveManager.getPlayerCash(player);
                
                if (!CashCalculator.canAffordMechanicalEntity(currentCash, dimensions)) {
                    console.log(`[MechanicalBlockManager] Player ${player.id} cannot afford mechanical entity confirmation (cost: ${cost}, cash: ${currentCash})`);
                    // Remove the preview entity since they can't afford it
                    this.removePreviewEntity(position);
                    return false;
                }
                
                // Deduct cost
                const newCash = CashCalculator.deductMechanicalEntityCost(currentCash, dimensions);
                plotSaveManager.setPlayerCash(player, newCash);
                console.log(`[MechanicalBlockManager] Deducted ${cost} cash from player ${player.id} for confirmation (remaining: ${newCash})`);
                
                const entity = this.configurableEntities.get(positionKey)!;
                
                // Remove the preview registration first
                const { ObstacleCollisionManager } = require('./ObstacleCollisionManager');
                const obstacleManager = ObstacleCollisionManager.getInstance();
                
                // Calculate entity spawn position that was used for preview
                const entitySpawnPosition = {
                    x: position.x + 0.5,
                    y: position.y + 0.5,
                    z: position.z + 0.5
                };
                
                // Remove ALL registrations at this position (including duplicates from previous loads)
                const removedCount = obstacleManager.unregisterAllObstaclesAt(plotId, entitySpawnPosition);
                console.log(`[MechanicalBlockManager] 🗑️ Removed ${removedCount.length} obstacle registrations from ObstacleCollisionManager`);
                
                // Register ONLY with ObstacleCollisionManager (like jump pads) with full config
                const fullConfig = {
                    entityType: config.type,
                    dimensions: { x: config.sizeX, y: config.sizeY, z: config.sizeZ },
                    speed: config.speed || 2.0,
                    distance: config.distance || 2,
                    rotationSpeed: config.type === 'carousel' ? 1.0 : undefined,
                    cost: cost
                };
                
                // Use entity spawn position for consistency with save/load
                this.registerMechanicalEntityAsObstacle(plotId, positionKey, entitySpawnPosition, entity, fullConfig);
                console.log(`[MechanicalBlockManager] ✅ Registered confirmed entity with ObstacleCollisionManager`);
            } else {
                console.log(`[MechanicalBlockManager] Entity confirmed and kept at ${positionKey} (no plot tracking)`);
            }
            return true;
        } else {
            console.error(`[MechanicalBlockManager] Expected entity not found at ${positionKey} - creating fallback`);
            // Fallback: create the entity if somehow it doesn't exist
            return this.createPreviewEntity(position, positionKey, config, plotId, player);
        }
    }

    /**
     * Create a static mechanical entity (non-moving entity)
     */
    private createStaticEntity(position: Vector3Like, positionKey: string, config: any, plotId?: string, player?: any, isLoading: boolean = false, savedCost?: number): boolean {
        // Calculate cost based on dimensions (or use saved cost when loading)
        const dimensions = { x: config.sizeX, y: config.sizeY, z: config.sizeZ };
        const cost = savedCost || CashCalculator.getMechanicalEntityCost(dimensions);
        
        // Check if player has enough cash (if player is provided and not loading)
        if (player && plotId && !isLoading) {
            const { PlotSaveManager } = require('./PlotSaveManager');
            const plotSaveManager = PlotSaveManager.getInstance();
            const currentCash = plotSaveManager.getPlayerCash(player);
            
            if (!CashCalculator.canAffordMechanicalEntity(currentCash, dimensions)) {
                console.log(`[MechanicalBlockManager] Player ${player.id} cannot afford mechanical entity (cost: ${cost}, cash: ${currentCash})`);
                return false;
            }
            
            // Deduct cost
            const newCash = CashCalculator.deductMechanicalEntityCost(currentCash, dimensions);
            plotSaveManager.setPlayerCash(player, newCash);
            console.log(`[MechanicalBlockManager] Deducted ${cost} cash from player ${player.id} (remaining: ${newCash})`);
        }
        
        const staticEntity = new ConfigurableMechanicalEntity(
            this.world!, 
            position, 
            'static',
            config.sizeX,
            config.sizeY,
            config.sizeZ,
            config.speed || 2.0,
            config.distance || 2
        );
        staticEntity.spawn(this.world!, position);
        
        this.configurableEntities.set(positionKey, staticEntity);
        
        // Register with ObstacleCollisionManager for proper persistence
        if (plotId && !isLoading) { // Only register new entities, not loaded ones (they get registered in loadMechanicalEntities)
            const fullConfig = {
                entityType: 'static',
                dimensions: { x: config.sizeX, y: config.sizeY, z: config.sizeZ },
                speed: config.speed || 2.0,
                distance: config.distance || 2,
                cost: cost
            };
            this.registerMechanicalEntityAsObstacle(plotId, positionKey, position, staticEntity, fullConfig);
        }
        
        console.log(`[MechanicalBlockManager] Created configurable static entity (FIXED entity) at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ} for ${cost} cash`);
        return true;
    }

    /**
     * Create an elevator entity with custom size
     */
    private createElevatorEntity(position: Vector3Like, positionKey: string, config: any, plotId?: string, player?: any, isLoading: boolean = false, savedCost?: number): boolean {
        const elevatorEntity = new ConfigurableMechanicalEntity(
            this.world!, 
            position, 
            'elevator',
            config.sizeX,
            config.sizeY,
            config.sizeZ,
            config.speed || 2.0,
            config.distance || 2
        );
        elevatorEntity.spawn(this.world!, position);
        
        // Calculate cost based on dimensions (or use saved cost when loading)
        const dimensions = { x: config.sizeX, y: config.sizeY, z: config.sizeZ };
        const cost = savedCost || CashCalculator.getMechanicalEntityCost(dimensions);
        
        // Check if player has enough cash (if player is provided and not loading)
        if (player && plotId && !isLoading) {
            const { PlotSaveManager } = require('./PlotSaveManager');
            const plotSaveManager = PlotSaveManager.getInstance();
            const currentCash = plotSaveManager.getPlayerCash(player);
            
            if (!CashCalculator.canAffordMechanicalEntity(currentCash, dimensions)) {
                console.log(`[MechanicalBlockManager] Player ${player.id} cannot afford mechanical entity (cost: ${cost}, cash: ${currentCash})`);
                return false;
            }
            
            // Deduct cost
            const newCash = CashCalculator.deductMechanicalEntityCost(currentCash, dimensions);
            plotSaveManager.setPlayerCash(player, newCash);
            console.log(`[MechanicalBlockManager] Deducted ${cost} cash from player ${player.id} (remaining: ${newCash})`);
        }
        
        this.configurableEntities.set(positionKey, elevatorEntity);
        
        // Register with ObstacleCollisionManager for proper persistence
        if (plotId && !isLoading) { // Only register new entities, not loaded ones (they get registered in loadMechanicalEntities)
            const fullConfig = {
                entityType: 'elevator',
                dimensions: { x: config.sizeX, y: config.sizeY, z: config.sizeZ },
                speed: config.speed || 2.0,
                distance: config.distance || 2,
                cost: cost
            };
            this.registerMechanicalEntityAsObstacle(plotId, positionKey, position, elevatorEntity, fullConfig);
        }
        
        console.log(`[MechanicalBlockManager] Created configurable elevator at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ} for ${cost} cash`);
        return true;
    }

    /**
     * Create a carousel entity (rotating wheel)
     */
    private createCarouselEntity(position: Vector3Like, positionKey: string, config: any, plotId?: string, player?: any, isLoading: boolean = false, savedCost?: number): boolean {
        // Calculate cost based on dimensions (or use saved cost when loading)
        const dimensions = { x: config.sizeX, y: config.sizeY, z: config.sizeZ };
        const cost = savedCost || CashCalculator.getMechanicalEntityCost(dimensions);
        
        // Check if player has enough cash (if player is provided and not loading)
        if (player && plotId && !isLoading) {
            const { PlotSaveManager } = require('./PlotSaveManager');
            const plotSaveManager = PlotSaveManager.getInstance();
            const currentCash = plotSaveManager.getPlayerCash(player);
            
            if (!CashCalculator.canAffordMechanicalEntity(currentCash, dimensions)) {
                console.log(`[MechanicalBlockManager] Player ${player.id} cannot afford mechanical entity (cost: ${cost}, cash: ${currentCash})`);
                return false;
            }
            
            // Deduct cost
            const newCash = CashCalculator.deductMechanicalEntityCost(currentCash, dimensions);
            plotSaveManager.setPlayerCash(player, newCash);
            console.log(`[MechanicalBlockManager] Deducted ${cost} cash from player ${player.id} (remaining: ${newCash})`);
        }
        
        const carouselEntity = new ConfigurableMechanicalEntity(
            this.world!, 
            position, 
            'carousel',
            config.sizeX,
            config.sizeY,
            config.sizeZ,
            config.speed || 2.0,
            config.distance || 2
        );
        carouselEntity.spawn(this.world!, position);
        
        this.configurableEntities.set(positionKey, carouselEntity);
        
        // Register with ObstacleCollisionManager for proper persistence
        if (plotId && !isLoading) { // Only register new entities, not loaded ones (they get registered in loadMechanicalEntities)
            const fullConfig = {
                entityType: 'carousel',
                dimensions: { x: config.sizeX, y: config.sizeY, z: config.sizeZ },
                speed: config.speed || 2.0,
                distance: config.distance || 2,
                rotationSpeed: 1.0,
                cost: cost
            };
            this.registerMechanicalEntityAsObstacle(plotId, positionKey, position, carouselEntity, fullConfig);
        }
        
        console.log(`[MechanicalBlockManager] Created configurable carousel (KINEMATIC entity) at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ} for ${cost} cash`);
        return true;
    }

    /**
     * Create a side-to-side entity (horizontal piston, X-axis movement)
     */
    private createSideToSideEntity(position: Vector3Like, positionKey: string, config: any, plotId?: string, player?: any, isLoading: boolean = false, savedCost?: number): boolean {
        // Calculate cost based on dimensions (or use saved cost when loading)
        const dimensions = { x: config.sizeX, y: config.sizeY, z: config.sizeZ };
        const cost = savedCost || CashCalculator.getMechanicalEntityCost(dimensions);
        
        // Check if player has enough cash (if player is provided and not loading)
        if (player && plotId && !isLoading) {
            const { PlotSaveManager } = require('./PlotSaveManager');
            const plotSaveManager = PlotSaveManager.getInstance();
            const currentCash = plotSaveManager.getPlayerCash(player);
            
            if (!CashCalculator.canAffordMechanicalEntity(currentCash, dimensions)) {
                console.log(`[MechanicalBlockManager] Player ${player.id} cannot afford mechanical entity (cost: ${cost}, cash: ${currentCash})`);
                return false;
            }
            
            // Deduct cost
            const newCash = CashCalculator.deductMechanicalEntityCost(currentCash, dimensions);
            plotSaveManager.setPlayerCash(player, newCash);
            console.log(`[MechanicalBlockManager] Deducted ${cost} cash from player ${player.id} (remaining: ${newCash})`);
        }
        
        const sideToSideEntity = new ConfigurableMechanicalEntity(
            this.world!, 
            position, 
            'side-to-side',
            config.sizeX,
            config.sizeY,
            config.sizeZ,
            config.speed || 2.0,
            config.distance || 2
        );
        sideToSideEntity.spawn(this.world!, position);
        
        this.configurableEntities.set(positionKey, sideToSideEntity);
        
        // Register with ObstacleCollisionManager for proper persistence
        if (plotId && !isLoading) { // Only register new entities, not loaded ones (they get registered in loadMechanicalEntities)
            const fullConfig = {
                entityType: 'side-to-side',
                dimensions: { x: config.sizeX, y: config.sizeY, z: config.sizeZ },
                speed: config.speed || 2.0,
                distance: config.distance || 2,
                cost: cost
            };
            this.registerMechanicalEntityAsObstacle(plotId, positionKey, position, sideToSideEntity, fullConfig);
        }
        
        console.log(`[MechanicalBlockManager] Created configurable side-to-side (X-axis KINEMATIC entity) at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ} for ${cost} cash`);
        return true;
    }

    /**
     * Create a front-to-back entity (horizontal piston, Z-axis movement)
     */
    private createFrontToBackEntity(position: Vector3Like, positionKey: string, config: any, plotId?: string, player?: any, isLoading: boolean = false, savedCost?: number): boolean {
        // Calculate cost based on dimensions (or use saved cost when loading)
        const dimensions = { x: config.sizeX, y: config.sizeY, z: config.sizeZ };
        const cost = savedCost || CashCalculator.getMechanicalEntityCost(dimensions);
        
        // Check if player has enough cash (if player is provided and not loading)
        if (player && plotId && !isLoading) {
            const { PlotSaveManager } = require('./PlotSaveManager');
            const plotSaveManager = PlotSaveManager.getInstance();
            const currentCash = plotSaveManager.getPlayerCash(player);
            
            if (!CashCalculator.canAffordMechanicalEntity(currentCash, dimensions)) {
                console.log(`[MechanicalBlockManager] Player ${player.id} cannot afford mechanical entity (cost: ${cost}, cash: ${currentCash})`);
                return false;
            }
            
            // Deduct cost
            const newCash = CashCalculator.deductMechanicalEntityCost(currentCash, dimensions);
            plotSaveManager.setPlayerCash(player, newCash);
            console.log(`[MechanicalBlockManager] Deducted ${cost} cash from player ${player.id} (remaining: ${newCash})`);
        }
        
        const frontToBackEntity = new ConfigurableMechanicalEntity(
            this.world!, 
            position, 
            'front-to-back',
            config.sizeX,
            config.sizeY,
            config.sizeZ,
            config.speed || 2.0,
            config.distance || 2
        );
        frontToBackEntity.spawn(this.world!, position);
        
        this.configurableEntities.set(positionKey, frontToBackEntity);
        
        // Register with ObstacleCollisionManager for proper persistence
        if (plotId && !isLoading) { // Only register new entities, not loaded ones (they get registered in loadMechanicalEntities)
            const fullConfig = {
                entityType: 'front-to-back',
                dimensions: { x: config.sizeX, y: config.sizeY, z: config.sizeZ },
                speed: config.speed || 2.0,
                distance: config.distance || 2,
                cost: cost
            };
            this.registerMechanicalEntityAsObstacle(plotId, positionKey, position, frontToBackEntity, fullConfig);
        }
        
        console.log(`[MechanicalBlockManager] Created configurable front-to-back (Z-axis KINEMATIC entity) at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ} for ${cost} cash`);
        return true;
    }

    /**
     * Handle real-time preview updates during configuration
     */
    public onMechanicalPreviewUpdate(position: Vector3Like, config: {
        type: 'static' | 'elevator' | 'carousel' | 'side-to-side' | 'front-to-back';
        sizeX: number;
        sizeY: number;
        sizeZ: number;
        speed?: number;
        distance?: number;
    }, plotId?: string, player?: any): boolean {
        if (!this.world) {
            console.error('[MechanicalBlockManager] World not initialized');
            return false;
        }

        const positionKey = this.getPositionKey(position);
        console.log(`[MechanicalBlockManager] Updating preview for ${config.type} at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ}`);

        // First, remove any existing preview entity at this position
        this.removePreviewEntity(position);

        // Create new preview entity with updated config
        return this.createPreviewEntity(position, positionKey, config, plotId, player);
    }

    /**
     * Remove existing preview entity at position
     */
    private removePreviewEntity(position: Vector3Like): void {
        const positionKey = this.getPositionKey(position);
        
        // Check and remove from all entity maps
        if (this.configurableEntities.has(positionKey)) {
            const entity = this.configurableEntities.get(positionKey)!;
            entity.despawn();
            this.configurableEntities.delete(positionKey);
            console.log(`[MechanicalBlockManager] Removed preview configurable entity at ${positionKey}`);
        }
        
        if (this.pistonEntities.has(positionKey)) {
            const entity = this.pistonEntities.get(positionKey)!;
            entity.despawn();
            this.pistonEntities.delete(positionKey);
            console.log(`[MechanicalBlockManager] Removed preview piston entity at ${positionKey}`);
        }
        
        if (this.wheelEntities.has(positionKey)) {
            const entity = this.wheelEntities.get(positionKey)!;
            entity.despawn();
            this.wheelEntities.delete(positionKey);
            console.log(`[MechanicalBlockManager] Removed preview wheel entity at ${positionKey}`);
        }
        
        if (this.elevatorEntities.has(positionKey)) {
            const entity = this.elevatorEntities.get(positionKey)!;
            entity.despawn();
            this.elevatorEntities.delete(positionKey);
            console.log(`[MechanicalBlockManager] Removed preview elevator entity at ${positionKey}`);
        }
        
    }

    /**
     * Create preview entity with current config
     */
    private createPreviewEntity(position: Vector3Like, positionKey: string, config: any, plotId?: string, player?: any): boolean {
        try {
            // Entities are center-based, chunk lattice blocks are corner-based
            // Offset all axes by +0.5 to center entities properly
            const entityPosition = {
                x: position.x + 0.5,
                y: position.y + 0.5,  // Add 0.5 to Y to lift entities to correct height
                z: position.z + 0.5
            };
            console.log(`[MechanicalBlockManager] 🔨 PLACEMENT DEBUG - Chunk lattice position: ${position.x}, ${position.y}, ${position.z}`);
            console.log(`[MechanicalBlockManager] 🔨 PLACEMENT DEBUG - Entity spawn position: ${entityPosition.x}, ${entityPosition.y}, ${entityPosition.z}`);
            
            switch (config.type) {
                case 'static':
                    return this.createStaticEntity(entityPosition, positionKey, config, plotId, player);
                    
                case 'elevator':
                    return this.createElevatorEntity(entityPosition, positionKey, config, plotId, player);
                    
                case 'carousel':
                    return this.createCarouselEntity(entityPosition, positionKey, config, plotId, player);
                    
                case 'side-to-side':
                    return this.createSideToSideEntity(entityPosition, positionKey, config, plotId, player);
                    
                case 'front-to-back':
                    return this.createFrontToBackEntity(entityPosition, positionKey, config, plotId, player);
                    
                default:
                    console.error(`[MechanicalBlockManager] Unknown preview type: ${config.type}`);
                    return false;
            }
        } catch (error) {
            console.error(`[MechanicalBlockManager] Error creating preview entity:`, error);
            return false;
        }
    }

    /**
     * Stop preview and clean up preview entities
     */
    public onMechanicalPreviewStop(position: Vector3Like): void {
        console.log(`[MechanicalBlockManager] Stopping preview at position:`, position);
        this.removePreviewEntity(position);
    }

    /**
     * Load a single mechanical entity and register it with ObstacleCollisionManager (like jump pads)
     */
    public loadSingleMechanicalEntity(plotId: string, entityId: string, position: Vector3Like, config: any, world: World): boolean {
        try {
            const positionKey = this.getPositionKey(position);
            
            // Add +0.5 offset to center entities properly (saved position is chunk lattice corner)
            const entitySpawnPosition = {
                x: position.x + 0.5,
                y: position.y + 0.5,
                z: position.z + 0.5
            };
            
            console.log(`[MechanicalBlockManager] Loading single mechanical entity ${config.entityType} at ${positionKey}`);
            console.log(`[MechanicalBlockManager] 📂 SINGLE-LOAD DEBUG - Saved position: ${position.x}, ${position.y}, ${position.z}`);
            console.log(`[MechanicalBlockManager] 📂 SINGLE-LOAD DEBUG - Entity spawn position: ${entitySpawnPosition.x}, ${entitySpawnPosition.y}, ${entitySpawnPosition.z}`);
            
            // Create the entity using the stored configuration
            const entity = new ConfigurableMechanicalEntity(
                world,
                entitySpawnPosition,
                config.entityType,
                config.dimensions.x,
                config.dimensions.y,
                config.dimensions.z,
                config.speed || 2.0,
                config.distance || 2
            );

            // Note: rotationSpeed is automatically calculated from speed in the entity constructor

            // Spawn the entity
            entity.spawn(world, entitySpawnPosition);
            
            // Always activate loaded entities (except static ones)
            if (config.entityType !== 'static') {
                entity.activate();
                console.log(`[MechanicalBlockManager] 🔄 Activated loaded ${config.entityType} entity`);
            }
            
            // Store the entity
            this.configurableEntities.set(positionKey, entity);
            
            // Register with ObstacleCollisionManager for proper persistence (like jump pads)
            // Use original chunk lattice position for consistency with entity creation
            this.registerMechanicalEntityAsObstacle(plotId, positionKey, position, entity, config);
            
            // No need to track separately - ObstacleCollisionManager handles it
            
            console.log(`[MechanicalBlockManager] Successfully loaded single ${config.entityType} entity with dimensions ${config.dimensions.x}x${config.dimensions.y}x${config.dimensions.z} at ${positionKey}`);
            return true;
            
        } catch (error) {
            console.error(`[MechanicalBlockManager] Error loading single mechanical entity:`, error);
            return false;
        }
    }

    /**
     * Load mechanical entities from saved data (called during plot loading)
     */
    public loadMechanicalEntities(plotId: string, mechanicalEntities: any[], world: World): void {
        if (!this.world) {
            console.error('[MechanicalBlockManager] World not initialized');
            return;
        }

        console.log(`[MechanicalBlockManager] Loading ${mechanicalEntities.length} mechanical entities for plot ${plotId}`);

        for (const entityData of mechanicalEntities) {
            try {
                const { position, config } = entityData;
                const positionKey = this.getPositionKey(position);
                
                // Add +0.5 offset to all axes to center entities properly
                const entitySpawnPosition = {
                    x: position.x + 0.5,
                    y: position.y + 0.5,  // Add back the Y offset
                    z: position.z + 0.5
                };
                
                console.log(`[MechanicalBlockManager] 📂 RESTORE DEBUG - Saved position: ${position.x}, ${position.y}, ${position.z}`);
                console.log(`[MechanicalBlockManager] 📂 RESTORE DEBUG - Entity spawn position: ${entitySpawnPosition.x}, ${entitySpawnPosition.y}, ${entitySpawnPosition.z}`);
                
                console.log(`[MechanicalBlockManager] Loading ${config.entityType} entity at ${positionKey} with dimensions ${config.dimensions.x}x${config.dimensions.y}x${config.dimensions.z}`);

                // Create the entity using the stored configuration
                const entity = new ConfigurableMechanicalEntity(
                    world,
                    entitySpawnPosition,
                    config.entityType,
                    config.dimensions.x,
                    config.dimensions.y,
                    config.dimensions.z,
                    config.speed || 2.0,
                    config.distance || 2
                );

                // Spawn the entity
                entity.spawn(world, entitySpawnPosition);
                
                // Always activate loaded entities (except static ones)
                if (config.entityType !== 'static') {
                    entity.activate();
                    console.log(`[MechanicalBlockManager] 🔄 Activated loaded ${config.entityType} entity`);
                }
                
                // Store the entity
                this.configurableEntities.set(positionKey, entity);
                
                // Register with ObstacleCollisionManager for proper persistence (like jump pads)
                // Use original chunk lattice position for consistency with entity creation
                this.registerMechanicalEntityAsObstacle(plotId, positionKey, position, entity, config);
                
                // No need to track separately - ObstacleCollisionManager handles it
                
                console.log(`[MechanicalBlockManager] Successfully loaded ${config.entityType} entity with dimensions ${config.dimensions.x}x${config.dimensions.y}x${config.dimensions.z} at ${positionKey}`);
                
            } catch (error) {
                console.error(`[MechanicalBlockManager] Error loading mechanical entity:`, error, entityData);
            }
        }
        
        console.log(`[MechanicalBlockManager] Completed loading mechanical entities. Total entities: ${this.configurableEntities.size}`);
    }
    
    /**
     * Enter build mode - no-op since we removed pause/resume functionality
     */
    public enterBuildMode(): void {
        console.log(`[MechanicalBlockManager] enterBuildMode called - no-op (build mode pause/resume removed)`);
    }
    
    /**
     * Exit build mode - no-op since we removed pause/resume functionality
     */
    public exitBuildMode(): void {
        console.log(`[MechanicalBlockManager] exitBuildMode called - no-op (build mode pause/resume removed)`);
    }
}