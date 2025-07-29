import {
  BlockType,
  ColliderShape,
  CollisionGroup,
  Entity,
  EntityEvent,
  ErrorHandler,
  Vector3,
  World,
  PlayerEntity,
  SimpleEntityController,
  RigidBodyType,
} from 'hytopia';
import type { EventPayloads, QuaternionLike, RawShape, Vector3Like } from 'hytopia';

const MOVEMENT_NOT_STUCK_DISTANCE_SQUARED = 3;

import { ObbyPlayerEntity } from '../ObbyPlayerEntity';

export type ComplexAttack = (params: {
  attacker: BaseCombatEntity;
  target: Entity | ObbyPlayerEntity;
}) => void;

export type BaseCombatEntityAttack = {
  animations: string[];
  complexAttack?: ComplexAttack;
  complexAttackDelayMs?: number;
  cooldownMs: number;
  range: number; // Considered when target is < range distance
  simpleAttackDamage?: number;
  simpleAttackDamageVariance?: number; // Percentage variance (0-1), e.g., 0.2 = ±20% damage
  simpleAttackDamageDelayMs?: number; // When during animation to deal damage (if projectile, delay after hit)
  simpleAttackReach?: number; // Applies damage if target is < reach after delay
  stopAllAnimationForMs?: number;
  stopMovingForDurationMs?: number;
  stopMovingDuringDelay?: boolean;
  weight: number;
  onHit?: (target: Entity | ObbyPlayerEntity, attacker: BaseCombatEntity) => void;
}

export type BaseCombatEntityOptions = {
  aggroRadius: number; 
  aggroRetargetIntervalMs?: number;
  aggroReturnToStart?: boolean;
  aggroSensorForwardOffset?: number;
  aggroTargetTypes?: (typeof Entity | typeof ObbyPlayerEntity)[];
  attacks?: BaseCombatEntityAttack[];
  diameterOverride?: number;
  health: number;
  outOfCombatRegenDelayMs?: number;
  outOfCombatRegenPerSecondRate?: number; // rate per second as a percent, ie 0.03 is 3% per second
  modelUri: string;
  modelScale?: number;
  name: string;
  idleAnimations?: string[];
  moveAnimations?: string[];
  moveSpeed?: number;
  pathfindingOptions?: any;
};

export default class BaseCombatEntity extends Entity {
  // Reusable temp vectors to avoid allocations
  private static readonly _scratchTargetVec3 = Vector3.create();
  private static readonly _scratchSourceVec3 = Vector3.create();

  private _aggroActiveTarget: Entity | ObbyPlayerEntity | null = null;
  private _aggroPathfinding: boolean = false;
  private _aggroPathfindAccumulatorMs: number = 0;
  private _aggroPathfindLastPosition: Vector3Like | null = null;
  private _aggroPathfindIntervalMs: number = 1000;
  private _aggroPotentialTargets: Set<Entity | ObbyPlayerEntity> = new Set();
  private _aggroPotentialTargetTypes: (typeof Entity | typeof ObbyPlayerEntity)[];
  private _aggroRadius: number;
  private _aggroRetargetAccumulatorMs: number;
  private _aggroRetargetIntervalMs: number;
  private _aggroReturnToStart: boolean;
  private _aggroSensorForwardOffset: number;
  private _aggroStartPosition: Vector3Like | null = null;
  private _attacks: BaseCombatEntityAttack[];
  private _attackAccumulatorMs: number = 0;
  private _health: number;
  private _maxHealth: number;
  private _moveSpeed: number;

