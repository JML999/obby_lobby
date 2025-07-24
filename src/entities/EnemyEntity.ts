import { 
    Entity, 
    EntityEvent, 
    SimpleEntityController, 
    RigidBodyType, 
    ColliderShape, 
    Audio, 
    World, 
    Vector3,
    BlockType,
    PlayerEntity
} from 'hytopia';
import type { EntityOptions, Vector3Like } from 'hytopia';

import { ObbyPlayerEntity } from '../ObbyPlayerEntity';
import { CollisionGroups } from '../CollisionGroups';

export interface EnemyEntityOptions {
    name?: string;
    modelUri?: string;
    modelScale?: number;
    modelLoopedAnimations?: string[];
    maxHealth?: number;
    damage?: number;
    moveSpeed?: number;
    attackRange?: number;
    detectionRange?: number;
    attackCooldownMs?: number;
    roamingArea?: {
        center: Vector3Like;
        size: number; // 3 for 3x3, etc.
    };
}

export abstract class EnemyEntity extends Entity {
    // Health and combat properties
    protected maxHealth: number;
    protected currentHealth: number;
    protected damage: number;
    protected isDead: boolean = false;

    // AI properties
    protected moveSpeed: number;
    protected attackRange: number;
    protected detectionRange: number;
    protected attackCooldownMs: number;
    
    // State tracking
    protected currentTarget: ObbyPlayerEntity | null = null;
    protected lastAttackTime: number = 0;
    protected isAggressive: boolean = false;
    
    // Roaming area constraints
    protected roamingArea?: {
        center: Vector3;
        size: number;
    };
    
    // Audio
    protected attackAudio?: Audio;
    protected hurtAudio?: Audio;
    protected deathAudio?: Audio;

    constructor(options: EnemyEntityOptions) {
        const entityOptions: EntityOptions = {
            name: options.name || 'Enemy',
            modelUri: options.modelUri || 'models/npcs/zombie.gltf',
            modelScale: options.modelScale || 1,
            modelLoopedAnimations: options.modelLoopedAnimations || ['idle'],
            controller: new SimpleEntityController(),
            rigidBodyOptions: {
                type: RigidBodyType.DYNAMIC,
                enabledRotations: { x: false, y: true, z: false },
                colliders: [{
                    shape: ColliderShape.CAPSULE,
                    halfHeight: 0.8,
                    radius: 0.4,
                    collisionGroups: {
                        belongsTo: [CollisionGroups.ENTITY],
                        collidesWith: [
                            CollisionGroups.BLOCK,
                            CollisionGroups.ENTITY,
                            CollisionGroups.PLAYER,
                            CollisionGroups.ENTITY_SENSOR
                        ]
                    }
                }]
            }
        };

        super(entityOptions);

        // Initialize properties with defaults
        this.maxHealth = options.maxHealth ?? 50;
        this.currentHealth = this.maxHealth;
        this.damage = options.damage ?? 10;
        this.moveSpeed = options.moveSpeed ?? 2;
        this.attackRange = options.attackRange ?? 1.5;
        this.detectionRange = options.detectionRange ?? 8;
        this.attackCooldownMs = options.attackCooldownMs ?? 2000;

        // Set roaming area if provided
        if (options.roamingArea) {
            this.roamingArea = {
                center: new Vector3(options.roamingArea.center.x, options.roamingArea.center.y, options.roamingArea.center.z),
                size: options.roamingArea.size
            };
        }

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.on(EntityEvent.SPAWN, this.onSpawn.bind(this));
        this.on(EntityEvent.TICK, this.onTick.bind(this));
        this.on(EntityEvent.ENTITY_COLLISION, this.onEntityCollision.bind(this));
    }

