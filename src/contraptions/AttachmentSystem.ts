import type { Vector3Like, World } from 'hytopia';
import { MechanicalPistonEntity } from '../entities/MechanicalPistonEntity';
import { MechanicalWheelEntity } from '../entities/MechanicalWheelEntity';
import { ContraptionComponent } from './ContraptionComponent';

/**
 * Represents a face of a block that can accept attachments
 */
export interface AttachmentFace {
    direction: 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
    normal: Vector3Like; // Direction vector pointing outward from face
    position: Vector3Like; // World position of the face center
}

/**
 * Represents a valid attachment point where blocks can be placed
 */
export interface AttachmentPoint {
    face: AttachmentFace;
    attachmentPosition: Vector3Like; // Where the attached block should be placed
    relativePosition: Vector3Like; // Position relative to the controller
    isOccupied: boolean;
}

/**
 * Interface for entities that can have blocks attached to them
 */
export interface ContraptionController {
    getAttachmentPoints(): AttachmentPoint[];
    attachComponent(component: ContraptionComponent, attachmentPoint: AttachmentPoint): boolean;
    detachComponent(component: ContraptionComponent): boolean;
    getAttachedComponents(): ContraptionComponent[];
}

/**
 * System for managing block attachments to mechanical entities
 */
export class AttachmentSystem {
    
    /**
     * Get all attachment faces for a block at the given position
     * Only includes side faces (north, south, east, west) - no top/bottom for wheels
     */
    public static getBlockFaces(position: Vector3Like): AttachmentFace[] {
        return [
            {
                direction: 'north',
                normal: { x: 0, y: 0, z: -1 },
                position: { x: position.x, y: position.y, z: position.z - 0.5 }
            },
            {
                direction: 'south', 
                normal: { x: 0, y: 0, z: 1 },
                position: { x: position.x, y: position.y, z: position.z + 0.5 }
            },
            {
                direction: 'east',
                normal: { x: 1, y: 0, z: 0 },
                position: { x: position.x + 0.5, y: position.y, z: position.z }
            },
            {
                direction: 'west',
                normal: { x: -1, y: 0, z: 0 },
                position: { x: position.x - 0.5, y: position.y, z: position.z }
            }
            // Removed up/down faces - they don't make mechanical sense for wheels
        ];
    }

    /**
     * Generate attachment points for a mechanical entity
     */
    public static generateAttachmentPoints(
        entity: MechanicalPistonEntity | MechanicalWheelEntity,
        entityPosition: Vector3Like
    ): AttachmentPoint[] {
        const faces = this.getBlockFaces(entityPosition);
        const attachmentPoints: AttachmentPoint[] = [];

        for (const face of faces) {
            // Calculate where an attached block would be placed
            const attachmentPosition = {
                x: entityPosition.x + face.normal.x,
                y: entityPosition.y + face.normal.y,
                z: entityPosition.z + face.normal.z
            };

            // Calculate relative position from entity center
            const relativePosition = {
                x: face.normal.x,
                y: face.normal.y,
                z: face.normal.z
            };

            attachmentPoints.push({
                face,
                attachmentPosition,
                relativePosition,
                isOccupied: false
            });
        }

        return attachmentPoints;
    }

