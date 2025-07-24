import { World, Vector3 } from 'hytopia';
import { TrafficVehicleEntity } from './entities/TrafficVehicleEntity';

export class TrafficManager {
    private world: World;
    private activeVehicles: TrafficVehicleEntity[] = [];
    private spawnTimer: ReturnType<typeof setTimeout> | null = null;
    private isRunning: boolean = false;

    // Vehicle model options
    private vehicleModels = [
        'models/items/red_truck.gltf',
        'models/items/blue_truck.gltf',
        'models/items/black_truck.gltf',
        'models/items/red_suv.gltf',
        'models/items/blue_suv.gltf',
        'models/items/black_suv.gltf',
    ];

    // Road constants (matching the actual world coordinates from debug)
    private readonly STORE_Z = 128; // MAP_LENGTH / 2
    private readonly PARKING_LOT_LENGTH = 48;
    private readonly STREET_LENGTH = 16;
    private readonly ROAD_Y = 1.79; // Actual road surface height
    private readonly ROAD_WIDTH = 140; // Actual road width (from -70 to +70)
    
    // Traffic settings
    private readonly MIN_SPAWN_DELAY = 2000; // 2 seconds delay between vehicles
    private readonly MAX_SPAWN_DELAY = 5000; // 5 seconds max delay between vehicles
    private readonly VEHICLE_SPEED = 3; // Units per second

    constructor(world: World) {
        this.world = world;
    }

    /**
     * Start the traffic system
     */
    public start(): void {
        if (this.isRunning) {
            console.log('[TrafficManager] Traffic system already running');
            return;
        }

        this.isRunning = true;
        console.log('[TrafficManager] Starting traffic system');
        
        // Start the first vehicle immediately
        this.spawnRandomVehicle();
    }

    /**
     * Stop the traffic system
     */
    public stop(): void {
        if (!this.isRunning) {
            console.log('[TrafficManager] Traffic system already stopped');
            return;
        }

        this.isRunning = false;
        console.log('[TrafficManager] Stopping traffic system');
        
        // Clear spawn timer
        if (this.spawnTimer) {
            clearTimeout(this.spawnTimer);
            this.spawnTimer = null;
        }

        // Clean up active vehicles
        this.activeVehicles.forEach(vehicle => {
            vehicle.destroy();
        });
        this.activeVehicles = [];
    }

    /**
     * Schedule the next vehicle spawn with a delay
     */
    private scheduleNextSpawn(): void {
        if (!this.isRunning) return;

        const delay = Math.random() * (this.MAX_SPAWN_DELAY - this.MIN_SPAWN_DELAY) + this.MIN_SPAWN_DELAY;
        
        this.spawnTimer = setTimeout(() => {
            this.spawnRandomVehicle();
        }, delay);
    }

    /**
     * Spawn a random vehicle going in a random direction
     */
    private spawnRandomVehicle(): void {
        if (!this.isRunning) {
            return;
        }

        // Only spawn if there are no active vehicles
        if (this.activeVehicles.length > 0) {
            console.log('[TrafficManager] Skipping spawn - vehicle already active');
            return;
        }

        // Pick random vehicle model
        const modelUri = this.vehicleModels[Math.floor(Math.random() * this.vehicleModels.length)];
        
        if (!modelUri) {
            console.error('[TrafficManager] No vehicle model found');
            return;
        }
        
        // Pick random direction (0 = east to west, 1 = west to east)
        const direction = Math.floor(Math.random() * 2);
        
        // Create waypoints based on direction
        const waypoints = this.createWaypoints(direction);
        
        // Create vehicle with completion callback
        const vehicle = new TrafficVehicleEntity(
            modelUri,
            waypoints,
            this.VEHICLE_SPEED,
            () => {
                // Remove from active vehicles and schedule next spawn
                this.removeVehicle(vehicle);
                this.scheduleNextSpawn();
            }
        );

        // Add to active vehicles and spawn
        this.activeVehicles.push(vehicle);
        vehicle.spawnInWorld(this.world);
        
        console.log(`[TrafficManager] Spawned ${modelUri} going ${direction === 0 ? 'east to west' : 'west to east'} (active: ${this.activeVehicles.length})`);
    }

    /**
     * Create waypoints for vehicle movement
     */
    private createWaypoints(direction: number): Vector3[] {
        const roadCenterZ = 188; // Based on user's coordinates
        
        // Define safe driving lanes (staying away from curbs)
        // Road is 16 blocks deep, so we'll use lanes at ±2 and ±4 blocks from center
        const safeLanes = [
            roadCenterZ - 4, // Lane closer to parking lot (Z=184)
            roadCenterZ - 2, // Lane closer to parking lot (Z=186) 
            roadCenterZ + 2, // Lane closer to store (Z=190)
            roadCenterZ + 4  // Lane closer to store (Z=192)
        ];
        
        // Pick a random safe lane
        const selectedLane = safeLanes[Math.floor(Math.random() * safeLanes.length)] || roadCenterZ;
        
        console.log(`[TrafficManager] Using lane Z=${selectedLane}`);
        
        const waypoints: Vector3[] = [];
        
        if (direction === 0) {
            // East to west: start far east, go through middle, end far west
            waypoints.push(new Vector3(80, this.ROAD_Y, selectedLane));   // Start well off-screen east
            waypoints.push(new Vector3(0, this.ROAD_Y, selectedLane));    // Middle point (center of road)
            waypoints.push(new Vector3(-80, this.ROAD_Y, selectedLane)); // End well off-screen west
        } else {
            // West to east: start far west, go through middle, end far east
            waypoints.push(new Vector3(-80, this.ROAD_Y, selectedLane)); // Start well off-screen west
            waypoints.push(new Vector3(0, this.ROAD_Y, selectedLane));   // Middle point (center of road)
            waypoints.push(new Vector3(80, this.ROAD_Y, selectedLane));  // End well off-screen east
        }
        
        console.log(`[TrafficManager] Created 3-point waypoints:`, waypoints.map(w => `(${w.x}, ${w.y}, ${w.z})`));
        
        return waypoints;
    }

    /**
     * Remove a vehicle from active vehicles list
     */
    private removeVehicle(vehicle: TrafficVehicleEntity): void {
        const index = this.activeVehicles.indexOf(vehicle);
        if (index > -1) {
            this.activeVehicles.splice(index, 1);
            vehicle.destroy(); // Properly destroy the vehicle
            console.log(`[TrafficManager] Removed vehicle, active count: ${this.activeVehicles.length}`);
        }
    }

    /**
     * Get current active vehicle count
     */
    public getActiveVehicleCount(): number {
        return this.activeVehicles.length;
    }
} 