import { Vector3, DefaultPlayerEntityController, DefaultPlayerEntity, Audio, EntityEvent } from "hytopia";
import type { PlayerInput, PlayerCameraOrientation, World, Vector3Like, EventPayloads } from "hytopia";
import { BlockPlacementManager } from "./BlockPlacementManager";
import { ObstaclePlacementManager } from "./ObstaclePlacementManager";
import { ObbyPlayerEntity } from "./ObbyPlayerEntity";
import { FlyEntity } from "./FlyEntity";
import { PlayerCameraMode } from "hytopia";
import { BlockBehaviorManager } from "./BlockBehaviorManager";
import { PlayerStateManager, PlayerGameState } from "./PlayerGameState";
import { PlotBuildManager } from "./PlotBuildManager";
import { ObstacleCollisionManager } from "./ObstacleCollisionManager";
import { ObbyPlayManager } from "./ObbyPlayManager";
import { CashCalculator } from "./CashCalculator";
import { PlotSaveManager } from "./PlotSaveManager";
import { MobileDetectionManager } from "./MobileDetectionManager";
import { SystemManager } from "./SystemManager";
import type { WorldContext } from "./WorldContext";


// --- Lobby checkpoint positions ---
const LOBBY_CHECKPOINTS = [
  { x: 0, y: 10, z: 100 },
  { x: 0, y: 10, z: 31 },
  { x: 0, y: 10, z: -30 },
  { x: 0, y: 10, z: -100 }
];

export class ObbyPlayerController extends DefaultPlayerEntityController {
    private world: World;
    private blockPlacementManager: BlockPlacementManager;
    private obstaclePlacementManager: ObstaclePlacementManager;
    private blockBehaviorManager: BlockBehaviorManager;
    private plotBuildManager: PlotBuildManager;
    private playerStateManager: PlayerStateManager;
    private obbyPlayManager: ObbyPlayManager;
    private plotSaveManager: PlotSaveManager;
    private lastMouseState: { ml?: boolean; mr?: boolean } = {};
    private lastKeyState: { f?: boolean; c?: boolean } = {};
    private lastPlayerInput: PlayerInput | null = null; // Track current input for conveyor physics
    private currentFlyEntity: FlyEntity | null = null; // Reference to current fly entity
    private isFirstPersonMode: boolean = false; // Track camera mode
    private _stepAudio: Audio | undefined; // Step audio for animations
    
    // Fall detection and respawn properties
    private fallThresholdY: number = -2; // Y position threshold for considering a fall
    private lastCheckpointPosition: Vector3Like | null = null;
    private fallDetectionEnabled: boolean = false; // Disabled by default, enabled in play mode
    private isRespawning: boolean = false;
    private isDead: boolean = false;
    private pauseMovement: boolean = false;
    private playerEntity?: ObbyPlayerEntity;
    
    // Ice skating physics properties
    private _iceVelocity = { x: 0, y: 0, z: 0 };
    private readonly ICE_ACCELERATION = 0.1; // How quickly to accelerate on ice
    private readonly ICE_DECELERATION = 0.95; // How much momentum to preserve when no input
    private isWalking: boolean = false; // Track walking state for animations
    
    // Animation state management
    private lastAnimationState: 'normal' | 'climbing' | 'ice' = 'normal';
    private animationChangeTime: number = 0;
    private readonly ANIMATION_DEBOUNCE_TIME = 200; // 200ms debounce for animation changes
    
    // Climbing jump cooldown
    private climbingJumpCooldown: number = 0;
    private readonly CLIMBING_JUMP_COOLDOWN_TIME = 500; // 500ms cooldown for climbing jumps
    


    constructor(world: World) {
        super();
        this.world = world;
        this.blockPlacementManager = BlockPlacementManager.getInstance();
        this.obstaclePlacementManager = ObstaclePlacementManager.getInstance();
        this.blockBehaviorManager = BlockBehaviorManager.getInstance();
        this.plotBuildManager = PlotBuildManager.getInstance();
        this.playerStateManager = PlayerStateManager.getInstance();
        this.obbyPlayManager = ObbyPlayManager.getInstance();
        this.plotSaveManager = PlotSaveManager.getInstance();
        
        // TEMPORARILY DISABLED: WorldContext integration for debugging
        // this.logWorldContextStatus();
        
        // Initialize the collision manager
        ObstacleCollisionManager.getInstance();
        
        // Disable auto-face-forward to prevent interference with friction behavior
        this.faceForwardOnStop = false;
    }


    /**
     * Restrict player movement by disabling all movement inputs
     */
    private restrictMovement(input: PlayerInput): void {
        input.w = false;
        input.a = false;
        input.s = false;
        input.d = false;
    }

    /**
     * Update the player's cash display in the UI
     */
    private updatePlayerCashUI(player: any, newCash: number): void {
        try {
            // Send cash update to the UI
            player.ui.sendData({
                type: 'cashUpdate',
                cash: newCash,
                maxCash: CashCalculator.DEFAULT_STARTING_CASH // Could be made configurable later
            });
        } catch (error) {
            console.error(`[ObbyPlayerController] Error updating cash UI for player ${player.id}:`, error);
        }
    }

    public override tickWithPlayerInput(entity: DefaultPlayerEntity, input: PlayerInput, cameraOrientation: PlayerCameraOrientation, deltaTimeMs: number) {
        const playerEntity = entity as ObbyPlayerEntity;
        const isBuilding = this.playerStateManager.getCurrentState(playerEntity.player.id) === PlayerGameState.BUILDING;
        // Store original input for our use
        const originalInput = input;
        
        // Track input for conveyor physics
        this.lastPlayerInput = { ...input };
        
        // Check for fall detection if enabled
        if (this.fallDetectionEnabled) {
            this.checkForFall(playerEntity);
        }
        
        // Restrict movement during respawn (2.5 seconds after death)
        if (this.isRespawning) {
            this.restrictMovement(input);
            // Only restrict horizontal movement, allow gravity on Y-axis
            const currentVel = playerEntity.linearVelocity;
            playerEntity.setLinearVelocity({ x: 0, y: currentVel.y, z: 0 });
        }
        
        // Handle movement pausing (used during countdown, etc.)
        if (this.pauseMovement) {
            playerEntity.setLinearVelocity({ x: 0, y: 0, z: 0 });
            // Still allow camera movement but block all input
            return;
        }
        
        // Handle fly mode toggle first
        this.handleFlyModeToggle(playerEntity, originalInput);
        
        // Update last key state immediately to prevent rapid toggling
        this.lastKeyState = { f: originalInput.f, c: originalInput.c };
       let m = MobileDetectionManager.getInstance().isPlayerMobile(playerEntity.player.id);
        
        // If in fly mode, forward input to the FlyEntity instead of processing normally
        if (this.currentFlyEntity && playerEntity.isFlying) {
            // In building mode, prevent shift (sprint) and space (jump) from interfering with building
            if (isBuilding && playerEntity.isFlying && m) {
                input.sh = false; // Disable sprint
                input.sp = false; // Disable jump
            }
            
            // Forward input to the FlyEntityController
            this.currentFlyEntity.controller.processFlyMovement(
                this.currentFlyEntity,
                originalInput,
                cameraOrientation,
                deltaTimeMs
            );
            
            // Still allow mouse input for building/destroying while flying
            this.handleMouseInput(playerEntity, originalInput);
            
            // Update mouse state even in fly mode
            this.lastMouseState = { ml: originalInput.ml, mr: originalInput.mr };
            return;
        }
        
        // Check if player is on ice, sand, conveyor, or climbing using the block behavior system
        const isOnIce = (playerEntity as any).isOnIce === true;
        const isOnSand = (playerEntity as any).isOnSand === true;
        const isOnConveyor = (playerEntity as any).isOnConveyor === true;
        const isClimbing = (playerEntity as any).isClimbing === true;
        
        // Sand state is tracked via isOnSand flag
        
        // Log state transitions for debugging
        // if (isClimbing || isOnConveyor || isOnIce) {
        //     console.log(`[TICK] Player ${playerEntity.player.id} state - isClimbing=${isClimbing}, isOnConveyor=${isOnConveyor}, isOnIce=${isOnIce}, velocity: x=${playerEntity.linearVelocity.x.toFixed(2)}, y=${playerEntity.linearVelocity.y.toFixed(2)}, z=${playerEntity.linearVelocity.z.toFixed(2)}`);
        // }
        
        // Determine current animation state
        let currentAnimationState: 'normal' | 'climbing' | 'ice' = 'normal';
        if (isOnIce) currentAnimationState = 'ice';
        else if (isClimbing) currentAnimationState = 'climbing';
        
        // Handle animation changes with debouncing
        this.handleAnimationStateChange(entity, currentAnimationState);
        
        if (isClimbing) {
            // Use climbing physics - this overrides all other movement types
            this.applyClimbingPhysics(entity, input, cameraOrientation, deltaTimeMs);
        } else if (isOnIce) {
            super.tickWithPlayerInput(entity, input, cameraOrientation, deltaTimeMs);
            
            // Then override with ice skating physics
            this.applyIceSkatingPhysics(entity, input, cameraOrientation, deltaTimeMs);
        } else if (isOnConveyor) {
            super.tickWithPlayerInput(entity, input, cameraOrientation, deltaTimeMs);
            
            // Then override with conveyor physics
            this.applyConveyorPhysics(entity, input, cameraOrientation, deltaTimeMs);
        } else if (isOnSand) {
            // Don't call super - handle all physics in sand method
            this.applySandPhysics(entity, input, cameraOrientation, deltaTimeMs);
        } else {
            // Use normal movement when not on special surfaces
            super.tickWithPlayerInput(entity, input, cameraOrientation, deltaTimeMs);
        }
        
        // Handle mouse input for block placement/destruction (only when not flying)
        this.handleMouseInput(playerEntity, originalInput);
        
        // Update mouse state for non-flying mode
        this.lastMouseState = { ml: originalInput.ml, mr: originalInput.mr };
    }