  constructor(options: BaseCombatEntityOptions) {
    super({
      controller: new SimpleEntityController(),
      name: options.name,
      modelUri: options.modelUri,
      modelScale: options.modelScale || 1,
      modelLoopedAnimations: options.idleAnimations || ['idle'],
      rigidBodyOptions: {
        type: RigidBodyType.DYNAMIC,
        enabledRotations: { x: false, y: true, z: false },
      }
    });

    this._aggroRadius = options.aggroRadius;
    this._aggroRetargetIntervalMs = options.aggroRetargetIntervalMs || 1000;
    this._aggroReturnToStart = options.aggroReturnToStart || false;
    this._aggroSensorForwardOffset = options.aggroSensorForwardOffset || 0;
    this._aggroPotentialTargetTypes = options.aggroTargetTypes || [PlayerEntity];
    this._attacks = options.attacks || [];
    this._health = options.health;
    this._maxHealth = options.health;
    this._moveSpeed = options.moveSpeed || 2;
    this._aggroRetargetAccumulatorMs = 0;

    this.on(EntityEvent.SPAWN, this._onSpawn.bind(this));
    this.on(EntityEvent.TICK, this._onTick.bind(this));
  }

  private _onSpawn(): void {
    if (!this.isSpawned || !this.world) return;

    // Store starting position
    this._aggroStartPosition = { ...this.position };

    // Create aggro sensor
    this.createAndAddChildCollider({
      shape: ColliderShape.BALL,
      radius: this._aggroRadius,
      isSensor: true,
      onCollision: (other: Entity | BlockType, started: boolean) => {
        for (const targetType of this._aggroPotentialTargetTypes) {
          if (other instanceof targetType) {
            if (started) {
              this._aggroPotentialTargets.add(other as Entity | ObbyPlayerEntity);
              console.log(`[BaseCombatEntity] Target entered aggro: ${other.name || 'unknown'}`);
            } else {
              this._aggroPotentialTargets.delete(other as Entity | ObbyPlayerEntity);
              console.log(`[BaseCombatEntity] Target left aggro: ${other.name || 'unknown'}`);
            }
          }
        }
      }
    });

    console.log(`[BaseCombatEntity] ${this.name} spawned with aggro radius ${this._aggroRadius}`);
  }

  private _onTick(payload: EventPayloads[EntityEvent.TICK]): void {
    if (!this.isSpawned || !this.world) return;

    this._updateTargeting();
    this._updateMovement(payload);
    this._updateAttacking(payload);
  }

  private _updateTargeting(): void {
    this._aggroRetargetAccumulatorMs += 16.67; // Approximate tick time

    if (this._aggroRetargetAccumulatorMs >= this._aggroRetargetIntervalMs) {
      this._aggroRetargetAccumulatorMs = 0;

      // Find best target from potential targets
      const newTarget = this._findBestTarget();
      
      if (newTarget !== this._aggroActiveTarget) {
        this._aggroActiveTarget = newTarget;
        if (newTarget) {
          console.log(`[BaseCombatEntity] ${this.name} targeting: ${newTarget.name || 'player'}`);
        } else {
          console.log(`[BaseCombatEntity] ${this.name} lost target`);
        }
      }
    }
  }

  private _findBestTarget(): Entity | ObbyPlayerEntity | null {
    if (this._aggroPotentialTargets.size === 0) return null;

    // Find closest valid target
    let bestTarget: Entity | ObbyPlayerEntity | null = null;
    let bestDistance = Infinity;

    for (const target of this._aggroPotentialTargets) {
      if (!target.isSpawned) continue;

      // Manual distance calculation
      const dx = this.position.x - target.position.x;
      const dy = this.position.y - target.position.y;
      const dz = this.position.z - target.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = target;
      }
    }

