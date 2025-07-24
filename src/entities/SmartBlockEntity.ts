import { Entity, RigidBodyType, ColliderShape, PlayerEntity, World, Vector3, Player, SimpleEntityController } from 'hytopia';

export class SmartBlockEntity extends Entity {
    constructor(options: any) {
        super(options);
    }

    spawnWithCollider(world: World, position: Vector3) {
        this.spawn(world, position);
        this.createAndAddChildCollider({
            shape: ColliderShape.CYLINDER,
            radius: 1,
            halfHeight: 1,
            isSensor: true,
            onCollision: (other: any, started: boolean) => {
                if (other instanceof PlayerEntity && started) {
                    this.onPlayerInteract(other.player);
                }
            },
        });
    }

    // Apply facing to the entity
    faceTowards(target: Vector3) {
        if (this.controller && this.controller instanceof SimpleEntityController) {
            (this.controller as SimpleEntityController).face(target, 1);
        }
    }

    // Override in subclasses
    onPlayerInteract(player: Player) {
        // Default: do nothing
    }
} 