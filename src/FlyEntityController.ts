import { BaseEntityController, Entity, type PlayerInput, type PlayerCameraOrientation, Vector3 } from "hytopia";
import { FlyEntity } from "./FlyEntity";

export class FlyEntityController extends BaseEntityController {
    private flySpeed: number = 0.1; // Reduced for precise building movement

    public override attach(entity: Entity) {
        super.attach(entity);
        console.log("[FlyEntityController] Attached to fly entity");
    }

    public processFlyMovement(
        entity: FlyEntity,
        input: PlayerInput,
        cameraOrientation: PlayerCameraOrientation,
        deltaTimeMs: number
    ): void {
        if (!entity.isSpawned || !entity.rider) return;

        const camera = entity.rider.player.camera;
        const { yaw } = cameraOrientation;

        // Calculate horizontal forward/right vectors (ignore camera pitch for WASD)
        // This ensures WASD only moves in the horizontal plane, not up/down
        const horizontalForward = new Vector3(
            -Math.sin(yaw), // X component based on yaw only
            0,              // No Y component - keep horizontal
            -Math.cos(yaw)  // Z component based on yaw only
        );
        
        const horizontalRight = new Vector3(
            Math.cos(yaw), // X component for right direction (fixed sign)
            0,             // No Y component - keep horizontal
            -Math.sin(yaw) // Z component for right direction (fixed sign)
        );
        
        // Calculate movement vector
        let moveX = 0;
        let moveY = 0;
        let moveZ = 0;

        // WASD movement in horizontal XZ plane only (ignore camera pitch)
        if (input.w) { // Forward
            moveX += horizontalForward.x * this.flySpeed;
            moveZ += horizontalForward.z * this.flySpeed;
        }
        if (input.s) { // Backward
            moveX -= horizontalForward.x * this.flySpeed;
            moveZ -= horizontalForward.z * this.flySpeed;
        }
        if (input.a) { // Left - move in negative right direction
            moveX -= horizontalRight.x * this.flySpeed;
            moveZ -= horizontalRight.z * this.flySpeed;
        }
        if (input.d) { // Right - move in positive right direction
            moveX += horizontalRight.x * this.flySpeed;
            moveZ += horizontalRight.z * this.flySpeed;
        }

        // Vertical movement - use correct HYTOPIA property names
        if (input.sp) { // Up - correct property name for spacebar
            moveY += this.flySpeed;
            console.log('[FlyEntityController] Space detected, moving up:', { sp: input.sp, moveY });
        }
        if (input.sh) { // Down - correct property name for shift
            moveY -= this.flySpeed;
            console.log('[FlyEntityController] Shift detected, moving down:', { sh: input.sh, moveY });
        }
        
        // DEBUG: Check if moveY is being set when it shouldn't be
        if (moveY !== 0 && !input.sp && !input.sh) {
            console.log('[FlyEntityController] WARNING: moveY is not 0 but no space/shift pressed!', {
                moveY, 
                sp: input.sp, 
                sh: input.sh,
                w: input.w,
                s: input.s,
                fullInput: input
            });
        }

        // Apply movement using position-based movement (like the original FlyEntity)
        if (moveX !== 0 || moveY !== 0 || moveZ !== 0) {
            const oldPosition = entity.position;
            const newPosition = {
                x: entity.position.x + moveX,
                y: entity.position.y + moveY,
                z: entity.position.z + moveZ
            };
            entity.setPosition(newPosition);
            
            console.log('[FlyEntityController] Final movement applied:', {
                delta: { moveX, moveY, moveZ },
                oldPos: { x: oldPosition.x, y: oldPosition.y, z: oldPosition.z },
                newPos: newPosition,
                actualYChange: newPosition.y - oldPosition.y
            });
        }

        // Apply yaw rotation (copied from DefaultPlayerEntityController)
        if (yaw !== undefined) {
            const halfYaw = yaw / 2;
            
            entity.setRotation({
                x: 0,
                y: Math.fround(Math.sin(halfYaw)),
                z: 0,
                w: Math.fround(Math.cos(halfYaw)),
            });
        }
    }
} 