    private applyIceSkatingPhysics(entity: DefaultPlayerEntity, input: PlayerInput, cameraOrientation: PlayerCameraOrientation, deltaTimeMs: number): void {
        const { w, a, s, d, sp, sh } = input;
        const { yaw } = cameraOrientation;
        const currentVelocity = entity.linearVelocity;
        
        // Handle jumping (same as normal controller)
        let newVelocityY = currentVelocity.y;
        if (sp && this.canJump(this)) {
            if (this.isGrounded && currentVelocity.y > -0.001 && currentVelocity.y <= 3) {
                console.log(`[ICE JUMP] Before jump - velocity: x=${currentVelocity.x.toFixed(2)}, y=${currentVelocity.y.toFixed(2)}, z=${currentVelocity.z.toFixed(2)}, isOnIce=${(entity as any).isOnIce}, isClimbing=${(entity as any).isClimbing}`);
                
                newVelocityY = this.jumpVelocity;
                
                // Clear ice state when jumping to allow proper state transitions
                (entity as any).isOnIce = false;
                
                console.log(`[ICE JUMP] After jump - newVelocityY=${newVelocityY}, isOnIce=${(entity as any).isOnIce}, isClimbing=${(entity as any).isClimbing}`);
            }
        }
        
        // Calculate target velocity based on input
        const targetVelocity = this._calculateIceMovement(!!w, !!a, !!s, !!d, yaw, !!sh);
        
        // Gradually accelerate towards target velocity (ice feel)
        if (targetVelocity.x !== 0 || targetVelocity.z !== 0) {
            // Accelerate towards target
            this._iceVelocity.x += (targetVelocity.x - this._iceVelocity.x) * this.ICE_ACCELERATION;
            this._iceVelocity.z += (targetVelocity.z - this._iceVelocity.z) * this.ICE_ACCELERATION;
        } else {
            // Decelerate when no input (ice sliding)
            this._iceVelocity.x *= this.ICE_DECELERATION;
            this._iceVelocity.z *= this.ICE_DECELERATION;
        }
        
        // Apply the ice velocity while preserving vertical velocity
        entity.setLinearVelocity({
            x: this._iceVelocity.x,
            y: newVelocityY,
            z: this._iceVelocity.z,
        });
        
        // Apply rotation (same as normal controller)
        if (yaw !== undefined) {
            const halfYaw = yaw / 2;
            entity.setRotation({
                x: 0,
                y: Math.fround(Math.sin(halfYaw)),
                z: 0,
                w: Math.fround(Math.cos(halfYaw)),
            });
        }
        
        const totalSpeed = Math.sqrt(this._iceVelocity.x * this._iceVelocity.x + this._iceVelocity.z * this._iceVelocity.z);
    }

    private _calculateIceMovement(w: boolean, a: boolean, s: boolean, d: boolean, yaw: number, isRunning: boolean): { x: number, z: number } {
        const velocity = isRunning ? this.runVelocity : this.walkVelocity;
        let moveDirectionX = 0;
        let moveDirectionZ = 0;
        
        if (w) {
            moveDirectionX -= velocity * Math.sin(yaw);
            moveDirectionZ -= velocity * Math.cos(yaw);
        }
        if (s) {
            moveDirectionX += velocity * Math.sin(yaw);
            moveDirectionZ += velocity * Math.cos(yaw);
        }
        if (a) {
            moveDirectionX -= velocity * Math.cos(yaw);
            moveDirectionZ += velocity * Math.sin(yaw);
        }
        if (d) {
            moveDirectionX += velocity * Math.cos(yaw);
            moveDirectionZ -= velocity * Math.sin(yaw);
        }
        
        // Normalize for diagonals
        const length = Math.sqrt(moveDirectionX * moveDirectionX + moveDirectionZ * moveDirectionZ);
        if (length > velocity) {
            const factor = velocity / length;
            moveDirectionX *= factor;
            moveDirectionZ *= factor;
        }
        
        return { x: moveDirectionX, z: moveDirectionZ };
    }

    private applySandPhysics(entity: DefaultPlayerEntity, input: PlayerInput, cameraOrientation: PlayerCameraOrientation, deltaTimeMs: number): void {
        const { w, a, s, d, sp, sh } = input;
        const { yaw } = cameraOrientation;
        
        // Set reduced jump velocity for sand on the entity's controller
        const controller = entity.controller;
        const originalJumpVelocity = (controller as any).jumpVelocity;
        const sandJumpVelocity = 8; // 75% of normal jump
        (controller as any).jumpVelocity = sandJumpVelocity;
        
        // Call parent to handle all physics and animations
        super.tickWithPlayerInput(entity, input, cameraOrientation, deltaTimeMs);
        
        // Restore normal jump velocity after processing
        (controller as any).jumpVelocity = originalJumpVelocity;
        
        // Now override horizontal movement for sand slowness
        const currentVelocity = entity.linearVelocity;
        const targetVelocity = this._calculateSandMovement(!!w, !!a, !!s, !!d, yaw, !!sh, false);
        
        // Apply sand physics with slower movement and higher friction
        const sandFriction = 0.1; // Extremely high friction (super sticky)
        const sandSpeedMultiplier = 0.3; // 70% slower movement (very sticky)
        
        let newVelocityX = currentVelocity.x;
        let newVelocityZ = currentVelocity.z;
        
        if (targetVelocity.x !== 0 || targetVelocity.z !== 0) {
            // Apply sand movement with reduced speed
            newVelocityX = targetVelocity.x * sandSpeedMultiplier;
            newVelocityZ = targetVelocity.z * sandSpeedMultiplier;
        } else {
            // Apply high friction when no input
            newVelocityX *= sandFriction;
            newVelocityZ *= sandFriction;
        }
        
        // Apply the sand velocity while preserving Y from parent physics
        entity.setLinearVelocity({
            x: newVelocityX,
            y: currentVelocity.y, // Keep Y from parent (includes jump/gravity)
            z: newVelocityZ,
        });
    }

    private _calculateSandMovement(w: boolean, a: boolean, s: boolean, d: boolean, yaw: number, isRunning: boolean, isJumping: boolean): { 
        x: number, 
        z: number, 
        jumpMultiplier: number 
    } {
        const velocity = isRunning ? this.runVelocity : this.walkVelocity;
        let moveDirectionX = 0;
        let moveDirectionZ = 0;
        
        if (w) {
            moveDirectionX -= velocity * Math.sin(yaw);
            moveDirectionZ -= velocity * Math.cos(yaw);
        }
        if (s) {
            moveDirectionX += velocity * Math.sin(yaw);
            moveDirectionZ += velocity * Math.cos(yaw);
        }
        if (a) {
            moveDirectionX -= velocity * Math.cos(yaw);
            moveDirectionZ += velocity * Math.sin(yaw);
        }
        if (d) {
            moveDirectionX += velocity * Math.cos(yaw);
            moveDirectionZ -= velocity * Math.sin(yaw);
        } 
        
        // Normalize for diagonals
        const length = Math.sqrt(moveDirectionX * moveDirectionX + moveDirectionZ * moveDirectionZ);
        if (length > velocity) {
            const factor = velocity / length;
            moveDirectionX *= factor;
            moveDirectionZ *= factor;
        }
        
        // Add jump penalty for sand
        let jumpMultiplier = 1.0; // Default normal jump
        if (isJumping) {
            jumpMultiplier = 0.75; // 50% penalty on sand (half height)
        }
        
        return { 
            x: moveDirectionX, 
            z: moveDirectionZ, 
            jumpMultiplier: jumpMultiplier 
        };
    }

    private applyClimbingPhysics(entity: DefaultPlayerEntity, input: PlayerInput, cameraOrientation: PlayerCameraOrientation, deltaTimeMs: number): void {
        const { w, a, s, d, sp, sh } = input;
        let { yaw } = cameraOrientation;
        
        // Override yaw with locked rotation if climbing
        if ((entity as any).climbingRotationLocked && (entity as any).climbingStartRotation) {
            const lockedRotation = (entity as any).climbingStartRotation;
            yaw = Math.atan2(2 * (lockedRotation.w * lockedRotation.y + lockedRotation.x * lockedRotation.z), 
                            1 - 2 * (lockedRotation.y * lockedRotation.y + lockedRotation.z * lockedRotation.z));
        }
        
        // Position-based climbing to prevent physics interference
        const climbSpeed = 0.03; // Reduced from 0.1 to 0.05 for slower climbing
        const traverseSpeed = 0.03; // Increased from 0.03 to 0.08 for more responsive horizontal movement
        const jumpBackForce = 5.0;
        
        // Allow jumping at any time while climbing (no cooldown, no A/D restriction)
        if (sp && this.canJump(this)) {
            const isNearTop = this.isNearTopOfVineWall(entity);
            
            if (isNearTop) {
                // Near the top - just jump up to get over the wall
                entity.setLinearVelocity({ 
                    x: 0, 
                    y: this.jumpVelocity * 1.2, // Slightly higher jump
                    z: 0 
                });
            } else {
                // In the middle - jump back and out to escape
                const jumpBackX = -Math.sin(yaw) * jumpBackForce;
                const jumpBackZ = -Math.cos(yaw) * jumpBackForce;
                
                entity.setLinearVelocity({ 
                    x: jumpBackX, 
                    y: this.jumpVelocity, 
                    z: jumpBackZ 
                });
            }
            
            // Start with jump-pre animation
            entity.startModelOneshotAnimations(['jump-pre']);
            
            // After a short delay, transition to jump-loop
            setTimeout(() => {
                if (!(entity as any).isClimbing) { // Only if still not climbing
                   // entity.startModelOneshotAnimations(['jump-loop']);
                }
            }, 200);
            
            // Unlock rotation when climbing stops
            (entity as any).climbingRotationLocked = false;
            (entity as any).climbingStartRotation = null;
            
            (entity as any).isClimbing = false;
            return;
        }
        
        // Get vine navigation data for smart movement
        const vineData = this.getVineNavigationData(entity);
        
        // Get current position
        const currentPos = entity.position;
        let newPos = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
        
        if (w || s || a || d) {
            // Set cooldown for next climbing jump
            if (!entity.modelLoopedAnimations.has('climbing')) {  
                entity.startModelLoopedAnimations(['climbing']);
            }
        }
        
        // Handle vertical climbing with camera-relative movement
        if (w) { // W - climb up (forward relative to camera)
            // Always allow moving up when climbing - don't check for vines above
            newPos.y += climbSpeed;
        } else if (s) { // S - climb down (backward relative to camera)
            // Always allow moving down when climbing - don't check for vines below
            newPos.y -= climbSpeed;
        } else {
            // No vertical input - only apply upward force if there are vines below to prevent sliding
            if (vineData.hasVinesBelow) {
                newPos.y += 0.005; // Reduced upward force to prevent going up at top
            }
        }
        
        // Handle horizontal movement - use existing vine detection but make it camera-relative
        if (a || d) {
            
            // Use the existing vine navigation data to check for vines
            // But determine movement direction based on camera orientation
            let canMoveLeft = false;
            let canMoveRight = false;
            
            // Check if there are vines in the camera-relative directions
            if (vineData.hasVinesLeft || vineData.hasVinesRight || vineData.hasVinesFront || vineData.hasVinesBack) {
                // There are vines around us, so we can move
                canMoveLeft = true;
                canMoveRight = true;
            }
            
            if (a && canMoveLeft) {
                // Move left relative to camera direction
                newPos.x -= traverseSpeed * Math.cos(yaw);
                newPos.z += traverseSpeed * Math.sin(yaw);
            } else if (d && canMoveRight) {
                // Move right relative to camera direction
                newPos.x += traverseSpeed * Math.cos(yaw);
                newPos.z -= traverseSpeed * Math.sin(yaw);
            } else {
            }
        }
        
        // Apply position change and zero out velocity to prevent physics interference
        entity.setPosition(newPos);
        entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
        
        // Lock rotation during climbing to prevent excessive spinning
        // Keep the player facing the same direction they were when they started climbing
        if (!(entity as any).climbingRotationLocked) {
            // Store the initial rotation when climbing starts
            (entity as any).climbingRotationLocked = true;
            (entity as any).climbingStartRotation = entity.rotation;
        }
        
        // Apply the stored rotation to keep player stable
        if ((entity as any).climbingStartRotation) {
            entity.setRotation((entity as any).climbingStartRotation);
        }
    }

