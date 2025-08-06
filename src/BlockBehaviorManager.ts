import { Vector3, World, Player } from "hytopia";
import { ObbyPlayerEntity } from "./ObbyPlayerEntity";
import { blockRegistry } from "./BlockRegistry";
import { MechanicalBlockManager } from "./MechanicalBlockManager";

export interface BlockBehavior {
    id: number;
    name: string;
    onStandingOn?: (player: ObbyPlayerEntity, world: World, blockPosition: Vector3) => void;
    onTouch?: (player: ObbyPlayerEntity, world: World, blockPosition: Vector3) => void;
    onBreak?: (player: Player, world: World, blockPosition: Vector3) => boolean; // return false to prevent breaking
    friction?: number; // Custom friction value
    bounceForce?: number; // Bounce/jump force
    isDeadly?: boolean;
    isSlippery?: boolean;
    isStartBlock?: boolean;
    isSandy?: boolean; // Flag for sand physics
    disappearAfterTime?: number; // Time in ms before block disappears
    regenerateAfterTime?: number; // Time in ms before block regenerates
}

export class BlockBehaviorManager {
    private static instance: BlockBehaviorManager;
    private behaviors: Map<number, BlockBehavior> = new Map();
    private disappearingBlocks: Map<string, { blockId: number, disappearTime: number, regenerateTime?: number }> = new Map();
    private playerLastStandingBlock: Map<string, number> = new Map(); // Track what block each player was last standing on
    private mechanicalBlockManager: MechanicalBlockManager;
    
    private constructor() {
        this.mechanicalBlockManager = MechanicalBlockManager.getInstance();
        this.initializeBehaviors();
    }

    public static getInstance(): BlockBehaviorManager {
        if (!BlockBehaviorManager.instance) {
            BlockBehaviorManager.instance = new BlockBehaviorManager();
        }
        return BlockBehaviorManager.instance;
    }

