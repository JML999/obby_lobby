import {
  Entity,
  EntityOptions,
  PathfindingEntityController,
  RigidBodyType,
  World,
  EntityEvent,
  ColliderShape,
  PlayerEntity,
  Audio,
  Vector3,
} from 'hytopia';

interface Vector3Like {
  x: number;
  y: number;
  z: number;
}
import type { EventPayloads } from 'hytopia';
import { ObbyPlayerEntity } from '../ObbyPlayerEntity';
import { CollisionGroups } from '../CollisionGroups';
import { BlockBehaviorManager } from '../BlockBehaviorManager';

export class ZombieEntity extends Entity {
  private pathfindingController: PathfindingEntityController;
  
  // Aggro system
  private aggroTarget: ObbyPlayerEntity | null = null;
  private isAggressive: boolean = false;
  private aggroRadius: number = 3.0;
  
  // Attack system
  private attackDamage: number = 10;
  private attackCooldownMs: number = 2000;
  private lastAttackTime: number = 0;
  
  // Pathfinding throttling (like Frontiers)
  private pathfindAccumulatorMs: number = 0;
  private isPathfinding: boolean = false;
  private readonly PATHFIND_THRESHOLD_MS = 3000; // 3 seconds between pathfind calls
  
  // Respawn system
  private originalSpawnPosition: Vector3Like | null = null;
  private fallDetectionY: number = -2; // Y level considered "fallen off cliff" 
  private hasStartedFallRespawn: boolean = false;
  
  // Audio system
  private attackAudio?: Audio;
  private groanAudio?: Audio;
  private groanTimer: number = 0;
  private groanInterval: number = 5000;

  // Block physics (similar to player properties)
  private isOnIce: boolean = false;
  private isOnSand: boolean = false;
  private isOnConveyor: boolean = false;
  private conveyorDirection?: string;
  private conveyorStrength?: number;

  constructor(options: Partial<EntityOptions> = {}) {
    
    // Ensure zombie tags are always present, even if options override them
    const zombieTags = ['zombie', 'enemy'];
    const optionTags = options.tags || [];
    const allTags = [...new Set([...zombieTags, ...optionTags])]; // Merge and deduplicate
    
    // Remove tags from options to prevent override, then add back at the end
    const { tags: _ignoredTags, ...optionsWithoutTags } = options;
    
    super({
      controller: new PathfindingEntityController(),
      name: 'Zombie',
      modelUri: 'models/npcs/zombie.gltf',
      modelScale: 0.75,
      rigidBodyOptions: {
        type: RigidBodyType.DYNAMIC,
        enabledRotations: { x: false, y: true, z: false },
        ccdEnabled: true,
      },
      ...optionsWithoutTags, // Spread options without tags
      tags: allTags, // Always set zombie tags last to prevent override
    });

    this.pathfindingController = this.controller as PathfindingEntityController;
    
    // Set up animations exactly like the SDK example
    this.pathfindingController.idleLoopedAnimations = ['idle'];
    this.pathfindingController.moveLoopedAnimations = ['walk'];

    // Set up event handlers
    this.on(EntityEvent.SPAWN, this.onSpawn.bind(this));
    this.on(EntityEvent.TICK, this.onTick.bind(this));
    this.on(EntityEvent.ENTITY_COLLISION, this.onEntityCollision.bind(this));

  }

  /**
   * Override spawn to call parent
   */
  public spawn(world: World, position?: Vector3): void {
    // Call parent spawn first
    super.spawn(world, position);
  }

  private onSpawn(): void {
    // Store original spawn position for respawning
    this.originalSpawnPosition = { ...this.position };
    this.hasStartedFallRespawn = false;
    
    this.setupAggroSensor();
    this.initializeAudio();
  }

  private onTick(payload: EventPayloads[EntityEvent.TICK]): void {
    if (!this.world) return;

    // Check for fall detection first
    this.checkFallRespawn();

    // Check block physics (ice, sand, conveyor, etc.)
    this.checkBlockPhysics();

    // Apply block physics effects
    this.applyBlockPhysics(payload.tickDeltaMs);

    // Update groan timer
    this.updateGroan(payload.tickDeltaMs);

    // Update pathfinding accumulator
    this.pathfindAccumulatorMs += payload.tickDeltaMs;

    // Check if pathfinding should be considered complete
    this.checkPathfindingCompletion();

    // IMPORTANT: Always update AI regardless of aggro state
    // This ensures conveyor logic runs even for passive zombies
    this.updateAI();
  }