    private findVineWallPosition(playerPos: Vector3): Vector3 | null {
        // Check in a small radius around the player for vine blocks
        const searchRadius = 2;
        
        for (let x = -searchRadius; x <= searchRadius; x++) {
            for (let y = -searchRadius; y <= searchRadius; y++) {
                for (let z = -searchRadius; z <= searchRadius; z++) {
                    const checkPos = new Vector3(
                        Math.floor(playerPos.x) + x,
                        Math.floor(playerPos.y) + y,
                        Math.floor(playerPos.z) + z
                    );
                    
                    if (this.world.chunkLattice.getBlockId(checkPos) === 15) {
                        return checkPos;
                    }
                }
            }
        }
        
        return null;
    }

    private getVineNavigationData(entity: DefaultPlayerEntity): {
        hasVinesAbove: boolean;
        hasVinesBelow: boolean;
        hasVinesLeft: boolean;
        hasVinesRight: boolean;
        hasVinesFront: boolean;
        hasVinesBack: boolean;
    } {
        const playerPos = entity.position;
        
        // Find the vine wall position (where the vines are)
        let vineWallX = Math.floor(playerPos.x);
        let vineWallZ = Math.floor(playerPos.z);
        
        // Check in front of player for vines (vine wall) - reduced buffer
        const frontPos = new Vector3(Math.floor(playerPos.x), Math.floor(playerPos.y), Math.floor(playerPos.z + 0.5));
        if (this.world.chunkLattice.getBlockId(frontPos) === 15) {
            vineWallZ = Math.floor(playerPos.z + 0.5);
        }
        
        // Check behind player for vines (vine wall) - reduced buffer
        const backPos = new Vector3(Math.floor(playerPos.x), Math.floor(playerPos.y), Math.floor(playerPos.z - 0.5));
        if (this.world.chunkLattice.getBlockId(backPos) === 15) {
            vineWallZ = Math.floor(playerPos.z - 0.5);
        }
        
        // Check left of player for vines (vine wall) - reduced buffer
        const leftPos = new Vector3(Math.floor(playerPos.x - 0.5), Math.floor(playerPos.y), Math.floor(playerPos.z));
        if (this.world.chunkLattice.getBlockId(leftPos) === 15) {
            vineWallX = Math.floor(playerPos.x - 0.5);
        }
        
        // Check right of player for vines (vine wall) - reduced buffer
        const rightPos = new Vector3(Math.floor(playerPos.x + 0.5), Math.floor(playerPos.y), Math.floor(playerPos.z));
        if (this.world.chunkLattice.getBlockId(rightPos) === 15) {
            vineWallX = Math.floor(playerPos.x + 0.5);
        }
        
        
        // Now check for vines relative to the vine wall position, not the player position
        const directions = [
            { name: 'Above', pos: new Vector3(vineWallX, Math.floor(playerPos.y + 1), vineWallZ) },
            { name: 'Below', pos: new Vector3(vineWallX, Math.floor(playerPos.y - 1), vineWallZ) },
            { name: 'Left', pos: new Vector3(vineWallX - 1, Math.floor(playerPos.y), vineWallZ) },
            { name: 'Right', pos: new Vector3(vineWallX + 1, Math.floor(playerPos.y), vineWallZ) },
            { name: 'Front', pos: new Vector3(vineWallX, Math.floor(playerPos.y), vineWallZ + 1) },
            { name: 'Back', pos: new Vector3(vineWallX, Math.floor(playerPos.y), vineWallZ - 1) }
        ];

        const result = {
            hasVinesAbove: false,
            hasVinesBelow: false,
            hasVinesLeft: false,
            hasVinesRight: false,
            hasVinesFront: false,
            hasVinesBack: false
        };

        for (const dir of directions) {
            const blockId = this.world.chunkLattice.getBlockId(dir.pos);
            if (blockId === 15) { // Vine block
                result[`hasVines${dir.name}` as keyof typeof result] = true;
            }
        }

        return result;
    }

    private isNearTopOfVineWall(entity: DefaultPlayerEntity): boolean {
        const playerPos = entity.position;
        
        // Find the vine wall position (where the vines are)
        let vineWallX = Math.floor(playerPos.x);
        let vineWallZ = Math.floor(playerPos.z);
        
        // Check in front of player for vines (vine wall)
        const frontPos = new Vector3(Math.floor(playerPos.x), Math.floor(playerPos.y), Math.floor(playerPos.z + 0.5));
        if (this.world.chunkLattice.getBlockId(frontPos) === 15) {
            vineWallZ = Math.floor(playerPos.z + 0.5);
        }
        
        // Check behind player for vines (vine wall)
        const backPos = new Vector3(Math.floor(playerPos.x), Math.floor(playerPos.y), Math.floor(playerPos.z - 0.5));
        if (this.world.chunkLattice.getBlockId(backPos) === 15) {
            vineWallZ = Math.floor(playerPos.z - 0.5);
        }
        
        // Check left of player for vines (vine wall)
        const leftPos = new Vector3(Math.floor(playerPos.x - 0.5), Math.floor(playerPos.y), Math.floor(playerPos.z));
        if (this.world.chunkLattice.getBlockId(leftPos) === 15) {
            vineWallX = Math.floor(playerPos.x - 0.5);
        }
        
        // Check right of player for vines (vine wall)
        const rightPos = new Vector3(Math.floor(playerPos.x + 0.5), Math.floor(playerPos.y), Math.floor(playerPos.z));
        if (this.world.chunkLattice.getBlockId(rightPos) === 15) {
            vineWallX = Math.floor(playerPos.x + 0.5);
        }
        
        // Check for vines above the player's current position
        // Look up to 3 blocks above to see if we're near the top
        let hasVinesAbove = false;
        for (let y = 1; y <= 3; y++) {
            const checkPos = new Vector3(vineWallX, Math.floor(playerPos.y + y), vineWallZ);
            if (this.world.chunkLattice.getBlockId(checkPos) === 15) {
                hasVinesAbove = true;
                break;
            }
        }
        
        // If there are no vines above within 3 blocks, we're near the top
        const isNearTop = !hasVinesAbove;
        
        return isNearTop;
    }

    private setClimbingAnimation(entity: DefaultPlayerEntity): void {
        // Stop all current animations and start climbing animation
        
        // Stop any current animations
        entity.stopAllModelLoopedAnimations();
        entity.stopAllModelOneshotAnimations();
        
        // Start the climbing animation loop
        entity.startModelLoopedAnimations(['climbing']);
    }

    private setNormalAnimation(entity: DefaultPlayerEntity): void {
        // Stop climbing animation and return to normal animations
        
        // Stop climbing animation
        entity.stopAllModelLoopedAnimations();
        entity.stopAllModelOneshotAnimations();
        
        // Start normal idle animation
        entity.startModelLoopedAnimations(['idle']);
    }



    private handleFlyModeToggle(playerEntity: ObbyPlayerEntity, input: PlayerInput): void {
        // Toggle fly mode with F key (only on press, not hold)
        if (input.f && !this.lastKeyState.f) {
            // Check if player is in build mode - fly mode only allowed in build mode
            const playerState = this.playerStateManager.getCurrentState(playerEntity.player.id);
            if (playerState !== PlayerGameState.BUILDING) {
                // Not in build mode - inform player they need to be in build mode
                this.world.chatManager.sendPlayerMessage(
                    playerEntity.player, 
                    '❌ Fly mode is only available in build mode! Enter build mode on your plot first.', 
                    'FF0000'
                );
                return;
            }
            
            if (!playerEntity.isFlying) {
                // Enable fly mode - spawn and mount FlyEntity
                this.enableFlyMode(playerEntity);
            } else {
                // Disable fly mode - dismount from FlyEntity
                this.disableFlyMode(playerEntity);
            }
        }

        // Toggle camera mode with C key (only on press, not hold) - only when flying
        if (input.c && !this.lastKeyState.c && playerEntity.isFlying) {
            this.toggleFirstPersonMode(playerEntity);
        }
    }

