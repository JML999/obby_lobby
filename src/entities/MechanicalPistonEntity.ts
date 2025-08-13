import { Entity, Vector3, World, RigidBodyType, CollisionGroup, ColliderShape, EntityEvent, type EventPayloads, BlockType, PlayerEntity } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import ObstacleEntity from '../obstacles/ObstacleEntity';
import { MechanicalBlockManager } from '../MechanicalBlockManager';
import { ResizableMechanicalBlock } from '../interfaces/ResizableMechanicalBlock';

/**
 * Mechanical Piston Entity - Creates moving piston blocks that extend and retract horizontally
 * Based on the working elevator implementation with horizontal movement
 */
export class MechanicalPistonEntity extends ObstacleEntity implements ResizableMechanicalBlock {
    private world: World;
    private pistonAxis: 'x' | 'y' | 'z';
    private pistonSpeed: number = 2.0; // blocks per second
    private pistonDistance: number = 4.0; // blocks to travel
    private startPosition: Vector3Like;
    private endPosition: Vector3Like;
    private movingForward: boolean = true; // Movement direction
    
    // Size management for resizing
    private currentSize: number = 1; // 1, 2, 3 (travel distance multiplier)
    private readonly minSize: number = 1;
    private readonly maxSize: number = 3;
    private beamHalfExtents: Vector3Like; // Current beam dimensions
    private mechanicalCategory: string = 'beam'; // 'beam' or 'platform'
    
    // Player tracking (like Roblox .Touched detection)
    private playersOnPiston: Set<Entity> = new Set();

    constructor(world: World, pistonAxis: 'x' | 'y' | 'z', position: Vector3Like, initialSize: number = 1) {
        // Set initial size
        const currentSize = Math.max(1, Math.min(3, initialSize)); // Clamp to valid range
        
        // Calculate dimensions based on axis and size  
        let blockHalfExtents;
        switch (pistonAxis) {
            case 'x':
                blockHalfExtents = { x: currentSize * 0.5, y: 0.5, z: 0.5 }; // Beam along X
                break;
            case 'y':
                blockHalfExtents = { x: 0.5, y: currentSize * 0.5, z: 0.5 }; // Beam along Y (vertical)
                break;
            case 'z':
                blockHalfExtents = { x: 0.5, y: 0.5, z: currentSize * 0.5 }; // Beam along Z
                break;
        }
        
        // Configure entity with beam shape
        super({
            blockTextureUri: 'blocks/mechanical-wheel.png', // Using mechanical wheel texture
            blockHalfExtents: blockHalfExtents, // Beam shape based on axis and size
            rigidBodyOptions: {
                type: RigidBodyType.KINEMATIC_POSITION, // Use KINEMATIC_POSITION (VELOCITY causes recursive errors)
                colliders: [
                    // Solid collider for players to stand on
                    {
                        shape: ColliderShape.BLOCK,
                        halfExtents: blockHalfExtents, // Match beam shape
                        isSensor: false, // Solid collision
                        collisionGroups: {
                            belongsTo: [CollisionGroup.ENTITY],
                            collidesWith: [CollisionGroup.PLAYER, CollisionGroup.ENTITY_SENSOR]
                        }
                    }
                ]
            }
        });
        
        this.world = world;
        this.pistonAxis = pistonAxis;
        this.startPosition = { ...position };
        this.currentSize = currentSize; // Use the initial size passed in
        this.beamHalfExtents = { ...blockHalfExtents }; // Store beam dimensions
        this.mechanicalCategory = 'beam'; // Default category
        
        // Calculate end position based on axis (like elevator calculates top position)
        this.endPosition = { ...position };
        switch (pistonAxis) {
            case 'x':
                this.endPosition.x += this.pistonDistance;
                break;
            case 'y':
                this.endPosition.y += this.pistonDistance;
                break;
            case 'z':
                this.endPosition.z += this.pistonDistance;
                break;
        }
        
        // Listen for spawn event
        this.on(EntityEvent.SPAWN, this.onSpawned);
        
        console.log(`[MechanicalPistonEntity] Created ${pistonAxis}-axis piston at position ${position.x}, ${position.y}, ${position.z}`);
    }