    private initializeBehaviors(): void {
        console.log('[BlockBehaviorManager] Initializing behaviors from BlockRegistry...');
        
        // Get all blocks with special behaviors from the registry
        const blocksWithBehaviors = blockRegistry.getAllBlocks().filter(block => 
            block.isStartBlock || block.isGoalBlock || block.isCheckpoint || 
            block.isSlippery || block.isSandy || block.isDeadly || 
            block.isClimbable || block.disappearAfterTime || block.friction
        );
        
        console.log(`[BlockBehaviorManager] Found ${blocksWithBehaviors.length} blocks with behaviors`);
        
        // Debug: Check if conveyor block is in the registry
        const conveyorBlock = blockRegistry.getBlock(104);
        console.log(`[BlockBehaviorManager] Conveyor block in registry:`, conveyorBlock);
        
        // Debug: List all blocks with behaviors
        console.log(`[BlockBehaviorManager] Blocks with behaviors:`, blocksWithBehaviors.map(b => `${b.name} (ID: ${b.id})`));
        
        // Set up behaviors for each block based on registry properties
        for (const block of blocksWithBehaviors) {
            const behavior: BlockBehavior = {
                id: block.id,
                name: block.name,
                friction: block.friction,
                bounceForce: block.bounceForce,
                isDeadly: block.isDeadly,
                isSlippery: block.isSlippery,
                isSandy: block.isSandy,
                disappearAfterTime: block.disappearAfterTime,
                regenerateAfterTime: block.regenerateAfterTime
            };
            
            // Add specific behaviors based on block type
            if (block.isStartBlock) {
                behavior.isStartBlock = true;
                behavior.onStandingOn = (player, world, blockPos) => {
                    // Set spawn point for this player - center on the block
                    (player as any).spawnPoint = { 
                        x: blockPos.x + 0.5,  // Center of block
                        y: blockPos.y + 1.8,  // Above block with clearance
                        z: blockPos.z + 0.5   // Center of block
                    };
                    console.log(`[BlockBehaviorManager] Set spawn point for player on start block at (${blockPos.x + 0.5}, ${blockPos.y + 1.8}, ${blockPos.z + 0.5})`);
                };
            }
            
            if (block.isGoalBlock) {
                behavior.onStandingOn = (player, world, blockPos) => {
                    console.log('[BlockBehaviorManager] Player reached goal!');
                    
                    // Check if player is in play mode
                    const playerStateManager = require('./PlayerGameState').PlayerStateManager.getInstance();
                    const currentState = playerStateManager.getCurrentState(player.player.id);
                    
                    if (currentState === require('./PlayerGameState').PlayerGameState.PLAYING) {
                        // Player is in play mode - trigger completion flow via their session
                        const obbyPlayManager = require('./ObbyPlayManager').ObbyPlayManager.getInstance();
                        console.log('[BlockBehaviorManager] Player in play mode - triggering completion');
                        
                        // Get the player's session and trigger completion
                        const playerSession = obbyPlayManager.getPlayerSession(player.player.id);
                        if (playerSession) {
                            playerSession.handlePlayerFinished().catch(error => {
                                console.error(`[BlockBehaviorManager] Error handling player finish:`, error);
                            });
                        } else {
                            console.warn(`[BlockBehaviorManager] No session found for player ${player.player.id}`);
                            world.chatManager.sendPlayerMessage(player.player, '❌ Error completing course - no active session found!', 'FF0000');
                        }
                    } else {
                        // Player not in play mode - just show message
                        world.chatManager.sendPlayerMessage(player.player, '🎉 You reached the goal! Enter play mode to complete the course.', '00FF00');
                    }
                };
            }
            
            if (block.isCheckpoint) {
                behavior.onStandingOn = (player, world, blockPos) => {
                    // Check if player is in play mode
                    const playerStateManager = require('./PlayerGameState').PlayerStateManager.getInstance();
                    const currentState = playerStateManager.getCurrentState(player.player.id);
                    
                    if (currentState === require('./PlayerGameState').PlayerGameState.PLAYING) {
                        // Player is in play mode - set checkpoint
                        (player as any).checkpoint = { x: blockPos.x, y: blockPos.y + 1, z: blockPos.z };
                        
                        // Also set it on the controller for proper respawn handling
                        const controller = (player as any).controller;
                        if (controller && typeof controller.setCheckpoint === 'function') {
                            controller.setCheckpoint({ x: blockPos.x, y: blockPos.y + 1, z: blockPos.z });
                        }
                        
                        // Show animated checkpoint text
                        player.showSuccess('CHECKPOINT!', 'Progress saved', 2000);
                        
                        console.log(`[BlockBehaviorManager] Checkpoint set at: ${blockPos.x}, ${blockPos.y}, ${blockPos.z} for player in play mode`);
                    } else {
                        // Player not in play mode - show message
                        world.chatManager.sendPlayerMessage(player.player, '⚠️ Enter play mode to activate checkpoints', 'FFA500');
                        console.log(`[BlockBehaviorManager] Checkpoint ignored - player not in play mode`);
                    }
                };
            }
            
            if (block.isSlippery) {
                behavior.onStandingOn = (player, world, blockPos) => {
                    // Set a flag on the player to use ice physics
                    (player as any).isOnIce = true;
                    console.log('[BlockBehaviorManager] Ice flag set to true');
                };
            }
            
            if (block.isSandy) {
                behavior.onStandingOn = (player, world, blockPos) => {
                    // Set a flag on the player to use sand physics
                    (player as any).isOnSand = true;
                    console.log('[BlockBehaviorManager] Sand flag set to true');
                };
            }
            
            if (block.isClimbable) {
                // Vines - climbable walls
                // Note: No onStandingOn behavior - climbing is handled by proximity detection
                // This prevents climbing when standing on top of vine blocks
            }
            
            if (block.isDeadly) {
                behavior.onTouch = (player, world, blockPos) => {
                    // Get spawn point or checkpoint
                    const spawnPoint = (player as any).checkpoint || (player as any).spawnPoint || { x: 0, y: 10, z: 0 };
                    
                    // Reset player to spawn/checkpoint
                    player.setPosition(spawnPoint);
                    player.applyImpulse({ x: 0, y: 5, z: 0 });
                    world.chatManager.sendPlayerMessage(player.player, '💀 You touched deadly blocks!', 'FF0000');
                };
            }
            
            if (block.disappearAfterTime) {
                behavior.onTouch = (player, world, blockPos) => {
                    const blockKey = `${blockPos.x},${blockPos.y},${blockPos.z}`;
                    
                    // Always trigger disappearing, even if already triggered
                    this.disappearingBlocks.set(blockKey, {
                        blockId: block.id,
                        disappearTime: Date.now() + block.disappearAfterTime!,
                        regenerateTime: Date.now() + block.disappearAfterTime! + (block.regenerateAfterTime || 3000)
                    });
                                    
                    // Schedule block removal
                    setTimeout(() => {
                        world.chunkLattice.setBlock(blockPos, 0); // Remove block (air)
                        
                        // Schedule block regeneration
                        setTimeout(() => {
                            world.chunkLattice.setBlock(blockPos, block.id); // Restore block
                            this.disappearingBlocks.delete(blockKey);
                        }, block.regenerateAfterTime || 3000);
                    }, block.disappearAfterTime);
                };
            }
            

            
            this.behaviors.set(block.id, behavior);
            console.log(`[BlockBehaviorManager] Registered behavior for ${block.name} (ID: ${block.id})`);
        }
        
        // Also register basic blocks without special behaviors (for completeness)
        const basicBlocks = blockRegistry.getAllBlocks().filter(block => 
            !block.isStartBlock && !block.isGoalBlock && !block.isCheckpoint && 
            !block.isSlippery && !block.isSandy && !block.isDeadly && 
            !block.isClimbable && !block.disappearAfterTime && !block.friction &&
            !this.behaviors.has(block.id) // Don't overwrite blocks that already have behaviors!
        );
        
        for (const block of basicBlocks) {
            if (block.buildable) { // Only register buildable blocks
                this.behaviors.set(block.id, {
                    id: block.id,
                    name: block.name
                });
            }
        }

        // Conveyor-z- (south/negative Z) behavior
        this.behaviors.set(104, {
            id: 104,
            name: "conveyor-z-",
            onTouch: (player, world) => {
                (player as any).isOnConveyor = true;
                (player as any).conveyorDirection = "forward"; // negative Z
                (player as any).conveyorStrength = 4.0;
            },
        });
        // Conveyor-z+ (north/positive Z) behavior
        this.behaviors.set(105, {
            id: 105,
            name: "conveyor-z+",
            onTouch: (player, world) => {
                (player as any).isOnConveyor = true;
                (player as any).conveyorDirection = "backward"; // positive Z
                (player as any).conveyorStrength = 4.0;
            },
        });
        // Conveyor-x- (west/negative X) behavior
        this.behaviors.set(109, {
            id: 109,
            name: "conveyor-x-",
            onTouch: (player, world) => {
                (player as any).isOnConveyor = true;
                (player as any).conveyorDirection = "left"; // negative X
                (player as any).conveyorStrength = 4.0;
            },
        });
        // Conveyor-x+ (east/positive X) behavior
        this.behaviors.set(110, {
            id: 110,
            name: "conveyor-x+",
            onTouch: (player, world) => {
                (player as any).isOnConveyor = true;
                (player as any).conveyorDirection = "right"; // positive X
                (player as any).conveyorStrength = 4.0;
            },
        });
        
        console.log(`[BlockBehaviorManager] Initialized ${this.behaviors.size} total block behaviors`);
    }