    public enableFlyMode(playerEntity: ObbyPlayerEntity): void {
        
        // Reset player rotation to ensure proper alignment
        playerEntity.setRotation({ x: 0, y: 0, z: 0, w: 1 });
        
        // Create and spawn a new FlyEntity at the player's position
        const flyEntity = new FlyEntity();
        
        // Try spawning with world parameter
        flyEntity.spawn(this.world, {
            x: playerEntity.position.x,
            y: playerEntity.position.y,
            z: playerEntity.position.z
        });
        
        // Mount the player to the fly entity
        flyEntity.mountPlayer(playerEntity);
        
        // Store reference
        this.currentFlyEntity = flyEntity;
     
        // Start in first person mode by default (shows crosshair immediately)
        this.isFirstPersonMode = true;
        this.setupFirstPersonCamera(playerEntity);
        
        // Send UI message for fly mode
        playerEntity.player.ui.sendData({ type: 'flyModeChanged', isFlying: true });
        this.world.chatManager.sendPlayerMessage(playerEntity.player, '✈️ Fly mode enabled for building! Controls: WASD + Space/Shift = move, C = toggle camera, F = exit fly', '00FFFF');
    }

    public disableFlyMode(playerEntity: ObbyPlayerEntity): void {
        
        if (this.currentFlyEntity) {
            // Dismount the player (this will also despawn the FlyEntity)
            this.currentFlyEntity.dismountPlayer();
            this.currentFlyEntity = null;
        }
     
        // Reset player rotation to ensure proper alignment when returning to normal mode
        playerEntity.setRotation({ x: 0, y: 0, z: 0, w: 1 });
        
        // Reset camera mode and hide crosshair
        this.isFirstPersonMode = false;
        this.setupThirdPersonCamera(playerEntity);
        
        // Block behavior manager no longer needs fly mode notifications
        
        // Send UI message for walk mode
        playerEntity.player.ui.sendData({ type: 'flyModeChanged', isFlying: false });
        this.world.chatManager.sendPlayerMessage(playerEntity.player, '🚶 Fly mode disabled - back to walking', 'FFFF00');
    }

    private handleMouseInput(playerEntity: ObbyPlayerEntity, input: PlayerInput): void {
        // Build mode is always enabled in obby game
        // Left click to place blocks or obstacles (only on press, not hold)
        if (input.ml && !this.lastMouseState.ml) {
            if (playerEntity.isObstacleSelected()) {
                this.handleObstaclePlacement(playerEntity);
            } else {
                this.handleBlockPlacement(playerEntity);
            }
        }
        // Right click to remove blocks (only on press, not hold)
        if (input.mr && !this.lastMouseState.mr) {
            this.handleBlockRemoval(playerEntity);
        }
    }

    private handleObstaclePlacement(playerEntity: ObbyPlayerEntity): void {
        const targetPosition = this.getTargetPositionForPlacement(playerEntity);
        if (!targetPosition) {
            return;
        }
        const selectedObstacle = playerEntity.getSelectedObstacle();
        if (!selectedObstacle) {
            return;
        }
        // Get player's active build plot (if any) for boundary checking
        const activeBuildPlot = this.plotBuildManager.getPlayerActiveBuildPlot(playerEntity.player.id);
        const plotId = activeBuildPlot !== null ? this.plotBuildManager.getPlotId(activeBuildPlot) : undefined;

        try {
            const success = this.obstaclePlacementManager.placeObstacle(
                playerEntity.player, 
                selectedObstacle.id, 
                targetPosition,
                plotId // Pass plotId for boundary checking
            );
            if (success) {
                                        // Map obstacle type to entity type for cash calculation
                        let entityType = 'obstacle'; // Default fallback
                        switch (selectedObstacle.type) {
                            case 'bounce_pad':
                                entityType = 'bounce-pad';
                                break;
                            case 'rotating_beam':
                                entityType = 'rotating-beam';
                                break;
                            case 'zombie':
                                // Use variant-specific cost for zombies
                                entityType = `zombie-${selectedObstacle.size}`;
                                break;
                            case 'seesaw':
                                entityType = 'obstacle'; // Use generic for now
                                break;
                            default:
                                entityType = 'obstacle';
                        }
                // Deduct cash and update UI
                const currentCash = this.plotSaveManager.getPlayerCash(playerEntity.player);
                const newCash = CashCalculator.deductEntityCost(currentCash, entityType);
                this.plotSaveManager.setPlayerCash(playerEntity.player, newCash);
                this.updatePlayerCashUI(playerEntity.player, newCash);
            }
        } catch (e) {
            console.error('[ObbyPlayerController] Exception during obstacle placement:', e);
        }
    }

    private handleBlockPlacement(playerEntity: ObbyPlayerEntity): void {
        const targetPosition = this.getTargetPositionForPlacement(playerEntity);
        if (targetPosition) {
            
            // Get player's active build plot (if any) for boundary checking
            const activeBuildPlot = this.plotBuildManager.getPlayerActiveBuildPlot(playerEntity.player.id);
            const plotId = activeBuildPlot !== null ? this.plotBuildManager.getPlotId(activeBuildPlot) : undefined;
            
            
            if (playerEntity.isObstacleSelected()) {
                const selectedObstacle = playerEntity.getSelectedObstacle();
                if (selectedObstacle) {
                    // Check if player has enough cash for the entity
                    const currentCash = this.plotSaveManager.getPlayerCash(playerEntity.player);
                    const entityCost = CashCalculator.getEntityCost(selectedObstacle.type);
                    
                    if (!CashCalculator.canAffordEntity(currentCash, selectedObstacle.type)) {
                        this.world.chatManager.sendPlayerMessage(
                            playerEntity.player, 
                            `❌ Not enough cash! Need ${entityCost}, have ${currentCash}`, 
                            'FF0000'
                        );
                        return;
                    }
                    
                    const success = this.obstaclePlacementManager.placeObstacle(
                        playerEntity.player, 
                        selectedObstacle.id, 
                        targetPosition,
                        plotId // Pass plotId for boundary checking
                    );
                    
                    if (success) {
                        // Map obstacle type to entity type for cash calculation
                        let entityType = 'obstacle'; // Default fallback
                        switch (selectedObstacle.type) {
                            case 'bounce_pad':
                                entityType = 'bounce-pad';
                                break;
                            case 'rotating_beam':
                                entityType = 'rotating-beam';
                                break;
                            case 'zombie':
                                // Use variant-specific cost for zombies
                                entityType = `zombie-${selectedObstacle.size}`;
                                break;
                            case 'seesaw':
                                entityType = 'obstacle'; // Use generic for now
                                break;
                            default:
                                entityType = 'obstacle';
                        }
                        // Deduct cash and update UI
                        const newCash = CashCalculator.deductEntityCost(currentCash, entityType);
                        this.plotSaveManager.setPlayerCash(playerEntity.player, newCash);
                        this.updatePlayerCashUI(playerEntity.player, newCash);
                    }
                }
            } else {
                // Check if player has enough cash for the block
                const selectedBlockId = playerEntity.getSelectedBlockId();
                if (selectedBlockId === null) return;
                
                const currentCash = this.plotSaveManager.getPlayerCash(playerEntity.player);
                const blockCost = CashCalculator.getBlockCost(selectedBlockId);
                
                if (!CashCalculator.canAffordBlock(currentCash, selectedBlockId)) {
                    this.world.chatManager.sendPlayerMessage(
                        playerEntity.player, 
                        `❌ Not enough cash! Need ${blockCost}, have ${currentCash}`, 
                        'FF0000'
                    );
                    return;
                }
                
                // TEMPORARILY USING LEGACY: Direct block placement without WorldContext
                console.log(`[ObbyPlayerController] 🔧 Legacy Block Placement - Block: ${selectedBlockId}, Position: (${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z})`);
                const success = this.blockPlacementManager.placeBlock(
                    playerEntity.player, 
                    targetPosition,
                    this.world, // Pass world parameter
                    plotId // Pass plotId for boundary checking
                );
                if (success) {
                    console.log(`[ObbyPlayerController] ✅ Legacy block placement successful`);
                } else {
                    console.log(`[ObbyPlayerController] ❌ Legacy block placement failed`);
                }
                
                if (success) {
                    // Deduct cash and update UI
                    const newCash = CashCalculator.deductBlockCost(currentCash, selectedBlockId);
                    this.plotSaveManager.setPlayerCash(playerEntity.player, newCash);
                    this.updatePlayerCashUI(playerEntity.player, newCash);
                }
            }
        } else {
            console.log("[ObbyPlayerController] No target position found for placement");
        }
    }

    private handleBlockRemoval(playerEntity: ObbyPlayerEntity): void {
        const targetPosition = this.getTargetPositionForRemoval(playerEntity);
        if (targetPosition) {
            
            // Get player's active build plot (if any) for boundary checking
            const activeBuildPlot = this.plotBuildManager.getPlayerActiveBuildPlot(playerEntity.player.id);
            const plotId = activeBuildPlot !== null ? this.plotBuildManager.getPlotId(activeBuildPlot) : undefined;
            
            // Try to remove obstacle first (obstacles are entities, not blocks)
            const obstacleRemovalResult = this.obstaclePlacementManager.removeObstacle(
                playerEntity.player,
                targetPosition,
                plotId // Pass plotId for boundary checking
            );
            
            if (obstacleRemovalResult.success) {
                // Obstacle was removed, give cash refund based on actual obstacle type
                const currentCash = this.plotSaveManager.getPlayerCash(playerEntity.player);
                let newCash = currentCash;
                
                if (obstacleRemovalResult.obstacleType && obstacleRemovalResult.obstacleSize) {
                    // Map obstacle type to entity type for cash calculation
                    let entityType = 'obstacle'; // Default fallback
                    switch (obstacleRemovalResult.obstacleType) {
                        case 'bounce_pad':
                            entityType = 'bounce-pad';
                            break;
                        case 'rotating_beam':
                            entityType = 'rotating-beam';
                            break;
                        case 'zombie':
                            // Use variant-specific refund for zombies
                            entityType = `zombie-${obstacleRemovalResult.obstacleSize || 'normal'}`;
                            break;
                        case 'seesaw':
                            entityType = 'obstacle'; // Use generic for now, can add specific type later
                            break;
                        default:
                            entityType = 'obstacle';
                    }
                    
                    // Refund based on mapped entity type (size doesn't affect cost currently)
                    newCash = CashCalculator.refundEntityCost(currentCash, entityType);
                } else {
                    // Fallback - refund generic obstacle cost
                    newCash = CashCalculator.refundEntityCost(currentCash, 'obstacle');
                }
                
                this.plotSaveManager.setPlayerCash(playerEntity.player, newCash);
                this.updatePlayerCashUI(playerEntity.player, newCash);
            } else {
                // No obstacle found, try to remove block if one exists
                const blockId = this.world.chunkLattice.getBlockId(targetPosition);
                
                if (blockId !== 0) {
                    // TEMPORARILY USING LEGACY: Direct block removal without WorldContext
                    console.log(`[ObbyPlayerController] Falling back to legacy block removal`);
                    const success = this.blockPlacementManager.removeBlock(
                        playerEntity.player, 
                        targetPosition,
                        this.world, // Pass world parameter
                        plotId // Pass plotId for boundary checking
                    );
                    
                    if (success) {
                        // Block was removed, give cash refund
                        const currentCash = this.plotSaveManager.getPlayerCash(playerEntity.player);
                        const newCash = CashCalculator.refundBlockCost(currentCash, blockId);
                        this.plotSaveManager.setPlayerCash(playerEntity.player, newCash);
                        this.updatePlayerCashUI(playerEntity.player, newCash);
                    }
                } else {
                    // No block or obstacle found - show single unified message
                    this.world.chatManager.sendPlayerMessage(
                        playerEntity.player,
                        'Nothing to remove here!',
                        'FF0000'
                    );
                }
            }
        } else {
            console.log("[ObbyPlayerController] No target position found for removal");
        }
    }

