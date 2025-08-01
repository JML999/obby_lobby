import { Entity, Vector3, World, RigidBodyType, CollisionGroup, ColliderShape, EntityEvent, type EventPayloads } from 'hytopia';
import type { Vector3Like, QuaternionLike } from 'hytopia';
import ObstacleEntity from '../obstacles/ObstacleEntity';
import { ContraptionController, AttachmentPoint } from './AttachmentSystem';
import { ObbyPlayerEntity } from '../ObbyPlayerEntity';

/**
 * Block properties that define how a block behaves in the world
 */
export interface BlockProperties {
    // Physics properties
    friction?: number;
    bounciness?: number;
    slippery?: boolean;
    
    // Interaction properties
    breakable?: boolean;
    hardness?: number;
    
    // Visual properties
    textureUri: string;
    blockHalfExtents?: Vector3Like;
    
    // Special behaviors
    icy?: boolean;      // Makes players slide
    bouncy?: boolean;   // Makes players bounce
    sticky?: boolean;   // Slows player movement
}

/**
 * Predefined block property sets for common block types
 */
export const BLOCK_PROPERTIES: Record<string, BlockProperties> = {
    ice: {
        textureUri: 'blocks/ice.png',
        friction: 0.1,
        slippery: true,
        icy: true,
        breakable: true,
        hardness: 1
    },
    glass: {
        textureUri: 'blocks/glass.png',
        friction: 0.7,
        breakable: true,
        hardness: 0.5,
        bounciness: 0.2
    },
    stone: {
        textureUri: 'blocks/stone.png',
        friction: 0.8,
        breakable: true,
        hardness: 3
    },
    wood: {
        textureUri: 'blocks/wood.png',
        friction: 0.6,
        breakable: true,
        hardness: 2
    },
    metal: {
        textureUri: 'blocks/metal.png',
        friction: 0.9,
        breakable: false,
        hardness: 5
    }
};

/**
 * Represents a block attached to a mechanical contraption
 * Maintains block properties while moving with the contraption
 * Can also act as a parent for other components (hierarchical attachment)
 */
export class ContraptionComponent extends ObstacleEntity implements ContraptionController {
    private blockType: string;
    private blockProperties: BlockProperties;
    private relativePosition: Vector3Like;
    private relativeRotation: QuaternionLike;
    private contraptionController: Entity | null = null;
    
    // Hierarchical attachment system
    private childComponents: ContraptionComponent[] = [];
    private parentComponent: ContraptionComponent | null = null;
    private attachmentPoints: AttachmentPoint[] = [];

    constructor(
        blockType: string, 
        relativePosition: Vector3Like, 
        absolutePosition: Vector3Like,
        world: World,
        relativeRotation: QuaternionLike = { x: 0, y: 0, z: 0, w: 1 }
    ) {
        const properties = BLOCK_PROPERTIES[blockType];
        if (!properties) {
            throw new Error(`Unknown block type: ${blockType}`);
        }

        // Configure entity as KINEMATIC body for predictable platforming
        super({
            blockTextureUri: properties.textureUri,
            blockHalfExtents: properties.blockHalfExtents || { x: 0.5, y: 0.5, z: 0.5 },
            rigidBodyOptions: {
                type: RigidBodyType.KINEMATIC_POSITION,
                colliders: [{
                    shape: ColliderShape.BLOCK,
                    halfExtents: properties.blockHalfExtents || { x: 0.5, y: 0.5, z: 0.5 },
                    friction: properties.friction || 0.7,
                    restitution: properties.bounciness || 0.0,
                    collisionGroups: {
                        belongsTo: [CollisionGroup.ENTITY],
                        collidesWith: [CollisionGroup.PLAYER, CollisionGroup.ENTITY_SENSOR]
                    }
                }]
            }
        });

        this.blockType = blockType;
        this.blockProperties = properties;
        this.relativePosition = { ...relativePosition };
        this.relativeRotation = { ...relativeRotation };

        // Listen for spawn event
        this.on(EntityEvent.SPAWN, this.onSpawned);
        
        // Listen for collision events to apply block behaviors
        this.on(EntityEvent.COLLISION, this.onPlayerCollision);

        console.log(`[ContraptionComponent] Created ${blockType} component at relative position ${relativePosition.x}, ${relativePosition.y}, ${relativePosition.z}`);
    }

    private onSpawned = (): void => {
        console.log(`[ContraptionComponent] Spawned ${this.blockType} component`);
        
        // Apply special block behaviors
        this.applyBlockBehaviors();
        
        // Initialize attachment points for hierarchical attachment
        this.initializeAttachmentPoints();
        
        // If attached to a controller, ensure we're positioned and oriented correctly
        if (this.contraptionController) {
            const controllerPos = this.contraptionController.position;
            const absolutePos = {
                x: controllerPos.x + this.relativePosition.x,
                y: controllerPos.y + this.relativePosition.y,
                z: controllerPos.z + this.relativePosition.z
            };
            this.setNextKinematicPosition(absolutePos);
            
            // Orient the block to face outward from the attachment point
            this.setInitialOrientation();
        }
        
        console.log(`[ContraptionComponent] ${this.blockType} component spawned with collision detection enabled`);
    }