  private setupAggroSensor(): void {
    // Create aggro sensor exactly like we had before
    this.createAndAddChildCollider({
      shape: ColliderShape.BALL,
      radius: this.aggroRadius,
      isSensor: true,
      tag: 'aggroSensor',
      onCollision: (other: any, started: boolean) => {
        if (other instanceof PlayerEntity) {
          if (started) {
            this.aggroTarget = other as ObbyPlayerEntity;
            this.isAggressive = true;
            this.onBecomeAggressive();
          } else {
            if (this.aggroTarget === other) {
              this.aggroTarget = null;
              this.isAggressive = false;
            }
          }
        }
      }
    });
  }

  private onEntityCollision(payload: EventPayloads[EntityEvent.ENTITY_COLLISION]): void {
    const { otherEntity, started } = payload;

    // Only trigger on collision start with players
    if (!started || !(otherEntity instanceof PlayerEntity)) {
      return;
    }

    // Check if we can attack (cooldown + aggression check)
    if (this.canAttack()) {
      this.attackPlayer(otherEntity as ObbyPlayerEntity);
    }
  }

  private updateAI(): void {
    // console.log(`[ZombieEntity] updateAI called - isOnConveyor: ${this.isOnConveyor}, conveyorDirection: ${this.conveyorDirection}, isAggressive: ${this.isAggressive}`);
    
    // Handle conveyor movement - completely disable controller
    if (this.isOnConveyor) {
      // Stop any current pathfinding
      if (this.isPathfinding) {
        this.isPathfinding = false;
      }
      
      // Stop any current movement
      this.pathfindingController.stopMove();
      
      // Disable the controller completely while on conveyor
      // This allows pure physics to take over
      return;
    }
    
    if (!this.aggroTarget || !this.isAggressive) {
      // console.log('[ZombieEntity] No aggro target or not aggressive - idle');
      return;
    }

    const moveSpeed = this.getMoveSpeed();
    const targetDistance = this.getDistanceToTarget();

    // Use Frontiers approach: close range = simple move with cliff check, far range = pathfind with throttling
    if (targetDistance < 8 || (!this.isPathfinding && this.pathfindAccumulatorMs < this.PATHFIND_THRESHOLD_MS)) {
      // Close range or waiting for pathfind cooldown - use simple movement with cliff detection
      if (this.isCliffInDirection(this.aggroTarget.position)) {
        // Cliff detected - use pathfinding instead for safety
        // Use move() for pathfinding since pathfindTo doesn't exist in current SDK
        this.pathfindingController.move(this.aggroTarget.position, moveSpeed);
        this.pathfindingController.face(this.aggroTarget.position, moveSpeed * 2);
        this.isPathfinding = true;
        
        // We'll handle completion detection in the tick loop
      } else {
        // Safe to use simple movement
        this.pathfindingController.move(this.aggroTarget.position, moveSpeed);
        this.pathfindingController.face(this.aggroTarget.position, moveSpeed * 2);
      }
    } else if (this.pathfindAccumulatorMs >= this.PATHFIND_THRESHOLD_MS) {
      // Far range and cooldown expired - start pathfinding
      // Use move() for pathfinding since pathfindTo doesn't exist in current SDK
      this.pathfindingController.move(this.aggroTarget.position, moveSpeed);
      this.pathfindingController.face(this.aggroTarget.position, moveSpeed * 2);
      this.isPathfinding = true;
      this.pathfindAccumulatorMs = 0; // Reset accumulator after starting pathfind
      
      // We'll handle completion detection in the tick loop
    }
  }

  private getDistanceToTarget(): number {
    if (!this.aggroTarget) return Infinity;
    
    const dx = this.position.x - this.aggroTarget.position.x;
    const dy = this.position.y - this.aggroTarget.position.y;
    const dz = this.position.z - this.aggroTarget.position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private checkPathfindingCompletion(): void {
    if (!this.isPathfinding || !this.aggroTarget) return;

    const distanceToTarget = this.getDistanceToTarget();
    const velocity = this.linearVelocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);

    // Consider pathfinding complete if:
    // 1. We're very close to target (within 1.5 blocks)
    // 2. OR we're close (within 3 blocks) and barely moving (stuck/completed)
    if (distanceToTarget < 1.5 || (distanceToTarget < 3 && speed < 0.1)) {
      this.isPathfinding = false;
    }
  }

