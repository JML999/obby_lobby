import { Entity, Vector3, RigidBodyType, CollisionGroup, ColliderShape, EntityEvent, type EventPayloads } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import { ContraptionController, AttachmentPoint } from './AttachmentSystem';
import { ContraptionComponent } from './ContraptionComponent';

/**
 * Face direction for attachment zones
 */
export type AttachmentFace = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

/**
 * Static invisible zone that provides reliable click detection for attachments
 * Follows its parent controller but remains static for physics purposes
 */
export class AttachmentZone extends Entity {
    private parentController: ContraptionController;
    private parentComponent: ContraptionComponent | null = null;
    private face: AttachmentFace;
    private relativePosition: Vector3Like;
    private attachmentPoint: AttachmentPoint;
    private isHighlighted: boolean = false;

    constructor(
        parentController: ContraptionController,
        parentComponent: ContraptionComponent | null,
        face: AttachmentFace,
        relativePosition: Vector3Like,
        attachmentPoint: AttachmentPoint
    ) {
        // Create invisible static collision zone for reliable click detection
        super({
            name: `AttachmentZone_${face}`,
            // Use a minimal block texture (will be invisible in practice)
            blockTextureUri: 'blocks/glass.png', // Use glass for transparency
            blockHalfExtents: { x: 0.6, y: 0.6, z: 0.6 }, // Slightly larger than standard block
            rigidBodyOptions: {
                type: RigidBodyType.STATIC, // Static = always reliable for raycasting
                colliders: [{
                    shape: ColliderShape.BLOCK,
                    halfExtents: { x: 0.6, y: 0.6, z: 0.6 }, // Slightly larger than block for easier targeting
                    sensor: true, // No physics collision, just detection
                    collisionGroups: {
                        belongsTo: [CollisionGroup.ENTITY_SENSOR],
                        collidesWith: [CollisionGroup.PLAYER] // Only detects player interactions
                    }
                }]
            }
        });

        this.parentController = parentController;
        this.parentComponent = parentComponent;
        this.face = face;
        this.relativePosition = { ...relativePosition };
        this.attachmentPoint = attachmentPoint;

        // Listen for spawn event to start following parent
        this.on(EntityEvent.SPAWN, this.onSpawned);

        console.log(`[AttachmentZone] Created ${face} zone for ${parentComponent ? 'component' : 'controller'}`);
    }

    private onSpawned = (): void => {
        console.log(`[AttachmentZone] Spawned ${this.face} attachment zone`);
        
        // Start following parent position
        this.updatePosition();
    }

    /**
     * Update zone position to follow parent, called every tick
     */
    public updatePosition(): void {
        if (!this.isSpawned) return;

        let parentPosition: Vector3Like;

        if (this.parentComponent && this.parentComponent.isSpawned) {
            // Zone attached to a component
            parentPosition = this.parentComponent.position;
        } else if ('position' in this.parentController) {
            // Zone attached to main controller
            parentPosition = (this.parentController as any).position;
        } else {
            return;
        }

        // Calculate absolute position from parent position + relative offset
        const absolutePosition = {
            x: parentPosition.x + this.relativePosition.x,
            y: parentPosition.y + this.relativePosition.y,
            z: parentPosition.z + this.relativePosition.z
        };

        // Move zone to follow parent (zone stays static but updates position)
        this.setPosition(absolutePosition);

        // Update attachment point position for attachment calculations
        this.attachmentPoint.attachmentPosition = {
            x: absolutePosition.x + this.getNormalVector().x * 0.5,
            y: absolutePosition.y + this.getNormalVector().y * 0.5,
            z: absolutePosition.z + this.getNormalVector().z * 0.5
        };
    }

    /**
     * Get the normal vector for this face direction
     */
    private getNormalVector(): Vector3Like {
        switch (this.face) {
            case 'north': return { x: 0, y: 0, z: -1 };
            case 'south': return { x: 0, y: 0, z: 1 };
            case 'east': return { x: 1, y: 0, z: 0 };
            case 'west': return { x: -1, y: 0, z: 0 };
            case 'up': return { x: 0, y: 1, z: 0 };
            case 'down': return { x: 0, y: -1, z: 0 };
        }
    }

