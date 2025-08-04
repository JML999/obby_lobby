import { Entity, Vector3, World, RigidBodyType, CollisionGroup, ColliderShape, EntityEvent, type EventPayloads, PlayerEntity } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import ObstacleEntity from '../obstacles/ObstacleEntity';

/**
 * Configurable Mechanical Entity - Supports any size configuration
 * Used for the general mechanical block with real-time preview
 */
export class ConfigurableMechanicalEntity extends ObstacleEntity {
    private world: World;
    private entityType: 'static' | 'elevator' | 'carousel' | 'side-to-side' | 'front-to-back';
    private dimensions: { x: number; y: number; z: number };
    
    // Movement properties
    private moveSpeed: number;
    private startPosition: Vector3Like;
    private targetPosition: Vector3Like;
    private movingForward: boolean = true;
    private rotationSpeed: number; // degrees per second for carousel
    private currentRotation: number = 0;
    private moveDistance: number;
    
    // Player tracking (like Roblox .Touched detection)
    private playersOnPlatform: Set<Entity> = new Set();
    
    constructor(
        world: World, 
        position: Vector3Like, 
        type: 'static' | 'elevator' | 'carousel' | 'side-to-side' | 'front-to-back',
        sizeX: number = 1,
        sizeY: number = 1, 
        sizeZ: number = 1,
        speed: number = 2.0,
        distance: number = 2
    ) {
        
        // Calculate half extents from full sizes
        const blockHalfExtents = { 
            x: sizeX * 0.5, 
            y: sizeY * 0.5, 
            z: sizeZ * 0.5 
        };
        
        // Choose texture based on type
        let textureUri = 'blocks/stone.png'; // Default for static
        switch (type) {
            case 'elevator':
                textureUri = 'blocks/iron-ore.png';
                break;
            case 'carousel':
                textureUri = 'blocks/gold-ore.png';
                break;
            case 'side-to-side':
            case 'front-to-back':
                textureUri = 'blocks/coal-ore.png'; // Same texture for both horizontal movements
                break;
        }
        
        // Configure all entities the same way, but static ones use FIXED rigid body
        super({
            blockTextureUri: textureUri,
            blockHalfExtents: blockHalfExtents,
            rigidBodyOptions: {
                type: type === 'static' ? RigidBodyType.FIXED : RigidBodyType.KINEMATIC_POSITION,
                colliders: [
                    // Solid collider for players to stand on
                    {
                        shape: ColliderShape.BLOCK,
                        halfExtents: blockHalfExtents,
                        isSensor: false,
                        collisionGroups: {
                            belongsTo: [CollisionGroup.ENTITY],
                            collidesWith: [CollisionGroup.PLAYER, CollisionGroup.ENTITY_SENSOR]
                        }
                    }
                ]
            }
        });
        
        this.world = world;
        this.entityType = type;
        this.dimensions = { x: sizeX, y: sizeY, z: sizeZ };
        this.moveSpeed = speed;
        this.moveDistance = distance;
        this.rotationSpeed = speed * 20; // Convert speed to degrees per second for carousel
        this.startPosition = { 
            x: position.x, 
            y: position.y, 
            z: position.z 
        };
        
        
        // Calculate target positions based on type and distance
        switch (type) {
            case 'elevator':
                // Move up by distance
                this.targetPosition = {
                    x: position.x,
                    y: position.y + this.moveDistance,
                    z: position.z
                };
                break;
            case 'side-to-side':
                // Move sideways by distance
                this.targetPosition = {
                    x: position.x + this.moveDistance,
                    y: position.y,
                    z: position.z
                };
                break;
            case 'front-to-back':
                // Move forward/backward by distance
                this.targetPosition = {
                    x: position.x,
                    y: position.y,
                    z: position.z + this.moveDistance
                };
                break;
            default:
                this.targetPosition = { ...position };
        }
        
        // Listen for spawn event to add sensor collider
        this.on(EntityEvent.SPAWN, this.onSpawned);
        
    }
    
    /**
     * Getter methods for accessing entity properties during saving
     */
    public getEntityType(): 'static' | 'elevator' | 'carousel' | 'side-to-side' | 'front-to-back' {
        return this.entityType;
    }
    
    public getDimensions(): { x: number; y: number; z: number } {
        return { ...this.dimensions };
    }
    
    public getMoveSpeed(): number {
        return this.moveSpeed;
    }
    
    public getMoveDistance(): number {
        return this.moveDistance;
    }
    
    public getRotationSpeed(): number {
        return this.rotationSpeed;
    }
    
    /**
     * Spawn the entity and set up movement behavior
     */
    spawn(world: World, position: Vector3Like): Entity | null {
        // All mechanical blocks should be entities, including static ones
        const entity = super.spawn(world, position);
        
        
        // Only activate movement for non-static types
        if (this.entityType !== 'static') {
            // Wait a tick before activating to ensure rigidBody is ready
            setTimeout(() => {
                this.activate();
            }, 50); // 50ms delay
        }
        
        return entity;
    }
    
    
    /**
     * Activate movement for non-static entities
     */
    activate(): void {
        if (this.entityType === 'static') {
            return;
        }
        
        
        // Use parent class activation (which uses the existing TICK listener)
        super.activate();
    }
    
