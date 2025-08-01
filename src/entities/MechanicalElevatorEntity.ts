import { Entity, Vector3, World, RigidBodyType, CollisionGroup, ColliderShape, EntityEvent, type EventPayloads, BlockType } from 'hytopia';
import type { Vector3Like, QuaternionLike } from 'hytopia';
import ObstacleEntity from '../obstacles/ObstacleEntity';
import { MechanicalBlockManager } from '../MechanicalBlockManager';
import { ResizableMechanicalBlock } from '../interfaces/ResizableMechanicalBlock';

/**
 * Mechanical Elevator Entity - Creates moving elevator blocks that go up and down
 * Tests if players naturally stick to vertical movement
 */
export class MechanicalElevatorEntity extends ObstacleEntity implements ResizableMechanicalBlock {
    private world: World;
    private elevatorSpeed: number = 2.0; // blocks per second
    private elevatorDistance: number = 4.0; // blocks to travel up/down
    private startPosition: Vector3Like;
    private topPosition: Vector3Like;
    private bottomPosition: Vector3Like;
    private movingUp: boolean = true; // Movement direction
    
    // Size management for resizing
    private currentSize: number = 1; // 1, 2, 3 (travel distance multiplier)
    private readonly minSize: number = 1;
    private readonly maxSize: number = 3;
    private mechanicalCategory: string = 'beam'; // 'beam' or 'platform'
    
    // Player tracking (like Roblox .Touched detection)
    private playersOnElevator: Set<Entity> = new Set();

    constructor(world: World, position: Vector3Like, initialSize: number = 1) {
        // Set initial size
        const currentSize = Math.max(1, Math.min(3, initialSize)); // Clamp to valid range
        
        // Calculate dimensions based on size (beam shape)
        const blockHalfExtents = { x: currentSize * 0.5, y: 0.5, z: 0.5 }; // Beam shape - long in X direction
        
        // Configure entity as a block-like entity with texture
        super({
            blockTextureUri: 'blocks/iron-ore.png', // Using iron-ore texture for elevators
            blockHalfExtents: blockHalfExtents, // Size based on initialSize parameter
            rigidBodyOptions: {
                type: RigidBodyType.KINEMATIC_POSITION, // Use KINEMATIC_POSITION (VELOCITY causes recursive errors)
                colliders: [
                    // Solid collider for players to stand on
                    {
                        shape: ColliderShape.BLOCK,
                        halfExtents: blockHalfExtents, // Match visual size
                        isSensor: false, // Solid collision
                        collisionGroups: {
                            belongsTo: [CollisionGroup.ENTITY],
                            collidesWith: [CollisionGroup.PLAYER, CollisionGroup.ENTITY_SENSOR]
                        }
                    },
                    // Sensor collider for player detection (match beam size)
                    {
                        shape: ColliderShape.BLOCK,
                        halfExtents: { x: blockHalfExtents.x + 0.1, y: 0.8, z: blockHalfExtents.z + 0.1 }, // Match beam with small buffer
                        isSensor: true, // Sensor only
                        relativePosition: { x: 0, y: 0.3, z: 0 }, // Slightly above platform
                        collisionGroups: {
                            belongsTo: [CollisionGroup.ENTITY_SENSOR],
                            collidesWith: [CollisionGroup.PLAYER]
                        },
                        onCollision: (other: BlockType | Entity, started: boolean) => {
                            console.log(`[MechanicalElevatorEntity] SENSOR TRIGGERED - Entity: ${other?.constructor?.name}, started: ${started}`);
                            this.handlePlayerCollision(other, started);
                        }
                    }
                ]
            }
        });
        
        this.world = world;
        this.startPosition = { ...position };
        this.currentSize = currentSize; // Use the initial size passed in
        this.mechanicalCategory = 'beam'; // Default category
        
        // Calculate target position (elevated position, like piston's extended position)
        this.topPosition = {
            x: position.x,
            y: position.y + this.elevatorDistance,
            z: position.z
        };
        
        // Bottom position is the start position
        this.bottomPosition = { ...position };
        
        // Initialize movement positions
        this.moveFromPos = { ...this.startPosition };
        this.moveToPos = { ...this.startPosition };
        
        // Listen for spawn event
        this.on(EntityEvent.SPAWN, this.onSpawned);
        
        console.log(`[MechanicalElevatorEntity] Created elevator at position ${position.x}, ${position.y}, ${position.z}`);
    }

    private onSpawned = (): void => {
        console.log(`[MechanicalElevatorEntity] Spawning elevator, will start moving up and down`);
        
        // Use the entity's actual spawned position as the start position
        const actualPosition = this.position;
        this.startPosition = {
            x: actualPosition.x,
            y: actualPosition.y,
            z: actualPosition.z
        };
        
        // Recalculate positions based on actual start position
        this.topPosition = {
            x: this.startPosition.x,
            y: this.startPosition.y + this.elevatorDistance,
            z: this.startPosition.z
        };
        
        this.bottomPosition = {
            x: this.startPosition.x,
            y: this.startPosition.y,
            z: this.startPosition.z
        };
        
        console.log(`[MechanicalElevatorEntity] Elevator setup: bottom=(${this.bottomPosition.x.toFixed(2)}, ${this.bottomPosition.y.toFixed(2)}, ${this.bottomPosition.z.toFixed(2)}), start=(${this.startPosition.x.toFixed(2)}, ${this.startPosition.y.toFixed(2)}, ${this.startPosition.z.toFixed(2)}), top=(${this.topPosition.x.toFixed(2)}, ${this.topPosition.y.toFixed(2)}, ${this.topPosition.z.toFixed(2)})`);
        
        // Register with MechanicalBlockManager
        const mechanicalManager = MechanicalBlockManager.getInstance();
        mechanicalManager.registerElevatorEntity(this.startPosition, this);
        
        // Activate the elevator to start moving
        this.activate();
        console.log(`[MechanicalElevatorEntity] Elevator activated and will start moving`);
    };

