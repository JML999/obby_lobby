import { Entity, World, type Vector3Like, type EntityOptions, Vector3, EntityEvent, type EventPayloads, Quaternion, RigidBodyType, ColliderShape, CoefficientCombineRule, CollisionGroup, Collider } from 'hytopia';
import ObstacleEntity from './ObstacleEntity';
// Define beam size options
export type BeamType = 'small' | 'large';

export interface RotatingBeamOptions {
	beamType?: BeamType;  // Size property for beam type
	rotationSpeed?: number; // degrees per second
    clockwise?: boolean;
    beamColor?: number;
    bounciness?: number; // Restitution/bounciness coefficient
}

/**
 * A rotating beam obstacle that spins continuously
 */
export default class RotatingBeamEntity extends ObstacleEntity {
    private pivotEntity: Entity | null = null;
    private rotationSpeed: number;
    private clockwise: boolean;
    private currentRotation: number = 0;
	private beamType: BeamType;
    private beamColor: number;
    private bounciness: number;
    /**
     * Create a new rotating beam obstacle
     * @param options Configuration options for the beam
     * @param world The world to spawn in
     */
    constructor(options: RotatingBeamOptions & EntityOptions = {}, world: World) {
        // Determine beam size and set appropriate model
        const beamType = options.beamType || 'large';
        let modelPath = '';
        let modelScale = 0.5; // Default uniform scale
        
        // Set model path and scale based on size
        switch (beamType) {
            case 'small':
                modelPath = 'models/obstacles/beam_small.gltf';
                modelScale = 1; // Smaller scale for small beams
                break;
            case 'large':
            default:
                modelPath = 'models/obstacles/beam_large.gltf';
                modelScale = 1.2; // Slightly smaller scale for large beams
                break;
        }
        
        // Get bounciness value from options or use default
        const bounciness = options.bounciness ?? 0.5; // Default medium bounciness
        
        // Base entity options
        const entityOptions: EntityOptions = {
            name: `Rotating Beam (${beamType})`,
            modelUri: modelPath,
            modelScale: modelScale,
            rigidBodyOptions: {
                type: RigidBodyType.KINEMATIC_POSITION,
                // We'll set the bounciness via code after spawning
				colliders: [
					{
						// Derive shape/size from model
						...Collider.optionsFromModelUri(modelPath, modelScale),
						// Set friction properties using defaults or overrides
						friction: 0.0, // Physical friction coefficient
						frictionCombineRule: CoefficientCombineRule.Min, // How friction is combined with other objects
					}
				],
            },
            ...options
        };
        
        // Call parent constructor
        super(entityOptions);
        
        // Store configuration
        this.beamType = beamType;
        this.beamColor = options.beamColor ?? 0xff5555;
        this.rotationSpeed = options.rotationSpeed ?? 30;
        this.clockwise = options.clockwise ?? true;
        this.bounciness = bounciness;
        
        // Register event handler for spawning
        this.on(EntityEvent.SPAWN, this.onSpawned);
    }
    
    /**
     * Called when the beam is spawned
     */
    private onSpawned = (): void => {
        if (!this.isSpawned || !this.world) return;

        // Log beam properties
        console.log(`[RotatingBeamEntity] Spawned ${this.beamType} beam with bounciness: ${this.bounciness}`);
    };
    
    /**
     * Apply physics updates for rotation
     */
    protected override updatePhysics(payload: EventPayloads[EntityEvent.TICK]): void {
        if (!this.isSpawned) return;
        
        // Calculate rotation change based on delta time
        const deltaTimeS = payload.tickDeltaMs / 1000.0;
        const rotationChange = (this.clockwise ? -1 : 1) * (this.rotationSpeed * deltaTimeS);
        this.currentRotation += rotationChange;
        
        // Calculate and set rotation
        const radians = this.currentRotation * (Math.PI / 180);
        const halfRadians = radians / 2;
        const quat = { x: 0, y: Math.sin(halfRadians), z: 0, w: Math.cos(halfRadians) };
        
        this.setNextKinematicRotation(quat);
    }

    /**
     * Start the rotation of the beam
     */
    public startRotation(): void {
        this.activate();
    }

    /**
     * Stop the rotation of the beam
     */
    public stopRotation(): void {
        this.deactivate();
    }

    /**
     * Reset the beam to its starting position
     */
    public resetState(): void {
        // First deactivate to reset the activated flag
        this.deactivate();
        
		console.log(`[RotatingBeamEntity] Resetting state ${this.name}`);
        // Reset rotation
        this.currentRotation = 0;
        this.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
    }

    /**
     * Despawn the beam and clean up
     */
    public override despawn(): void {
        this.stopRotation();
        
        if (this.pivotEntity && this.pivotEntity.isSpawned) {
            this.pivotEntity.despawn();
        }
        this.pivotEntity = null;
        
        super.despawn();
    }
    
    /**
     * Get the type of this beam
     */
    public getBeamType(): BeamType {
        return this.beamType;
    }
    
    /**
     * Get the bounciness value of this beam
     */
    public getBounciness(): number {
        return this.bounciness;
    }
    
    /**
     * Set the bounciness value and update collider if spawned
     */
    public setBounciness(value: number): void {
        this.bounciness = Math.max(0, Math.min(1, value)); // Clamp between 0 and 1
        
        // If entity is spawned, update the bounciness value
        if (this.isSpawned && this.rawRigidBody) {
            try {
                const colliders = this.rawRigidBody.colliders();
                for (const collider of colliders) {
                    if (typeof collider.setRestitution === 'function') {
                        collider.setRestitution(this.bounciness);
                    }
                }
            } catch (error) {
                console.error(`[RotatingBeamEntity] Failed to update bounciness: ${error}`);
            }
        }
    }
    
    /**
     * Override the activate method from ObstacleEntity
     * Start the beam's rotation when activated
     */
    public override activate(): void {
        super.activate();
        console.log(`[RotatingBeamEntity ${this.name || this.id}] Starting rotation`);
    }
    
    /**
     * Override the deactivate method from ObstacleEntity
     * Stop the beam's rotation when deactivated
     */
    public override deactivate(): void {
        super.deactivate();
        console.log(`[RotatingBeamEntity ${this.name || this.id}] Stopping rotation`);
    }
    
    /**
     * Get the current rotation speed in degrees per second
     */
    public getRotationSpeed(): number {
        return this.rotationSpeed;
    }
    
    /**
     * Set a new rotation speed in degrees per second
     * @param speed New rotation speed
     */
    public setRotationSpeed(speed: number): void {
        this.rotationSpeed = speed;
        console.log(`[RotatingBeamEntity ${this.name || this.id}] Speed set to ${speed.toFixed(1)} degrees/sec`);
    }
} 