    private getTargetPositionForPlacement(playerEntity: ObbyPlayerEntity): Vector3 | null {
        const maxDistance = 8.0; // Changed from 2.0 to match block placement distance
        const aimResult = this.calculateAimDirection(playerEntity, maxDistance);
        if (!aimResult) return null;

        // Build the filter options - exclude both player and fly entity rigid bodies
        const filterOptions: any = {
            filterFlags: 8 // Exclude sensors
        };

        // Always exclude the player's rigid body
        if (playerEntity.rawRigidBody) {
            filterOptions.filterExcludeRigidBody = playerEntity.rawRigidBody;
        }

        // When flying, we might need to exclude the FlyEntity too
        if (this.currentFlyEntity?.rawRigidBody) {
            // Note: We can only exclude one rigid body at a time in HYTOPIA
            // Let's try excluding the FlyEntity instead since the player is mounted on it
            filterOptions.filterExcludeRigidBody = this.currentFlyEntity.rawRigidBody;
        }

        // Raycast to find where the player is looking
        const raycastResult = this.world.simulation.raycast(
            aimResult.origin,
            aimResult.direction,
            maxDistance,
            filterOptions
        );

        let targetPosition: Vector3;

        if (raycastResult?.hitBlock) {
            // Use the block's method to get the neighbor coordinate from hit point
            const placementCoordinate = raycastResult.hitBlock.getNeighborGlobalCoordinateFromHitPoint(raycastResult.hitPoint);
            
            targetPosition = new Vector3(
                placementCoordinate.x,
                placementCoordinate.y,
                placementCoordinate.z
            );
        } else {
            // If no hit, place block at max distance (floored for block grid)
            targetPosition = new Vector3(
                Math.floor(aimResult.origin.x + aimResult.direction.x * maxDistance),
                Math.floor(aimResult.origin.y + aimResult.direction.y * maxDistance),
                Math.floor(aimResult.origin.z + aimResult.direction.z * maxDistance)
            );
            
        }

        // Smart boundary limiting - find closest valid position along raycast
        const validPosition = this.findClosestValidPosition(playerEntity, aimResult, targetPosition);
        
        if (validPosition) {
            return validPosition;
        } else {
            return null;
        }
    }

    /**
     * Find the closest valid position along the raycast line that's within plot boundaries
     */
    private findClosestValidPosition(playerEntity: ObbyPlayerEntity, aimResult: any, originalTarget: Vector3): Vector3 | null {
        // Get player's active build plot
        const activeBuildPlot = this.plotBuildManager.getPlayerActiveBuildPlot(playerEntity.player.id);
        
        if (activeBuildPlot === null) {
            // Player is not actively building on a plot, use original target (global area)
            return originalTarget;
        }

        const plotId = this.plotBuildManager.getPlotId(activeBuildPlot);
        const plotBoundaries = this.plotBuildManager.getPlotBoundaries(plotId);
        
        if (!plotBoundaries) {
            return originalTarget;
        }

        // Check if original target is valid
        if (this.plotBuildManager.isValidPlacement(plotId, originalTarget)) {
            return originalTarget;
        }

        // Instead of returning the first valid position, return the last valid position along the ray
        const stepSize = 0.5; // Step along raycast in 0.5 block increments
        const maxSteps = Math.floor(8.0 / stepSize); // Maximum raycast distance / step size
        let lastValidPosition: Vector3 | null = null;
        for (let step = 1; step <= maxSteps; step++) {
            const distance = step * stepSize;
            const testPosition = new Vector3(
                Math.floor(aimResult.origin.x + aimResult.direction.x * distance),
                Math.floor(aimResult.origin.y + aimResult.direction.y * distance),
                Math.floor(aimResult.origin.z + aimResult.direction.z * distance)
            );

            if (this.plotBuildManager.isValidPlacement(plotId, testPosition)) {
                lastValidPosition = testPosition;
            }
        }

        if (lastValidPosition) {
            return lastValidPosition;
        }

        // No valid position found along raycast - show boundary error
        const violation = this.plotBuildManager.checkBoundaries(plotId, originalTarget);
        if (violation.type !== 'valid' && playerEntity.player.world) {
            playerEntity.player.world.chatManager.sendPlayerMessage(
                playerEntity.player, 
                violation.message, 
                'FF0000'
            );
            if (violation.suggestion) {
                playerEntity.player.world.chatManager.sendPlayerMessage(
                    playerEntity.player, 
                    violation.suggestion, 
                    'FFAA00'
                );
            }
        }

        return null;
    }

    private getTargetPositionForRemoval(playerEntity: ObbyPlayerEntity): Vector3 | null {
        const maxDistance = 8.0;
        const aimResult = this.calculateAimDirection(playerEntity, maxDistance);
        if (!aimResult) return null;

        // Build the filter options - exclude both player and fly entity rigid bodies
        const filterOptions: any = {
            filterFlags: 8 // Exclude sensors
        };

        // Always exclude the player's rigid body
        if (playerEntity.rawRigidBody) {
            filterOptions.filterExcludeRigidBody = playerEntity.rawRigidBody;
        }

        // When flying, we might need to exclude the FlyEntity too
        if (this.currentFlyEntity?.rawRigidBody) {
            // Note: We can only exclude one rigid body at a time in HYTOPIA
            // Let's try excluding the FlyEntity instead since the player is mounted on it
            filterOptions.filterExcludeRigidBody = this.currentFlyEntity.rawRigidBody;
        }

        // Raycast to find where the player is looking
        const raycastResult = this.world.simulation.raycast(
            aimResult.origin,
            aimResult.direction,
            maxDistance,
            filterOptions
        );

        if (raycastResult?.hitBlock) {
            // Remove the block that was hit directly
            const blockCoordinate = raycastResult.hitBlock.globalCoordinate;
            return new Vector3(
                blockCoordinate.x,
                blockCoordinate.y,
                blockCoordinate.z
            );
        }

        // If no block hit, still provide a target position for obstacle removal
        // This allows obstacles (entities) to be found even when not hitting blocks
        const targetPosition = new Vector3(
            aimResult.origin.x + aimResult.direction.x * (maxDistance * 0.5), // Use half distance for better accuracy
            aimResult.origin.y + aimResult.direction.y * (maxDistance * 0.5),
            aimResult.origin.z + aimResult.direction.z * (maxDistance * 0.5)
        );
        
        return targetPosition;
    }

    private calculateAimDirection(entity: DefaultPlayerEntity, maxDistance: number) {
        // Get camera orientation
        const camera = entity.player.camera;
        const facingDirection = camera.facingDirection;
        
        // Calculate world position - different logic for fly mode vs normal mode
        let worldPosition: Vector3;
        
        if (this.currentFlyEntity && (entity as ObbyPlayerEntity).isFlying) {
            // When flying, use the FlyEntity's position as the base world position
            // The player is a child of the FlyEntity, so their position is relative
            const flyEntityPos = this.currentFlyEntity.position;
            worldPosition = new Vector3(flyEntityPos.x, flyEntityPos.y, flyEntityPos.z);
        } else {
            // Normal mode - use player's world position directly
            const playerPos = entity.position;
            worldPosition = new Vector3(playerPos.x, playerPos.y, playerPos.z);
        }

        // Improved raycast origin calculation like the HYGROUNDS example
        const origin = {
            x: worldPosition.x,
            y: worldPosition.y + camera.offset.y,
            z: worldPosition.z,
        };

        // Use camera's facing direction directly
        const direction = facingDirection;

        return { origin, direction };
    }

    public override attach(entity: DefaultPlayerEntity) {
        super.attach(entity);
        
        // Store player entity reference for fall detection
        this.playerEntity = entity as ObbyPlayerEntity;
        
        // Initialize step audio like the default controller
        this._stepAudio = new Audio({
            uri: 'audio/sfx/step/stone/stone-step-04.mp3',
            loop: true,
            volume: 0.1,
            attachedToEntity: entity,
        });
        
    }

    public override spawn(entity: DefaultPlayerEntity) {
        super.spawn(entity);
    }

    public override despawn(entity: DefaultPlayerEntity) {
        super.despawn(entity);
        
        // Clean up block behavior manager data for this player
        this.blockBehaviorManager.cleanupPlayer(entity.player.id);
    }

    public override tick(entity: DefaultPlayerEntity, deltaTimeMs: number) {
        super.tick(entity, deltaTimeMs);
        
        if (!entity.isSpawned || !entity.world) return;
        
        const playerEntity = entity as ObbyPlayerEntity;
        
        // Clear ice/sand states when jumping to allow proper state transitions
        // This needs to happen BEFORE the block behavior check
        if (this.isGrounded && entity.linearVelocity.y > 1.0) {
            if ((playerEntity as any).isOnIce) {
                (playerEntity as any).isOnIce = false;
            }
            if ((playerEntity as any).isOnSand) {
                (playerEntity as any).isOnSand = false;
            }
        }
        
        // Check block behaviors each tick
        this.blockBehaviorManager.checkBlockBehavior(playerEntity, this.world);
        
        // Death check (but more lenient in fly mode)
        const deathY = this.currentFlyEntity ? -100 : -50;
        if (entity.position.y < deathY) {
            entity.setPosition({ x: 0, y: 10, z: 0 });
            // Apply an upward impulse to stop falling motion
            entity.applyImpulse({ x: 0, y: 5, z: 0 });
        }
    }

