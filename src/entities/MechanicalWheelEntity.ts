import { Entity, Vector3, World, RigidBodyType, CollisionGroup, ColliderShape, EntityEvent, type EventPayloads, PlayerEntity } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import ObstacleEntity from '../obstacles/ObstacleEntity';
import { MechanicalBlockManager } from '../MechanicalBlockManager';
import { ResizableMechanicalBlock } from '../interfaces/ResizableMechanicalBlock';

/**
 * Mechanical Wheel Entity - Creates rotating wheel blocks
 * Based on the working piston implementation with rotation instead of linear movement
 */
export class MechanicalWheelEntity extends ObstacleEntity implements ResizableMechanicalBlock {
    private world: World;
    private rotationSpeed: number = 60; // degrees per second - double speed for stronger tangential force
    private currentRotation: number = 0; // Current rotation in degrees
    private currentTime: number = 0;
    private startPosition: Vector3Like; // Original wheel center position
    private previousPosition: Vector3Like = { x: 0, y: 0, z: 0 }; // Track position delta
    
    // Size management for resizing
    private currentSize: number = 1; // 1, 3, 5 (sizes available)
    private readonly minSize: number = 1;
    private readonly maxSize: number = 5;
    private beamHalfExtents: Vector3Like; // Current beam dimensions
    private growthDirection: 'x' | 'z' | 'both' = 'both'; // Growth direction for the beam
    private mechanicalCategory: string = 'beam'; // 'beam' or 'platform'
    
    // Player tracking (like Roblox .Touched detection)
    private playersOnWheel: Set<Entity> = new Set();

