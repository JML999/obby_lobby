import { World, EntityEvent, RigidBodyType, ColliderShape, Vector3, type Vector3Like, type EntityOptions, type EventPayloads, CollisionGroup, PlayerEntity, Audio } from 'hytopia';
import ObstacleEntity from './ObstacleEntity';

export type BouncePadSize = 'small' | 'medium' | 'large';

export interface BouncePadObstacleOptions {
    bounceForce?: number;
    cooldownTime?: number;
    size?: BouncePadSize;
    movementAxis?: 'x' | 'y' | 'z';
    moveEnabled?: boolean;
    moveDistance?: number;
    moveSpeed?: number;
}

export class BouncePadObstacle extends ObstacleEntity {
    private bounceForce: number;
    private cooldownTime: number;
    private padSize: BouncePadSize;
    private lastBounceTime: number = 0;

    // Movement properties
    private moveEnabled: boolean;
    private movementAxis: 'x' | 'y' | 'z';
    private moveDistance: number;
    private moveSpeed: number;
    private originPosition: Vector3 = new Vector3(0, 0, 0);
    private targetPosition: Vector3 = new Vector3(0, 0, 0);
    private movingForward: boolean = true;

    constructor(options: BouncePadObstacleOptions & EntityOptions = {}, world: World) {
        // Determine pad size and select appropriate model
        const padSize = options.size || 'medium';
        let modelPath = '';
        let modelScale = 1.0;

        switch (padSize) {
            case 'small':
                modelPath = 'models/obstacles/bounce_pad_small.gltf';
                modelScale = 5;
                break;
            case 'medium':
                modelPath = 'models/obstacles/bounce_pad_medium.gltf';
                modelScale = 6.0;
                break;
            case 'large':
                modelPath = 'models/obstacles/bounce_pad_large.gltf';
                modelScale = 6;
                break;
            default:
                modelPath = 'models/obstacles/bounce_pad_small.gltf';
                modelScale = 5;
        }

        const defaultOptions: EntityOptions = {
            name: `Bounce Pad (${padSize})`,
            modelUri: modelPath,
            modelScale: modelScale,
            rigidBodyOptions: {
                type: RigidBodyType.KINEMATIC_POSITION,
            }
        };

        super({ ...defaultOptions, ...options });

        this.padSize = padSize;
        this.bounceForce = options.bounceForce ?? 10;
        this.cooldownTime = options.cooldownTime ?? 100;
        this.moveEnabled = options.moveEnabled ?? false;
        this.movementAxis = options.movementAxis ?? 'y';
        this.moveDistance = options.moveDistance ?? 2;
        this.moveSpeed = options.moveSpeed ?? 1;

        this.on(EntityEvent.SPAWN, this.onSpawned);
        this.on(EntityEvent.ENTITY_CONTACT_FORCE, this.handleContactForce);
    }

    private onSpawned = (): void => {
        this.originPosition = Vector3.fromVector3Like(this.position);
        this.targetPosition = new Vector3(
            this.originPosition.x + (this.movementAxis === 'x' ? this.moveDistance : 0),
            this.originPosition.y + (this.movementAxis === 'y' ? this.moveDistance : 0),
            this.originPosition.z + (this.movementAxis === 'z' ? this.moveDistance : 0)
        );
        this.setCollisionGroupsForSolidColliders({
            belongsTo: [CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.ENTITY, CollisionGroup.PLAYER, CollisionGroup.ENTITY_SENSOR],
        });
    };

    private handleContactForce = (payload: EventPayloads[EntityEvent.ENTITY_CONTACT_FORCE]): void => {
        const otherEntity = payload.otherEntity;
        if (!otherEntity) return;

        // The entity must be a PlayerEntity
        if (otherEntity instanceof PlayerEntity && 
             otherEntity.position.y > this.position.y) {
            
            // Check if player is moving upward too fast to prevent double-bouncing
            if (otherEntity.linearVelocity.y > 0.5 + this.linearVelocity.y) {
                return;
            }
            
            // Apply upward velocity to the player
            const mass = otherEntity.mass;
            otherEntity.applyImpulse({
                x: 0,
                y: this.bounceForce * mass, // Multiply by mass for proper physics
                z: 0
            });
            
            // Play sound
            const worldToUse = this.worldActive || (otherEntity as any).world;
            if (worldToUse) {
                this.playGameSound({ uri: 'audio/sfx/boing-1.wav', volume: 0.7 }, worldToUse);
            }
        }
    };

    protected override updatePhysics(payload: EventPayloads[EntityEvent.TICK]): void {
        if (!this.moveEnabled) return;
        const { tickDeltaMs } = payload;
        const deltaTimeS = tickDeltaMs / 1000;
        this.updateMovement(deltaTimeS);
    }

    private updateMovement(deltaTimeS: number): void {
        const currentPos = Vector3.fromVector3Like(this.position);
        const currentComponent = this.getAxisComponent(currentPos, this.movementAxis);
        const targetComponent = this.getAxisComponent(
            this.movingForward ? this.targetPosition : this.originPosition,
            this.movementAxis
        );
        const distance = targetComponent - currentComponent;
        const direction = Math.sign(distance);
        if (Math.abs(distance) < 0.01) {
            this.movingForward = !this.movingForward;
            return;
        }
        const moveStep = this.moveSpeed * deltaTimeS;
        const actualMove = Math.min(moveStep, Math.abs(distance));
        const newComponent = currentComponent + direction * actualMove;
        const newPosition = new Vector3(
            this.movementAxis === 'x' ? newComponent : currentPos.x,
            this.movementAxis === 'y' ? newComponent : currentPos.y,
            this.movementAxis === 'z' ? newComponent : currentPos.z
        );
        this.setNextKinematicPosition(newPosition);
    }

    private getAxisComponent(vector: Vector3Like, axis: 'x' | 'y' | 'z'): number {
        return vector[axis];
    }

    public override activate(): void {
        super.activate();
    }

    public override deactivate(): void {
        super.deactivate();
    }

    public override reset(): void {
        super.reset();
        this.setPosition(this.originPosition);
        this.movingForward = true;
        this.lastBounceTime = 0;
    }
} 