    /**
     * Apply conveyor belt physics (similar to ice physics)
     */
    private applyConveyorPhysics(entity: DefaultPlayerEntity, input: PlayerInput, cameraOrientation: PlayerCameraOrientation, deltaTimeMs: number): void {
        const { w, a, s, d, sp, sh } = input;
        // Start with normal movement physics to handle walking, jumping, etc.
        super.tickWithPlayerInput(entity, input, cameraOrientation, deltaTimeMs);
        
        // Check if player is jumping - if so, cancel conveyor forces
        if (sp && this.canJump(this)) {
            if (this.isGrounded && entity.linearVelocity.y > -0.001 && entity.linearVelocity.y <= 3) {
                console.log(`[CONVEYOR JUMP] Before jump - velocity: x=${entity.linearVelocity.x.toFixed(2)}, y=${entity.linearVelocity.y.toFixed(2)}, z=${entity.linearVelocity.z.toFixed(2)}, isOnConveyor=${(entity as any).isOnConveyor}, isClimbing=${(entity as any).isClimbing}, conveyorDirection=${(entity as any).conveyorDirection}`);
                
                // Clamp X/Z velocity to a reasonable value for vine/ice jumps
                const maxJumpXZ = 6.0;
                entity.setLinearVelocity({
                    x: Math.max(Math.min(entity.linearVelocity.x, maxJumpXZ), -maxJumpXZ),
                    y: this.jumpVelocity,
                    z: Math.max(Math.min(entity.linearVelocity.z, maxJumpXZ), -maxJumpXZ)
                });
                // Clear conveyor state when jumping to allow normal movement
                (entity as any).isOnConveyor = false;
                
                console.log(`[CONVEYOR JUMP] After jump - velocity: x=${entity.linearVelocity.x.toFixed(2)}, y=${entity.linearVelocity.y.toFixed(2)}, z=${entity.linearVelocity.z.toFixed(2)}, isOnConveyor=${(entity as any).isOnConveyor}, isClimbing=${(entity as any).isClimbing}`);
                
                return; // Exit early, don't apply conveyor forces when jumping
            }
        }
        
        // Then OVERRIDE velocity to add conveyor movement (like ice blocks)
        const currentVelocity = entity.linearVelocity;
        let baseConveyorStrength = (entity as any).conveyorStrength ?? 7.5; // fallback for legacy
        let conveyorBoost = -baseConveyorStrength; // Default: forward (south)
        let axis = 'z';
        if ((entity as any).conveyorDirection === "backward") {
            conveyorBoost = baseConveyorStrength; // Move north (positive Z)
        } else if ((entity as any).conveyorDirection === "left") {
            conveyorBoost = -baseConveyorStrength; // Move west (negative X)
            axis = 'x';
        } else if ((entity as any).conveyorDirection === "right") {
            conveyorBoost = baseConveyorStrength; // Move east (positive X)
            axis = 'x';
        }
        // Input modifiers
        if (axis === 'z') {
            if (w) conveyorBoost *= 1.6;
            else if (s) conveyorBoost *= 0.2;
        } else if (axis === 'x') {
            if ((entity as any).conveyorDirection === 'left') {
                if (a) conveyorBoost *= 1.6;
                else if (d) conveyorBoost *= 0.2;
            } else if ((entity as any).conveyorDirection === 'right') {
                if (d) conveyorBoost *= 1.6;
                else if (a) conveyorBoost *= 0.2;
            }
        }
        // Apply conveyor by adding to current velocity
        if (axis === 'z') {
            const newZVelocity = currentVelocity.z + conveyorBoost;
            entity.setLinearVelocity({
                x: currentVelocity.x,
                y: currentVelocity.y,
                z: Math.max(Math.min(newZVelocity, 24.0), -24.0)
            });
        } else if (axis === 'x') {
            const newXVelocity = currentVelocity.x + conveyorBoost;
            entity.setLinearVelocity({
                x: Math.max(Math.min(newXVelocity, 24.0), -24.0),
                y: currentVelocity.y,
                z: currentVelocity.z
            });
        }
    }

    // Public methods for external access
    public isInFlyMode(): boolean {
        return !!this.currentFlyEntity;
    }

    public toggleFlyMode(): void {
        // This will be handled by the F key in the next tick
    }

    public toggleCameraMode(): void {
        // This will be handled by the C key in the next tick
    }

    private toggleFirstPersonMode(playerEntity: ObbyPlayerEntity): void {
        this.isFirstPersonMode = !this.isFirstPersonMode;
        
        if (this.isFirstPersonMode) {
            this.setupFirstPersonCamera(playerEntity);
            this.world.chatManager.sendPlayerMessage(playerEntity.player, '👁️ Creative Mode enabled', '00FFFF');
        } else {
            this.setupThirdPersonCamera(playerEntity);
            this.world.chatManager.sendPlayerMessage(playerEntity.player, '👁️ Playtest Mode enabled', '00FFFF');
        }
    }

    private setupFirstPersonCamera(playerEntity: ObbyPlayerEntity): void {
        playerEntity.player.camera.setMode(PlayerCameraMode.FIRST_PERSON);
        playerEntity.player.camera.setModelHiddenNodes(['head', 'neck', 'torso', 'leg_right', 'leg_left']);
        
        // When in fly mode, we need a higher camera offset since the player is mounted on the FlyEntity
        // Camera offset of 1.8 provides the correct head-level positioning
        const cameraOffset = this.currentFlyEntity ? 
            { x: 0, y: 1.8, z: 0 } : // Higher offset when flying to position camera at head level
            { x: 0, y: 0.5, z: 0 };  // Normal offset when not flying
        
        playerEntity.player.camera.setOffset(cameraOffset);
        
        // Show crosshair UI for precise building
        playerEntity.player.ui.sendData({
            type: 'show-crosshair',
            show: true
        });
    }

    private setupThirdPersonCamera(playerEntity: ObbyPlayerEntity): void {
        playerEntity.player.camera.setMode(PlayerCameraMode.THIRD_PERSON);
        playerEntity.player.camera.setModelHiddenNodes([]);
        playerEntity.player.camera.setOffset({ x: 0, y: 0, z: 0 });
        
        // Hide crosshair UI
        playerEntity.player.ui.sendData({
            type: 'show-crosshair',
            show: false
        });
    }

    private handleAnimationStateChange(entity: DefaultPlayerEntity, currentAnimationState: 'normal' | 'climbing' | 'ice'): void {
        const now = Date.now();
        
        // If the animation state hasn't changed, do nothing
        if (currentAnimationState === this.lastAnimationState) {
            return;
        }
        
        // Check if enough time has passed since the last animation change (debouncing)
        if (now - this.animationChangeTime < this.ANIMATION_DEBOUNCE_TIME) {
            return;
        }
        
        
        // Update state and timestamp
        this.lastAnimationState = currentAnimationState;
        this.animationChangeTime = now;
        
        // Handle the animation change
        switch (currentAnimationState) {
            case 'climbing':
                if (!(entity as any).isInClimbingAnimation) {
                    this.setClimbingAnimation(entity);
                    (entity as any).isInClimbingAnimation = true;
                }
                break;
                
            case 'ice':
                // Ice uses normal animations, just make sure climbing is off
                if ((entity as any).isInClimbingAnimation) {
                    this.setNormalAnimation(entity);
                    (entity as any).isInClimbingAnimation = false;
                }
                break;
                
            case 'normal':
                // Return to normal animations
                if ((entity as any).isInClimbingAnimation) {
                //    this.setNormalAnimation(entity);
                    (entity as any).isInClimbingAnimation = false;
                }
                break;
        }
    }

    // ============== FALL DETECTION AND RESPAWN METHODS ==============

    /**
     * Check if the player has fallen below the threshold
     */
    private checkForFall(entity: ObbyPlayerEntity): void {
        if (!entity || !entity.isSpawned) return;

        // Skip fall detection if disabled or on cooldown
        if (!this.fallDetectionEnabled || this.isRespawning) return;

        // Two-stage fall detection
        const forceResetThreshold = -2;  // Start force reset early
        const respawnThreshold = -10;     // Actually respawn much lower
        
        // Stage 1: Apply force reset at -2
        if (entity.position.y < forceResetThreshold && !this.isDead) {
            const currentVel = entity.linearVelocity;
            console.log(`[VELOCITY_DEBUG] Player reached force reset threshold (Y=${entity.position.y.toFixed(2)}), starting early force clear`);
            console.log(`[VELOCITY_DEBUG] Current velocity at threshold: (${currentVel.x.toFixed(3)}, ${currentVel.y.toFixed(3)}, ${currentVel.z.toFixed(3)})`);
            this.isDead = true;
            
            // Store position at Y=-2 for better checkpoint detection
            (entity as any).lastPositionBeforeFall = {
                x: entity.position.x,
                y: entity.position.y,
                z: entity.position.z
            };
            
            // Start clearing forces early while falling
            entity.setLinearVelocity({ x: 0, y: entity.linearVelocity.y, z: 0 });
            if (entity.rawRigidBody) {
                entity.rawRigidBody.resetForces(true);
                entity.rawRigidBody.resetTorques(true);
            }
            
            // Track time to respawn
            (entity as any).forceResetStartTime = Date.now();
        }
        
        // Stage 2: Actually respawn at -10
        if (entity.position.y < respawnThreshold && this.isDead) {
            console.log(`[VELOCITY_DEBUG] Player reached respawn threshold (Y=${entity.position.y.toFixed(2)}), calling handleFall()`);
            this.handleFall(entity);
        }
    }

