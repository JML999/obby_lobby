import { World, Vector3, PlayerEntity } from "hytopia";
import type { Player, Vector3Like } from "hytopia";
import { BouncePadObstacle } from "./obstacles/BouncePadObstacle";
import RotatingBeamEntity from "./obstacles/RotatingBeamEntity";
import SeesawEntity from "./obstacles/SeesawEntity";
import { PlotBoundaryManager } from "./PlotBoundaryManager";
import { ObstacleCollisionManager } from "./ObstacleCollisionManager";
import { MechanicalPistonEntity } from "./entities/MechanicalPistonEntity";
import { MechanicalWheelEntity } from "./entities/MechanicalWheelEntity";
import { MechanicalElevatorEntity } from "./entities/MechanicalElevatorEntity";
import { MechanicalBlockManager } from "./MechanicalBlockManager";
import { ResizableMechanicalBlock } from "./interfaces/ResizableMechanicalBlock";

export interface ObstacleType {
  id: string;
  name: string;
  type: string;
  size: string;
  description: string;
  category: string;
}

export class ObstaclePlacementManager {
  private static instance: ObstaclePlacementManager;
  private world?: World;
  private plotBoundaryManager: PlotBoundaryManager;
  private obstacleCollisionManager: ObstacleCollisionManager;
  
  // Obstacle catalog matching the UI
  public readonly OBSTACLE_CATALOG: ObstacleType[] = [
    // Jump Pad (renamed from Bounce Pad, only small size)
    { id: 'bounce_pad_small', name: 'Jump Pad', type: 'bounce_pad', size: 'small', description: 'Jump pad for bouncing', category: 'movement' },
    
    // Rotating Beam (only small size)
    { id: 'rotating_beam_small', name: 'Rotating Beam', type: 'rotating_beam', size: 'small', description: 'Rotating beam obstacle', category: 'hazard' },
    
    // Seesaw (physics test for rotating platforms)
    { id: 'seesaw', name: 'Seesaw (360° Test)', type: 'seesaw', size: 'standard', description: 'Physics-based rotating platform for testing', category: 'movement' },
    
    // Mechanical Blocks (treated as obstacles for entity-based behavior)
    { id: 'mechanical_piston', name: 'Mechanical Piston', type: 'mechanical_piston', size: 'standard', description: 'Piston that extends and retracts', category: 'mechanical' },
    { id: 'mechanical_wheel', name: 'Mechanical Wheel', type: 'mechanical_wheel', size: 'standard', description: 'Wheel that rotates around a center', category: 'mechanical' },
    { id: 'mechanical_elevator', name: 'Mechanical Elevator', type: 'mechanical_elevator', size: 'standard', description: 'Elevator that moves up and down', category: 'mechanical' }
  ];

  public static getInstance(): ObstaclePlacementManager {
    if (!ObstaclePlacementManager.instance) {
      ObstaclePlacementManager.instance = new ObstaclePlacementManager();
    }
    return ObstaclePlacementManager.instance;
  }

  private constructor() {
    this.plotBoundaryManager = PlotBoundaryManager.getInstance();
    this.obstacleCollisionManager = ObstacleCollisionManager.getInstance();
  }

  public initializeWorld(world: World): void {
    this.world = world;
    console.log('[ObstaclePlacementManager] Initialized with world');
  }