    /**
     * Apply special behaviors based on block properties
     */
    private applyBlockBehaviors(): void {
        if (this.blockProperties.slippery && this.rawRigidBody) {
            // Make surface very slippery for ice blocks
            try {
                const colliders = this.rawRigidBody.colliders();
                for (const collider of colliders) {
                    if (typeof collider.setFriction === 'function') {
                        collider.setFriction(this.blockProperties.friction || 0.1);
                    }
                }
            } catch (error) {
                console.error(`[ContraptionComponent] Failed to set friction: ${error}`);
            }
        }
    }

    /**
     * Handle collision with players to apply block behaviors
     */
    private onPlayerCollision = (payload: EventPayloads[EntityEvent.COLLISION]): void => {
        const { entity: otherEntity, contactPoint } = payload;
        
        // Check if colliding entity is a player
        if (otherEntity instanceof ObbyPlayerEntity) {
            const player = otherEntity;
            
            // Apply block-specific behaviors based on block type
            this.applyPlayerBehaviors(player, contactPoint);
        }
    }

    /**
     * Apply block behaviors to player (similar to BlockBehaviorManager)
     */
    private applyPlayerBehaviors(player: ObbyPlayerEntity, contactPoint: Vector3Like): void {
        console.log(`[ContraptionComponent] Player collision with ${this.blockType} block`);
        
        // Ice block behavior - make player slippery (same as BlockBehaviorManager)
        if (this.blockProperties.icy || this.blockProperties.slippery) {
            console.log(`[ContraptionComponent] Applying ice physics to player - setting isOnIce flag`);
            
            // Set the isOnIce flag that ObbyPlayerController checks for
            (player as any).isOnIce = true;
            (player as any).iceBlockType = this.blockType;
            (player as any).lastIceContact = Date.now();
            
            // The ObbyPlayerController will automatically detect this flag
            // and switch to applyIceSkatingPhysics() on next tick
        }
        
        // Bouncy block behavior
        if (this.blockProperties.bouncy && this.blockProperties.bounciness) {
            console.log(`[ContraptionComponent] Applying bounce physics to player`);
            
            const bounceForce = {
                x: 0,
                y: this.blockProperties.bounciness * 10, // Convert to impulse
                z: 0
            };
            
            player.applyImpulse(bounceForce);
        }
        
        // Sand block behavior - make player slower
        if (this.blockProperties.sticky || this.blockType === 'sand') {
            console.log(`[ContraptionComponent] Applying sand physics to player`);
            
            // Set sand flag that ObbyPlayerController checks for
            (player as any).isOnSand = true;
            (player as any).sandBlockType = this.blockType;
        }
        
        // Conveyor-like behavior (if we add it to block properties)
        if (this.blockProperties.hasOwnProperty('conveyorDirection')) {
            console.log(`[ContraptionComponent] Applying conveyor physics to player`);
            
            (player as any).isOnConveyor = true;
            (player as any).conveyorDirection = (this.blockProperties as any).conveyorDirection;
            (player as any).conveyorStrength = (this.blockProperties as any).conveyorStrength || 4.0;
        }
        
        // Note: Deadly blocks (lava) should be handled by game logic, not here
        // We don't want contraption components to kill players accidentally
    }

    /**
     * Update position based on contraption controller's transformation
     */
    public updateRelativePosition(controllerPosition: Vector3Like, controllerRotation?: QuaternionLike): void {
        if (!this.isSpawned) return;

        // Calculate absolute position from relative position and controller transform
        const absolutePosition = {
            x: controllerPosition.x + this.relativePosition.x,
            y: controllerPosition.y + this.relativePosition.y,
            z: controllerPosition.z + this.relativePosition.z
        };

        // Apply rotation if controller is rotating (for wheels)
        if (controllerRotation) {
            // Apply controller rotation to relative position
            const rotatedRelative = this.rotateVector(this.relativePosition, controllerRotation);
            absolutePosition.x = controllerPosition.x + rotatedRelative.x;
            absolutePosition.y = controllerPosition.y + rotatedRelative.y;
            absolutePosition.z = controllerPosition.z + rotatedRelative.z;
        }

        this.setNextKinematicPosition(absolutePosition);

        // Also apply rotation if needed
        if (controllerRotation) {
            this.setNextKinematicRotation(controllerRotation);
        }
    }

