import { Entity, RigidBodyType, EntityEvent, ColliderShape, CoefficientCombineRule } from "hytopia";

export class IceEntity extends Entity {
    constructor() {
        super({
            name: 'IceEntity',
            tag: 'ice-entity',
            // Invisible entity - no model needed
            modelUri: undefined,
            rigidBodyOptions: {
                type: RigidBodyType.FIXED, // Fixed so it doesn't move
                colliders: [
                    {
                        shape: ColliderShape.BLOCK,
                        halfExtents: { x: .05, y: 0.01, z: 0.05 }, // Thin flat surface
                        friction: 0.00011, // Very low friction for slippery ice
                        frictionCombineRule: CoefficientCombineRule.Min, // Use minimum friction when combining
                    }
                ],
            }
        });

        this.on(EntityEvent.SPAWN, this.handleSpawn.bind(this));
    }

    private handleSpawn() {
        if (!this.isSpawned) return;
        
        console.log('[IceEntity] Spawned ice entity with low friction collider');
    }
} 