  // Place an obstacle at the target position
  public placeObstacle(player: Player, obstacleId: string, position: Vector3Like, plotId?: string, isRightClick: boolean = false): boolean {
    if (!this.world) return false;
    
    const obstacleType = this.OBSTACLE_CATALOG.find(o => o.id === obstacleId);
    if (!obstacleType) {
      console.log(`[ObstaclePlacementManager] Obstacle ID ${obstacleId} not found in catalog`);
      return false;
    }
    
    // 1. FIRST: Check if this is a mechanical block type and try to resize existing block
    if (this.isMechanicalBlock(obstacleType.type)) {
      const existingEntity = this.findNearbyMechanicalBlock(position, obstacleType.type, 8); // 8 block radius
      
      if (existingEntity) {
        // Found existing mechanical block - try to resize it
        const oldSize = existingEntity.getCurrentSize();
        const success = isRightClick ? 
          existingEntity.resizeSmaller() : 
          existingEntity.resizeLarger();
          
        if (success) {
          // Resize succeeded - despawn old entity and spawn new one with updated size
          const newSize = existingEntity.getCurrentSize();
          const spawnPosition = existingEntity.getSpawnPosition(); // Use original spawn position from interface
          const entityRotation = (existingEntity as any).currentRotation || 0;
          // No need for entity category
          
          console.log(`[ObstaclePlacementManager] Resizing ${obstacleType.type} from size ${oldSize} to ${newSize} at spawn position (${spawnPosition.x}, ${spawnPosition.y}, ${spawnPosition.z})`);
          
          // Despawn old entity
          (existingEntity as any).despawn();
          
          // Spawn new entity with updated size at original spawn position
          this.spawnMechanicalBlockWithSize(obstacleType.type, spawnPosition, newSize, entityRotation);
          
          const action = isRightClick ? "shrunk" : "expanded";
          const sizeDescription = existingEntity.getSizeDescription();
          
          this.world.chatManager.sendPlayerMessage(
            player, 
            `${obstacleType.name} ${action} to ${sizeDescription}`,
            '00FF00'
          );
        } else {
          // Resize failed (at min/max size)
          this.world.chatManager.sendPlayerMessage(
            player, 
            `${obstacleType.name} already at ${isRightClick ? 'minimum' : 'maximum'} size`,
            'FFAA00'
          );
        }
        
        return true; // Block placement handled
      }
    }
    
    // 2. FALLBACK: No existing block found, place new one (existing logic)
    // Check collision and boundaries using the new collision manager
    const canPlace = this.obstacleCollisionManager.canPlaceObstacle(
      plotId, 
      obstacleType.type, 
      obstacleType.size, 
      position
    );
    
    if (!canPlace.valid) {
      this.world.chatManager.sendPlayerMessage(player, canPlace.reason || 'Cannot place obstacle here!', 'FF0000');
      if (canPlace.suggestion) {
        this.world.chatManager.sendPlayerMessage(player, canPlace.suggestion, 'FFAA00');
      }
      return false;
    }
    
    // Spawn the obstacle based on type
    const success = this.spawnObstacle(obstacleType, position);
    
    if (success) {
      // Register the obstacle in the collision manager
      this.obstacleCollisionManager.registerObstacle(
        plotId,
        obstacleId,
        obstacleType.type,
        obstacleType.size,
        position
      );
      
      this.world.chatManager.sendPlayerMessage(player, `Placed ${obstacleType.name} (${obstacleType.size})`, '00FF00');
      return true;
    } else {
      this.world.chatManager.sendPlayerMessage(player, 'Failed to place obstacle!', 'FF0000');
      return false;
    }
  }