    /**
     * Find the best attachment point based on camera direction and click position
     * IMPROVED APPROACH: Uses camera direction as primary factor, click position as secondary
     */
    public static findClosestAttachmentPoint(
        worldPosition: Vector3Like,
        attachmentPoints: AttachmentPoint[],
        maxDistance: number = 6.0,
        cameraDirection?: Vector3Like | null
    ): AttachmentPoint | null {
        if (attachmentPoints.length === 0) return null;
        
        let bestPoint: AttachmentPoint | null = null;
        let bestScore = Infinity;

        // Get the wheel/controller center from the first attachment point
        const wheelCenter = {
            x: attachmentPoints[0].attachmentPosition.x - attachmentPoints[0].relativePosition.x,
            y: attachmentPoints[0].attachmentPosition.y - attachmentPoints[0].relativePosition.y,
            z: attachmentPoints[0].attachmentPosition.z - attachmentPoints[0].relativePosition.z
        };

        // IMPROVED: Prioritize camera direction over click position for better face selection
        // Camera direction represents where the player is actually looking, which is more intuitive
        let primaryDirection: Vector3Like;
        
        if (cameraDirection) {
            // Use camera direction as primary factor (normalized)
            const camLength = Math.sqrt(cameraDirection.x ** 2 + cameraDirection.y ** 2 + cameraDirection.z ** 2);
            primaryDirection = {
                x: cameraDirection.x / camLength,
                y: cameraDirection.y / camLength,
                z: cameraDirection.z / camLength
            };
        } else {
            // Fallback: Calculate direction from wheel center to click position
            const clickDirection = {
                x: worldPosition.x - wheelCenter.x,
                y: worldPosition.y - wheelCenter.y,
                z: worldPosition.z - wheelCenter.z
            };
            const clickLength = Math.sqrt(clickDirection.x ** 2 + clickDirection.y ** 2 + clickDirection.z ** 2);
            primaryDirection = {
                x: clickDirection.x / clickLength,
                y: clickDirection.y / clickLength,
                z: clickDirection.z / clickLength
            };
        }

        console.log(`[AttachmentSystem] ========== FACE SELECTION DEBUG ==========`);
        console.log(`[AttachmentSystem] Wheel center: (${wheelCenter.x}, ${wheelCenter.y}, ${wheelCenter.z})`);
        console.log(`[AttachmentSystem] Click position: (${worldPosition.x}, ${worldPosition.y}, ${worldPosition.z})`);
        console.log(`[AttachmentSystem] Primary direction (${cameraDirection ? 'camera' : 'click-based'}): (${primaryDirection.x.toFixed(3)}, ${primaryDirection.y.toFixed(3)}, ${primaryDirection.z.toFixed(3)})`);
        
        console.log(`[AttachmentSystem] Using ${cameraDirection ? 'camera direction' : 'click-based direction'} for face selection`);

        for (const point of attachmentPoints) {
            if (point.isOccupied) continue;

            const distance = this.calculateDistance(worldPosition, point.attachmentPosition);
            
            // Calculate how aligned this face is with the primary direction (camera or click-based)
            // Dot product: higher = more aligned (face normal points toward camera/click direction)
            const dotProduct = (
                point.relativePosition.x * primaryDirection.x +
                point.relativePosition.y * primaryDirection.y +
                point.relativePosition.z * primaryDirection.z
            );
            
            // IMPROVED SCORING: Heavily weight alignment, small distance penalty
            // For camera direction: face should be aligned with where player is looking
            // For click direction: face should be aligned with click direction from entity center
            const alignmentWeight = 10.0; // Heavy weight on alignment
            const distanceWeight = 0.01;  // Light weight on distance
            const score = (-dotProduct * alignmentWeight) + (distance * distanceWeight);
            
            console.log(`[AttachmentSystem] - ${point.face.direction} face:`);
            console.log(`[AttachmentSystem]   Face normal: (${point.relativePosition.x}, ${point.relativePosition.y}, ${point.relativePosition.z})`);
            console.log(`[AttachmentSystem]   Dot product: ${dotProduct.toFixed(3)} (higher = more aligned with direction)`);
            console.log(`[AttachmentSystem]   Distance: ${distance.toFixed(2)}`);
            console.log(`[AttachmentSystem]   Final score: ${score.toFixed(3)} (lower = better)`);
            
            if (score < bestScore && distance <= maxDistance) {
                bestScore = score;
                bestPoint = point;
            }
        }

        if (bestPoint) {
            console.log(`[AttachmentSystem] ========== FINAL SELECTION ==========`);
            console.log(`[AttachmentSystem] SELECTED: ${bestPoint.face.direction} face with score ${bestScore.toFixed(3)}`);
            console.log(`[AttachmentSystem] This face normal: (${bestPoint.relativePosition.x}, ${bestPoint.relativePosition.y}, ${bestPoint.relativePosition.z})`);
            console.log(`[AttachmentSystem] ====================================`);
        } else {
            console.log(`[AttachmentSystem] No valid attachment point found within max distance ${maxDistance}`);
        }

        return bestPoint;
    }

