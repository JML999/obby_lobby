import { World, Vector3 } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import { MechanicalPistonEntity } from './entities/MechanicalPistonEntity';
import { MechanicalWheelEntity } from './entities/MechanicalWheelEntity';
import { MechanicalElevatorEntity } from './entities/MechanicalElevatorEntity';
import { ConfigurableMechanicalEntity } from './entities/ConfigurableMechanicalEntity';
import { MECHANICAL_BLOCK_IDS } from './BlockRegistry';

/**
 * Manages mechanical block entities and their placement
 * Handles the entity-based approach for mechanical blocks (no actual blocks in chunk lattice)
 */
export class MechanicalBlockManager {
    private static instance: MechanicalBlockManager;
    private world?: World;
    private pistonEntities: Map<string, MechanicalPistonEntity> = new Map();
    private wheelEntities: Map<string, MechanicalWheelEntity> = new Map();
    private elevatorEntities: Map<string, MechanicalElevatorEntity> = new Map();
    private configurableEntities: Map<string, ConfigurableMechanicalEntity> = new Map();
    private isInBuildMode: boolean = true; // Default to build mode enabled (matches BlockPlacementManager)
    
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
    public onMechanicalBlockPlaced(blockId: number, position: Vector3Like, slotIndex?: number, player?: any): boolean {
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
            
            // Activate if not in build mode
            if (!this.isInBuildMode) {
                elevatorEntity.activate();
            }
            
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
    private showConfigPanel(position: Vector3Like, positionKey: string, player?: any): boolean {
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
            
            this.createPreviewEntity(position, positionKey, defaultConfig);

            player.ui.sendData({
                type: 'showMechanicalConfig',
                position: {
                    x: position.x,
                    y: position.y, 
                    z: position.z
                },
                config: defaultConfig
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
    public onGeneralMechanicalBlockPlaced(position: Vector3Like, player?: any): boolean {
        if (!this.world) {
            console.error('[MechanicalBlockManager] World not initialized');
            return false;
        }

        const positionKey = this.getPositionKey(position);
        console.log(`[MechanicalBlockManager] General mechanical block placed at ${positionKey}, showing config panel`);
        
        return this.showConfigPanel(position, positionKey, player);
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
     * Pause all mechanical entities
     */
    public pauseAllEntities(): void {
        // Pistons don't have pause/resume yet, but wheels do
        for (const wheelEntity of this.wheelEntities.values()) {
            wheelEntity.pauseRotation();
        }
        console.log('[MechanicalBlockManager] Paused all wheel entities');
    }

    /**
     * Resume all mechanical entities
     */
    public resumeAllEntities(): void {
        // Resume wheels
        for (const wheelEntity of this.wheelEntities.values()) {
            wheelEntity.resumeRotation();
        }
        console.log('[MechanicalBlockManager] Resumed all wheel entities');
    }

    /**
     * Reset all mechanical entities to their home positions (for build mode)
     */
    public resetAllEntitiesToHome(): void {
        // Reset wheels to 0 rotation and static positions
        for (const wheelEntity of this.wheelEntities.values()) {
            wheelEntity.resetToHome();
        }
        
        // TODO: Add piston reset when implemented
        // for (const pistonEntity of this.pistonEntities.values()) {
        //     pistonEntity.resetToHome();
        // }
        
        console.log('[MechanicalBlockManager] Reset all mechanical entities to home positions');
    }

    /**
     * Check if currently in build mode
     */
    public getIsInBuildMode(): boolean {
        return this.isInBuildMode;
    }

    /**
     * Enter build mode - pause and reset all mechanical entities
     */
    public enterBuildMode(): void {
        this.isInBuildMode = true;
        this.pauseAllEntities();
        this.resetAllEntitiesToHome();
        console.log('[MechanicalBlockManager] Entered build mode - all entities paused and reset');
    }

    /**
     * Exit build mode - resume all mechanical entities
     */
    public exitBuildMode(): void {
        this.isInBuildMode = false;
        this.resumeAllEntities();
        console.log('[MechanicalBlockManager] Exited build mode - all entities resumed');
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
    }): boolean {
        if (!this.world) {
            console.error('[MechanicalBlockManager] World not initialized');
            return false;
        }

        const positionKey = this.getPositionKey(position);
        console.log(`[MechanicalBlockManager] Confirming ${config.type} mechanical entity at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ} - keeping existing entity`);

        // The entity already exists from the preview - just keep it!
        // No need to remove and recreate, which was causing the disappearing issue
        
        // Verify the entity exists in our tracking
        if (this.configurableEntities.has(positionKey)) {
            console.log(`[MechanicalBlockManager] Entity confirmed and kept at ${positionKey}`);
            return true;
        } else {
            console.error(`[MechanicalBlockManager] Expected entity not found at ${positionKey} - creating fallback`);
            // Fallback: create the entity if somehow it doesn't exist
            return this.createPreviewEntity(position, positionKey, config);
        }
    }

    /**
     * Create a static mechanical entity (non-moving entity)
     */
    private createStaticEntity(position: Vector3Like, positionKey: string, config: any): boolean {
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
        
        console.log(`[MechanicalBlockManager] Created configurable static entity (FIXED entity) at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ}`);
        return true;
    }

    /**
     * Create an elevator entity with custom size
     */
    private createElevatorEntity(position: Vector3Like, positionKey: string, config: any): boolean {
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
        
        // Always activate for preview purposes - user needs to see movement during configuration
        
        this.configurableEntities.set(positionKey, elevatorEntity);
        
        console.log(`[MechanicalBlockManager] Created configurable elevator at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ}, buildMode: ${this.isInBuildMode}`);
        return true;
    }

    /**
     * Create a carousel entity (rotating wheel)
     */
    private createCarouselEntity(position: Vector3Like, positionKey: string, config: any): boolean {
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
        
        console.log(`[MechanicalBlockManager] Created configurable carousel (KINEMATIC entity) at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ}`);
        return true;
    }

    /**
     * Create a side-to-side entity (horizontal piston, X-axis movement)
     */
    private createSideToSideEntity(position: Vector3Like, positionKey: string, config: any): boolean {
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
        
        console.log(`[MechanicalBlockManager] Created configurable side-to-side (X-axis KINEMATIC entity) at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ}`);
        return true;
    }

    /**
     * Create a front-to-back entity (horizontal piston, Z-axis movement)
     */
    private createFrontToBackEntity(position: Vector3Like, positionKey: string, config: any): boolean {
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
        
        console.log(`[MechanicalBlockManager] Created configurable front-to-back (Z-axis KINEMATIC entity) at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ}`);
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
    }): boolean {
        if (!this.world) {
            console.error('[MechanicalBlockManager] World not initialized');
            return false;
        }

        const positionKey = this.getPositionKey(position);
        console.log(`[MechanicalBlockManager] Updating preview for ${config.type} at ${positionKey} with size ${config.sizeX}x${config.sizeY}x${config.sizeZ}`);

        // First, remove any existing preview entity at this position
        this.removePreviewEntity(position);

        // Create new preview entity with updated config
        return this.createPreviewEntity(position, positionKey, config);
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
    private createPreviewEntity(position: Vector3Like, positionKey: string, config: any): boolean {
        try {
            // Entities are center-based, chunk lattice blocks are corner-based
            // Offset by +0.5 to make 1x1x1 entities appear in same position as chunk blocks
            const entityPosition = {
                x: position.x + 0.5,
                y: position.y + 0.5,
                z: position.z + 0.5
            };
            
            switch (config.type) {
                case 'static':
                    return this.createStaticEntity(entityPosition, positionKey, config);
                    
                case 'elevator':
                    return this.createElevatorEntity(entityPosition, positionKey, config);
                    
                case 'carousel':
                    return this.createCarouselEntity(entityPosition, positionKey, config);
                    
                case 'side-to-side':
                    return this.createSideToSideEntity(entityPosition, positionKey, config);
                    
                case 'front-to-back':
                    return this.createFrontToBackEntity(entityPosition, positionKey, config);
                    
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
}