    public checkBlockBehavior(player: ObbyPlayerEntity, world: World): void {
        if (!player.isSpawned) return;

        // Always check for vine collisions first (regardless of what block player is standing on)
        this.checkVineCollision(player, world);

        // Get the block the player is standing on
        const playerPos = player.position;
        const blockBelowPos = new Vector3(
            Math.floor(playerPos.x),
            Math.floor(playerPos.y - 1.5), // Check block below player's feet
            Math.floor(playerPos.z)
        );

        const blockBelowId = world.chunkLattice.getBlockId(blockBelowPos);
        if (!blockBelowId || blockBelowId === 0) return;

        // For conveyor blocks, use stricter detection to prevent triggering when jumping over
        let isOnConveyorBlock = false;
        if (blockBelowId === 104 || blockBelowId === 105 || blockBelowId === 109 || blockBelowId === 110) {
            // Only trigger conveyor if player is close to the ground (not jumping high)
            const conveyorBlockPos = new Vector3(
                Math.floor(playerPos.x),
                Math.floor(playerPos.y - 1.0), // Smaller offset for conveyors
                Math.floor(playerPos.z)
            );
            const conveyorBlockId = world.chunkLattice.getBlockId(conveyorBlockPos);
            const isGrounded = Math.abs(player.linearVelocity.y) < 2.0; // Not jumping/falling fast
            const isCloseToGround = (playerPos.y - Math.floor(playerPos.y)) < 1.2; // Within 1.2 units of block surface
            isOnConveyorBlock = (conveyorBlockId === blockBelowId) && isGrounded && isCloseToGround;
            // if (isOnConveyorBlock) {
            //     console.log(`[BlockBehaviorManager] Player ${player.player.id} standing on conveyor block ID ${blockBelowId} at ${blockBelowPos.x}, ${blockBelowPos.y}, ${blockBelowPos.z}`);
            // }
        }
        // Clear conveyor state if not on conveyor block
        if (!isOnConveyorBlock) {
            (player as any).isOnConveyor = false;
            (player as any).conveyorDirection = undefined;
            (player as any).conveyorStrength = undefined;
        }

        const behavior = this.behaviors.get(blockBelowId);
        

        
        // Check if player is standing on vine blocks (this should NOT trigger climbing)
        const blockBelowPlayer = new Vector3(
            Math.floor(playerPos.x),
            Math.floor(playerPos.y - 1), // Check block directly below player
            Math.floor(playerPos.z)
        );
        const blockBelowPlayerId = world.chunkLattice.getBlockId(blockBelowPlayer);
        const isStandingOnVines = blockBelowPlayerId === 15;
        
        // Only set climbing to false if not standing on vines (vine collision check already handled this)
        if (isStandingOnVines) {
            // Unlock rotation when climbing stops
            (player as any).climbingRotationLocked = false;
            (player as any).climbingStartRotation = null;
            (player as any).isClimbing = false;
        }
        
        if (!behavior) {
            // Clear ALL special movement flags when standing on any block without special behavior
            (player as any).isOnIce = false;
            (player as any).isOnSand = false;
            (player as any).isOnConveyor = false;
            return;
        }

        const playerId = player.player.id;
        const lastBlockId = this.playerLastStandingBlock.get(playerId);

        // Only trigger onStandingOn if we just stepped on this block type
        if (behavior.onStandingOn && lastBlockId !== blockBelowId) {
            behavior.onStandingOn(player, world, blockBelowPos);
        }

        // Always update spawn point when standing on start block, even if we've been on it before
        // This ensures players can reset their spawn point by revisiting the start block
        if (behavior.isStartBlock) {
            (player as any).spawnPoint = { 
                x: blockBelowPos.x + 0.5,  // Center of block
                y: blockBelowPos.y + 1.8,  // Above block with clearance
                z: blockBelowPos.z + 0.5   // Center of block
            };
            console.log(`[BlockBehaviorManager] Updated spawn point for player on start block at (${blockBelowPos.x + 0.5}, ${blockBelowPos.y + 1.8}, ${blockBelowPos.z + 0.5})`);
        }

        // Trigger onTouch for continuous effects - but use stricter rules for conveyors
        if (behavior.onTouch) {
            // For conveyor blocks, only trigger if strict conditions are met
            if (blockBelowId === 104 || blockBelowId === 105 || blockBelowId === 109 || blockBelowId === 110) {
                if (isOnConveyorBlock) {
                    behavior.onTouch(player, world, blockBelowPos);
                }
            } else {
                // For all other blocks, use normal behavior
                behavior.onTouch(player, world, blockBelowPos);
            }
        }

        // Update last standing block
        this.playerLastStandingBlock.set(playerId, blockBelowId);
        
        // Set or clear physics flags based on current block
        // Don't set ice/sand states if player is jumping (to allow climbing transitions)
        const isJumping = player.linearVelocity.y > 1.0;
                
        if (!isJumping) {
            if (behavior.isSlippery) {
                (player as any).isOnIce = true;
                (player as any).isOnSand = false;
                (player as any).isOnConveyor = false;
            } else if (behavior.isSandy) {
                (player as any).isOnIce = false;
                (player as any).isOnSand = true;
                (player as any).isOnConveyor = false;
            } else if (blockBelowId === 104 || blockBelowId === 105 || blockBelowId === 109 || blockBelowId === 110) { // Conveyor blocks (all directions)
                // Conveyor state is already set by behavior.onTouch above
                (player as any).isOnIce = false;
                (player as any).isOnSand = false;
                // Keep isOnConveyor = true (set by onTouch)
            } else {
                (player as any).isOnIce = false;
                (player as any).isOnSand = false;
                (player as any).isOnConveyor = false;
            }
        }
    }

