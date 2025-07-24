import { Entity, Vector3, World, RigidBodyType, SimpleEntityController } from 'hytopia';

interface Coordinate { 
  x: number; 
  y: number; 
  z: number; 
}

interface ParkingLotEntity {
  type: 'decoration' | 'vehicle' | 'furniture';
  id: string;
  modelUri: string;
  relativePosition: Coordinate;
  facing?: Coordinate;
  scale?: number;
  rotationY?: number;
}

interface ParkingLotLayout {
  anchorCoordinate: Coordinate;
  description: string;
  entities: ParkingLotEntity[];
}

export class ParkingLotPopulator {
  private world: World;
  
  // Define the parking lot layout
  private parkingLotLayout: ParkingLotLayout = {
    anchorCoordinate: { x: 0, y: 1, z: 152 }, // Center of parking lot area (STORE_Z + PARKING_LOT_LENGTH/2)
    description: "Obby Lobby Parking Lot",
    entities: [
      // Test car - positioned in first left parking space
      // Left side first space: between x=-32 and x=-24, in first row at z=136
      {
        type: 'vehicle',
        id: 'test_red_truck',
        modelUri: 'models/items/red_truck.gltf',
        relativePosition: { x: -28, y: 2.5, z: -15 }, // x=-28 (middle of first space), y=2.5 (higher to clear wheels), z=-15 (one block away from building)
        scale: 1.0,
        rotationY: 0 // Facing north, along the parking lines
      },

      // Second left parking space (same row)
      {
        type: 'vehicle',
        id: 'blue_suv_1',
        modelUri: 'models/items/blue_suv.gltf',
        relativePosition: { x: -20, y: 2.5, z: -15 }, // Second left space
        scale: 1.0,
        rotationY: 0 // Facing north, along the parking lines
      },

      // First right parking space (same row)
      {
        type: 'vehicle',
        id: 'black_truck_1',
        modelUri: 'models/items/black_truck.gltf',
        relativePosition: { x: 12, y: 2.5, z: -15 }, // First right space
        scale: 1.0,
        rotationY: 0 // Facing north, along the parking lines
      },

      // Second right parking space (same row)
      {
        type: 'vehicle',
        id: 'red_suv_1',
        modelUri: 'models/items/red_suv.gltf',
        relativePosition: { x: 20, y: 2.5, z: -15 }, // Second right space
        scale: 1.0,
        rotationY: 0 // Facing north, along the parking lines
      },

      // Second row - furthest from building
      // Left side parking space (second row)
      {
        type: 'vehicle',
        id: 'blue_truck_2',
        modelUri: 'models/items/blue_truck.gltf',
        relativePosition: { x: -28, y: 2.5, z: 1 }, // Second row, left side
        scale: 1.0,
        rotationY: 0 // Facing north, along the parking lines
      },

      // Right side parking space (second row)
      {
        type: 'vehicle',
        id: 'black_suv_2',
        modelUri: 'models/items/black_suv.gltf',
        relativePosition: { x: 28, y: 2.5, z: 1 }, // Second row, moved two spots to the right
        scale: 1.0,
        rotationY: 0 // Facing north, along the parking lines
      }
    ]
  };

  constructor(world: World) {
    this.world = world;
  }

  public populateParkingLot(): void {
    console.log('[ParkingLotPopulator] Starting parking lot population...');
    
    const anchorPos = new Vector3(
      this.parkingLotLayout.anchorCoordinate.x,
      this.parkingLotLayout.anchorCoordinate.y,
      this.parkingLotLayout.anchorCoordinate.z
    );
    
    console.log(`[ParkingLotPopulator] ${this.parkingLotLayout.description} anchored at ${JSON.stringify(anchorPos)}`);

    this.parkingLotLayout.entities.forEach((entityData: ParkingLotEntity) => {
      const relativePos = new Vector3(
        entityData.relativePosition.x,
        entityData.relativePosition.y,
        entityData.relativePosition.z
      );
      
      const finalPos = new Vector3(anchorPos.x, anchorPos.y, anchorPos.z).add(relativePos);
      
      console.log(`[ParkingLotPopulator] Spawning ${entityData.type}: ${entityData.id} at ${JSON.stringify(finalPos)}`);
      
      this.spawnEntity(entityData, finalPos);
    });
    
    console.log('[ParkingLotPopulator] Parking lot population complete');
  }

  private spawnEntity(data: ParkingLotEntity, position: Vector3): void {
    try {
      const entity = new Entity({
        name: data.id,
        modelUri: data.modelUri,
        modelScale: data.scale || 1.0,
        modelLoopedAnimations: ['idle'],
        controller: new SimpleEntityController(),
        rigidBodyOptions: { type: RigidBodyType.KINEMATIC_POSITION }
      });
      
      entity.spawn(this.world, position);
      
      // Apply rotation if specified
      if (data.rotationY) {
        const rotationYRad = data.rotationY * (Math.PI / 180);
        entity.setRotation({ x: 0, y: rotationYRad, z: 0, w: 1 });
      }
      
      // Apply facing if provided
      if (data.facing) {
        const controller = entity.controller as SimpleEntityController;
        controller?.face(data.facing, 1);
        console.log(`[ParkingLotPopulator] Applied facing to ${data.id}: ${JSON.stringify(data.facing)}`);
      }
      
      console.log(`[ParkingLotPopulator] Successfully spawned ${data.id}`);
    } catch (error) {
      console.error(`[ParkingLotPopulator] Error spawning ${data.id}:`, error);
    }
  }
} 