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
import { MechanicalBlockManager } from "./MechanicalBlockManager";
import { AttachmentSystem } from "./contraptions/AttachmentSystem";
import { blockRegistry } from "./BlockRegistry";
import { MechanicalWheelEntity } from "./entities/MechanicalWheelEntity";

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
    
    // Fall detection and respawn properties - TWO STAGE SYSTEM
    private fallThresholdY: number = -2; // First threshold for force reset
    private deathThresholdY: number = -10; // Second threshold for actual respawn
    private lastCheckpointPosition: Vector3Like | null = null;
    private fallDetectionEnabled: boolean = false; // Disabled by default, enabled in play mode
    private isRespawning: boolean = false;
    private isDead: boolean = false;
    private pauseMovement: boolean = false;
    private movementRestricted: boolean = false; // New: track movement restriction
    private movementRestrictedUntil: number = 0; // New: when movement restriction ends
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
    
    // Mobile fly button tracking
    private mobileFlyDownActive: Map<string, boolean> = new Map(); // Track mobile fly down button per player
    


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
        
        // Initialize the collision manager
        ObstacleCollisionManager.getInstance();
        
        // Disable auto-face-forward to prevent interference with friction behavior
        this.faceForwardOnStop = false;
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

    /**
     * Check if mobile fly down button is currently being pressed for a player
     */
    private isMobileFlyDownActive(playerId: string): boolean {
        return this.mobileFlyDownActive.get(playerId) === true;
    }

    /**
     * Set mobile fly down button state for a player
     */
    public setMobileFlyDownActive(playerId: string, active: boolean): void {
        this.mobileFlyDownActive.set(playerId, active);
    }

    /**
     * Handle mobile fly down message from UI
     */
    public handleMobileFlyDown(playerEntity: ObbyPlayerEntity, active: boolean): void {
        if (this.currentFlyEntity && playerEntity.isFlying) {
            this.currentFlyEntity.controller.setMobileFlyDownActive(active);
        }
    }

    /**
     * Set up UI message handlers for a player
     */
    public setupUIHandlers(player: any): void {
        player.ui.onData((data: any) => {
            if (data.type === 'mobileFlyDown') {
                const playerEntity = player.entity as ObbyPlayerEntity;
                this.handleMobileFlyDown(playerEntity, data.active);
            }
        });
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
        
        // Handle movement pausing (used during countdown, etc.)
        if (this.pauseMovement) {
            playerEntity.setLinearVelocity({ x: 0, y: 0, z: 0 });
            // Still allow camera movement but block all input
            return;
        }
        
        // Handle movement restriction (used after respawn)
        if (this.movementRestricted && Date.now() < this.movementRestrictedUntil) {
            // Block WASD movement but allow camera and other inputs
            input.w = false;
            input.a = false;
            input.s = false;
            input.d = false;
        } else if (this.movementRestricted) {
            // Movement restriction period has ended
            this.movementRestricted = false;
            this.movementRestrictedUntil = 0;
        }
        
        // Handle fly mode toggle first
        this.handleFlyModeToggle(playerEntity, originalInput);
        
        // Update last key state immediately to prevent rapid toggling
        this.lastKeyState = { f: originalInput.f, c: originalInput.c };
        let m = MobileDetectionManager.getInstance().isPlayerMobile(playerEntity.player.id);
        
        // If in fly mode, forward input to the FlyEntity instead of processing normally
        if (this.currentFlyEntity && playerEntity.isFlying) {
            // For mobile users: completely block shift from joystick, period
            if (m) {
                originalInput.sh = false;
            }
            
            // Forward input to the FlyEntityController
            this.currentFlyEntity.controller.processFlyMovement(
                this.currentFlyEntity,
                originalInput, // Use originalInput which we modified above
                cameraOrientation,
                deltaTimeMs
            );
            
            // Still allow mouse input for building/destroying while flying
            this.handleMouseInput(playerEntity, originalInput);
            
            // Update mouse state even in fly mode
            this.lastMouseState = { ml: originalInput.ml, mr: originalInput.mr };
            return;
        }
        
        // For mobile users in building mode but NOT flying, disable shift to prevent sprint conflicts
        if (isBuilding && m && !playerEntity.isFlying) {
            input.sh = false; // Disable sprint when building on mobile (but not when flying)
        }
        
        // Check if player is on ice, sand, conveyor, wheel, or climbing using the block behavior system
        const isOnIce = (playerEntity as any).isOnIce === true;
        const isOnSand = (playerEntity as any).isOnSand === true;
        const isOnConveyor = (playerEntity as any).isOnConveyor === true;
        const isOnWheel = (playerEntity as any).isOnWheel === true;
        const isClimbing = (playerEntity as any).isClimbing === true;
        
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
            console.log(`[TICK] Applying climbing physics for player ${playerEntity.player.id}`);
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
        } else if (isOnWheel) {
            super.tickWithPlayerInput(entity, input, cameraOrientation, deltaTimeMs);
            
            // Then override with wheel physics
            this.applyWheelPhysics(entity, input, cameraOrientation, deltaTimeMs);
        } else if (isOnSand) {
            super.tickWithPlayerInput(entity, input, cameraOrientation, deltaTimeMs);
            
            // Then override with sand physics
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
        const currentVelocity = entity.linearVelocity;
        
        // Handle jumping with reduced height on sand
        let newVelocityY = currentVelocity.y;
        if (sp && this.canJump(this)) {
            if (this.isGrounded && currentVelocity.y > -0.001 && currentVelocity.y <= 3) {
                newVelocityY = this.jumpVelocity * 0.8; // 20% lower jump on sand
                
                // Clear sand state when jumping to allow proper state transitions
                (entity as any).isOnSand = false;
            }
        }
        
        // Calculate target velocity with reduced speed on sand
        const targetVelocity = this._calculateSandMovement(!!w, !!a, !!s, !!d, yaw, !!sh);
        
        // Apply sand physics with slower movement and higher friction
        const sandFriction = 0.2; // Very high friction (sticky)
        const sandSpeedMultiplier = 0.5; // 50% slower movement (very sticky)
        
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
        
        // Apply the sand velocity while preserving vertical velocity
        entity.setLinearVelocity({
            x: newVelocityX,
            y: newVelocityY,
            z: newVelocityZ,
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
        
        const totalSpeed = Math.sqrt(newVelocityX * newVelocityX + newVelocityZ * newVelocityZ);
    }

    private _calculateSandMovement(w: boolean, a: boolean, s: boolean, d: boolean, yaw: number, isRunning: boolean): { x: number, z: number } {
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

    private applyClimbingPhysics(entity: DefaultPlayerEntity, input: PlayerInput, cameraOrientation: PlayerCameraOrientation, deltaTimeMs: number): void {
        const { w, a, s, d, sp, sh } = input;
        const { yaw } = cameraOrientation;
        
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
        // Left click to place blocks/obstacles or make mechanical entities bigger (only on press, not hold)
        if (input.ml && !this.lastMouseState.ml) {
            // First try normal placement (prioritize block/obstacle placement)
            let placementSuccess = false;
            if (playerEntity.isObstacleSelected()) {
                this.handleObstaclePlacement(playerEntity);
                placementSuccess = true; // Assume obstacle placement attempts are intentional
            } else {
                // For block placement, we need to check if it actually placed something
                const targetPosition = this.getTargetPositionForPlacement(playerEntity);
                if (targetPosition) {
                    // Check if there's already a block at this position
                    const existingBlockId = this.world.chunkLattice.getBlockId(targetPosition);
                    if (existingBlockId === 0) {
                        // No block exists, place normally
                        this.handleBlockPlacement(playerEntity);
                        placementSuccess = true;
                    }
                }
            }
            
            // Only try to resize mechanical entities if no placement occurred
            if (!placementSuccess) {
                this.tryResizeMechanicalEntity(playerEntity, 'bigger');
            }
        }
        // Right click to remove blocks or make mechanical entities smaller (only on press, not hold)
        if (input.mr && !this.lastMouseState.mr) {
            // First try to remove blocks/obstacles (prioritize chunk lattice)
            const blockRemovalSuccess = this.handleBlockRemoval(playerEntity);
            if (!blockRemovalSuccess) {
                // If no block was found, try to make a mechanical entity smaller (or delete if at minimum size)
                this.tryResizeMechanicalEntity(playerEntity, 'smaller');
            }
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
                plotId, // Pass plotId for boundary checking
                false // isRightClick
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
                    case 'mechanical_piston':
                        entityType = 'mechanical-piston';
                        break;
                    case 'mechanical_wheel':
                        entityType = 'mechanical-wheel';
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
                        plotId, // Pass plotId for boundary checking
                        false // isRightClick
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
                            case 'mechanical_piston':
                                entityType = 'mechanical-piston';
                                break;
                            case 'mechanical_wheel':
                                entityType = 'mechanical-wheel';
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
                
                // Check if this block can be attached to a nearby mechanical entity
                console.log(`[ObbyPlayerController] Target position for placement: ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z}`);
                const attachmentSuccess = this.tryAttachBlockToMechanicalEntity(
                    playerEntity,
                    selectedBlockId,
                    targetPosition
                );
                
                let success = false;
                if (attachmentSuccess) {
                    success = true;
                    console.log(`[ObbyPlayerController] Block attached to mechanical entity instead of placed in world`);
                } else {
                    // Place block normally in chunk lattice
                    success = this.blockPlacementManager.placeBlock(
                        playerEntity.player, 
                        targetPosition,
                        this.world, // Pass world parameter
                        plotId // Pass plotId for boundary checking
                    );
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

    /**
     * Try to attach a block to a nearby mechanical entity instead of placing it in the world
     */
    private tryAttachBlockToMechanicalEntity(
        playerEntity: ObbyPlayerEntity,
        blockId: number,
        targetPosition: Vector3Like
    ): boolean {
        console.log(`[ObbyPlayerController] ========== ATTACHMENT DEBUG ==========`);
        console.log(`[ObbyPlayerController] Trying to attach block ID ${blockId} at target position ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z}`);
        
        // Log player/camera information
        const playerPos = playerEntity.position;
        console.log(`[ObbyPlayerController] Player entity position: ${playerPos.x.toFixed(2)}, ${playerPos.y.toFixed(2)}, ${playerPos.z.toFixed(2)}`);
        
        // Try to get real player position (might be different if in fly mode)
        const rawPosition = playerEntity.rawPosition;
        if (rawPosition) {
            console.log(`[ObbyPlayerController] Raw player position: ${rawPosition.x.toFixed(2)}, ${rawPosition.y.toFixed(2)}, ${rawPosition.z.toFixed(2)}`);
        }
        
        // Check if we have a parent entity (fly mode)
        if (playerEntity.parent) {
            const parentPos = playerEntity.parent.position;
            console.log(`[ObbyPlayerController] Parent entity position (fly mode): ${parentPos.x.toFixed(2)}, ${parentPos.y.toFixed(2)}, ${parentPos.z.toFixed(2)}`);
        }
        
        // Get camera direction - handle fly mode properly
        let camera = playerEntity.camera;
        let actualPlayerPos = playerPos;
        
        // If in fly mode, get camera from the player's actual player object
        if (playerEntity.parent) {
            actualPlayerPos = playerEntity.parent.position;
            console.log(`[ObbyPlayerController] In fly mode - using parent position for calculations`);
            
            // Try to get the actual player entity that's riding the fly entity
            const flyEntity = playerEntity.parent;
            if ((flyEntity as any).rider && (flyEntity as any).rider.camera) {
                camera = (flyEntity as any).rider.camera;
                console.log(`[ObbyPlayerController] Got camera from fly entity rider`);
            }
        }
        
        let facing = camera && camera.facingDirection ? camera.facingDirection : null;
        
        // Fallback if camera facing direction is not available
        if (!facing) {
            console.log(`[ObbyPlayerController] Camera facing direction not available - using entity rotation as fallback`);
            // Calculate facing direction from entity rotation
            const rotation = playerEntity.rotation;
            facing = {
                x: Math.sin(rotation.y) * Math.cos(rotation.x),
                y: -Math.sin(rotation.x),
                z: Math.cos(rotation.y) * Math.cos(rotation.x)
            };
        }
        
        console.log(`[ObbyPlayerController] Camera/entity facing direction: ${facing.x.toFixed(3)}, ${facing.y.toFixed(3)}, ${facing.z.toFixed(3)}`);
        
        // Calculate direction from actual player position to target
        const playerToTarget = {
            x: targetPosition.x - actualPlayerPos.x,
            y: targetPosition.y - actualPlayerPos.y,
            z: targetPosition.z - actualPlayerPos.z
        };
        const distance = Math.sqrt(playerToTarget.x ** 2 + playerToTarget.y ** 2 + playerToTarget.z ** 2);
        const normalizedDirection = {
            x: playerToTarget.x / distance,
            y: playerToTarget.y / distance,
            z: playerToTarget.z / distance
        };
        console.log(`[ObbyPlayerController] Actual player to target direction: ${normalizedDirection.x.toFixed(3)}, ${normalizedDirection.y.toFixed(3)}, ${normalizedDirection.z.toFixed(3)} (distance: ${distance.toFixed(2)})`);
        
        // Compare camera direction to player-target direction
        const dotProduct = facing.x * normalizedDirection.x + facing.y * normalizedDirection.y + facing.z * normalizedDirection.z;
        console.log(`[ObbyPlayerController] Camera-to-target alignment (dot product): ${dotProduct.toFixed(3)} (1.0 = perfect alignment)`);
        
        // Most importantly: show where the player is looking vs where they clicked
        console.log(`[ObbyPlayerController] Camera direction suggests player is looking towards: ${facing.x > 0 ? 'east' : facing.x < 0 ? 'west' : 'center'}, ${facing.z > 0 ? 'south' : facing.z < 0 ? 'north' : 'center'}`);
        
        console.log(`[ObbyPlayerController] ==========================================`);
        
        // Get the block type from registry
        const blockData = blockRegistry.getBlock(blockId);
        if (!blockData) {
            console.log(`[ObbyPlayerController] Unknown block ID: ${blockId}`);
            return false;
        }

        console.log(`[ObbyPlayerController] Block data found: ${blockData.name}`);

        // Only allow certain blocks to be attached (ice, glass, stone, etc.)
        const attachableBlocks = ['ice', 'glass', 'stone', 'wood', 'sand'];
        const blockName = blockData.name.toLowerCase();
        const isAttachable = attachableBlocks.some(name => blockName.includes(name));
        
        console.log(`[ObbyPlayerController] Block '${blockData.name}' (${blockName}) attachable: ${isAttachable}`);
        
        if (!isAttachable) {
            console.log(`[ObbyPlayerController] Block '${blockData.name}' is not attachable`);
            return false;
        }

        // Search for nearby mechanical entities
        const mechanicalBlockManager = MechanicalBlockManager.getInstance();
        const searchRadius = 10.0; // blocks - increased for testing
        
        console.log(`[ObbyPlayerController] Searching for mechanical entities within ${searchRadius} blocks`);
        
        // Debug: Check what entities are registered
        const entityCount = mechanicalBlockManager.getEntityCount();
        console.log(`[ObbyPlayerController] MechanicalBlockManager state:`);
        console.log(`[ObbyPlayerController] - Piston entities: ${entityCount.pistons}`);
        console.log(`[ObbyPlayerController] - Wheel entities: ${entityCount.wheels}`);
        console.log(`[ObbyPlayerController] - Total entities: ${entityCount.total}`);
        
        // Check for pistons in nearby positions
        for (let x = -searchRadius; x <= searchRadius; x++) {
            for (let y = -searchRadius; y <= searchRadius; y++) {
                for (let z = -searchRadius; z <= searchRadius; z++) {
                    const checkPos = {
                        x: Math.floor(targetPosition.x) + x,
                        y: Math.floor(targetPosition.y) + y,
                        z: Math.floor(targetPosition.z) + z
                    };
                    
                    // Check for piston at this position
                    const piston = mechanicalBlockManager.getPistonEntityAt(checkPos);
                    if (piston) {
                        console.log(`[ObbyPlayerController] Found piston at ${checkPos.x}, ${checkPos.y}, ${checkPos.z}`);
                        
                        // Try to attach to this piston - pass camera info for better face selection
                        let cameraDirection = null;
                        if (camera && camera.facingDirection) {
                            cameraDirection = camera.facingDirection;
                        }
                        
                        const attached = AttachmentSystem.attachBlockToEntity(
                            blockName,
                            targetPosition,
                            piston,
                            playerEntity.world,
                            cameraDirection
                        );
                        
                        if (attached) {
                            console.log(`[ObbyPlayerController] Successfully attached ${blockData.name} to piston`);
                            return true;
                        } else {
                            console.log(`[ObbyPlayerController] Failed to attach ${blockData.name} to piston`);
                        }
                    }
                    
                    // Check for wheel at this position
                    const wheel = mechanicalBlockManager.getWheelEntityAt(checkPos);
                    if (wheel) {
                        console.log(`[ObbyPlayerController] Found wheel at ${checkPos.x}, ${checkPos.y}, ${checkPos.z}`);
                        
                        // Try to attach to this wheel - pass camera info for better face selection
                        let cameraDirection = null;
                        if (camera && camera.facingDirection) {
                            cameraDirection = camera.facingDirection;
                        }
                        
                        const attached = AttachmentSystem.attachBlockToEntity(
                            blockName,
                            targetPosition,
                            wheel,
                            playerEntity.world,
                            cameraDirection
                        );
                        
                        if (attached) {
                            console.log(`[ObbyPlayerController] Successfully attached ${blockData.name} to wheel`);
                            return true;
                        } else {
                            console.log(`[ObbyPlayerController] Failed to attach ${blockData.name} to wheel`);
                        }
                    }
                }
            }
        }
        
        console.log(`[ObbyPlayerController] No mechanical entities found within ${searchRadius} blocks of target position`);
        console.log(`[ObbyPlayerController] Searched area: X(${Math.floor(targetPosition.x) - searchRadius} to ${Math.floor(targetPosition.x) + searchRadius}), Y(${Math.floor(targetPosition.y) - searchRadius} to ${Math.floor(targetPosition.y) + searchRadius}), Z(${Math.floor(targetPosition.z) - searchRadius} to ${Math.floor(targetPosition.z) + searchRadius})`);
        return false;
    }

    /**
     * Try to resize a mechanical entity at the target position
     */
    private tryResizeMechanicalEntity(
        playerEntity: ObbyPlayerEntity,
        action: 'bigger' | 'smaller'
    ): boolean {
        const targetPosition = this.getTargetPositionForPlacement(playerEntity);
        if (!targetPosition) {
            return false;
        }

        console.log(`[ObbyPlayerController] Trying to ${action} mechanical entity at ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z}`);

        const mechanicalBlockManager = MechanicalBlockManager.getInstance();
        
        // First, try exact position (rounded)
        const exactPos = {
            x: Math.floor(targetPosition.x + 0.5),
            y: Math.floor(targetPosition.y + 0.5), 
            z: Math.floor(targetPosition.z + 0.5)
        };
        
        console.log(`[ObbyPlayerController] Checking exact position: ${exactPos.x}, ${exactPos.y}, ${exactPos.z}`);
        let wheel = mechanicalBlockManager.getWheelEntityAt(exactPos);
        
        if (!wheel) {
            console.log(`[ObbyPlayerController] No wheel at exact position, searching nearby...`);
            
            // Debug: List all registered wheels
            const allWheels = mechanicalBlockManager.getWheelEntities();
            console.log(`[ObbyPlayerController] Registered wheels: ${allWheels.size}`);
            for (const [posKey, w] of allWheels) {
                console.log(`[ObbyPlayerController] - Wheel at ${posKey}: size ${w.getCurrentSize()}, direction ${w.getCurrentGrowthDirection()}`);
            }
            
            // If not found at exact position, search with size-based radius
            // Use adaptive search: check all entities in a reasonable area to find the largest size,
            // then use that to determine appropriate search radius (larger entities = smaller zones)
            let searchRadius = 3; // Start with max radius for initial scan
            let largestEntitySize = 1; // Default minimum size
            
            // First pass: find the largest entity size in the area
            for (let x = -searchRadius; x <= searchRadius; x++) {
                for (let y = -searchRadius; y <= searchRadius; y++) {
                    for (let z = -searchRadius; z <= searchRadius; z++) {
                        const checkPos = {
                            x: exactPos.x + x,
                            y: exactPos.y + y,
                            z: exactPos.z + z
                        };
                        
                        // Check wheel entities
                        const testWheel = mechanicalBlockManager.getWheelEntityAt(checkPos);
                        if (testWheel) {
                            largestEntitySize = Math.max(largestEntitySize, testWheel.getCurrentSize());
                        }
                        
                        // Check configurable mechanical entities
                        const testConfigurable = mechanicalBlockManager.getConfigurableEntityAt(checkPos);
                        if (testConfigurable) {
                            // Configurable entities can be 1-5 in each dimension, use max dimension for size
                            const maxDim = Math.max(testConfigurable.dimensions?.x || 1, testConfigurable.dimensions?.y || 1, testConfigurable.dimensions?.z || 1);
                            largestEntitySize = Math.max(largestEntitySize, maxDim);
                        }
                        
                        // Check piston entities
                        const testPiston = mechanicalBlockManager.getPistonEntityAt(checkPos);
                        if (testPiston) {
                            // Pistons have a getCurrentSize method, use it if available
                            const pistonSize = (testPiston as any).getCurrentSize ? (testPiston as any).getCurrentSize() : 1;
                            largestEntitySize = Math.max(largestEntitySize, pistonSize);
                        }
                    }
                }
            }
            
            // Calculate size-based search radius: larger entities get smaller interaction zones
            // Size 1 = radius 2, Size 2 = radius 2, Size 3 = radius 1, Size 4+ = radius 1
            const sizeBasedRadius = largestEntitySize <= 2 ? 2 : 1;
            searchRadius = Math.min(searchRadius, sizeBasedRadius);
            
            console.log(`[ObbyPlayerController] Using size-based search radius ${searchRadius} for largest entity size ${largestEntitySize}`);
            
            // Second pass: search with appropriate radius for all entity types
            for (let x = -searchRadius; x <= searchRadius; x++) {
                for (let y = -searchRadius; y <= searchRadius; y++) {
                    for (let z = -searchRadius; z <= searchRadius; z++) {
                        const checkPos = {
                            x: exactPos.x + x,
                            y: exactPos.y + y,
                            z: exactPos.z + z
                        };
                        
                        // Check for wheel entities first (maintain existing behavior)
                        wheel = mechanicalBlockManager.getWheelEntityAt(checkPos);
                        if (wheel) {
                            console.log(`[ObbyPlayerController] Found wheel at ${checkPos.x}, ${checkPos.y}, ${checkPos.z} (size ${wheel.getCurrentSize()}, search radius was ${searchRadius})`);
                            break;
                        }
                        
                        // Check for configurable mechanical entities
                        const configurableEntity = mechanicalBlockManager.getConfigurableEntityAt(checkPos);
                        if (configurableEntity) {
                            console.log(`[ObbyPlayerController] Found configurable entity at ${checkPos.x}, ${checkPos.y}, ${checkPos.z} (search radius was ${searchRadius})`);
                            // For compatibility with existing code, we'll handle this in the next section
                            break;
                        }
                        
                        // Check for piston entities
                        const pistonEntity = mechanicalBlockManager.getPistonEntityAt(checkPos);
                        if (pistonEntity) {
                            console.log(`[ObbyPlayerController] Found piston entity at ${checkPos.x}, ${checkPos.y}, ${checkPos.z} (search radius was ${searchRadius})`);
                            // For compatibility with existing code, we'll handle this in the next section
                            break;
                        }
                    }
                    if (wheel) break; // Break out of nested loops when found
                }
                if (wheel) break;
            }
        }
        
        if (wheel) {
            const wheelPos = wheel.position;
            console.log(`[ObbyPlayerController] Found wheel, current size: ${wheel.getCurrentSize()}, growth direction: ${wheel.getCurrentGrowthDirection()}`);
            
            if (action === 'bigger') {
                // Calculate new growth direction
                const newGrowthDirection = this.calculateGrowthDirection(targetPosition, wheelPos);
                const currentGrowthDirection = wheel.getCurrentGrowthDirection();
                const currentSize = wheel.getCurrentSize();
                
                // Check if we're switching growth direction
                let finalSize: number;
                if (currentGrowthDirection !== 'both' && newGrowthDirection !== currentGrowthDirection) {
                    // Switching direction - reset to size 1 and grow in new direction
                    finalSize = 2; // Start at size 2 in new direction
                    console.log(`[ObbyPlayerController] Switching growth direction from ${currentGrowthDirection} to ${newGrowthDirection}, resetting size`);
                } else {
                    // Same direction - continue growing
                    if (currentSize >= 4) {
                        console.log(`[ObbyPlayerController] Wheel already at maximum size`);
                        return true;
                    }
                    finalSize = currentSize + 1;
                    console.log(`[ObbyPlayerController] Continuing growth along ${newGrowthDirection} axis`);
                }
                
                // Replace wheel with new size and direction
                this.replaceWheelWithNewSize(wheel, wheelPos, finalSize, mechanicalBlockManager, newGrowthDirection);
                console.log(`[ObbyPlayerController] Made wheel bigger along ${newGrowthDirection} axis, new size: ${finalSize}`);
                return true;
            } else {
                // Make wheel smaller or delete if at minimum size
                const currentSize = wheel.getCurrentSize();
                if (currentSize === 1) {
                    // Delete the wheel when it's at minimum size
                    console.log(`[ObbyPlayerController] Deleting wheel at minimum size`);
                    mechanicalBlockManager.onMechanicalBlockRemoved(wheelPos);
                    return true;
                } else {
                    // Make wheel smaller
                    const newSize = currentSize - 1;
                    const growthDirection = this.calculateGrowthDirection(targetPosition, wheelPos);
                    this.replaceWheelWithNewSize(wheel, wheelPos, newSize, mechanicalBlockManager, growthDirection);
                    console.log(`[ObbyPlayerController] Made wheel smaller along ${growthDirection} axis, new size: ${newSize}`);
                    return true;
                }
            }
        }

        console.log(`[ObbyPlayerController] No mechanical entities found for resizing`);
        return false;
    }

    /**
     * Calculate the growth direction based on raycast intersection
     */
    private calculateGrowthDirection(targetPosition: Vector3Like, wheelPosition: Vector3Like): 'x' | 'z' {
        // Calculate direction from wheel center to click point
        const dx = Math.abs(targetPosition.x - wheelPosition.x);
        const dz = Math.abs(targetPosition.z - wheelPosition.z);
        
        // Grow along the axis with greater distance (where the player clicked)
        if (dx > dz) {
            return 'x';
        } else {
            return 'z';
        }
    }

    /**
     * Replace a wheel entity with a new one of different size and directional growth
     */
    private replaceWheelWithNewSize(
        oldWheel: any,
        position: Vector3Like,
        newSize: number,
        mechanicalBlockManager: any,
        growthDirection: 'x' | 'z' = 'x'
    ): void {
        console.log(`[ObbyPlayerController] Replacing wheel at ${position.x}, ${position.y}, ${position.z} with size ${newSize}`);
        
        // Store current state
        const currentPos = oldWheel.position;
        const currentRot = oldWheel.getCurrentRotation();
        const wasActivated = oldWheel.isActivated;
        
        // Remove old wheel safely
        mechanicalBlockManager.onMechanicalBlockRemoved(position);
        
        // Create new wheel with new size and growth direction
        const newWheel = new MechanicalWheelEntity(this.world, currentPos, currentRot, newSize, growthDirection);
        newWheel.spawn(this.world, currentPos);
        
        // Restore activation state
        if (wasActivated) {
            newWheel.activate();
        }
        
        // Register with manager
        mechanicalBlockManager.registerWheelEntity(currentPos, newWheel);
        
        console.log(`[ObbyPlayerController] Successfully replaced wheel with size ${newSize}`);
    }

    private handleBlockRemoval(playerEntity: ObbyPlayerEntity): boolean {
        const targetPosition = this.getTargetPositionForRemoval(playerEntity);
        if (targetPosition) {
            
            // Get player's active build plot (if any) for boundary checking
            const activeBuildPlot = this.plotBuildManager.getPlayerActiveBuildPlot(playerEntity.player.id);
            const plotId = activeBuildPlot !== null ? this.plotBuildManager.getPlotId(activeBuildPlot) : undefined;
            
                // First check for chunk lattice blocks at exact position (like regular blocks)
                const blockId = this.world.chunkLattice.getBlockId(targetPosition);
                
                if (blockId !== 0) {
                    // Block exists, try to remove it
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
                        return true; // Successfully removed block
                    }
                } else {
                    // No chunk lattice block found, check for mechanical entities at exact position
                    const mechanicalBlockManager = MechanicalBlockManager.getInstance();
                    
                    // Check for configurable mechanical entities at exact position
                    const configurableEntity = mechanicalBlockManager.getConfigurableEntityAt(targetPosition);
                    if (configurableEntity) {
                        console.log(`[ObbyPlayerController] Removing configurable mechanical entity at exact position ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z}`);
                        mechanicalBlockManager.onMechanicalBlockRemoved(targetPosition);
                        return true; // Successfully removed mechanical entity
                    }
                    
                    // Check for wheel entities at exact position
                    const wheelEntity = mechanicalBlockManager.getWheelEntityAt(targetPosition);
                    if (wheelEntity) {
                        console.log(`[ObbyPlayerController] Removing wheel entity at exact position ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z}`);
                        mechanicalBlockManager.onMechanicalBlockRemoved(targetPosition);
                        return true; // Successfully removed mechanical entity
                    }
                    
                    // Check for piston entities at exact position
                    const pistonEntity = mechanicalBlockManager.getPistonEntityAt(targetPosition);
                    if (pistonEntity) {
                        console.log(`[ObbyPlayerController] Removing piston entity at exact position ${targetPosition.x}, ${targetPosition.y}, ${targetPosition.z}`);
                        mechanicalBlockManager.onMechanicalBlockRemoved(targetPosition);
                        return true; // Successfully removed mechanical entity
                    }
                    
                    // Finally try to remove obstacles with the massive search zone (as fallback)
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
                                case 'mechanical_piston':
                                    entityType = 'mechanical-piston';
                                    break;
                                case 'mechanical_wheel':
                                    entityType = 'mechanical-wheel';
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
                        return true; // Successfully removed obstacle
                    }
                }
        } else {
            console.log("[ObbyPlayerController] No target position found for removal");
        }
        return false; // Nothing was removed
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
        let facingDirection = camera.facingDirection;
        
        // Fallback if camera facing direction is not available
        if (!facingDirection) {
            console.warn('[ObbyPlayerController] Camera facing direction not available, using entity rotation as fallback');
            // Calculate facing direction from entity rotation (similar to BlockPlacementManager)
            const rotation = entity.rotation;
            facingDirection = {
                x: Math.sin(rotation.y) * Math.cos(rotation.x),
                y: -Math.sin(rotation.x),
                z: Math.cos(rotation.y) * Math.cos(rotation.x)
            };
        }
        
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

        // Use camera's facing direction (or fallback)
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

    /**
     * Apply wheel physics (similar to conveyor physics but with circular motion)
     */
    private applyWheelPhysics(entity: DefaultPlayerEntity, input: PlayerInput, cameraOrientation: PlayerCameraOrientation, deltaTimeMs: number): void {
        const { w, a, s, d, sp, sh } = input;
        
        // Check if player is jumping - if so, cancel wheel forces
        if (sp && this.canJump(this)) {
            if (this.isGrounded && entity.linearVelocity.y > -0.001 && entity.linearVelocity.y <= 3) {
                // Clamp X/Z velocity to a reasonable value for jumps
                const maxJumpXZ = 6.0;
                entity.setLinearVelocity({
                    x: Math.max(Math.min(entity.linearVelocity.x, maxJumpXZ), -maxJumpXZ),
                    y: this.jumpVelocity,
                    z: Math.max(Math.min(entity.linearVelocity.z, maxJumpXZ), -maxJumpXZ)
                });
                // Clear wheel state when jumping to allow normal movement
                (entity as any).isOnWheel = false;
                
                return; // Exit early, don't apply wheel forces when jumping
            }
        }
        
        // Apply wheel movement by adding to current velocity (like conveyors)
        const currentVelocity = entity.linearVelocity;
        const wheelEntity = (entity as any).wheelEntity;
        const wheelStrength = (entity as any).wheelStrength ?? 4.0;
        
        // Get real-time wheel movement based on current position
        let scaledTangentX = 0;
        let scaledTangentZ = 0;
        
        if (wheelEntity && wheelEntity.getWheelMovementForPlayer) {
            const wheelMovement = wheelEntity.getWheelMovementForPlayer(entity.position);
            if (wheelMovement) {
                scaledTangentX = wheelMovement.x * wheelStrength;
                scaledTangentZ = wheelMovement.z * wheelStrength;
            }
        }
        
        // Add wheel movement to current velocity
        const newXVelocity = currentVelocity.x + scaledTangentX;
        const newZVelocity = currentVelocity.z + scaledTangentZ;
        
        entity.setLinearVelocity({
            x: Math.max(Math.min(newXVelocity, 24.0), -24.0),
            y: currentVelocity.y,
            z: Math.max(Math.min(newZVelocity, 24.0), -24.0)
        });
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
     * Check if the player has fallen below the thresholds - TWO STAGE SYSTEM
     */
    private checkForFall(entity: ObbyPlayerEntity): void {
        if (!entity || !entity.isSpawned) return;

        // Skip fall detection if disabled or on cooldown
        if (!this.fallDetectionEnabled || this.isRespawning) return;

        const playerY = entity.position.y;
        
        // TWO-STAGE FALL DETECTION
        if (playerY < this.deathThresholdY) {
            // Stage 2: Below -10, trigger actual respawn
            this.handleFall(entity);
        } else if (playerY < this.fallThresholdY) {
            // Stage 1: Below -2, force reset position immediately
            this.handleForceReset(entity);
        }
    }

    /**
     * Handle force reset at Y=-2 (first stage)
     */
    private handleForceReset(entity: ObbyPlayerEntity): void {
        if (!entity.isSpawned || !entity.world || this.isRespawning) return;
        
        console.log(`[ObbyPlayerController] Force reset triggered at Y=${entity.position.y} for player ${entity.player.id}`);
        
        // Get respawn position with smart priority system
        const respawnPos = this.getSmartRespawnPosition(entity);
        
        // Stop the player and reset position
        entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
        entity.setAngularVelocity({ x: 0, y: 0, z: 0 });
        entity.setPosition(respawnPos);
        
        // Restrict movement for 1.25 seconds
        this.restrictMovement(1250);
        
        // Show message
        entity.world.chatManager.sendPlayerMessage(entity.player, '⚡ Position reset!', 'FFAA00');
    }

    /**
     * Handle player fall (respawn at checkpoint) - Y=-10 (second stage)
     */
    public handleFall(entity: ObbyPlayerEntity): void {
        if (!entity.isSpawned || !entity.world || this.isDead) return;

        this.isDead = true;
        
        console.log(`[ObbyPlayerController] Full respawn triggered at Y=${entity.position.y} for player ${entity.player.id}`);
        
        // Stop the player
        entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
        entity.setAngularVelocity({ x: 0, y: 0, z: 0 });

        // Get respawn position with smart priority system
        const respawnPos = this.getSmartRespawnPosition(entity);
        entity.setPosition(respawnPos);
        
        // Restrict movement for 1.25 seconds
        this.restrictMovement(1250);
        
        // Show message
        entity.world.chatManager.sendPlayerMessage(entity.player, '💀 You fell! Respawning...', 'FF6B6B');
        
        // Reset respawning flag after a short delay
        setTimeout(() => {
            this.isRespawning = false;
            this.isDead = false;
        }, 1000);
    }

    /**
     * Respawn player at their last checkpoint
     */
    public respawnAtCheckpoint(entity: ObbyPlayerEntity): void {
        if (!entity || !entity.world) return;
        
        this.isDead = false;
        this.isRespawning = true;
        
        const respawnPosition = this.lastCheckpointPosition || { x: 0, y: 10, z: 0 };

        entity.setPosition(respawnPosition);
        entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
        entity.setAngularVelocity({ x: 0, y: 0, z: 0 });

        
        // Reset respawning flag after a short delay
        setTimeout(() => {
            this.isRespawning = false;
        }, 1000);
    }

    /**
     * Get smart respawn position with priority system - ENHANCED WITH START BLOCK DETECTION
     */
    private getSmartRespawnPosition(entity: ObbyPlayerEntity): Vector3Like {
        const playerId = entity.player.id;
        const playerState = this.playerStateManager.getCurrentState(playerId);
        
        console.log(`[RESPAWN_DEBUG] ===== SMART RESPAWN POSITION CALCULATION =====`);
        console.log(`[RESPAWN_DEBUG] Player ${playerId} state: ${playerState}`);
        console.log(`[RESPAWN_DEBUG] Player fell at: (${entity.position.x.toFixed(2)}, ${entity.position.y.toFixed(2)}, ${entity.position.z.toFixed(2)})`);
        
        // Check all possible respawn sources
        const controllerCheckpoint = this.lastCheckpointPosition;
        const entityCheckpoint = (entity as any).checkpoint;
        const entitySpawnPoint = (entity as any).spawnPoint;
        
        console.log(`[RESPAWN_DEBUG] Controller checkpoint: ${controllerCheckpoint ? `(${controllerCheckpoint.x}, ${controllerCheckpoint.y}, ${controllerCheckpoint.z})` : 'null'}`);
        console.log(`[RESPAWN_DEBUG] Entity checkpoint: ${entityCheckpoint ? `(${entityCheckpoint.x}, ${entityCheckpoint.y}, ${entityCheckpoint.z})` : 'null'}`);
        console.log(`[RESPAWN_DEBUG] Entity spawn point: ${entitySpawnPoint ? `(${entitySpawnPoint.x}, ${entitySpawnPoint.y}, ${entitySpawnPoint.z})` : 'null'}`);
        
        // Priority 1: Controller checkpoint (from checkpoint blocks)
        if (controllerCheckpoint) {
            console.log(`[RESPAWN_DEBUG] Using controller checkpoint: (${controllerCheckpoint.x}, ${controllerCheckpoint.y}, ${controllerCheckpoint.z})`);
            // Controller checkpoint is already properly centered, don't modify it
            console.log(`[RESPAWN_DEBUG] Final checkpoint respawn position: (${controllerCheckpoint.x}, ${controllerCheckpoint.y}, ${controllerCheckpoint.z})`);
            return controllerCheckpoint;
        }
        
        // Priority 2: Entity checkpoint (backup checkpoint system)
        if (entityCheckpoint) {
            console.log(`[RESPAWN_DEBUG] Using entity checkpoint: (${entityCheckpoint.x}, ${entityCheckpoint.y}, ${entityCheckpoint.z})`);
            // Entity checkpoint is already properly centered, don't modify it
            console.log(`[RESPAWN_DEBUG] Final entity checkpoint respawn position: (${entityCheckpoint.x}, ${entityCheckpoint.y}, ${entityCheckpoint.z})`);
            return entityCheckpoint;
        }
        
        // Priority 3: Entity spawn point (from start blocks)
        if (entitySpawnPoint) {
            console.log(`[RESPAWN_DEBUG] Using entity spawn point: (${entitySpawnPoint.x}, ${entitySpawnPoint.y}, ${entitySpawnPoint.z})`);
            // Don't modify spawn point - it's already correctly positioned by BlockBehaviorManager
            console.log(`[RESPAWN_DEBUG] Final spawn point respawn position: (${entitySpawnPoint.x}, ${entitySpawnPoint.y}, ${entitySpawnPoint.z})`);
            return {
                x: entitySpawnPoint.x,
                y: entitySpawnPoint.y,
                z: entitySpawnPoint.z
            };
        }
        
        // Priority 4: Search for nearby start blocks (ENHANCED LOGIC)
        console.log(`[RESPAWN_DEBUG] No pre-set spawn points found, searching for nearby start blocks`);
        const nearbyStartBlock = this.findNearbyStartBlock(entity.position);
        if (nearbyStartBlock) {
            console.log(`[RESPAWN_DEBUG] Found nearby start block at (${nearbyStartBlock.x}, ${nearbyStartBlock.y}, ${nearbyStartBlock.z}), using as respawn point`);
            const respawnPos = {
                x: nearbyStartBlock.x + 0.5,  // Center on block
                y: nearbyStartBlock.y + 1.8,  // Above block with clearance
                z: nearbyStartBlock.z + 0.5   // Center on block
            };
            console.log(`[RESPAWN_DEBUG] Final start block respawn position: (${respawnPos.x}, ${respawnPos.y}, ${respawnPos.z})`);
            return respawnPos;
        }
        
        // Priority 5: Lobby checkpoints (for lobby/build mode)
        if (playerState === PlayerGameState.LOBBY || playerState === PlayerGameState.BUILDING) {
            console.log(`[RESPAWN_DEBUG] No start blocks found, calculating closest lobby checkpoint`);
            // Use current position but add +10 to Y for checkpoint calculation
            const checkpointCalcPos = { 
                x: entity.position.x, 
                y: entity.position.y + 10, 
                z: entity.position.z 
            };
            const respawnPos = this.calculateClosestLobbyCheckpoint(checkpointCalcPos);
            console.log(`[RESPAWN_DEBUG] Final lobby checkpoint respawn position: (${respawnPos.x}, ${respawnPos.y}, ${respawnPos.z})`);
            return respawnPos;
        }
        
        // Priority 6: Default fallback
        console.log(`[RESPAWN_DEBUG] Using default fallback position: (0, 10, 0)`);
        console.log(`[RESPAWN_DEBUG] ===== END SMART RESPAWN POSITION CALCULATION =====`);
        return { x: 0, y: 10, z: 0 };
    }
    
    /**
     * Restrict player movement for a specified duration
     */
    public restrictMovement(durationMs: number): void {
        this.movementRestricted = true;
        this.movementRestrictedUntil = Date.now() + durationMs;
        console.log(`[ObbyPlayerController] Movement restricted for ${durationMs}ms`);
    }

    /**
     * Set the fall threshold Y position (first stage at -2)
     */
    public setFallThreshold(y: number): void {
        this.fallThresholdY = y;
    }
    
    /**
     * Set the death threshold Y position (second stage at -10)
     */
    public setDeathThreshold(y: number): void {
        this.deathThresholdY = y;
    }

    /**
     * Set a checkpoint position that the player will respawn at when falling
     */
    public setCheckpoint(position: Vector3Like): void {
        // Don't update the checkpoint if we're currently respawning
        if (this.isRespawning) return;

        // Make sure we store a clean copy of the position
        this.lastCheckpointPosition = {
            x: position.x,
            y: position.y + 0.5, // Add a small offset to avoid ground clipping
            z: position.z
        };
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
     * Find a nearby start block that the player might have fallen from - ENHANCED DETECTION
     */
    private findNearbyStartBlock(playerPosition: Vector3Like): Vector3Like | null {
        const searchRadius = 15; // Search within 15 blocks horizontally
        const searchHeight = 20; // Search up to 20 blocks above the player
        
        console.log(`[RESPAWN_DEBUG] Searching for start blocks near player position (${playerPosition.x.toFixed(2)}, ${playerPosition.y.toFixed(2)}, ${playerPosition.z.toFixed(2)})`);
        console.log(`[RESPAWN_DEBUG] Search parameters: radius=${searchRadius}, height=${searchHeight}`);
        
        let closestStartBlock: Vector3Like | null = null;
        let closestDistance = Number.POSITIVE_INFINITY;
        
        // Search in a cylinder above the player's position
        for (let y = 0; y <= searchHeight; y++) {
            for (let x = -searchRadius; x <= searchRadius; x++) {
                for (let z = -searchRadius; z <= searchRadius; z++) {
                    // Skip positions outside the circular search area
                    const horizontalDistance = Math.sqrt(x * x + z * z);
                    if (horizontalDistance > searchRadius) continue;
                    
                    const checkPos = {
                        x: Math.floor(playerPosition.x) + x,
                        y: Math.floor(playerPosition.y) + y,
                        z: Math.floor(playerPosition.z) + z
                    };
                    
                    const blockId = this.world.chunkLattice.getBlockId(checkPos);
                    if (blockId === 100) { // Start block ID
                        // Calculate 3D distance to find the closest start block
                        const totalDistance = Math.sqrt(x * x + y * y + z * z);
                        console.log(`[RESPAWN_DEBUG] Found start block at (${checkPos.x}, ${checkPos.y}, ${checkPos.z}), distance: ${totalDistance.toFixed(2)}`);
                        
                        if (totalDistance < closestDistance) {
                            closestDistance = totalDistance;
                            closestStartBlock = checkPos;
                            console.log(`[RESPAWN_DEBUG] New closest start block found at distance ${totalDistance.toFixed(2)}`);
                        }
                    }
                }
            }
        }
        
        if (closestStartBlock) {
            console.log(`[RESPAWN_DEBUG] Selected closest start block: (${closestStartBlock.x}, ${closestStartBlock.y}, ${closestStartBlock.z}) at distance ${closestDistance.toFixed(2)}`);
        } else {
            console.log(`[RESPAWN_DEBUG] No start blocks found within search radius`);
        }
        
        return closestStartBlock;
    }
    
    /**
     * Calculate the closest lobby checkpoint to a given position - ENHANCED CALCULATION
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
        return { x: closest.x, y: closest.y + 2, z: closest.z }; // Add +2 for safe spawning height
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

    // ============== ADVANCED VINE CLIMBING METHODS ==============

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


} 