    /**
     * Rotate a vector by a quaternion
     */
    private rotateVector(vector: Vector3Like, quaternion: QuaternionLike): Vector3Like {
        // Quaternion rotation: v' = q * v * q^-1
        // Simplified for Y-axis rotations (most common case)
        const { x, y, z, w } = quaternion;
        const vx = vector.x;
        const vy = vector.y;
        const vz = vector.z;

        return {
            x: vx * (1 - 2 * (y * y + z * z)) + vy * 2 * (x * y - w * z) + vz * 2 * (x * z + w * y),
            y: vx * 2 * (x * y + w * z) + vy * (1 - 2 * (x * x + z * z)) + vz * 2 * (y * z - w * x),
            z: vx * 2 * (x * z - w * y) + vy * 2 * (y * z + w * x) + vz * (1 - 2 * (x * x + y * y))
        };
    }

    /**
     * Set the contraption controller that manages this component
     */
    public setController(controller: Entity): void {
        this.contraptionController = controller;
        console.log(`[ContraptionComponent] Attached to controller ${controller.id}`);
    }

    /**
     * Get the block type of this component
     */
    public getBlockType(): string {
        return this.blockType;
    }

    /**
     * Set initial orientation for the block based on its attachment point
     * Makes blocks face outward naturally like windmill spokes
     */
    private setInitialOrientation(): void {
        if (!this.contraptionController) return;

        // Calculate orientation based on relative position from controller
        const relPos = this.relativePosition;
        
        // Create a quaternion that orients the block outward from the attachment point
        // For blocks on the sides of wheels, they should face outward
        let rotationY = 0;
        
        // Determine rotation based on which face we're attached to
        if (Math.abs(relPos.x) > Math.abs(relPos.z)) {
            // Attached to east/west face
            rotationY = relPos.x > 0 ? Math.PI / 2 : -Math.PI / 2; // 90° or -90°
        } else {
            // Attached to north/south face  
            rotationY = relPos.z > 0 ? Math.PI : 0; // 180° or 0°
        }
        
        // Convert to quaternion
        const halfY = rotationY / 2;
        const orientation = {
            x: 0,
            y: Math.sin(halfY),
            z: 0,
            w: Math.cos(halfY)
        };
        
        this.setNextKinematicRotation(orientation);
        
        console.log(`[ContraptionComponent] Set initial orientation for ${this.blockType} at relative pos (${relPos.x}, ${relPos.y}, ${relPos.z}) with Y rotation ${(rotationY * 180 / Math.PI).toFixed(1)}°`);
    }

    /**
     * Get the block properties
     */
    public getBlockProperties(): BlockProperties {
        return { ...this.blockProperties };
    }

    /**
     * Get the relative position from controller
     */
    public getRelativePosition(): Vector3Like {
        return { ...this.relativePosition };
    }

    /**
     * Get the relative rotation from controller
     */
    public getRelativeRotation(): QuaternionLike {
        return { ...this.relativeRotation };
    }

    /**
     * Update the relative position (useful for dynamic attachments)
     */
    public setRelativePosition(position: Vector3Like): void {
        this.relativePosition = { ...position };
    }

    /**
     * Check if this block type has special properties
     */
    public hasProperty(property: keyof BlockProperties): boolean {
        return Boolean(this.blockProperties[property]);
    }

    /**
     * Handle block breaking/destruction
     */
    public breakBlock(): void {
        if (this.blockProperties.breakable) {
            console.log(`[ContraptionComponent] Breaking ${this.blockType} block`);
            // TODO: Add break effects, drop items, etc.
            this.despawn();
        }
    }

    /**
     * Initialize attachment points for this component
     */
    private initializeAttachmentPoints(): void {
        // Generate 6 attachment points (one for each face)
        const faces = [
            { direction: 'north' as const, normal: { x: 0, y: 0, z: -1 } },
            { direction: 'south' as const, normal: { x: 0, y: 0, z: 1 } },
            { direction: 'east' as const, normal: { x: 1, y: 0, z: 0 } },
            { direction: 'west' as const, normal: { x: -1, y: 0, z: 0 } },
            { direction: 'up' as const, normal: { x: 0, y: 1, z: 0 } },
            { direction: 'down' as const, normal: { x: 0, y: -1, z: 0 } }
        ];

        this.attachmentPoints = faces.map(face => ({
            face: {
                direction: face.direction,
                normal: face.normal,
                position: {
                    x: this.position.x + face.normal.x * 0.5,
                    y: this.position.y + face.normal.y * 0.5,
                    z: this.position.z + face.normal.z * 0.5
                }
            },
            attachmentPosition: {
                x: this.position.x + face.normal.x,
                y: this.position.y + face.normal.y,
                z: this.position.z + face.normal.z
            },
            relativePosition: face.normal,
            isOccupied: false
        }));

        console.log(`[ContraptionComponent] Initialized ${this.attachmentPoints.length} attachment points for ${this.blockType}`);
    }