    /**
     * Handle player fall using despawn/respawn pattern
     */
    public handleFall(entity: ObbyPlayerEntity): void {
        if (!entity.isSpawned || !entity.world) return;

        // Calculate decay time if we have it
        const forceResetTime = (entity as any).forceResetStartTime;
        if (forceResetTime) {
            const decayTime = Date.now() - forceResetTime;
            console.log(`[VELOCITY_DEBUG] Force decay time: ${decayTime}ms (from Y=-2 to Y=-10)`);
        }
        
        // Prevent multiple respawns
        if (this.isRespawning) {
            console.log(`[ObbyPlayerController] Already respawning player ${entity.player.id}, ignoring duplicate fall`);
            return;
        }

        console.log(`[ObbyPlayerController] Player ${entity.player.id} died at Y=${entity.position.y.toFixed(2)}, using despawn/respawn pattern`);

        // Log player velocity before death
        const preDeathVel = entity.linearVelocity;
        console.log(`[VELOCITY_DEBUG] Player velocity BEFORE death: (${preDeathVel.x.toFixed(3)}, ${preDeathVel.y.toFixed(3)}, ${preDeathVel.z.toFixed(3)})`);

        // --- Custom respawn logic for lobby/build mode ---
        const playerId = entity.player.id;
        const playerState = this.playerStateManager.getCurrentState(playerId);
        console.log(`[RESPAWN_DEBUG] Player ${playerId} state: ${playerState}`);
        
        if (playerState === PlayerGameState.LOBBY || playerState === PlayerGameState.BUILDING) {
            console.log(`[RESPAWN_DEBUG] ===== LOBBY/BUILD MODE RESPAWN =====`);
            console.log(`[RESPAWN_DEBUG] Player ${playerId} fell at: (${entity.position.x.toFixed(2)}, ${entity.position.y.toFixed(2)}, ${entity.position.z.toFixed(2)})`);
            
            // Check if player has any spawn point or checkpoint set
            const entitySpawnPoint = (entity as any).spawnPoint;
            const entityCheckpoint = (entity as any).checkpoint;
            const controllerCheckpoint = this.lastCheckpointPosition;
            
            console.log(`[RESPAWN_DEBUG] Entity spawn point: ${entitySpawnPoint ? `(${entitySpawnPoint.x}, ${entitySpawnPoint.y}, ${entitySpawnPoint.z})` : 'null'}`);
            console.log(`[RESPAWN_DEBUG] Entity checkpoint: ${entityCheckpoint ? `(${entityCheckpoint.x}, ${entityCheckpoint.y}, ${entityCheckpoint.z})` : 'null'}`);
            console.log(`[RESPAWN_DEBUG] Controller checkpoint: ${controllerCheckpoint ? `(${controllerCheckpoint.x}, ${controllerCheckpoint.y}, ${controllerCheckpoint.z})` : 'null'}`);
            
            // Priority order: 1) Controller checkpoint, 2) Entity checkpoint, 3) Entity spawn point, 4) Closest lobby checkpoint
            let respawnPos = null;
            
            if (controllerCheckpoint) {
                console.log(`[RESPAWN_DEBUG] Using controller checkpoint: (${controllerCheckpoint.x}, ${controllerCheckpoint.y}, ${controllerCheckpoint.z})`);
                respawnPos = { x: controllerCheckpoint.x, y: controllerCheckpoint.y + 3, z: controllerCheckpoint.z };
            } else if (entityCheckpoint) {
                console.log(`[RESPAWN_DEBUG] Using entity checkpoint: (${entityCheckpoint.x}, ${entityCheckpoint.y}, ${entityCheckpoint.z})`);
                respawnPos = { x: entityCheckpoint.x, y: entityCheckpoint.y + 3, z: entityCheckpoint.z };
            } else if (entitySpawnPoint) {
                console.log(`[RESPAWN_DEBUG] Using entity spawn point: (${entitySpawnPoint.x}, ${entitySpawnPoint.y}, ${entitySpawnPoint.z})`);
                // Don't add extra height to spawn point as it's already set correctly
                respawnPos = { x: entitySpawnPoint.x, y: entitySpawnPoint.y, z: entitySpawnPoint.z };
            } else {
                console.log(`[RESPAWN_DEBUG] No player-specific spawn points found, calculating closest lobby checkpoint`);
                
                // Check if player is near a start block they might have fallen from
                const nearbyStartBlock = this.findNearbyStartBlock(entity.position);
                if (nearbyStartBlock) {
                    console.log(`[RESPAWN_DEBUG] Found nearby start block at (${nearbyStartBlock.x}, ${nearbyStartBlock.y}, ${nearbyStartBlock.z}), using as respawn point`);
                    respawnPos = {
                        x: nearbyStartBlock.x + 0.5,
                        y: nearbyStartBlock.y + 1.8,
                        z: nearbyStartBlock.z + 0.5
                    };
                } else {
                    // Use current position but add +10 to Y for checkpoint calculation
                    const checkpointCalcPos = { 
                        x: entity.position.x, 
                        y: entity.position.y + 10, 
                        z: entity.position.z 
                    };
                    
                    respawnPos = this.calculateClosestLobbyCheckpoint(checkpointCalcPos);
                }
            }
            
            console.log(`[RESPAWN_DEBUG] Final lobby/build respawn position: (${respawnPos.x}, ${respawnPos.y}, ${respawnPos.z})`);
            console.log(`[RESPAWN_DEBUG] ===== END LOBBY/BUILD MODE RESPAWN =====`);
            
            this.performInstantRespawn(entity, respawnPos);
            return;
        }
        // --- Default: respawn at last checkpoint (e.g. in play mode) ---
        this.respawnAtCheckpoint(entity);
    }

    /**
     * Respawn player at their last checkpoint using despawn/respawn approach
     */
    public respawnAtCheckpoint(entity: ObbyPlayerEntity): void {
        if (!entity || !entity.world) return;
        
        const playerId = entity.player.id;
        const playerState = this.playerStateManager.getCurrentState(playerId);
        
        console.log(`[RESPAWN_DEBUG] ===== PLAY MODE RESPAWN =====`);
        console.log(`[RESPAWN_DEBUG] Player ${playerId} state: ${playerState}`);
        console.log(`[RESPAWN_DEBUG] Player fell at: (${entity.position.x.toFixed(2)}, ${entity.position.y.toFixed(2)}, ${entity.position.z.toFixed(2)})`);
        
        // Check all possible respawn sources
        const controllerCheckpoint = this.lastCheckpointPosition;
        const entityCheckpoint = (entity as any).checkpoint;
        const entitySpawnPoint = (entity as any).spawnPoint;
        const playerStateCheckpoint = this.playerStateManager.getLastCheckpoint(playerId);
        
        console.log(`[RESPAWN_DEBUG] Controller checkpoint: ${controllerCheckpoint ? `(${controllerCheckpoint.x}, ${controllerCheckpoint.y}, ${controllerCheckpoint.z})` : 'null'}`);
        console.log(`[RESPAWN_DEBUG] Entity checkpoint: ${entityCheckpoint ? `(${entityCheckpoint.x}, ${entityCheckpoint.y}, ${entityCheckpoint.z})` : 'null'}`);
        console.log(`[RESPAWN_DEBUG] Entity spawn point: ${entitySpawnPoint ? `(${entitySpawnPoint.x}, ${entitySpawnPoint.y}, ${entitySpawnPoint.z})` : 'null'}`);
        console.log(`[RESPAWN_DEBUG] PlayerState checkpoint: ${playerStateCheckpoint ? `(${playerStateCheckpoint.x}, ${playerStateCheckpoint.y}, ${playerStateCheckpoint.z})` : 'null'}`);
        
        // Priority order for play mode: 1) Controller checkpoint, 2) PlayerState checkpoint, 3) Entity checkpoint, 4) Entity spawn point, 5) Fallback
        let respawnPosition = null;
        
        if (controllerCheckpoint) {
            console.log(`[RESPAWN_DEBUG] Using controller checkpoint: (${controllerCheckpoint.x}, ${controllerCheckpoint.y}, ${controllerCheckpoint.z})`);
            respawnPosition = {
                x: controllerCheckpoint.x,
                y: controllerCheckpoint.y + 1, // Add a bit of height for better spawning
                z: controllerCheckpoint.z
            };
            console.log(`[RESPAWN_DEBUG] Final respawn position: (${respawnPosition.x}, ${respawnPosition.y}, ${respawnPosition.z})`);
        } else if (playerStateCheckpoint) {
            console.log(`[RESPAWN_DEBUG] Using PlayerState checkpoint`);
            respawnPosition = {
                x: playerStateCheckpoint.x,
                y: playerStateCheckpoint.y + 3,
                z: playerStateCheckpoint.z
            };
        } else if (entityCheckpoint) {
            console.log(`[RESPAWN_DEBUG] Using entity checkpoint`);
            respawnPosition = {
                x: entityCheckpoint.x,
                y: entityCheckpoint.y + 3,
                z: entityCheckpoint.z
            };
        } else if (entitySpawnPoint) {
            console.log(`[RESPAWN_DEBUG] Using entity spawn point`);
            respawnPosition = {
                x: entitySpawnPoint.x,
                y: entitySpawnPoint.y + 3,
                z: entitySpawnPoint.z
            };
        } else {
            console.log(`[RESPAWN_DEBUG] No checkpoints or spawn points found, falling back to lobby checkpoint system`);
            
            // Use current position but add +10 to Y for checkpoint calculation
            const checkpointCalcPos = { 
                x: entity.position.x, 
                y: entity.position.y + 10, 
                z: entity.position.z 
            };
            
            respawnPosition = this.calculateClosestLobbyCheckpoint(checkpointCalcPos);
        }
        
        console.log(`[RESPAWN_DEBUG] Final play mode respawn position: (${respawnPosition.x}, ${respawnPosition.y}, ${respawnPosition.z})`);
        console.log(`[RESPAWN_DEBUG] ===== END PLAY MODE RESPAWN =====`);
        
        this.performInstantRespawn(entity, respawnPosition);
    }