    protected onSpawn(): void {
        console.log(`[${this.constructor.name}] Spawned enemy with ${this.maxHealth} health`);
        
        // Setup detection collider for finding players
        this.createAndAddChildCollider({
            shape: ColliderShape.CYLINDER,
            radius: this.detectionRange,
            halfHeight: 2,
            isSensor: true,
            tag: 'detection-sensor',
            collisionGroups: {
                belongsTo: [CollisionGroups.ENTITY_SENSOR],
                collidesWith: [CollisionGroups.PLAYER]
            },
            onCollision: (other: BlockType | Entity, started: boolean) => {
                if (other instanceof ObbyPlayerEntity) {
                    if (started) {
                        this.onPlayerDetected(other);
                    } else {
                        this.onPlayerLost(other);
                    }
                }
            }
        });

        // Setup attack collider for damaging players
        this.createAndAddChildCollider({
            shape: ColliderShape.CYLINDER,
            radius: this.attackRange,
            halfHeight: 1.5,
            isSensor: true,
            tag: 'attack-sensor',
            collisionGroups: {
                belongsTo: [CollisionGroups.ENTITY_SENSOR],
                collidesWith: [CollisionGroups.PLAYER]
            },
            onCollision: (other: BlockType | Entity, started: boolean) => {
                if (started && other instanceof ObbyPlayerEntity && this.canAttack()) {
                    this.attackPlayer(other);
                }
            }
        });

        this.initializeAudio();
        this.onEnemySpawn();
    }

    protected abstract onEnemySpawn(): void;

    protected initializeAudio(): void {
        // Override in subclasses to set up specific audio
    }

    protected onTick(): void {
        if (this.isDead || !this.isSpawned) return;

        this.updateAI();
        this.onEnemyTick();
    }

    protected abstract onEnemyTick(): void;

    protected updateAI(): void {
        if (!this.currentTarget) {
            // Look for nearby players if we don't have a target
            this.currentTarget = this.findNearestPlayer();
            if (!this.currentTarget) {
                this.onIdleBehavior();
                return;
            }
        }

        // Check if target is still valid and in range
        if (!this.currentTarget.isSpawned || this.getDistanceToTarget() > this.detectionRange * 1.5) {
            this.currentTarget = null;
            this.isAggressive = false;
            this.onIdleBehavior();
            return;
        }

        // Check if target is outside roaming area - if so, lose aggression
        if (this.roamingArea && !this.isWithinRoamingArea(this.currentTarget.position)) {
            // Target moved outside our allowed area, stop chasing
            this.currentTarget = null;
            this.isAggressive = false;
            this.onIdleBehavior();
            return;
        }

        // Move towards target
        this.moveTowardsTarget();
    }

    protected onIdleBehavior(): void {
        // Default idle behavior - can be overridden
        if (!this.modelLoopedAnimations.has('idle')) {
            this.stopAllModelAnimations();
            this.startModelLoopedAnimations(['idle']);
        }
    }

    protected moveTowardsTarget(): void {
        if (!this.currentTarget || !this.controller) return;

        const controller = this.controller as SimpleEntityController;
        const distance = this.getDistanceToTarget();

        if (distance > this.attackRange) {
            // Calculate desired position towards target
            let targetPosition = this.currentTarget.position;
            
            // If we have a roaming area, constrain the movement
            if (this.roamingArea) {
                const constrainedPosition = this.constrainToRoamingArea(targetPosition);
                
                // If the target is outside our roaming area, move towards the edge closest to them
                if (!this.isWithinRoamingArea(targetPosition)) {
                    targetPosition = constrainedPosition;
                }
                
                // Also make sure our current intended movement stays within bounds
                const currentPos = this.position;
                const directionX = targetPosition.x - currentPos.x;
                const directionZ = targetPosition.z - currentPos.z;
                const length = Math.sqrt(directionX * directionX + directionZ * directionZ);
                
                if (length > 0) {
                    const normalizedDirectionX = directionX / length;
                    const normalizedDirectionZ = directionZ / length;
                    
                    // Calculate next position
                    const nextPosition = {
                        x: currentPos.x + normalizedDirectionX * this.moveSpeed * 0.1,
                        y: currentPos.y,
                        z: currentPos.z + normalizedDirectionZ * this.moveSpeed * 0.1
                    };
                    
                    // Constrain the next position to our roaming area
                    targetPosition = this.constrainToRoamingArea(nextPosition);
                }
            }
            
            // Move towards the (possibly constrained) target
            controller.move(targetPosition, this.moveSpeed);
            controller.face(this.currentTarget.position, this.moveSpeed * 2);

            // Start movement animation
            if (!this.modelLoopedAnimations.has('walk') && !this.modelLoopedAnimations.has('run')) {
                this.stopModelAnimations(['idle']);
                this.startModelLoopedAnimations(['walk']);
            }
        } else {
            // Face target but don't move closer
            controller.face(this.currentTarget.position, this.moveSpeed * 2);
            
            // Switch to idle/attack stance
            if (this.modelLoopedAnimations.has('walk') || this.modelLoopedAnimations.has('run')) {
                this.stopModelAnimations(['walk', 'run']);
                this.startModelLoopedAnimations(['idle']);
            }
        }
    }