    private onSpawned = (): void => {
        console.log(`[MechanicalPistonEntity] Spawning ${this.pistonAxis}-axis piston, will start moving back and forth`);
        
        // Use the entity's actual spawned position as the start position (like elevator)
        const actualPosition = this.position;
        this.startPosition = {
            x: actualPosition.x,
            y: actualPosition.y,
            z: actualPosition.z
        };
        
        // Recalculate end position based on actual start position
        this.endPosition = { ...this.startPosition };
        switch (this.pistonAxis) {
            case 'x':
                this.endPosition.x += this.pistonDistance;
                break;
            case 'y':
                this.endPosition.y += this.pistonDistance;
                break;
            case 'z':
                this.endPosition.z += this.pistonDistance;
                break;
        }
        
        // Initialize movement direction
        this.movingForward = true;
        
        console.log(`[MechanicalPistonEntity] Piston setup: start=(${this.startPosition.x.toFixed(2)}, ${this.startPosition.y.toFixed(2)}, ${this.startPosition.z.toFixed(2)}), end=(${this.endPosition.x.toFixed(2)}, ${this.endPosition.y.toFixed(2)}, ${this.endPosition.z.toFixed(2)})`);
        
        // Add sensor collider using SmartBlockEntity approach (after spawning)
        // Use stored beam halfExtents
        const sensorHalfExtents = { ...this.beamHalfExtents };
        sensorHalfExtents.x += 0.1; // Small buffer
        sensorHalfExtents.y = 1.0;   // Taller for player detection
        sensorHalfExtents.z += 0.1; // Small buffer
        
        this.createAndAddChildCollider({
            shape: ColliderShape.BLOCK,
            halfExtents: sensorHalfExtents, // Match beam dimensions
            isSensor: true,
            onCollision: (other: any, started: boolean) => {
                console.log(`[MechanicalPistonEntity] CHILD SENSOR TRIGGERED - Entity: ${other?.constructor?.name}, started: ${started}`);
                if (other instanceof PlayerEntity) {
                    if (started) {
                        this.playersOnPiston.add(other);
                        console.log(`[MechanicalPistonEntity] Player entered piston via child sensor (total: ${this.playersOnPiston.size})`);
                    } else {
                        this.playersOnPiston.delete(other);
                        console.log(`[MechanicalPistonEntity] Player left piston via child sensor (total: ${this.playersOnPiston.size})`);
                    }
                }
            }
        });
        
        // Register with MechanicalBlockManager
        const mechanicalManager = MechanicalBlockManager.getInstance();
        mechanicalManager.registerPistonEntity(this.startPosition, this);
        
        // Activate the piston to start moving
        this.activate();
        console.log(`[MechanicalPistonEntity] Piston activated and will start moving`);
    };

    public onDespawn(): void {
        console.log(`[MechanicalPistonEntity] Despawning ${this.pistonAxis}-axis piston`);
    }

    /**
     * Handle player collision detection (like Roblox .Touched)
     */
    private handlePlayerCollision(other: BlockType | Entity, started: boolean): void {
        const otherEntity = other as Entity;
        if (otherEntity && (otherEntity as any).player) {
            if (started) {
                this.playersOnPiston.add(otherEntity);
                console.log(`[MechanicalPistonEntity] Player entered piston`);
            } else {
                this.playersOnPiston.delete(otherEntity);
                console.log(`[MechanicalPistonEntity] Player left piston`);
            }
        }
    }

    /**
     * Physics update - Linear movement with position updates
     */
    protected override updatePhysics(payload: EventPayloads[EntityEvent.TICK]): void {
        if (!this.isSpawned) return;
        
        const deltaTimeS = payload.tickDeltaMs / 1000.0;
        const currentPos = this.position;
        
        // Check if we need to change direction
        let atEnd = false;
        let atStart = false;
        
        switch (this.pistonAxis) {
            case 'x':
                atEnd = currentPos.x >= this.endPosition.x;
                atStart = currentPos.x <= this.startPosition.x;
                break;
            case 'y':
                atEnd = currentPos.y >= this.endPosition.y;
                atStart = currentPos.y <= this.startPosition.y;
                break;
            case 'z':
                atEnd = currentPos.z >= this.endPosition.z;
                atStart = currentPos.z <= this.startPosition.z;
                break;
        }
        
        if (this.movingForward && atEnd) {
            this.movingForward = false;
        } else if (!this.movingForward && atStart) {
            this.movingForward = true;
        }
        
        // Calculate movement distance for this frame
        const moveDistance = this.pistonSpeed * deltaTimeS;
        const direction = this.movingForward ? 1 : -1;
        
        const newPosition = { ...currentPos };
        switch (this.pistonAxis) {
            case 'x':
                newPosition.x += moveDistance * direction;
                break;
            case 'y':
                newPosition.y += moveDistance * direction;
                break;
            case 'z':
                newPosition.z += moveDistance * direction;
                break;
        }
        
        // Calculate movement delta for player synchronization
        const movementDelta = {
            x: newPosition.x - currentPos.x,
            y: newPosition.y - currentPos.y,
            z: newPosition.z - currentPos.z
        };
        
        // Move the platform using rigidBody translation for smoother physics integration
        if (this.rigidBody) {
            this.rigidBody.setTranslation(newPosition, true);
        } else {
            this.setPosition(newPosition);
        }
        
        // Apply movement delta to all players on the piston (manual "stick")
        for (const playerEntity of this.playersOnPiston) {
            const currentPlayerPos = playerEntity.position;
            const newPlayerPos = {
                x: currentPlayerPos.x + movementDelta.x,
                y: currentPlayerPos.y + movementDelta.y,
                z: currentPlayerPos.z + movementDelta.z
            };
            playerEntity.setPosition(newPlayerPos);
        }
        
        // Debug logging occasionally
        if (Math.random() < 0.02) {
            console.log(`[MechanicalPistonEntity] ${this.pistonAxis.toUpperCase()}: ${newPosition[this.pistonAxis].toFixed(2)}, Moving: ${this.movingForward ? 'FORWARD' : 'BACK'}, Speed: ${this.pistonSpeed}`);
        }
    }

