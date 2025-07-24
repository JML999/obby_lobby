import { Entity, PlayerEntity, Vector3, Quaternion, EntityEvent, RigidBodyType, BaseEntityControllerEvent, type PlayerCameraOrientation, type PlayerInput, ColliderShape } from "hytopia";
import { ObbyPlayerEntity } from "./ObbyPlayerEntity";
import { FlyEntityController } from "./FlyEntityController";
import { CollisionGroups } from "./CollisionGroups";

export class FlyEntity extends Entity {
    public rider: PlayerEntity | null = null;
    private flyController: FlyEntityController;
    
    constructor() {
        super({
            name: 'FlyEntity',
            tag: 'fly-entity',
            // Use sword model as temporary broom
            blockTextureUri: 'blocks/delete_block.png',
            blockHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
            modelScale: 1, // Make it bigger to look more like a rideable broom
            modelLoopedAnimations: [], // No animations needed
            rigidBodyOptions: {
                type: RigidBodyType.KINEMATIC_POSITION, // Position control without any physics forces
                colliders: [{
                    shape: ColliderShape.CAPSULE,
                    halfHeight: 0.5,
                    radius: 0.3,
                    collisionGroups: {
                        belongsTo: [CollisionGroups.FLY],
                        collidesWith: [CollisionGroups.PLAYER], // Only collide with players, exclude plot entities
                    }
                }],
            }
        });

        // Create and set the FlyEntityController
        this.flyController = new FlyEntityController();
        this.setController(this.flyController);

        this.on(EntityEvent.SPAWN, this.handleSpawn.bind(this));
        this.on(EntityEvent.TICK, this.handleTick.bind(this));
    }

    // Getter to access the controller
    public override get controller(): FlyEntityController {
        return this.flyController;
    }

    private handleSpawn() {
        console.log("[FlyEntity] Fly entity spawned at:", this.position);
    }

    private handleTick() {
        // This method is now only for basic entity updates
        // Movement is handled by processMovementInput() called from ObbyPlayerController
    }

    public mountPlayer(player: PlayerEntity) {
        if (this.rider) return;
        
        console.log("[FlyEntity] Mounting player as child entity");
        
        // Store reference to rider
        this.rider = player;
        
        // Set the isFlying flag to true
        (player as any).isFlying = true;
        // Set reference to current fly entity
        (player as any).currentFlyEntity = this;
        
        // Make player a child of the fly entity
        // Position player slightly above and behind the broom so it looks like they're riding it
        player.setParent(
            this,
            undefined,
            { x: 0, y: 0.0, z: 0.5 }, // Offset: above the broom and slightly back
            Quaternion.fromEuler(0, 0, 0)
        );
        
        console.log("[FlyEntity] Player mounted as child entity for fly mode");
    }

    public dismountPlayer() {
        if (!this.rider) return;
        
        console.log("[FlyEntity] Dismounting player from fly mode");
        
        // Stop all movement
        this.setLinearVelocity({ x: 0, y: 0, z: 0 });
        this.setAngularVelocity({ x: 0, y: 0, z: 0 });
        
        // Get reference to player before clearing
        const player = this.rider;
        
        // Set the isFlying flag back to false
        (player as any).isFlying = false;
        // Clear reference to current fly entity
        (player as any).currentFlyEntity = null;
        
        // Detach from fly entity
        player.setParent(undefined);
        
        // Position player at the fly entity's position
        player.setPosition({
            x: this.position.x,
            y: this.position.y,
            z: this.position.z
        });
        
        console.log("[FlyEntity] Player dismounted from fly mode at:", player.position);
        
        // Clear rider reference
        this.rider = null;
        
        // Despawn the fly entity since it's no longer needed
        this.despawn();
    }
} 