    /**
     * Called when entity spawns - add sensor collider for reliable player detection
     */
    private onSpawned = (): void => {
        
        // Calculate sensor collider dimensions based on entity size
        // Use entity height + buffer for better player detection coverage
        const sensorHalfExtents = { 
            x: this.dimensions.x * 0.5 + 0.2, 
            y: this.dimensions.y * 0.5 + 0.8, // Scale with entity height + 0.8 buffer
            z: this.dimensions.z * 0.5 + 0.2 
        };
        
        
        // Add sensor collider AFTER spawning for reliable detection (like our working implementation)
        this.createAndAddChildCollider({
            shape: ColliderShape.BLOCK,
            halfExtents: sensorHalfExtents,
            isSensor: true,
            onCollision: (other: any, started: boolean) => {
                if (other instanceof PlayerEntity) {
                    // Only register collision if player is above the platform (standing on top)
                    const playerY = other.position.y;
                    const platformTopY = this.position.y + (this.dimensions.y * 0.5);
                    
                    if (started && playerY >= platformTopY - 0.3) { // Player must be near/above platform top
                        this.playersOnPlatform.add(other);
                    } else if (!started) {
                        this.playersOnPlatform.delete(other);
                    }
                } else {
                }
            }
        });
    };

    /**
     * Handle movement based on entity type - called by parent class TICK handler
     */
    protected override updatePhysics(payload: EventPayloads[EntityEvent.TICK]): void {
      
        const currentPos = this.position;
        const deltaTime = payload.tickDeltaMs / 1000; // Convert ms to seconds
        
        switch (this.entityType) {
            case 'elevator':
                this.handleElevatorMovement(currentPos, deltaTime);
                break;
            case 'carousel':
                this.handleCarouselMovement(currentPos, deltaTime);
                break;
            case 'side-to-side':
                this.handlePistonMovement(currentPos, deltaTime);
                break;
            case 'front-to-back':
                this.handleFrontToBackMovement(currentPos, deltaTime);
                break;
        }
    }
    
    private handleElevatorMovement(currentPos: Vector3, deltaTime: number): void {
        const moveDistance = this.moveSpeed * deltaTime;
        
       
        
        let newPosition: Vector3Like;
        
        if (this.movingForward) {
            const newY = Math.min(currentPos.y + moveDistance, this.targetPosition.y);
            newPosition = { x: currentPos.x, y: newY, z: currentPos.z };
            
            if (newY >= this.targetPosition.y) {
                this.movingForward = false;
            }
        } else {
            const newY = Math.max(currentPos.y - moveDistance, this.startPosition.y);
            newPosition = { x: currentPos.x, y: newY, z: currentPos.z };
            
            if (newY <= this.startPosition.y) {
                this.movingForward = true;
            }
        }
        
        // Calculate movement delta for player synchronization
        const movementDelta = {
            x: newPosition.x - currentPos.x,
            y: newPosition.y - currentPos.y,
            z: newPosition.z - currentPos.z
        };
        
        // Safety check to prevent NaN positions
        if (isNaN(newPosition.x) || isNaN(newPosition.y) || isNaN(newPosition.z)) {
            console.error(`[ConfigurableMechanicalEntity] ERROR: Attempted to set NaN position for ${this.entityType}:`, newPosition);
            return;
        }
        
        // Move the platform
        if (this.rigidBody) {
            this.rigidBody.setTranslation(newPosition, true);
        } else {
            this.setPosition(newPosition);
        }
        
        // Apply movement delta to all players on the platform (manual "stick")
        for (const playerEntity of this.playersOnPlatform) {
            const currentPlayerPos = playerEntity.position;
            const newPlayerPos = {
                x: currentPlayerPos.x + movementDelta.x,  
                y: currentPlayerPos.y + movementDelta.y,
                z: currentPlayerPos.z + movementDelta.z
            };
            playerEntity.setPosition(newPlayerPos);
        }
    }
    