  // Remove an obstacle at the target position
  public removeObstacle(player: Player, position: Vector3Like, plotId?: string): { success: boolean; obstacleType?: string; obstacleSize?: string } {
    if (!this.world) return { success: false };
    
    // Find obstacles near the target position
    const obstacles = this.world.entityManager.getEntitiesByTag('obstacle');
    const targetPos = new Vector3(position.x, position.y, position.z);
    const searchRadius = 5; // Increased from 2 to 5 for better detection range
    
    for (const obstacle of obstacles) {
      const obstaclePos = obstacle.position;
      const distance = Math.sqrt(
        Math.pow(obstaclePos.x - targetPos.x, 2) +
        Math.pow(obstaclePos.y - targetPos.y, 2) +
        Math.pow(obstaclePos.z - targetPos.z, 2)
      );
      
      console.log(`[ObstaclePlacementManager] Checking obstacle at ${obstaclePos.x}, ${obstaclePos.y}, ${obstaclePos.z} - distance: ${distance.toFixed(2)}`);
      
      if (distance <= searchRadius) {
        // Found an obstacle to remove
        const obstacleName = obstacle.constructor.name;
        obstacle.despawn();
        
        // Unregister from collision manager and get obstacle data
        const removedObstacleData = this.obstacleCollisionManager.unregisterObstacle(plotId, obstaclePos, searchRadius);
        
        this.world.chatManager.sendPlayerMessage(player, `Removed ${obstacleName}`, 'FFA500');
        
        // Return obstacle data for cash refund
        if (removedObstacleData) {
          return { 
            success: true, 
            obstacleType: removedObstacleData.type, 
            obstacleSize: removedObstacleData.size 
          };
        } else {
          return { success: true }; // Fallback if no data available
        }
      }
    }
    
    this.world.chatManager.sendPlayerMessage(player, 'No obstacle found to remove here!', 'FF0000');
    return { success: false };
  }

  private spawnObstacle(obstacleType: ObstacleType, position: Vector3Like): boolean {
    if (!this.world) return false;

    try {
      let obstacle: any = null;

      switch (obstacleType.type) {
        case 'bounce_pad':
          obstacle = new BouncePadObstacle({ size: obstacleType.size as 'small' | 'medium' | 'large' }, this.world);
          break;
          
        case 'rotating_beam':
          const beamType = obstacleType.size === 'small' ? 'small' : 'large';
          obstacle = new RotatingBeamEntity({ beamType, rotationSpeed: 45 }, this.world);
          break;
          
        case 'seesaw':
          obstacle = new SeesawEntity({}, this.world);
          break;
          
        case 'mechanical_piston':
          obstacle = new MechanicalPistonEntity(this.world, 'x', position, 1);
          break;
          
        case 'mechanical_wheel':
          obstacle = new MechanicalWheelEntity(this.world, position, 0, 1, 'both', false);
          break;
          
        case 'mechanical_elevator':
          obstacle = new MechanicalElevatorEntity(this.world, position, 1);
          break;
          
        default:
          console.log(`[ObstaclePlacementManager] Unknown obstacle type: ${obstacleType.type}`);
          return false;
      }

      if (obstacle) {
        // Spawn the obstacle
        obstacle.spawn(this.world, position);
        
        // Activate obstacles that need activation (except mechanical blocks in build mode)
        if (obstacleType.type === 'rotating_beam' || obstacleType.type === 'seesaw') {
          obstacle.activate();
        } else if (obstacleType.type === 'mechanical_piston' || obstacleType.type === 'mechanical_wheel' || obstacleType.type === 'mechanical_elevator') {
          // Always activate mechanical blocks (they handle their own logic)
          obstacle.activate();
          console.log(`[ObstaclePlacementManager] Activated ${obstacleType.type}`);
        }
        
        console.log(`[ObstaclePlacementManager] Successfully spawned ${obstacleType.name} at`, position);
        return true;
      }
    } catch (error) {
      console.error(`[ObstaclePlacementManager] Error spawning obstacle:`, error);
    }
    
    return false;
  }

  // Check if a position is valid for obstacle placement (fallback for non-plot areas)
  private isValidPlacement(position: Vector3Like): boolean {
    // Basic bounds checking for global areas
    if (Math.abs(position.x) > 200 || Math.abs(position.z) > 200) return false;
    if (position.y < -50 || position.y > 100) return false;
    
    return true;
  }

  // Get obstacle info by ID
  public getObstacleInfo(obstacleId: string): ObstacleType | null {
    return this.OBSTACLE_CATALOG.find(o => o.id === obstacleId) || null;
  }

