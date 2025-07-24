import { Entity, SimpleEntityController, Vector3, World, EntityEvent, RigidBodyType } from 'hytopia';
import type { EventPayloads } from 'hytopia';

export class TrafficVehicleEntity extends Entity {
    private moveSpeed: number;
    private waypoints: Vector3[] = [];
    private currentTargetIndex = 0;
    private onCompleteCallback?: () => void;

    constructor(
        modelUri: string,
        waypoints: Vector3[],
        moveSpeed: number,
        onCompleteCallback?: () => void
    ) {
        if (waypoints.length === 0) {
            throw new Error("TrafficVehicleEntity requires at least one waypoint.");
        }

        super({
            controller: new SimpleEntityController(),
            name: 'TrafficVehicle',
            modelUri: modelUri,
            modelScale: 1.0,
            rigidBodyOptions: {
                type: RigidBodyType.DYNAMIC,
                enabledRotations: { x: false, y: false, z: false },
                ccdEnabled: true,
            }
        });
        
        this.waypoints = waypoints;
        this.moveSpeed = moveSpeed;
        this.onCompleteCallback = onCompleteCallback;

        // Add tick listener for facing target
        this.on(EntityEvent.TICK, this._onTick);
    }

    private _onTick = (payload: EventPayloads[EntityEvent.TICK]): void => {
        // Only face target if we have waypoints and are currently moving
        if (this.waypoints.length < 1 || this.currentTargetIndex >= this.waypoints.length) {
            return;
        }
        
        const controller = this.controller as SimpleEntityController;
        const targetWaypoint = this.waypoints[this.currentTargetIndex];
        
        if (targetWaypoint) {
            // Continuously face the target waypoint while moving
            controller.face(targetWaypoint, this.moveSpeed * 2);
        }
    }

    private moveToNextWaypoint(): void {
        if (this.waypoints.length === 0) {
            console.warn(`[${this.name}] Cannot move, no waypoints defined.`);
            return;
        }

        // Check if we've reached the end
        if (this.currentTargetIndex >= this.waypoints.length) {
            // Vehicle has completed its journey
            this.stopModelAnimations(['payload.move']);
            
            // Call completion callback to handle cleanup and next spawn
            if (this.onCompleteCallback) {
                this.onCompleteCallback();
            }
            return;
        }

        const controller = this.controller as SimpleEntityController;
        const targetWaypoint = this.waypoints[this.currentTargetIndex];

        if (targetWaypoint) {
            // Face the target and start moving animation
            controller.face(targetWaypoint, this.moveSpeed * 4);
            
            // Start the correct animation for vehicles
            this.startModelLoopedAnimations(['payload.move']);

            controller.move(targetWaypoint, this.moveSpeed, {
                moveCompleteCallback: () => {
                    // Move to next waypoint
                    this.currentTargetIndex++;
                    this.moveToNextWaypoint();
                },
                moveIgnoreAxes: { y: true } 
            });
        }
    }

    public spawnInWorld(world: World): void {
        if (this.waypoints.length === 0) {
            console.error(`[${this.name}] Cannot spawn, no waypoints defined.`);
            return;
        }
        
        const spawnPosition = this.waypoints[0];
        if (spawnPosition) {
            super.spawn(world, spawnPosition);
            console.log(`[${this.name}] Traffic vehicle spawned at position (${spawnPosition.x}, ${spawnPosition.y}, ${spawnPosition.z})`);
            
            // Start movement after a short delay
            setTimeout(() => {
                this.currentTargetIndex = 1; // Start moving toward second waypoint
                this.moveToNextWaypoint();
            }, 500);
        }
    }
    
    public destroy(): void {
        // Remove listeners
        this.off(EntityEvent.TICK, this._onTick);
        
        // Stop the vehicle animation
        this.stopModelAnimations(['payload.move']);
        
        // Despawn the entity
        this.despawn();
    }
} 