    /**
     * Handle player interaction with this zone
     */
    public onPlayerInteraction(selectedBlockType: string): ContraptionComponent | null {
        if (this.attachmentPoint.isOccupied) {
            console.log(`[AttachmentZone] Cannot attach to ${this.face} face - already occupied`);
            return null;
        }

        try {
            console.log(`[AttachmentZone] Player placing ${selectedBlockType} on ${this.face} face`);

            // Create the contraption component
            const component = new ContraptionComponent(
                selectedBlockType,
                this.relativePosition,
                this.attachmentPoint.attachmentPosition
            );

            // Attach to the appropriate controller
            const targetController = this.parentComponent || this.parentController;
            const success = targetController.attachComponent(component, this.attachmentPoint);

            if (success) {
                component.setController(targetController as any);
                this.attachmentPoint.isOccupied = true;
                
                // Create attachment zones for the new component
                this.createChildAttachmentZones(component);
                
                console.log(`[AttachmentZone] Successfully attached ${selectedBlockType} to ${this.face} face`);
                return component;
            } else {
                console.error(`[AttachmentZone] Failed to attach ${selectedBlockType} to controller`);
                component.despawn();
                return null;
            }
        } catch (error) {
            console.error(`[AttachmentZone] Error during attachment: ${error}`);
            return null;
        }
    }

    /**
     * Create attachment zones for a newly placed component
     */
    private createChildAttachmentZones(component: ContraptionComponent): void {
        // Generate attachment points for the new component
        const componentPosition = component.position;
        const faces: AttachmentFace[] = ['north', 'south', 'east', 'west', 'up', 'down'];

        for (const face of faces) {
            const normal = this.getFaceNormal(face);
            const relativePos = { x: normal.x, y: normal.y, z: normal.z };
            
            const attachmentPoint: AttachmentPoint = {
                face: {
                    direction: face,
                    normal: normal,
                    position: {
                        x: componentPosition.x + normal.x * 0.5,
                        y: componentPosition.y + normal.y * 0.5,
                        z: componentPosition.z + normal.z * 0.5
                    }
                },
                attachmentPosition: {
                    x: componentPosition.x + normal.x,
                    y: componentPosition.y + normal.y,
                    z: componentPosition.z + normal.z
                },
                relativePosition: relativePos,
                isOccupied: false
            };

            // Create zone for this face
            const zone = new AttachmentZone(
                this.parentController,
                component, // This component becomes parent for the new zone
                face,
                relativePos,
                attachmentPoint
            );

            // Spawn the zone in the world
            if (this.world) {
                this.world.spawnEntity(zone, attachmentPoint.face.position);
            }
        }

        console.log(`[AttachmentZone] Created 6 attachment zones for new ${component.getBlockType()} component`);
    }

    /**
     * Get face normal vector by face name
     */
    private getFaceNormal(face: AttachmentFace): Vector3Like {
        switch (face) {
            case 'north': return { x: 0, y: 0, z: -1 };
            case 'south': return { x: 0, y: 0, z: 1 };
            case 'east': return { x: 1, y: 0, z: 0 };
            case 'west': return { x: -1, y: 0, z: 0 };
            case 'up': return { x: 0, y: 1, z: 0 };
            case 'down': return { x: 0, y: -1, z: 0 };
        }
    }

    /**
     * Highlight this zone for visual feedback
     */
    public highlight(enabled: boolean): void {
        this.isHighlighted = enabled;
        // TODO: Add visual highlighting (glow effect, outline, etc.)
        console.log(`[AttachmentZone] ${this.face} zone ${enabled ? 'highlighted' : 'unhighlighted'}`);
    }

    /**
     * Check if this zone is available for attachment
     */
    public isAvailable(): boolean {
        return !this.attachmentPoint.isOccupied;
    }

    /**
     * Get the face direction this zone represents
     */
    public getFace(): AttachmentFace {
        return this.face;
    }

    /**
     * Get the attachment point this zone manages
     */
    public getAttachmentPoint(): AttachmentPoint {
        return this.attachmentPoint;
    }

    /**
     * Get the parent controller
     */
    public getParentController(): ContraptionController {
        return this.parentController;
    }

    /**
     * Get the parent component (if attached to a component)
     */
    public getParentComponent(): ContraptionComponent | null {
        return this.parentComponent;
    }

    /**
     * Clean up when zone is destroyed
     */
    public override despawn(): void {
        console.log(`[AttachmentZone] Despawning ${this.face} attachment zone`);
        super.despawn();
    }
}