    private handleCarouselMovement(currentPos: Vector3, deltaTime: number): void {
        // Rotate around Y axis
        this.currentRotation += this.rotationSpeed * deltaTime;
        if (this.currentRotation >= 360) {
            this.currentRotation -= 360;
        }
        
        
        
        const radians = this.currentRotation * Math.PI / 180;
        const quaternion = {
            x: 0,
            y: Math.sin(radians / 2),
            z: 0,
            w: Math.cos(radians / 2)
        };
        
        // Apply visual rotation to the wheel
        if (this.rigidBody) {
            this.rigidBody.setRotation(quaternion, true);
        } else {
            this.setRotation(quaternion);
        }
        
        // Move players tangentially (like our original wheel implementation)
        const wheelCenter = this.position;
        const angularVelocityRadPerSec = this.rotationSpeed * (Math.PI / 180);
        
        for (const playerEntity of this.playersOnPlatform) {
            const currentPlayerPos = playerEntity.position;
            
            // Player's distance from rotation center
            const offsetX = currentPlayerPos.x - wheelCenter.x;
            const offsetZ = currentPlayerPos.z - wheelCenter.z;
            const distanceFromCenter = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);
            
            // Tangential velocity = angular_velocity × radius
            const tangentialSpeed = angularVelocityRadPerSec * distanceFromCenter;
            const tangentialDistance = tangentialSpeed * deltaTime;
            
            if (distanceFromCenter > 0.01) {
                // Normalize radius vector
                const normalizedOffsetX = offsetX / distanceFromCenter;
                const normalizedOffsetZ = offsetZ / distanceFromCenter;
                
                // Tangent vector (perpendicular to radius)
                const tangentX = normalizedOffsetZ;
                const tangentZ = -normalizedOffsetX;
                
                // Move player tangentially
                const newPlayerPos = {
                    x: currentPlayerPos.x + tangentX * tangentialDistance,
                    y: currentPlayerPos.y,
                    z: currentPlayerPos.z + tangentZ * tangentialDistance
                };
                
                playerEntity.setPosition(newPlayerPos);
            }
        }
    }
    
    private handlePistonMovement(currentPos: Vector3, deltaTime: number): void {
        const moveDistance = this.moveSpeed * deltaTime;
        
        
        let newPosition: Vector3Like;
        
        if (this.movingForward) {
            const newX = Math.min(currentPos.x + moveDistance, this.targetPosition.x);
            newPosition = { x: newX, y: currentPos.y, z: currentPos.z };
            
            if (newX >= this.targetPosition.x) {
                this.movingForward = false;
            }
        } else {
            const newX = Math.max(currentPos.x - moveDistance, this.startPosition.x);
            newPosition = { x: newX, y: currentPos.y, z: currentPos.z };
            
            if (newX <= this.startPosition.x) {
                this.movingForward = true;
            }
        }
        
        // Calculate movement delta for player synchronization
        const movementDelta = {
            x: newPosition.x - currentPos.x,
            y: newPosition.y - currentPos.y,
            z: newPosition.z - currentPos.z
        };
        
        // Safety check to prevent NaN positions
        if (isNaN(newPosition.x) || isNaN(newPosition.y) || isNaN(newPosition.z)) {
            console.error(`[ConfigurableMechanicalEntity] ERROR: Attempted to set NaN position for ${this.entityType}:`, newPosition);
            return;
        }
        
        // Move the platform
        if (this.rigidBody) {
            this.rigidBody.setTranslation(newPosition, true);
        } else {
            this.setPosition(newPosition);
        }
        
        // Apply movement delta to all players on the platform (manual "stick")
        for (const playerEntity of this.playersOnPlatform) {
            const currentPlayerPos = playerEntity.position;
            const newPlayerPos = {
                x: currentPlayerPos.x + movementDelta.x,  
                y: currentPlayerPos.y + movementDelta.y,
                z: currentPlayerPos.z + movementDelta.z
            };
            playerEntity.setPosition(newPlayerPos);
        }
    }
    
    private handleFrontToBackMovement(currentPos: Vector3, deltaTime: number): void {
        const moveDistance = this.moveSpeed * deltaTime;
        
        let newPosition: Vector3Like;
        
        if (this.movingForward) {
            const newZ = Math.min(currentPos.z + moveDistance, this.targetPosition.z);
            newPosition = { x: currentPos.x, y: currentPos.y, z: newZ };
            
            if (newZ >= this.targetPosition.z) {
                this.movingForward = false;
            }
        } else {
            const newZ = Math.max(currentPos.z - moveDistance, this.startPosition.z);
            newPosition = { x: currentPos.x, y: currentPos.y, z: newZ };
            
            if (newZ <= this.startPosition.z) {
                this.movingForward = true;
            }
        }
        
        // Calculate movement delta for player synchronization
        const movementDelta = {
            x: newPosition.x - currentPos.x,
            y: newPosition.y - currentPos.y,
            z: newPosition.z - currentPos.z
        };
        
        // Safety check to prevent NaN positions
        if (isNaN(newPosition.x) || isNaN(newPosition.y) || isNaN(newPosition.z)) {
            console.error(`[ConfigurableMechanicalEntity] ERROR: Attempted to set NaN position for ${this.entityType}:`, newPosition);
            return;
        }
        
        // Move the platform
        if (this.rigidBody) {
            this.rigidBody.setTranslation(newPosition, true);
        } else {
            this.setPosition(newPosition);
        }
        
        // Apply movement delta to all players on the platform (manual "stick")
        for (const playerEntity of this.playersOnPlatform) {
            const currentPlayerPos = playerEntity.position;
            const newPlayerPos = {
                x: currentPlayerPos.x + movementDelta.x,  
                y: currentPlayerPos.y + movementDelta.y,
                z: currentPlayerPos.z + movementDelta.z
            };
            playerEntity.setPosition(newPlayerPos);
        }
    }
}