    /**
     * Update attachment points when component moves
     */
    private updateAttachmentPoints(): void {
        for (const point of this.attachmentPoints) {
            point.face.position = {
                x: this.position.x + point.face.normal.x * 0.5,
                y: this.position.y + point.face.normal.y * 0.5,
                z: this.position.z + point.face.normal.z * 0.5
            };
            point.attachmentPosition = {
                x: this.position.x + point.face.normal.x,
                y: this.position.y + point.face.normal.y,
                z: this.position.z + point.face.normal.z
            };
        }
    }

    /**
     * Update position and notify all children
     */
    public override updateRelativePosition(controllerPosition: Vector3Like, controllerRotation?: QuaternionLike): void {
        // Update own position
        super.updateRelativePosition(controllerPosition, controllerRotation);
        
        // Update attachment points
        this.updateAttachmentPoints();
        
        // Update all child components
        for (const child of this.childComponents) {
            if (child.isSpawned) {
                child.updateRelativePosition(this.position, controllerRotation);
            }
        }
    }

    // ContraptionController implementation for hierarchical attachment
    
    /**
     * Get attachment points for this component
     */
    public getAttachmentPoints(): AttachmentPoint[] {
        return this.attachmentPoints;
    }

    /**
     * Attach a child component to this component
     */
    public attachComponent(component: ContraptionComponent, attachmentPoint: AttachmentPoint): boolean {
        try {
            // Spawn the child component in the world
            if (this.world) {
                this.world.spawnEntity(component, attachmentPoint.attachmentPosition);
            }
            
            // Add to children and set parent relationship
            this.childComponents.push(component);
            component.parentComponent = this;
            component.setController(this);
            attachmentPoint.isOccupied = true;
            
            console.log(`[ContraptionComponent] Attached child ${component.getBlockType()} to ${this.blockType} (${this.childComponents.length} children total)`);
            return true;
        } catch (error) {
            console.error(`[ContraptionComponent] Failed to attach child component: ${error}`);
            return false;
        }
    }

    /**
     * Detach a child component
     */
    public detachComponent(component: ContraptionComponent): boolean {
        const index = this.childComponents.indexOf(component);
        if (index === -1) {
            return false;
        }

        this.childComponents.splice(index, 1);
        component.parentComponent = null;
        
        // Mark attachment point as available
        const relativePos = component.getRelativePosition();
        for (const point of this.attachmentPoints) {
            if (this.vectorsEqual(point.relativePosition, relativePos)) {
                point.isOccupied = false;
                break;
            }
        }
        
        component.despawn();
        
        console.log(`[ContraptionComponent] Detached child component (${this.childComponents.length} children remaining)`);
        return true;
    }

    /**
     * Get all attached child components
     */
    public getAttachedComponents(): ContraptionComponent[] {
        return [...this.childComponents];
    }

    /**
     * Check if two vectors are approximately equal
     */
    private vectorsEqual(v1: Vector3Like, v2: Vector3Like, tolerance: number = 0.01): boolean {
        return Math.abs(v1.x - v2.x) < tolerance &&
               Math.abs(v1.y - v2.y) < tolerance &&
               Math.abs(v1.z - v2.z) < tolerance;
    }

    /**
     * Get the parent component (if this is a child)
     */
    public getParentComponent(): ContraptionComponent | null {
        return this.parentComponent;
    }

    /**
     * Get the relative position of this component
     */
    public getRelativePosition(): Vector3Like {
        return { ...this.relativePosition };
    }

    /**
     * Get the block type of this component
     */
    public getBlockType(): string {
        return this.blockType;
    }

    /**
     * Get all child components recursively
     */
    public getAllDescendants(): ContraptionComponent[] {
        const descendants: ContraptionComponent[] = [];
        
        for (const child of this.childComponents) {
            descendants.push(child);
            descendants.push(...child.getAllDescendants());
        }
        
        return descendants;
    }

    /**
     * Get the root controller for this component chain
     */
    public getRootController(): Entity {
        if (this.parentComponent) {
            return this.parentComponent.getRootController();
        }
        return this.contraptionController || this;
    }

    /**
     * Clean up when component is destroyed
     */
    public override despawn(): void {
        console.log(`[ContraptionComponent] Despawning ${this.blockType} component`);
        
        // Despawn all children first
        for (const child of this.childComponents) {
            if (child.isSpawned) {
                child.despawn();
            }
        }
        this.childComponents = [];
        
        // Remove from parent if applicable
        if (this.parentComponent) {
            this.parentComponent.detachComponent(this);
        }
        
        this.contraptionController = null;
        this.parentComponent = null;
        super.despawn();
    }
}