  private isCliffInDirection(targetPosition: Vector3Like): boolean {
    if (!this.world) return false;

    // Calculate direction to target
    const dx = targetPosition.x - this.position.x;
    const dz = targetPosition.z - this.position.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    
    if (length === 0) return false;

    // Normalize direction and check 2 blocks ahead
    const checkDistance = 2;
    const checkX = Math.floor(this.position.x + (dx / length) * checkDistance);
    const checkZ = Math.floor(this.position.z + (dz / length) * checkDistance);
    const checkY = Math.floor(this.position.y) - 1; // Check block below where we'd step

    // Check if there's no block below the position we'd move to
    const blockId = this.world.chunkLattice.getBlockId({ x: checkX, y: checkY, z: checkZ });
    
    if (blockId === 0) {
      // No block below - check if it's a significant drop
      let dropDepth = 0;
      for (let y = checkY; y >= checkY - 5; y--) {
        const belowBlockId = this.world.chunkLattice.getBlockId({ x: checkX, y: y, z: checkZ });
        if (belowBlockId !== 0) {
          break;
        }
        dropDepth++;
      }
      
      // Consider it a cliff if drop is more than 3 blocks
      return dropDepth > 3;
    }

    return false;
  }

  private checkFallRespawn(): void {
    // Check if zombie has fallen below the fall detection threshold
    if (this.position.y < this.fallDetectionY && !this.hasStartedFallRespawn) {
      this.hasStartedFallRespawn = true;
      
      // Schedule respawn after 3 seconds
      setTimeout(() => {
        this.respawnAtOriginalPosition();
      }, 3000);
    }
  }

  private respawnAtOriginalPosition(): void {
    if (!this.originalSpawnPosition || !this.world) {
      return;
    }
    
    // Reset all state
    this.aggroTarget = null;
    this.isAggressive = false;
    this.hasStartedFallRespawn = false;
    this.isPathfinding = false;
    this.pathfindAccumulatorMs = 0;
    this.lastAttackTime = 0;

    // Reset physics state
    this.isOnIce = false;
    this.isOnSand = false;
    this.isOnConveyor = false;
    this.conveyorDirection = undefined;
    this.conveyorStrength = undefined;

    // Stop any current movement
    this.pathfindingController.stopMove();
    
    // Stop pathfinding if active
    if (this.isPathfinding) {
      this.isPathfinding = false;
    }
    
    // Clear all velocity and forces
    if (this.rawRigidBody) {
      this.rawRigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.rawRigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.rawRigidBody.setLinearDamping(3.0);
      this.rawRigidBody.setAngularDamping(3.0);
    }
    
    // Teleport back to original spawn position
    this.setPosition(this.originalSpawnPosition);
  }

  private canAttack(): boolean {
    const now = Date.now();
    return this.isAggressive && (now - this.lastAttackTime) >= this.attackCooldownMs;
  }

  private attackPlayer(player: ObbyPlayerEntity): void {
    if (!this.canAttack()) return;

    console.log(`[ZombieEntity] *** INSTANTLY KILLING PLAYER: ${player.player.username} ***`);
    
    this.lastAttackTime = Date.now();
    
    // Play attack animation
    this.startModelOneshotAnimations(['attack']);
    
    // Play attack sound
    if (this.attackAudio && this.world) {
      this.attackAudio.play(this.world);
    }

    // INSTANT DEATH: Trigger fall handler directly without any forces
    console.log(`[VELOCITY_DEBUG] Triggering instant death - no forces applied`);
    
    const playerController = (player as any).controller;
    if (playerController && typeof playerController.handleFall === 'function') {
      console.log(`[VELOCITY_DEBUG] Calling handleFall() directly for instant death`);
      playerController.handleFall(player);
    } else {
      console.error(`[ZombieEntity] Player controller not found or handleFall method missing`);
    }
  }