    constructor(world: World, position: Vector3Like, startingRotation: number = 0, initialSize: number = 1, growthDirection: 'x' | 'z' | 'both' = 'both', carryPlayers: boolean = false) {
        // Set initial size
        initialSize = Math.max(1, Math.min(5, initialSize)); // Clamp to valid range
        const currentSize = initialSize;
        
        // Calculate dimensions based on size (beam shape)
        const beamHalfExtents = { x: currentSize * 0.5, y: 0.5, z: 0.5 }; // Beam shape
        
        // Configure entity as beam
        super({
            blockTextureUri: 'blocks/mechanical-wheel.png', // Using mechanical wheel texture
            blockHalfExtents: beamHalfExtents, // Beam shape
            rigidBodyOptions: {
                type: RigidBodyType.KINEMATIC_POSITION, // Like Roblox anchored parts
                colliders: [
                    // Solid collider for players to stand on - matches beam shape
                    {
                        shape: ColliderShape.BLOCK,
                        halfExtents: beamHalfExtents,
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
        this.currentRotation = startingRotation;
        this.startPosition = { ...position };
        this.currentSize = currentSize;
        this.beamHalfExtents = { ...beamHalfExtents };
        this.growthDirection = growthDirection;
        this.mechanicalCategory = 'beam'; // Default category
        
        // Listen for spawn event
        this.on(EntityEvent.SPAWN, this.onSpawned);
        
        console.log(`[MechanicalWheelEntity] Created wheel at position ${position.x}, ${position.y}, ${position.z}, starting rotation ${startingRotation}°`);
    }

    private onSpawned = (): void => {
        console.log(`[MechanicalWheelEntity] Spawning wheel, will start rotating`);
        
        // Use actual spawned position as start position (like piston does)
        this.startPosition = { ...this.position };
        
        // Initialize previous position for delta tracking
        this.previousPosition = { ...this.startPosition };
        
        // Set initial rotation if specified
        if (this.currentRotation !== 0) {
            const radians = this.currentRotation * (Math.PI / 180);
            const halfRadians = radians / 2;
            const quat = { x: 0, y: Math.sin(halfRadians), z: 0, w: Math.cos(halfRadians) };
            this.setRotation(quat);
        }
        
        // Add sensor collider using SmartBlockEntity approach (after spawning)
        // Match the beam size plus small buffer for detection
        this.createAndAddChildCollider({
            shape: ColliderShape.BLOCK,
            halfExtents: { x: this.beamHalfExtents.x + 0.1, y: 1.0, z: this.beamHalfExtents.z + 0.1 }, // Slightly larger than beam
            isSensor: true,
            onCollision: (other: any, started: boolean) => {
                console.log(`[MechanicalWheelEntity] CHILD SENSOR TRIGGERED - Entity: ${other?.constructor?.name}, started: ${started}`);
                if (other instanceof PlayerEntity) {
                    if (started) {
                        this.playersOnWheel.add(other);
                        console.log(`[MechanicalWheelEntity] Player entered wheel via child sensor (total: ${this.playersOnWheel.size})`);
                    } else {
                        this.playersOnWheel.delete(other);
                        console.log(`[MechanicalWheelEntity] Player left wheel via child sensor (total: ${this.playersOnWheel.size})`);
                    }
                }
            }
        });
        
        // Register with MechanicalBlockManager
        const mechanicalManager = MechanicalBlockManager.getInstance();
        mechanicalManager.registerWheelEntity(this.position, this);
        
        // Activate the wheel to start rotating
        this.activate();
        console.log(`[MechanicalWheelEntity] Wheel activated and will start rotating at ${this.rotationSpeed}°/sec`);
    };

    public onDespawn(): void {
        console.log(`[MechanicalWheelEntity] Despawning wheel`);
        this.playersOnWheel.clear();
    }

    /**
     * Physics update - Rotation with manual player synchronization
     * Based on working piston approach but with rotation
     */
    protected override updatePhysics(payload: EventPayloads[EntityEvent.TICK]): void {
        if (!this.isSpawned) return;
        
        const deltaTimeS = payload.tickDeltaMs / 1000.0;
        this.currentTime += deltaTimeS;
        
        // Update rotation (continuous rotation like piston movement)
        this.currentRotation += this.rotationSpeed * deltaTimeS;
        while (this.currentRotation >= 360) {
            this.currentRotation -= 360;
        }
        while (this.currentRotation < 0) {
            this.currentRotation += 360;
        }
        
        // Apply rotation to platform (visual rotation like Roblox beam.CFrame rotation)
        const radians = this.currentRotation * (Math.PI / 180);
        const halfRadians = radians / 2;
        const quat = { x: 0, y: Math.sin(halfRadians), z: 0, w: Math.cos(halfRadians) };
        this.setRotation(quat);
        
        // ROTATING BEAM + PLAYER SYNCHRONIZATION
        // Like Roblox: beam rotates physically, players move with tangential velocity
        
        const wheelCenter = this.position; // Rotation pivot point
        const rotationDelta = this.rotationSpeed * deltaTimeS * (Math.PI / 180); // radians per frame
        
        // Move each player with proper tangential velocity (like riding a merry-go-round)
        for (const playerEntity of this.playersOnWheel) {
            const currentPlayerPos = playerEntity.position;
            
            // Calculate player's distance and position relative to wheel center (pivot)
            const offsetX = currentPlayerPos.x - wheelCenter.x;  
            const offsetZ = currentPlayerPos.z - wheelCenter.z;
            const distanceFromCenter = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);
            
            // Calculate tangential velocity (farther from center = faster movement)
            // Like Roblox physics: v_tangential = angular_velocity * radius
            const angularVelocityRadPerSec = this.rotationSpeed * (Math.PI / 180); // convert degrees/sec to radians/sec
            const tangentialSpeed = angularVelocityRadPerSec * distanceFromCenter; // blocks per second
            const tangentialDistance = tangentialSpeed * deltaTimeS; // blocks to move this frame
            
            // Calculate tangential direction (perpendicular to radius vector)
            if (distanceFromCenter > 0.01) { // Avoid division by zero for players at exact center
                const normalizedOffsetX = offsetX / distanceFromCenter;
                const normalizedOffsetZ = offsetZ / distanceFromCenter;
                
                // Tangent vector (90° rotation of radius vector) - try opposite direction
                const tangentX = normalizedOffsetZ; // perpendicular direction (flipped)
                const tangentZ = -normalizedOffsetX; // perpendicular direction (flipped)
                
                // Move player along tangent (like being on a rotating platform)
                const newPlayerPos = {
                    x: currentPlayerPos.x + tangentX * tangentialDistance,
                    y: currentPlayerPos.y, // Keep same height
                    z: currentPlayerPos.z + tangentZ * tangentialDistance
                };
                
                playerEntity.setPosition(newPlayerPos);
                
                // Debug logging occasionally  
                if (Math.random() < 0.05) {
                    console.log(`[MechanicalWheelEntity] TANGENTIAL MOVEMENT: radius=${distanceFromCenter.toFixed(2)}, speed=${tangentialSpeed.toFixed(2)}, distance=${tangentialDistance.toFixed(3)}, oldPos=(${currentPlayerPos.x.toFixed(2)}, ${currentPlayerPos.z.toFixed(2)}), newPos=(${newPlayerPos.x.toFixed(2)}, ${newPlayerPos.z.toFixed(2)})`);
                }
            }
        }
        
        // Debug logging occasionally
        if (Math.random() < 0.02) {
            console.log(`[MechanicalWheelEntity] Rotation: ${this.currentRotation.toFixed(1)}°, Players: ${this.playersOnWheel.size}`);
        }
    }

    /**
     * Get the current rotation in degrees
     */
    public getCurrentRotation(): number {
        return this.currentRotation;
    }

    /**
     * Set custom rotation speed in degrees per second
     */
    public setRotationSpeed(speed: number): void {
        this.rotationSpeed = speed;
        console.log(`[MechanicalWheelEntity] Rotation speed set to ${speed} degrees per second`);
    }

    /**
     * Get the current rotation speed in degrees per second
     */
    public getRotationSpeed(): number {
        return this.rotationSpeed;
    }

    /**
     * Check if wheel is currently rotating (true when activated)
     */
    public isRotating(): boolean {
        return this.isActivated();
    }

    /**
     * Pause rotation (for build mode)
     */
    public pauseRotation(): void {
        this.deactivate();
        console.log(`[MechanicalWheelEntity] Rotation paused`);
    }

    /**
     * Resume rotation (when leaving build mode)
     */
    public resumeRotation(): void {
        this.activate();
        console.log(`[MechanicalWheelEntity] Rotation resumed`);
    }

    // =================================================================
    // RESIZABLE MECHANICAL BLOCK INTERFACE IMPLEMENTATION
    // =================================================================

    /**
     * Increase the size of the wheel (ML click)
     */
    public resizeLarger(): boolean {
        if (this.currentSize < this.maxSize) {
            this.currentSize += 2; // 1 → 3 → 5
            this.updateBeamSize();
            console.log(`[MechanicalWheelEntity] Resized larger to ${this.currentSize}x1`);
            return true;
        }
        console.log(`[MechanicalWheelEntity] Already at maximum size (${this.maxSize}x1)`);
        return false;
    }

    /**
     * Decrease the size of the wheel (MR click)
     */
    public resizeSmaller(): boolean {
        if (this.currentSize > this.minSize) {
            this.currentSize -= 2; // 5 → 3 → 1
            this.updateBeamSize();
            console.log(`[MechanicalWheelEntity] Resized smaller to ${this.currentSize}x1`);
            return true;
        }
        console.log(`[MechanicalWheelEntity] Already at minimum size (${this.minSize}x1)`);
        return false;
    }

    /**
     * Get the current size of the wheel
     */
    public getCurrentSize(): number {
        return this.currentSize;
    }

    /**
     * Get the size description for user feedback
     */
    public getSizeDescription(): string {
        switch (this.currentSize) {
            case 1: return "Small (1x1)";
            case 3: return "Medium (3x1)";
            case 5: return "Large (5x1)";
            default: return `Custom (${this.currentSize}x1)`;
        }
    }

    /**
     * Get the original spawn position of the wheel
     */
    public getSpawnPosition(): { x: number; y: number; z: number } {
        return { ...this.startPosition };
    }

    /**
     * Get the current growth direction of the wheel
     */
    public getCurrentGrowthDirection(): 'x' | 'z' | 'both' {
        return this.growthDirection;
    }

    /**
     * Get the mechanical category (beam or platform)
     */
    public getMechanicalCategory(): string {
        return this.mechanicalCategory;
    }

    /**
     * Update the beam size (internal state only - actual respawn handled by ObstaclePlacementManager)
     */
    private updateBeamSize(): void {
        // Update beam dimensions internally
        this.beamHalfExtents = { x: this.currentSize * 0.5, y: 0.5, z: 0.5 };
        
        console.log(`[MechanicalWheelEntity] Updated internal beam size to ${this.currentSize}x1 (${this.beamHalfExtents.x * 2}x${this.beamHalfExtents.y * 2}x${this.beamHalfExtents.z * 2})`);
        
        // Note: Visual resizing (despawn/respawn) is handled by ObstaclePlacementManager
    }
}