    /**
     * Get the piston's axis of movement
     */
    public getPistonAxis(): 'x' | 'y' | 'z' {
        return this.pistonAxis;
    }

    /**
     * Get the start position of the piston
     */
    public getStartPosition(): Vector3Like {
        return { ...this.startPosition };
    }

    /**
     * Get the end (extended) position of the piston
     */
    public getEndPosition(): Vector3Like {
        return { ...this.endPosition };
    }

    /**
     * Set custom extension distance
     */
    public setExtensionDistance(distance: number): void {
        this.pistonDistance = distance;
        
        // Recalculate end position
        this.endPosition = { ...this.startPosition };
        switch (this.pistonAxis) {
            case 'x':
                this.endPosition.x += this.pistonDistance;
                break;
            case 'y':
                this.endPosition.y += this.pistonDistance;
                break;
            case 'z':
                this.endPosition.z += this.pistonDistance;
                break;
        }
    }

    /**
     * Set custom cycle time
     */
    public setCycleTime(timeS: number): void {
        this.cycleTime = timeS;
    }

    /**
     * Set custom piston speed
     */
    public setPistonSpeed(speed: number): void {
        this.pistonSpeed = speed;
    }

    // =================================================================
    // RESIZABLE MECHANICAL BLOCK INTERFACE IMPLEMENTATION
    // =================================================================

    /**
     * Increase the piston extension distance (ML click)
     */
    public resizeLarger(): boolean {
        if (this.currentSize < this.maxSize) {
            this.currentSize += 1; // 1 → 2 → 3
            this.updatePistonDistance();
            console.log(`[MechanicalPistonEntity] Resized larger to ${this.currentSize}x distance`);
            return true;
        }
        console.log(`[MechanicalPistonEntity] Already at maximum size (${this.maxSize}x distance)`);
        return false;
    }

    /**
     * Decrease the piston extension distance (MR click)
     */
    public resizeSmaller(): boolean {
        if (this.currentSize > this.minSize) {
            this.currentSize -= 1; // 3 → 2 → 1
            this.updatePistonDistance();
            console.log(`[MechanicalPistonEntity] Resized smaller to ${this.currentSize}x distance`);
            return true;
        }
        console.log(`[MechanicalPistonEntity] Already at minimum size (${this.minSize}x distance)`);
        return false;
    }

    /**
     * Get the current size of the piston
     */
    public getCurrentSize(): number {
        return this.currentSize;
    }

    /**
     * Get the size description for user feedback
     */
    public getSizeDescription(): string {
        const distance = this.currentSize * 2; // Base distance is 2 blocks
        switch (this.currentSize) {
            case 1: return `Short (${distance} blocks)`;
            case 2: return `Medium (${distance} blocks)`;
            case 3: return `Long (${distance} blocks)`;
            default: return `Custom (${distance} blocks)`;
        }
    }

    /**
     * Get the original spawn position of the piston
     */
    public getSpawnPosition(): { x: number; y: number; z: number } {
        return { ...this.startPosition };
    }

    /**
     * Get the mechanical category (beam or platform)
     */
    public getMechanicalCategory(): string {
        return this.mechanicalCategory;
    }

    /**
     * Update the piston distance based on current size
     */
    private updatePistonDistance(): void {
        // Update travel distance (base 2.0 blocks * size multiplier)
        this.pistonDistance = 2.0 * this.currentSize;
        
        // Recalculate end position based on new distance
        this.endPosition = { ...this.startPosition };
        switch (this.pistonAxis) {
            case 'x':
                this.endPosition.x += this.pistonDistance;
                break;
            case 'y':
                this.endPosition.y += this.pistonDistance;
                break;
            case 'z':
                this.endPosition.z += this.pistonDistance;
                break;
        }
        
        console.log(`[MechanicalPistonEntity] Updated ${this.pistonAxis}-axis piston distance to ${this.pistonDistance} blocks`);
    }
}