    protected findNearestPlayer(): ObbyPlayerEntity | null {
        if (!this.world) return null;

        const players = this.world.entityManager.getAllPlayerEntities()
            .filter(entity => entity instanceof ObbyPlayerEntity && entity.isSpawned) as ObbyPlayerEntity[];

        let nearestPlayer: ObbyPlayerEntity | null = null;
        let nearestDistance = Infinity;

        for (const player of players) {
            const dx = this.position.x - player.position.x;
            const dy = this.position.y - player.position.y;
            const dz = this.position.z - player.position.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPlayer = player;
            }
        }

        return nearestPlayer;
    }

    protected getDistanceToTarget(): number {
        if (!this.currentTarget) return Infinity;
        const dx = this.position.x - this.currentTarget.position.x;
        const dy = this.position.y - this.currentTarget.position.y;
        const dz = this.position.z - this.currentTarget.position.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Check if a position is within the roaming area
     */
    protected isWithinRoamingArea(position: Vector3Like): boolean {
        if (!this.roamingArea) return true; // No constraints if no roaming area set

        const halfSize = Math.floor(this.roamingArea.size / 2);
        const minX = this.roamingArea.center.x - halfSize;
        const maxX = this.roamingArea.center.x + halfSize;
        const minZ = this.roamingArea.center.z - halfSize;
        const maxZ = this.roamingArea.center.z + halfSize;

        return position.x >= minX && position.x <= maxX && 
               position.z >= minZ && position.z <= maxZ;
    }

    /**
     * Get a position constrained to the roaming area
     */
    protected constrainToRoamingArea(position: Vector3Like): Vector3Like {
        if (!this.roamingArea) return position;

        const halfSize = Math.floor(this.roamingArea.size / 2);
        const minX = this.roamingArea.center.x - halfSize;
        const maxX = this.roamingArea.center.x + halfSize;
        const minZ = this.roamingArea.center.z - halfSize;
        const maxZ = this.roamingArea.center.z + halfSize;

        return {
            x: Math.max(minX, Math.min(maxX, position.x)),
            y: position.y,
            z: Math.max(minZ, Math.min(maxZ, position.z))
        };
    }

    protected onPlayerDetected(player: ObbyPlayerEntity): void {
        console.log(`[${this.constructor.name}] Player detected: ${player.player.username}`);
        
        if (!this.currentTarget) {
            this.currentTarget = player;
            this.isAggressive = true;
            this.onBecomeAggressive();
        }
    }

    protected onPlayerLost(player: ObbyPlayerEntity): void {
        console.log(`[${this.constructor.name}] Player lost: ${player.player.username}`);
        
        if (this.currentTarget === player) {
            // Look for other nearby players before giving up
            const newTarget = this.findNearestPlayer();
            if (newTarget) {
                const dx = this.position.x - newTarget.position.x;
                const dy = this.position.y - newTarget.position.y;
                const dz = this.position.z - newTarget.position.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (distance <= this.detectionRange) {
                    this.currentTarget = newTarget;
                } else {
                    this.currentTarget = null;
                    this.isAggressive = false;
                    this.onBecomePassive();
                }
            } else {
                this.currentTarget = null;
                this.isAggressive = false;
                this.onBecomePassive();
            }
        }
    }

    protected onBecomeAggressive(): void {
        // Override in subclasses for specific behavior
        console.log(`[${this.constructor.name}] Becoming aggressive`);
    }

    protected onBecomePassive(): void {
        // Override in subclasses for specific behavior
        console.log(`[${this.constructor.name}] Becoming passive`);
    }

    protected canAttack(): boolean {
        const now = Date.now();
        return !this.isDead && this.isAggressive && (now - this.lastAttackTime) >= this.attackCooldownMs;
    }

    protected attackPlayer(player: ObbyPlayerEntity): void {
        if (!this.canAttack()) return;

        console.log(`[${this.constructor.name}] Attacking player: ${player.player.username}`);
        
        this.lastAttackTime = Date.now();
        
        // Play attack animation
        this.startModelOneshotAnimations(['attack']);
        
        // Play attack sound
        if (this.attackAudio && this.world) {
            this.attackAudio.play(this.world);
        }

        // Apply damage/impulse to player
        this.applyDamageToPlayer(player);
        
        this.onAttackExecuted(player);
    }

    protected applyDamageToPlayer(player: ObbyPlayerEntity): void {
        // Since we don't have health implemented yet, apply an impulse to push the player
        const directionX = player.position.x - this.position.x;
        const directionY = player.position.y - this.position.y;
        const directionZ = player.position.z - this.position.z;
        
        // Normalize the direction vector
        const length = Math.sqrt(directionX * directionX + directionY * directionY + directionZ * directionZ);
        const direction = length > 0 ? {
            x: directionX / length,
            y: directionY / length,
            z: directionZ / length
        } : { x: 0, y: 0, z: 1 };

        // Apply impulse in the direction away from the enemy
        const impulseForce = 5; // Adjust as needed
        player.applyImpulse({
            x: direction.x * impulseForce * player.mass,
            y: 2 * player.mass, // Small upward component
            z: direction.z * impulseForce * player.mass
        });

        // Console log for now
        console.log(`[${this.constructor.name}] Applied ${this.damage} damage and impulse to ${player.player.username}`);
        
        // TODO: When health system is implemented, call player.takeDamage(this.damage)
    }

    protected onAttackExecuted(player: ObbyPlayerEntity): void {
        // Override in subclasses for specific attack effects
    }

    protected onEntityCollision({ otherEntity, started }: { otherEntity: Entity, started: boolean }): void {
        // Handle collisions with other entities if needed
        // Base implementation does nothing
    }

    public takeDamage(amount: number, source?: Entity): void {
        if (this.isDead) return;

        this.currentHealth -= amount;
        console.log(`[${this.constructor.name}] Took ${amount} damage, health: ${this.currentHealth}/${this.maxHealth}`);

        // Play hurt animation and sound
        this.startModelOneshotAnimations(['hurt']);
        if (this.hurtAudio && this.world) {
            this.hurtAudio.play(this.world);
        }

        // Become aggressive if attacked
        if (source instanceof ObbyPlayerEntity) {
            this.currentTarget = source;
            this.isAggressive = true;
            this.onBecomeAggressive();
        }

        this.onTakeDamage(amount, source);

        if (this.currentHealth <= 0) {
            this.die();
        }
    }

    protected onTakeDamage(amount: number, source?: Entity): void {
        // Override in subclasses for specific hurt effects
    }

    protected die(): void {
        if (this.isDead) return;

        this.isDead = true;
        console.log(`[${this.constructor.name}] Died`);

        // Stop all movement
        this.setLinearVelocity({ x: 0, y: 0, z: 0 });
        this.setAngularVelocity({ x: 0, y: 0, z: 0 });

        // Play death animation
        this.stopAllModelAnimations();
        this.startModelOneshotAnimations(['death']);

        // Play death sound
        if (this.deathAudio && this.world) {
            this.deathAudio.play(this.world);
        }

        // Make entity non-collidable
        this.setCollisionGroupsForSolidColliders({
            belongsTo: [],
            collidesWith: []
        });

        this.onDeath();

        // Despawn after death animation
        setTimeout(() => {
            if (this.isSpawned) {
                this.despawn();
            }
        }, 3000);
    }

    protected onDeath(): void {
        // Override in subclasses for specific death effects (loot drops, etc.)
    }

    // Getters for external access
    public get health(): number { return this.currentHealth; }
    public get maxHealthValue(): number { return this.maxHealth; }
    public get isDeadState(): boolean { return this.isDead; }
    public get isAggressiveState(): boolean { return this.isAggressive; }
    public get target(): ObbyPlayerEntity | null { return this.currentTarget; }
} 