  private applyKnockback(player: ObbyPlayerEntity): void {
    if (!player.rawRigidBody) return;

    // Log player velocity BEFORE knockback
    const preKnockbackVel = player.linearVelocity;
    console.log(`[VELOCITY_DEBUG] Player velocity BEFORE knockback: (${preKnockbackVel.x.toFixed(3)}, ${preKnockbackVel.y.toFixed(3)}, ${preKnockbackVel.z.toFixed(3)})`);

    // Calculate direction from zombie to player
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const dz = player.position.z - this.position.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (length === 0) return;

    // Check if player is on sand - need slightly stronger knockback to overcome damping
    const isOnSand = (player as any).isOnSand === true;
    const knockbackStrength = isOnSand ? 12 : 10; // Reduced strength for velocity-based approach
    
    // DIRECT VELOCITY APPROACH: Set velocity directly instead of using impulse
    const currentVel = player.linearVelocity;
    const knockbackVelocity = {
      x: (dx / length) * knockbackStrength,
      y: Math.max(currentVel.y, 5), // Slight upward boost, but preserve existing upward velocity
      z: (dz / length) * knockbackStrength,
    };

    console.log(`[VELOCITY_DEBUG] Applying knockback velocity: (${knockbackVelocity.x.toFixed(3)}, ${knockbackVelocity.y.toFixed(3)}, ${knockbackVelocity.z.toFixed(3)})`);

    // Apply knockback by directly setting velocity (no impulse forces!)
    player.setLinearVelocity(knockbackVelocity);
    
    // Log player velocity IMMEDIATELY after velocity set
    const immediatePostVel = player.linearVelocity;
    console.log(`[VELOCITY_DEBUG] Player velocity IMMEDIATELY after velocity set: (${immediatePostVel.x.toFixed(3)}, ${immediatePostVel.y.toFixed(3)}, ${immediatePostVel.z.toFixed(3)})`);
    
    // Additional step for sand: temporarily reduce damping to allow knockback
    if (isOnSand && player.rawRigidBody) {
      // Store current damping
      const originalDamping = player.rawRigidBody.linearDamping();
      console.log(`[VELOCITY_DEBUG] Sand detected - original damping: ${originalDamping}, setting to 1.0 temporarily`);
      
      // Temporarily reduce damping for knockback effect
      player.rawRigidBody.setLinearDamping(1.0);
      
      // Restore original damping after a short delay
      setTimeout(() => {
        if (player.rawRigidBody) {
          player.rawRigidBody.setLinearDamping(originalDamping);
          console.log(`[VELOCITY_DEBUG] Restored original damping: ${originalDamping}`);
        }
      }, 200); // 200ms window for knockback to take effect
      
    }
    
    // Log velocity after some time to see ongoing effects
    setTimeout(() => {
      const delayedPostVel = player.linearVelocity;
      console.log(`[VELOCITY_DEBUG] Player velocity 500ms after knockback: (${delayedPostVel.x.toFixed(3)}, ${delayedPostVel.y.toFixed(3)}, ${delayedPostVel.z.toFixed(3)})`);
    }, 500);
  }

  private getMoveSpeed(): number {
    return 2.5; // Single zombie speed
  }

  private onBecomeAggressive(): void {
    // Face the target immediately when becoming aggressive
    if (this.aggroTarget) {
      this.pathfindingController.face(this.aggroTarget.position, this.getMoveSpeed() * 2);
    }
    
    // Play aggressive sound when becoming hostile
    if (this.world && this.groanAudio) {
      this.groanAudio.play(this.world);
    }
  }

  private updateGroan(deltaMs: number): void {
    if (this.groanTimer > 0) {
      this.groanTimer -= deltaMs;
    }

    // Play periodic groans when not aggressive
    if (this.groanTimer <= 0 && !this.isAggressive && this.world && this.groanAudio) {
      this.groanAudio.play(this.world);
      this.groanInterval = 3000 + Math.random() * 4000; // 3-7 seconds
      this.groanTimer = this.groanInterval;
    }
  }

  private initializeAudio(): void {
    if (!this.world) return;

    this.attackAudio = new Audio({
      attachedToEntity: this,
      uri: 'audio/sfx/entity/zombie/zombie-attack.mp3',
      volume: 0.6,
      referenceDistance: 8,
    });

    this.groanAudio = new Audio({
      attachedToEntity: this,
      uri: 'audio/sfx/boing-1.wav', // Fallback audio - replace with zombie groan sound
      volume: 0.3,
      referenceDistance: 12,
    });

  }