    /**
     * Check if a position is valid for block placement
     */
    public static isValidPlacementPosition(
        position: Vector3Like,
        controller: ContraptionController,
        blockType: string
    ): boolean {
        const attachmentPoints = controller.getAttachmentPoints();
        const closestPoint = this.findClosestAttachmentPoint(position, attachmentPoints);
        
        if (!closestPoint) {
            console.log(`[AttachmentSystem] No valid attachment point found near ${position.x}, ${position.y}, ${position.z}`);
            return false;
        }

        // Additional validation based on block type
        if (blockType === 'ice' || blockType === 'glass') {
            // These blocks can attach to any face
            return true;
        }

        // Add more block-specific rules here
        return true;
    }

    /**
     * Attach a block to a mechanical entity at the specified position
     */
    public static attachBlockToEntity(
        blockType: string,
        worldPosition: Vector3Like,
        controller: ContraptionController & (MechanicalPistonEntity | MechanicalWheelEntity),
        world: World,
        cameraDirection?: Vector3Like | null
    ): ContraptionComponent | null {
        const attachmentPoints = controller.getAttachmentPoints();
        
        // Use the controller's position as reference point instead of worldPosition
        // This gives more predictable attachment behavior
        const controllerPos = controller.position;
        const closestPoint = this.findClosestAttachmentPoint(worldPosition, attachmentPoints, 6.0, cameraDirection);

        if (!closestPoint) {
            console.error(`[AttachmentSystem] Cannot attach ${blockType} - no valid attachment point`);
            return null;
        }

        try {
            // Create the contraption component
            const component = new ContraptionComponent(
                blockType,
                closestPoint.relativePosition,
                closestPoint.attachmentPosition,
                world
            );

            // Spawn the component in the world first
            component.spawn(world, closestPoint.attachmentPosition);

            // Attach to controller
            const success = controller.attachComponent(component, closestPoint);
            if (success) {
                component.setController(controller as any);
                closestPoint.isOccupied = true;
                
                console.log(`[AttachmentSystem] Successfully attached ${blockType} to ${controller.constructor.name}`);
                return component;
            } else {
                console.error(`[AttachmentSystem] Failed to attach ${blockType} to controller`);
                component.despawn();
                return null;
            }
        } catch (error) {
            console.error(`[AttachmentSystem] Error creating attachment: ${error}`);
            return null;
        }
    }

    /**
     * Detach a component from its controller
     */
    public static detachComponent(
        component: ContraptionComponent,
        controller: ContraptionController
    ): boolean {
        const success = controller.detachComponent(component);
        if (success) {
            // Mark attachment point as available again
            const attachmentPoints = controller.getAttachmentPoints();
            const relativePos = component.getRelativePosition();
            
            for (const point of attachmentPoints) {
                if (this.vectorsEqual(point.relativePosition, relativePos)) {
                    point.isOccupied = false;
                    break;
                }
            }
            
            console.log(`[AttachmentSystem] Successfully detached ${component.getBlockType()}`);
        }
        
        return success;
    }

    /**
     * Calculate distance between two positions
     */
    private static calculateDistance(pos1: Vector3Like, pos2: Vector3Like): number {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const dz = pos2.z - pos1.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Check if two vectors are approximately equal
     */
    private static vectorsEqual(v1: Vector3Like, v2: Vector3Like, tolerance: number = 0.01): boolean {
        return Math.abs(v1.x - v2.x) < tolerance &&
               Math.abs(v1.y - v2.y) < tolerance &&
               Math.abs(v1.z - v2.z) < tolerance;
    }

    /**
     * Get attachment preview position for UI feedback
     */
    public static getAttachmentPreview(
        targetPosition: Vector3Like,
        controller: ContraptionController
    ): Vector3Like | null {
        const attachmentPoints = controller.getAttachmentPoints();
        const closestPoint = this.findClosestAttachmentPoint(targetPosition, attachmentPoints);
        
        return closestPoint ? closestPoint.attachmentPosition : null;
    }

    /**
     * Get all available attachment positions for an entity
     */
    public static getAvailableAttachmentPositions(
        controller: ContraptionController
    ): Vector3Like[] {
        return controller.getAttachmentPoints()
            .filter(point => !point.isOccupied)
            .map(point => point.attachmentPosition);
    }
}