    private checkVineCollision(player: ObbyPlayerEntity, world: World): void {
        const playerPos = player.position;
        const wasClimbing = (player as any).isClimbing;
        
        // Get player's facing direction for logging
        const playerRotation = player.rotation;
        const playerYaw = Math.atan2(2 * (playerRotation.w * playerRotation.y + playerRotation.x * playerRotation.z), 
                                      1 - 2 * (playerRotation.y * playerRotation.y + playerRotation.z * playerRotation.z));
        const playerYawDegrees = (playerYaw * 180 / Math.PI + 360) % 360;
        
        // Get player velocity for context
        const velocity = player.linearVelocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        
        // Check for vines in all directions around the player
        const checkPositions = [
            // Same level - sides only
            { pos: new Vector3(Math.floor(playerPos.x + 1), Math.floor(playerPos.y), Math.floor(playerPos.z)), name: "Right", relativeDir: "East" },
            { pos: new Vector3(Math.floor(playerPos.x - 1), Math.floor(playerPos.y), Math.floor(playerPos.z)), name: "Left", relativeDir: "West" },
            { pos: new Vector3(Math.floor(playerPos.x), Math.floor(playerPos.y), Math.floor(playerPos.z + 1)), name: "Front", relativeDir: "North" },
            { pos: new Vector3(Math.floor(playerPos.x), Math.floor(playerPos.y), Math.floor(playerPos.z - 1)), name: "Back", relativeDir: "South" },
            
            // Check one level up - sides only
            { pos: new Vector3(Math.floor(playerPos.x + 1), Math.floor(playerPos.y + 1), Math.floor(playerPos.z)), name: "Right+1", relativeDir: "East+1" },
            { pos: new Vector3(Math.floor(playerPos.x - 1), Math.floor(playerPos.y + 1), Math.floor(playerPos.z)), name: "Left+1", relativeDir: "West+1" },
            { pos: new Vector3(Math.floor(playerPos.x), Math.floor(playerPos.y + 1), Math.floor(playerPos.z + 1)), name: "Front+1", relativeDir: "North+1" },
            { pos: new Vector3(Math.floor(playerPos.x), Math.floor(playerPos.y + 1), Math.floor(playerPos.z - 1)), name: "Back+1", relativeDir: "South+1" }
        ];
        
        let foundVine = false;
        let vineLocations = [];
        let vineDirection = { x: 0, z: 0 };
        
        for (const check of checkPositions) {
            const blockId = world.chunkLattice.getBlockId(check.pos);
            if (blockId === 15) { // Vine block
                vineLocations.push(check.name);
                
                // Calculate direction FROM player TO vine position (not vine orientation)
                const directionToVine = {
                    x: check.pos.x + 0.5 - playerPos.x, // Use center of vine block
                    z: check.pos.z + 0.5 - playerPos.z
                };
                
                // Calculate angle player should face to look AT the vine
                const angleToVine = Math.atan2(directionToVine.x, directionToVine.z);
                const angleToVineDegrees = (angleToVine * 180 / Math.PI + 360) % 360;
                const angleDifference = Math.abs(((playerYawDegrees - angleToVineDegrees + 180) % 360) - 180);
                
                let playerRelativeDirection = "";
                let isFacingVine = false;
                
                // Player must be facing TOWARD the vine (within 45 degrees) to climb
                // Note: angleDifference near 180° means facing TOWARD the target
                if (angleDifference > 135) {
                    playerRelativeDirection = "FACING_VINE";
                    isFacingVine = true;
                } else if (angleDifference < 45) {
                    playerRelativeDirection = "BACK_TO_VINE";
                } else {
                    playerRelativeDirection = "SIDE_TO_VINE";
                }
                
                // Only allow climbing if player is facing toward the vine
                if (isFacingVine) {
                    foundVine = true;
                    vineDirection = directionToVine; // Use the calculated direction to vine
                    // Valid climb: Player facing toward vine
                } else {
                    // No climb: Player not facing toward vine
                }
            }
        }
        
        if (foundVine && !wasClimbing) {
            // Starting climb
            (player as any).isClimbing = true;
        } else if (foundVine && wasClimbing) {
            // Continuing climb
        } else if (!foundVine && wasClimbing) {
            // Stopping climb - no more vines detected
            (player as any).isClimbing = false;
        }
        
        // Log when vines are detected but no action taken
        if (foundVine && vineLocations.length > 0) {
            // Vine climbing state updated
        }
    }