  /**
   * Check what type of block the zombie is standing on
   */
  private checkBlockPhysics(): void {
    if (!this.world) return;

    const zombiePos = this.position;

    // Reset physics flags
    const wasOnConveyor = this.isOnConveyor;
    this.isOnIce = false;
    this.isOnSand = false;
    this.isOnConveyor = false;
    this.conveyorDirection = undefined;
    this.conveyorStrength = undefined;

    // Get the block the zombie is standing on
    const blockBelowPos = new Vector3(
      Math.floor(zombiePos.x),
      Math.floor(zombiePos.y - 1.5), // Check block below zombie's feet
      Math.floor(zombiePos.z)
    );

    const blockBelowId = this.world.chunkLattice.getBlockId(blockBelowPos);
    
    if (!blockBelowId || blockBelowId === 0) {
      return;
    }

    const behaviorManager = BlockBehaviorManager.getInstance();
    const behavior = behaviorManager.getBehavior(blockBelowId);
    
    if (!behavior) return;

    // Check for different block types
    if (behavior.isSlippery) {
      this.isOnIce = true;
    } else if (behavior.isSandy) {
      this.isOnSand = true;
    } else if (blockBelowId === 104 || blockBelowId === 105 || blockBelowId === 109 || blockBelowId === 110) {
      // Conveyor blocks
      this.isOnConveyor = true;
      
      switch (blockBelowId) {
        case 104: // conveyor-z- (south/negative Z)
          this.conveyorDirection = "forward";
          break;
        case 105: // conveyor-z+ (north/positive Z)
          this.conveyorDirection = "backward";
          break;
        case 109: // conveyor-x- (west/negative X)
          this.conveyorDirection = "left";
          break;
        case 110: // conveyor-x+ (east/positive X)
          this.conveyorDirection = "right";
          break;
      }
      this.conveyorStrength = 4.0;
    }
  }

  /**
   * Apply physics effects based on current block type
   */
  private applyBlockPhysics(deltaMs: number): void {
    if (!this.rawRigidBody) return;

    if (this.isOnIce) {
      // Reduce friction for slippery movement
      this.rawRigidBody.setLinearDamping(0.1); // Very low damping = slippery
    } else if (this.isOnSand) {
      // Increase damping for slower movement
      this.rawRigidBody.setLinearDamping(8.0); // High damping = slower
    } else if (this.isOnConveyor && this.conveyorDirection && this.conveyorStrength) {
      // Use gentler force similar to player experience
      const conveyorForce = 6.0; // Much gentler force
      const maxConveyorSpeed = 4.0; // Cap the speed
      
      let targetVelocity = { x: 0, y: 0, z: 0 };

      switch (this.conveyorDirection) {
        case "forward": // negative Z
          targetVelocity.z = -maxConveyorSpeed;
          break;
        case "backward": // positive Z
          targetVelocity.z = maxConveyorSpeed;
          break;
        case "left": // negative X
          targetVelocity.x = -maxConveyorSpeed;
          break;
        case "right": // positive X
          targetVelocity.x = maxConveyorSpeed;
          break;
      }

      if (this.rawRigidBody) {
        const currentVel = this.rawRigidBody.linvel();
        
        // Gradually adjust velocity toward target instead of applying force
        let newVel = { 
          x: this.lerp(currentVel.x, targetVelocity.x, 0.3), 
          y: currentVel.y, // Keep Y velocity unchanged
          z: this.lerp(currentVel.z, targetVelocity.z, 0.3)
        };
        
        // Clear momentum in the wrong direction when changing conveyor direction
        if (this.conveyorDirection === "left" || this.conveyorDirection === "right") {
          newVel.z = this.lerp(currentVel.z, 0, 0.2); // Slow down Z movement
        }
        if (this.conveyorDirection === "forward" || this.conveyorDirection === "backward") {
          newVel.x = this.lerp(currentVel.x, 0, 0.2); // Slow down X movement
        }
        
        this.rawRigidBody.setLinvel(newVel, true);
      }
      
      // Play walk animation when being moved by conveyor
      if (!this.modelLoopedAnimations.has('walk')) {
        this.startModelLoopedAnimations(['walk']);
      }
      
      // Normal damping when on conveyor 
      this.rawRigidBody.setLinearDamping(2.0);
      this.rawRigidBody.setAngularDamping(2.0);
    } else {
      // Normal damping for regular blocks
      this.rawRigidBody.setLinearDamping(3.0);
      this.rawRigidBody.setAngularDamping(3.0);
      
      // Stop walk animation when not on conveyor and not aggressive
      if (!this.isAggressive && this.modelLoopedAnimations.has('walk')) {
        this.stopAllModelLoopedAnimations();
        this.startModelLoopedAnimations(['idle']);
      }
    }
  }

  public isZombie(): boolean {
    return true;
  }

  /**
   * Get the zombie variant (required for removal system)
   */
  public getVariant(): string {
    // Since we simplified to only have one zombie type, return 'normal'
    // This could be extended if multiple variants are added later
    return 'normal';
  }

  /**
   * Linear interpolation helper
   */
  private lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * factor;
  }
}