    return bestTarget;
  }

  private _updateMovement(payload: EventPayloads[EntityEvent.TICK]): void {
    if (!this._aggroActiveTarget) return;

    const controller = this.controller as SimpleEntityController;
    
    // Manual distance calculation
    const dx = this.position.x - this._aggroActiveTarget.position.x;
    const dy = this.position.y - this._aggroActiveTarget.position.y;
    const dz = this.position.z - this._aggroActiveTarget.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Check if in attack range
    const attackRange = this._attacks.length > 0 ? this._attacks[0]?.range || 1.5 : 1.5;
    if (distance <= attackRange) {
      // Stop moving, we're in attack range
      return;
    }

    // Move towards target
    controller.face(this._aggroActiveTarget.position, this._moveSpeed * 2);
    controller.move(this._aggroActiveTarget.position, this._moveSpeed, {
      moveIgnoreAxes: { y: true }
    });

    // Play movement animation
    if (!this.modelLoopedAnimations.has('walk') && !this.modelLoopedAnimations.has('run')) {
      this.stopAllModelAnimations();
      this.startModelLoopedAnimations(['walk']);
    }
  }

  private _updateAttacking(payload: EventPayloads[EntityEvent.TICK]): void {
    if (!this._aggroActiveTarget || this._attacks.length === 0) return;

    this._attackAccumulatorMs += payload.tickDeltaMs;

    // Manual distance calculation
    const dx = this.position.x - this._aggroActiveTarget.position.x;
    const dy = this.position.y - this._aggroActiveTarget.position.y;
    const dz = this.position.z - this._aggroActiveTarget.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    const attack = this._attacks[0]; // Use first attack for simplicity

    if (attack && distance <= attack.range && this._attackAccumulatorMs >= attack.cooldownMs) {
      this._performAttack(attack);
      this._attackAccumulatorMs = 0;
    }
  }

  private _performAttack(attack: BaseCombatEntityAttack): void {
    if (!this._aggroActiveTarget) return;

    console.log(`[BaseCombatEntity] ${this.name} attacking target`);

    // Play attack animation
    if (attack.animations.length > 0) {
      this.stopAllModelAnimations();
      this.startModelOneshotAnimations(attack.animations);
    }

    // Schedule damage application
    setTimeout(() => {
      if (!this._aggroActiveTarget || !this.isSpawned) return;

      // Manual distance calculation
      const dx = this.position.x - this._aggroActiveTarget.position.x;
      const dy = this.position.y - this._aggroActiveTarget.position.y;
      const dz = this.position.z - this._aggroActiveTarget.position.z;
      const currentDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      const reach = attack.simpleAttackReach || attack.range;

      if (currentDistance <= reach) {
        this._applyDamage(attack);
      }
    }, attack.simpleAttackDamageDelayMs || 0);
  }

  private _applyDamage(attack: BaseCombatEntityAttack): void {
    if (!this._aggroActiveTarget) return;

    let damage = attack.simpleAttackDamage || 10;
    
    // Apply damage variance
    if (attack.simpleAttackDamageVariance) {
      const variance = damage * attack.simpleAttackDamageVariance;
      damage += (Math.random() - 0.5) * 2 * variance;
      damage = Math.max(1, Math.round(damage));
    }

    // Apply damage to player
    if (this._aggroActiveTarget instanceof PlayerEntity || this._aggroActiveTarget instanceof ObbyPlayerEntity) {
      const player = this._aggroActiveTarget.player;
      console.log(`[BaseCombatEntity] ${this.name} dealt ${damage} damage to ${player.id}`);
      
      // Apply damage and knockback
      if ('takeDamage' in this._aggroActiveTarget && typeof this._aggroActiveTarget.takeDamage === 'function') {
        this._aggroActiveTarget.takeDamage(damage);
      }

      // Apply impulse for knockback (manual vector calculation)
      const dx = this._aggroActiveTarget.position.x - this.position.x;
      const dy = this._aggroActiveTarget.position.y - this.position.y;
      const dz = this._aggroActiveTarget.position.z - this.position.z;
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (length > 0) {
        const impulseStrength = damage * 0.1;
        const impulse = {
          x: (dx / length) * impulseStrength,
          y: (dy / length) * impulseStrength,
          z: (dz / length) * impulseStrength
        };
        this._aggroActiveTarget.applyImpulse(impulse);
      }
    }

    // Call onHit callback if provided
    if (attack.onHit) {
      attack.onHit(this._aggroActiveTarget, this);
    }
  }

  // Public getters
  public get health(): number {
    return this._health;
  }

  public get maxHealth(): number {
    return this._maxHealth;
  }

  public get aggroTarget(): Entity | ObbyPlayerEntity | null {
    return this._aggroActiveTarget;
  }
} 