  // Show available obstacles to player
  public showObstacleCatalog(player: Player): void {
    if (!this.world) return;
    
    this.world.chatManager.sendPlayerMessage(player, '⚡ Available Obstacles:', 'FFFF00');
    
    const categories = ['movement', 'hazard'];
    categories.forEach(category => {
      const categoryObstacles = this.OBSTACLE_CATALOG.filter(o => o.category === category);
      if (categoryObstacles.length > 0) {
        this.world!.chatManager.sendPlayerMessage(player, `--- ${category.toUpperCase()} ---`, 'CCCCCC');
        categoryObstacles.forEach(obstacle => {
          this.world!.chatManager.sendPlayerMessage(player, 
            `${obstacle.name} (${obstacle.size}) - ${obstacle.description}`, 'FFFFFF');
        });
      }
    });
  }

  // =================================================================
  // MECHANICAL BLOCK RESIZE HELPER METHODS
  // =================================================================

  /**
   * Check if an obstacle type is a mechanical block that can be resized
   */
  private isMechanicalBlock(type: string): boolean {
    return ['mechanical_piston', 'mechanical_wheel', 'mechanical_elevator'].includes(type);
  }

  /**
   * Find a nearby mechanical block of the specified type within the given radius
   */
  private findNearbyMechanicalBlock(position: Vector3Like, blockType: string, radius: number): ResizableMechanicalBlock | null {
    if (!this.world) return null;
    
    const entities = this.world.entityManager.getEntitiesByTag('obstacle');
    
    for (const entity of entities) {
      // Check if it's the right type of mechanical block
      if (this.matchesMechanicalType(entity, blockType)) {
        // Calculate distance manually (HYTOPIA Vector3 doesn't have distanceTo method)
        const entityPos = entity.position;
        const distance = Math.sqrt(
          Math.pow(entityPos.x - position.x, 2) +
          Math.pow(entityPos.y - position.y, 2) +
          Math.pow(entityPos.z - position.z, 2)
        );
        
        if (distance <= radius) {
          console.log(`[ObstaclePlacementManager] Found nearby ${blockType} at distance ${distance.toFixed(2)}`);
          return entity as ResizableMechanicalBlock;
        }
      }
    }
    
    console.log(`[ObstaclePlacementManager] No nearby ${blockType} found within ${radius} blocks`);
    return null;
  }

  /**
   * Check if an entity matches the specified mechanical block type
   */
  private matchesMechanicalType(entity: any, type: string): boolean {
    switch (type) {
      case 'mechanical_piston': 
        return entity instanceof MechanicalPistonEntity;
      case 'mechanical_wheel': 
        return entity instanceof MechanicalWheelEntity; 
      case 'mechanical_elevator': 
        return entity instanceof MechanicalElevatorEntity;
      default: 
        return false;
    }
  }

  /**
   * Spawn a mechanical block with specific size (for resizing)
   */
  private spawnMechanicalBlockWithSize(blockType: string, position: Vector3Like, size: number, rotation: number = 0): boolean {
    if (!this.world) return false;

    try {
      let newEntity: any = null;

      switch (blockType) {
        case 'mechanical_piston':
          newEntity = new MechanicalPistonEntity(this.world, 'x', position, size);
          break;
          
        case 'mechanical_wheel':
          newEntity = new MechanicalWheelEntity(this.world, position, rotation, size, 'both', false);
          break;
          
        case 'mechanical_elevator':
          newEntity = new MechanicalElevatorEntity(this.world, position, size);
          break;
          
        default:
          console.log(`[ObstaclePlacementManager] Unknown mechanical block type: ${blockType}`);
          return false;
      }

      if (newEntity) {
        // Spawn the entity
        newEntity.spawn(this.world, position);
        
        console.log(`[ObstaclePlacementManager] Successfully spawned ${blockType} with size ${size} at position (${position.x}, ${position.y}, ${position.z})`);
        return true;
      }
    } catch (error) {
      console.error(`[ObstaclePlacementManager] Error spawning resized ${blockType}:`, error);
    }
    
    return false;
  }
} 