    /**
     * Perform instant respawn (no forces to worry about!)
     */
    private performInstantRespawn(entity: ObbyPlayerEntity, respawnPosition: Vector3Like): void {
        if (!entity || !entity.world || !entity.isSpawned) {
            console.error('[ObbyPlayerController] Cannot perform respawn - invalid entity state');
            return;
        }

        console.log(`[ObbyPlayerController] Performing instant respawn for player ${entity.player.id} at (${respawnPosition.x}, ${respawnPosition.y}, ${respawnPosition.z})`);
        
        // Validate respawn position
        if (!respawnPosition || typeof respawnPosition.x !== 'number' || typeof respawnPosition.y !== 'number' || typeof respawnPosition.z !== 'number') {
            console.error('[ObbyPlayerController] Invalid respawn position, using fallback');
            respawnPosition = { x: 0, y: 10, z: 0 };
        }
        
        // Prevent multiple concurrent respawns
        if (this.isRespawning) {
            console.warn(`[ObbyPlayerController] Already respawning player ${entity.player.id}, ignoring duplicate request`);
            return;
        }
        
        this.isRespawning = true;
        
        console.log(`[VELOCITY_DEBUG] No forces were applied, so no force cleanup needed!`);
        
        // Clear horizontal velocities immediately after respawn, allow gravity on Y
        entity.setLinearVelocity({ x: 0, y: 0, z: 0 }); // Start with all 0, then let gravity take over
        entity.setAngularVelocity({ x: 0, y: 0, z: 0 });
        
        // Reset basic physics states
        (entity as any).isOnIce = false;
        (entity as any).isOnSand = false;
        (entity as any).isOnConveyor = false;
        (entity as any).isClimbing = false;
        
        // Teleport to respawn position
        console.log(`[VELOCITY_DEBUG] Teleporting player to respawn position: (${respawnPosition.x}, ${respawnPosition.y}, ${respawnPosition.z})`);
        entity.setPosition(respawnPosition);
        
        // Movement will be disabled for 1.25 seconds via isRespawning flag
        console.log(`[VELOCITY_DEBUG] Movement disabled for 1.25 seconds via isRespawning flag`);
        
        // Keep horizontal velocity at 0 for the first 100ms, allow gravity on Y
        setTimeout(() => {
            if (entity.isSpawned) {
                console.log(`[VELOCITY_DEBUG] Ensuring horizontal velocity stays at 0, allowing gravity`);
                const currentVel = entity.linearVelocity;
                entity.setLinearVelocity({ x: 0, y: currentVel.y, z: 0 }); // Preserve Y velocity for gravity
                entity.setAngularVelocity({ x: 0, y: 0, z: 0 });
                
                // Final velocity check
                setTimeout(() => {
                    const finalVel = entity.linearVelocity;
                    console.log(`[VELOCITY_DEBUG] Final velocity check: (${finalVel.x.toFixed(3)}, ${finalVel.y.toFixed(3)}, ${finalVel.z.toFixed(3)})`);
                    console.log(`[VELOCITY_DEBUG] SUCCESS: Clean respawn with natural gravity!`);
                }, 200);
            }
        }, 100);
        
        // Send respawn message
        entity.world.chatManager.sendPlayerMessage(entity.player, '💀 You died! Respawned.', 'FF6B6B');
        
        // Reset controller state after 1.25 seconds (re-enabling movement)
        setTimeout(() => {
            console.log(`[VELOCITY_DEBUG] Re-enabling movement after 1.25 seconds`);
            this.isRespawning = false;
            this.isDead = false;
            console.log(`[ObbyPlayerController] Instant respawn completed for player ${entity.player.id}`);
        }, 1250);
    }

    /**
     * Set the fall threshold Y position
     */
    public setFallThreshold(y: number): void {
        this.fallThresholdY = y;
    }

    /**
     * Set a checkpoint position that the player will respawn at when falling
     */
    public setCheckpoint(position: Vector3Like): void {
        // Don't update the checkpoint if we're currently respawning
        if (this.isRespawning) {
            console.log(`[CHECKPOINT_DEBUG] Ignoring checkpoint update during respawn`);
            return;
        }

        console.log(`[CHECKPOINT_DEBUG] ===== SETTING CONTROLLER CHECKPOINT =====`);
        console.log(`[CHECKPOINT_DEBUG] Input position: (${position.x}, ${position.y}, ${position.z})`);
        console.log(`[CHECKPOINT_DEBUG] Previous checkpoint: ${this.lastCheckpointPosition ? `(${this.lastCheckpointPosition.x}, ${this.lastCheckpointPosition.y}, ${this.lastCheckpointPosition.z})` : 'null'}`);

        // Make sure we store a clean copy of the position
        this.lastCheckpointPosition = {
            x: position.x,
            y: position.y + 3, // Spawn higher for more decay time
            z: position.z
        };
        
        console.log(`[CHECKPOINT_DEBUG] New checkpoint set: (${this.lastCheckpointPosition.x}, ${this.lastCheckpointPosition.y}, ${this.lastCheckpointPosition.z})`);
        console.log(`[CHECKPOINT_DEBUG] ===== END SETTING CONTROLLER CHECKPOINT =====`);
    }

    /**
     * Clear the current checkpoint
     */
    public clearCheckpoint(): void {
        console.log(`[CHECKPOINT_DEBUG] ===== CLEARING CONTROLLER CHECKPOINT =====`);
        console.log(`[CHECKPOINT_DEBUG] Previous checkpoint: ${this.lastCheckpointPosition ? `(${this.lastCheckpointPosition.x}, ${this.lastCheckpointPosition.y}, ${this.lastCheckpointPosition.z})` : 'null'}`);
        this.lastCheckpointPosition = null;
        console.log(`[CHECKPOINT_DEBUG] Checkpoint cleared`);
        console.log(`[CHECKPOINT_DEBUG] ===== END CLEARING CONTROLLER CHECKPOINT =====`);
    }

    /**
     * Find a nearby start block that the player might have fallen from
     */
    private findNearbyStartBlock(playerPosition: Vector3Like): Vector3Like | null {
        const searchRadius = 15; // Search within 15 blocks horizontally
        const searchHeight = 20; // Search up to 20 blocks above the player
        
        console.log(`[RESPAWN_DEBUG] Searching for start blocks near player position (${playerPosition.x.toFixed(2)}, ${playerPosition.y.toFixed(2)}, ${playerPosition.z.toFixed(2)})`);
        
        // Search in a cylinder above the player's position
        for (let y = 0; y <= searchHeight; y++) {
            for (let x = -searchRadius; x <= searchRadius; x++) {
                for (let z = -searchRadius; z <= searchRadius; z++) {
                    // Skip positions outside the circular search area
                    const distance = Math.sqrt(x * x + z * z);
                    if (distance > searchRadius) continue;
                    
                    const checkPos = {
                        x: Math.floor(playerPosition.x) + x,
                        y: Math.floor(playerPosition.y) + y,
                        z: Math.floor(playerPosition.z) + z
                    };
                    
                    const blockId = this.world.chunkLattice.getBlockId(checkPos);
                    if (blockId === 100) { // Start block
                        console.log(`[RESPAWN_DEBUG] Found start block at (${checkPos.x}, ${checkPos.y}, ${checkPos.z}), distance: ${distance.toFixed(2)}`);
                        return checkPos;
                    }
                }
            }
        }
        
        console.log(`[RESPAWN_DEBUG] No start blocks found within search radius`);
        return null;
    }

    /**
     * Calculate the closest lobby checkpoint to a given position
     */
    private calculateClosestLobbyCheckpoint(fromPosition: Vector3Like): Vector3Like {
        console.log(`[RESPAWN_DEBUG] Calculating closest lobby checkpoint from: (${fromPosition.x.toFixed(2)}, ${fromPosition.y.toFixed(2)}, ${fromPosition.z.toFixed(2)})`);
        console.log(`[RESPAWN_DEBUG] Available lobby checkpoints: ${LOBBY_CHECKPOINTS.length}`);
        
        // Find closest checkpoint
        let closest = LOBBY_CHECKPOINTS[0];
        let minDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < LOBBY_CHECKPOINTS.length; i++) {
            const cp = LOBBY_CHECKPOINTS[i];
            const dx = cp.x - fromPosition.x;
            const dy = cp.y - fromPosition.y;
            const dz = cp.z - fromPosition.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            console.log(`[RESPAWN_DEBUG] Checkpoint ${i}: (${cp.x}, ${cp.y}, ${cp.z}) - Distance: ${dist.toFixed(2)}`);
            if (dist < minDist) {
                minDist = dist;
                closest = cp;
                console.log(`[RESPAWN_DEBUG] New closest checkpoint found: ${i}`);
            }
        }
        
        console.log(`[RESPAWN_DEBUG] Selected closest lobby checkpoint: (${closest.x}, ${closest.y}, ${closest.z}) with distance ${minDist.toFixed(2)}`);
        return { x: closest.x, y: closest.y + 3, z: closest.z };
    }

    /**
     * Enable or disable fall detection
     */
    public setFallDetectionEnabled(enabled: boolean): void {
        this.fallDetectionEnabled = enabled;
    }

    /**
     * Set movement pause state (used during countdown, etc.)
     */
    public setPauseMovement(pause: boolean): void {
        this.pauseMovement = pause;
    }

    /**
     * Get the player entity associated with this controller
     */
    public getPlayerEntity(): ObbyPlayerEntity {
        if (!this.playerEntity) {
            throw new Error('Player entity not attached to PlayerController');
        }
        return this.playerEntity;
    }

    /**
     * Get WorldContext for this world if available
     */
    private getWorldContext(): WorldContext | null {
        try {
            const systemManager = SystemManager.getInstance();
            const context = systemManager.getWorldContext(this.world);
            return context;
        } catch (error) {
            console.warn(`[ObbyPlayerController] Failed to get WorldContext:`, error);
            return null;
        }
    }

    /**
     * Log WorldContext integration status on startup
     */
    private logWorldContextStatus(): void {
        const context = this.getWorldContext();
        if (context) {
            const systemType = SystemManager.getInstance().getWorldSystemType(this.world.name);
            console.log(`[ObbyPlayerController] ✅ WorldContext active - System: ${systemType}, World: ${this.world.name}`);
            console.log(`[ObbyPlayerController] 🔧 Available systems - Plot: ${!!context.plotManager}, Block: ${!!context.blockSystem}, Save: ${!!context.saveSystem}`);
        } else {
            console.log(`[ObbyPlayerController] ⚠️ WorldContext not available - Using legacy singletons for world: ${this.world.name}`);
        }
    }

} 