import { type EntityOptions, EntityEvent, type EventPayloads, RigidBodyType, Quaternion, Collider, CoefficientCombineRule, World } from 'hytopia';
import ObstacleEntity from './ObstacleEntity';

// --- Configuration for Seesaw Physics ---
// Maximum allowed rotation angle in radians (about 35 degrees)
const MAX_ANGLE = 0.65;
// TEST: Enable 360 rotation to test player movement
const ENABLE_360_ROTATION = true;
const ROTATION_SPEED = 30; // degrees per second
// ----------------------------------------

export default class SeesawEntity extends ObstacleEntity {
	static DEFAULT_SCALE = 3;
	private currentRotation: number = 0; // Track rotation for 360 mode
	
	constructor(options: EntityOptions = {}, world: World) {
		const modelScale = (options as any).modelScale ?? SeesawEntity.DEFAULT_SCALE; // Use option or default
		const defaultOptions: EntityOptions = {
			name: 'Seesaw',
			modelUri: 'models/obstacles/seesaw_platform.gltf',
			modelScale: modelScale,
			rigidBodyOptions: {
				type: RigidBodyType.DYNAMIC, // Keep it DYNAMIC - that's the whole point!
				additionalSolverIterations: 50,
				enabledPositions: { x: false, y: false, z: false },	
				enabledRotations: { x: false, y: true, z: false }, // Allow only Y rotation (like a merry-go-round)
				// NOTE: Adding collider back based on modelddddd
				colliders: [
					{
						// Derive shape/size from model with the same scale
						...Collider.optionsFromModelUri('models/obstacles/seesaw_platform.gltf', modelScale),
						// Set friction properties using defaults or overrides
						friction: 0.2, // Physical friction coefficient
						frictionCombineRule: CoefficientCombineRule.Min // How friction is combined with other objects
					}
				],
				// Mass and friction are often part of the collider definition or calculated automatically.
				// We will access this.mass later in the physics update.
				// Set a higher center of mass to make it less stable initially if needed
				// centerOfMass: { x: 0, y: 0.1, z: 0 }
				// Increase angular damping if it spins too freely
				angularDamping: 0.05,
				ccdEnabled: true,
			},
		};
		
		// Merge default options with any provided options
		super({ ...defaultOptions, ...options });
		
		// Register our physics update method to replace the parent class's event handler
		this.off(EntityEvent.TICK, this.onPhysicsUpdate);
		this.on(EntityEvent.TICK, this.onPhysicsUpdate);
	}

	/**
	 * Applies simple angle clamping and gentle center-returning force to the seesaw.
	 * OR in test mode: rotates 360 degrees continuously
	 */
	protected override updatePhysics = (payload: EventPayloads[EntityEvent.TICK]): void => {
		if (!this.isSpawned || !this.rawRigidBody) return;

		if (ENABLE_360_ROTATION) {
			// TEST MODE: Apply constant torque to create continuous rotation
			const targetAngularVelocity = (ROTATION_SPEED * Math.PI) / 180; // Convert to radians/second
			
			// Get current angular velocity
			const currentAngularVelocity = this.angularVelocity;
			
			// Apply torque to maintain constant rotation speed
			// Torque = I * alpha, where I is moment of inertia and alpha is angular acceleration
			// We'll use a simple proportional controller
			const velocityError = targetAngularVelocity - currentAngularVelocity.y;
			const torqueStrength = 100.0; // Adjust this to control how quickly it reaches target speed
			
			// Apply torque around Y axis (like a merry-go-round)
			this.applyTorqueImpulse({
				x: 0,
				y: velocityError * torqueStrength * payload.tickDeltaMs / 1000.0,
				z: 0
			});
			
			// Track rotation for debugging
			const currentQuat = Quaternion.fromQuaternionLike(this.rotation);
			const currentYAngle = 2 * Math.asin(Math.abs(currentQuat.y)) * Math.sign(currentQuat.y);
			this.currentRotation = (currentYAngle * 180) / Math.PI;
			
			// Debug log
			if (Math.floor(Math.abs(this.currentRotation)) % 30 === 0) {
				console.log(`[SeesawEntity] 360 TEST MODE - Rotation: ${this.currentRotation.toFixed(1)}°, Angular Vel Y: ${currentAngularVelocity.y.toFixed(3)}`);
			}
		} else {
			// NORMAL MODE: Original seesaw behavior
			// Extract current Z rotation angle from quaternion
			const currentQuat = Quaternion.fromQuaternionLike(this.rotation);
			const currentZAngle = 2 * Math.asin(Math.abs(currentQuat.z)) * Math.sign(currentQuat.z);
			
			// Debug logging - only log occasionally to avoid spam
			if (Math.random() < 0.01) { // 1% chance per frame
				console.log(`[SeesawEntity] Current Z angle: ${(currentZAngle * 180 / Math.PI).toFixed(1)}°`);
			}
			
			// Simple clamping - if beyond max angle, set rotation to max angle
			if (Math.abs(currentZAngle) > MAX_ANGLE) {
				// Clamp the angle to the maximum allowed
				const clampedAngle = MAX_ANGLE * Math.sign(currentZAngle);
				const halfAngle = clampedAngle / 2;
				
				// Create quaternion for Z-axis rotation with clamped angle
				const clampedQuat = new Quaternion(0, 0, Math.sin(halfAngle), Math.cos(halfAngle));
				
				// Set the rotation directly
				this.setRotation(clampedQuat);
			}
		}
	}
} 