    private makePlayerFaceVineWall(player: ObbyPlayerEntity, vineDirection: { x: number, z: number }): void {
        // Calculate the yaw angle to face the vine wall
        // The player should face TOWARD the vine wall (opposite of the direction vector)
        const targetYaw = Math.atan2(-vineDirection.x, -vineDirection.z);
        
        // Convert yaw to quaternion rotation
        const halfYaw = targetYaw / 2;
        const rotation = {
            x: 0,
            y: Math.fround(Math.sin(halfYaw)),
            z: 0,
            w: Math.fround(Math.cos(halfYaw)),
        };
        
        // Apply the rotation to make player face the vine wall
        player.setRotation(rotation);
        
        // Store this rotation as the locked climbing rotation
        (player as any).climbingRotationLocked = true;
        (player as any).climbingStartRotation = rotation;
        
    }

    public getBehavior(blockId: number): BlockBehavior | undefined {
        return this.behaviors.get(blockId);
    }

    public addBehavior(behavior: BlockBehavior): void {
        this.behaviors.set(behavior.id, behavior);
    }

    public removeBehavior(blockId: number): void {
        this.behaviors.delete(blockId);
    }

    // Clean up player data when they leave
    public cleanupPlayer(playerId: string): void {
        this.playerLastStandingBlock.delete(playerId);
    }
    
    // Clear checkpoint for a specific player
    public clearPlayerCheckpoint(player: ObbyPlayerEntity): void {
        if (player) {
            // Clear checkpoint on player object
            (player as any).checkpoint = null;
            
            // Clear checkpoint on controller
            const controller = (player as any).controller;
            if (controller && typeof controller.setCheckpoint === 'function') {
                controller.setCheckpoint(null);
            }
            
            console.log(`[BlockBehaviorManager] Cleared checkpoint for player ${player.player.id}`);
        }
    }
} 