    public onDespawn(): void {
        console.log(`[MechanicalElevatorEntity] Despawning elevator`);
    }

    /**
     * Handle player collision detection (like Roblox .Touched)
     */
    private handlePlayerCollision(other: BlockType | Entity, started: boolean): void {
        const otherEntity = other as Entity;
        if (otherEntity && (otherEntity as any).player) {
            if (started) {
                this.playersOnElevator.add(otherEntity);
                console.log(`[MechanicalElevatorEntity] Player entered elevator`);
            } else {
                this.playersOnElevator.delete(otherEntity);
                console.log(`[MechanicalElevatorEntity] Player left elevator`);
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
        if (this.movingUp && currentPos.y >= this.topPosition.y) {
            this.movingUp = false;
        } else if (!this.movingUp && currentPos.y <= this.bottomPosition.y) {
            this.movingUp = true;
        }
        
        // Calculate movement distance for this frame
        const moveDistance = this.elevatorSpeed * deltaTimeS;
        const newY = this.movingUp ? 
            currentPos.y + moveDistance : 
            currentPos.y - moveDistance;
        
        const newPosition = {
            x: currentPos.x,
            y: newY,
            z: currentPos.z
        };
        
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
        
        // Apply movement delta to all players on the elevator (manual "stick")
        for (const playerEntity of this.playersOnElevator) {
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
            console.log(`[MechanicalElevatorEntity] Y: ${newPosition.y.toFixed(2)}, Moving: ${this.movingUp ? 'UP' : 'DOWN'}, Speed: ${this.elevatorSpeed}`);
        }
    }

    // Old discrete movement methods removed - now using continuous force-based movement

    /**
     * Get the elevator's current state (like piston's isExtended)
     */
    public isCurrentlyElevated(): boolean {
        return this.isElevated;
    }

    /**
     * Get the start position of the elevator
     */
    public getStartPosition(): Vector3Like {
        return { ...this.startPosition };
    }

    /**
     * Get the top position of the elevator
     */
    public getTopPosition(): Vector3Like {
        return { ...this.topPosition };
    }

    /**
     * Get the bottom position of the elevator
     */
    public getBottomPosition(): Vector3Like {
        return { ...this.bottomPosition };
    }

    /**
     * Set custom elevator distance
     */
    public setElevatorDistance(distance: number): void {
        this.elevatorDistance = distance;
        
        // Recalculate positions
        this.topPosition = {
            x: this.startPosition.x,
            y: this.startPosition.y + this.elevatorDistance,
            z: this.startPosition.z
        };
        
        this.bottomPosition = {
            x: this.startPosition.x,
            y: this.startPosition.y - this.elevatorDistance,
            z: this.startPosition.z
        };
    }

    /**
     * Set custom elevator speed
     */
    public setElevatorSpeed(speed: number): void {
        this.elevatorSpeed = speed;
    }

    // =================================================================
    // RESIZABLE MECHANICAL BLOCK INTERFACE IMPLEMENTATION
    // =================================================================

    /**
     * Increase the elevator travel distance (ML click)
     */
    public resizeLarger(): boolean {
        if (this.currentSize < this.maxSize) {
            this.currentSize += 1; // 1 → 2 → 3
            this.updateElevatorDistance();
            console.log(`[MechanicalElevatorEntity] Resized larger to ${this.currentSize}x distance`);
            return true;
        }
        console.log(`[MechanicalElevatorEntity] Already at maximum size (${this.maxSize}x distance)`);
        return false;
    }

    /**
     * Decrease the elevator travel distance (MR click)
     */
    public resizeSmaller(): boolean {
        if (this.currentSize > this.minSize) {
            this.currentSize -= 1; // 3 → 2 → 1
            this.updateElevatorDistance();
            console.log(`[MechanicalElevatorEntity] Resized smaller to ${this.currentSize}x distance`);
            return true;
        }
        console.log(`[MechanicalElevatorEntity] Already at minimum size (${this.minSize}x distance)`);
        return false;
    }

    /**
     * Get the current size of the elevator
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
            case 3: return `Tall (${distance} blocks)`;
            default: return `Custom (${distance} blocks)`;
        }
    }

    /**
     * Get the original spawn position of the elevator
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
     * Update the elevator distance based on current size
     */
    private updateElevatorDistance(): void {
        // Update travel distance (base 2.0 blocks * size multiplier)
        this.elevatorDistance = 2.0 * this.currentSize;
        
        // Recalculate positions based on new distance
        this.topPosition = {
            x: this.startPosition.x,
            y: this.startPosition.y + this.elevatorDistance,
            z: this.startPosition.z
        };
        
        this.bottomPosition = {
            x: this.startPosition.x,
            y: this.startPosition.y,
            z: this.startPosition.z
        };
        
        console.log(`[MechanicalElevatorEntity] Updated elevator distance to ${this.elevatorDistance} blocks`);
    }
}