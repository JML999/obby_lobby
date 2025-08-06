import { Vector3 } from "hytopia";
import type { Vector3Like } from "hytopia";
import { PlotBoundaryManager } from "./PlotBoundaryManager";

export interface ObstacleBounds {
  width: number;  // X-axis size
  height: number; // Y-axis size
  length: number; // Z-axis size
}

export interface PlacedObstacle {
  id: string;
  type: string;
  size: string;
  position: Vector3;
  bounds: ObstacleBounds;
  entityId?: string; // For tracking the actual entity
  config?: any; // For mechanical entities - stores full configuration
  entity?: any; // Reference to the actual entity instance (for mechanical entities)
}

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export class ObstacleCollisionManager {
  private static instance: ObstacleCollisionManager;
  private plotBoundaryManager: PlotBoundaryManager;
  private placedObstacles: Map<string, PlacedObstacle[]> = new Map(); // region-aware plotId -> obstacles
  private world?: { name?: string }; // Track world for region awareness
  
  // Obstacle size definitions (in blocks)
  private readonly OBSTACLE_SIZES: Record<string, Record<string, ObstacleBounds>> = {
    bounce_pad: {
      small: { width: 5, height: 5, length: 5 },
      medium: { width: 5, height: 5, length: 5 },
      large: { width: 5, height: 5, length: 5 }
    },
    rotating_beam: {
      small: { width: 5, height: 5, length: 5 },
      large: { width: 5, height: 5, length: 5 }
    },
    mechanical_piston: {
      standard: { width: 1, height: 1, length: 1 }
    },
    mechanical_wheel: {
      standard: { width: 1, height: 1, length: 1 }
    },
    mechanical_elevator: {
      standard: { width: 1, height: 1, length: 1 }
    },
    mechanical: {
      custom: { width: 2, height: 2, length: 2 } // Default size for configurable mechanical blocks
    },
    seesaw: {
      standard: { width: 6, height: 2, length: 2 }
    }
  };

  public static getInstance(): ObstacleCollisionManager {
    if (!ObstacleCollisionManager.instance) {
      ObstacleCollisionManager.instance = new ObstacleCollisionManager();
    }
    return ObstacleCollisionManager.instance;
  }

  private constructor() {
    this.plotBoundaryManager = PlotBoundaryManager.getInstance();
  }

  /**
   * Initialize with world for region awareness
   */
  public initializeWorld(world: { name?: string }): void {
    this.world = world;
    console.log(`[ObstacleCollisionManager] Initialized with world ${world.name || 'unknown'}`);
  }

  /**
   * Create a region-aware plot key to prevent cross-region contamination
   */
  private getRegionAwarePlotKey(plotId: string | undefined, world?: { name?: string }): string {
    if (!plotId) return 'global';
    
    const targetWorld = world || this.world;
    const worldName = targetWorld?.name || 'unknown';
    return `${worldName}:${plotId}`;
  }

  /**
   * Convert entity spawn position to chunk lattice position (floor coordinates)
   * Entity spawn: (-33.5, 18.5, -12.5) -> Chunk lattice: (-34, 18, -13)
   */
  private toChunkLatticePosition(position: Vector3Like): Vector3 {
    return new Vector3(
      Math.floor(position.x),
      Math.floor(position.y), 
      Math.floor(position.z)
    );
  }

  /**
   * Convert chunk lattice position to entity spawn position (add 0.5 offset)
   * Chunk lattice: (-34, 18, -13) -> Entity spawn: (-33.5, 18.5, -12.5)
   */
  private toEntitySpawnPosition(position: Vector3Like): Vector3 {
    return new Vector3(
      position.x + 0.5,
      position.y + 0.5,
      position.z + 0.5
    );
  }

  /**
   * Convert entity spawn position to chunk lattice position (remove 0.5 offset)
   * Entity spawn: (-33.5, 18.5, -12.5) -> Chunk lattice: (-34, 18, -13)
   * FIXED: Store entity positions as-is to prevent coordinate drift
   */
  private toChunkLatticePosition(position: Vector3Like): Vector3 {
    // IMPORTANT: For mechanical entities, we now store entity spawn coordinates
    // to prevent coordinate drift during save/load cycles
    return new Vector3(
      position.x,
      position.y, 
      position.z
    );
  }

  /**
   * Get the bounding box size for an obstacle type and size
   */
  public getObstacleBounds(obstacleType: string, obstacleSize: string): ObstacleBounds | null {
    const typeConfig = this.OBSTACLE_SIZES[obstacleType];
    if (!typeConfig) {
      console.log(`[ObstacleCollisionManager] Unknown obstacle type: ${obstacleType}`);
      return null;
    }
    
    const bounds = typeConfig[obstacleSize];
    if (!bounds) {
      console.log(`[ObstacleCollisionManager] Unknown size ${obstacleSize} for type ${obstacleType}`);
      return null;
    }
    
    return bounds;
  }

  /**
   * Convert position and bounds to a bounding box
   * CRITICAL: Input position should be chunk lattice position, converts to entity spawn for physics
   */
  private createBoundingBox(chunkLatticePosition: Vector3Like, bounds: ObstacleBounds): BoundingBox {
    // Convert chunk lattice position to entity spawn position for physics calculations
    const entitySpawnPosition = this.toEntitySpawnPosition(chunkLatticePosition);
    
    // Entity spawn position is center of obstacle, calculate min/max from center
    const halfWidth = bounds.width / 2;
    const halfLength = bounds.length / 2;
    
    return {
      minX: entitySpawnPosition.x - halfWidth,
      maxX: entitySpawnPosition.x + halfWidth,
      minY: entitySpawnPosition.y, // Y position is bottom of obstacle
      maxY: entitySpawnPosition.y + bounds.height,
      minZ: entitySpawnPosition.z - halfLength,
      maxZ: entitySpawnPosition.z + halfLength
    };
  }

  /**
   * Check if two bounding boxes overlap
   */
  private boundingBoxesOverlap(box1: BoundingBox, box2: BoundingBox): boolean {
    return !(
      box1.maxX <= box2.minX || // box1 is to the left of box2
      box1.minX >= box2.maxX || // box1 is to the right of box2
      box1.maxY <= box2.minY || // box1 is below box2
      box1.minY >= box2.maxY || // box1 is above box2
      box1.maxZ <= box2.minZ || // box1 is in front of box2
      box1.minZ >= box2.maxZ    // box1 is behind box2
    );
  }

  /**
   * Check if an obstacle placement is valid (no collisions, within boundaries)
   * CRITICAL: Converts input position to chunk lattice for consistent checking
   */
  public canPlaceObstacle(
    plotId: string | undefined, 
    obstacleType: string, 
    obstacleSize: string, 
    position: Vector3Like
  ): { valid: boolean; reason?: string; suggestion?: string } {
    
    const bounds = this.getObstacleBounds(obstacleType, obstacleSize);
    if (!bounds) {
      return { valid: false, reason: "Unknown obstacle type or size" };
    }

    // STANDARDIZATION: Convert input position to chunk lattice for consistent checking
    const chunkLatticePosition = this.toChunkLatticePosition(position);

    // Create bounding box (createBoundingBox expects chunk lattice position)
    const collisionBoundingBox = this.createBoundingBox(chunkLatticePosition, bounds);
    const boundaryBoundingBox = collisionBoundingBox;

    // Check plot boundaries if in a plot
    if (plotId) {
      const boundaryResult = this.checkPlotBoundaries(plotId, boundaryBoundingBox, obstacleType);
      if (!boundaryResult.valid) {
        return boundaryResult;
      }
    }

    // Check collision with existing obstacles (use normal collision box)
    const collisionResult = this.checkObstacleCollisions(plotId, collisionBoundingBox);
    if (!collisionResult.valid) {
      return collisionResult;
    }

    return { valid: true };
  }



  /**
   * Check if obstacle fits within plot boundaries
   */
  private checkPlotBoundaries(plotId: string, boundingBox: BoundingBox, obstacleType: string): { valid: boolean; reason?: string; suggestion?: string } {
    const plotBoundaries = this.plotBoundaryManager.getCalculatedBoundaries(plotId);
    if (!plotBoundaries) {
      return { valid: false, reason: "Plot boundaries not found" };
    }

    // Set buffer based on obstacle type (standardized for 5x5x5 obstacles)
    let buffer: number;
    switch (obstacleType) {
      case 'rotating_beam':
      case 'bounce_pad':
        buffer = 3; // 3 blocks from edge for 5x5x5 obstacles
        break;
      case 'seesaw':
        buffer = 3; // 3 blocks from edge for seesaws
        break;
      case 'mechanical_piston':
      case 'mechanical_wheel':
      case 'mechanical_elevator':
        buffer = 1; // 1 block from edge for 1x1x1 mechanical blocks
        break;
      default:
        buffer = 2; // Default 2 blocks for any other obstacles
        break;
    }

    const effectiveMinX = plotBoundaries.minX + buffer;
    const effectiveMaxX = plotBoundaries.maxX - buffer;
    const effectiveMinZ = plotBoundaries.minZ + buffer;
    const effectiveMaxZ = plotBoundaries.maxZ - buffer;

    // Check if entire obstacle fits within plot boundaries (with buffer)
    if (boundingBox.minX < effectiveMinX) {
      return { 
        valid: false, 
        reason: "Obstacle too close to western plot boundary",
        suggestion: "Move obstacle further east (positive X direction)"
      };
    }
    if (boundingBox.maxX > effectiveMaxX) {
      return { 
        valid: false, 
        reason: "Obstacle too close to eastern plot boundary",
        suggestion: "Move obstacle further west (negative X direction)"
      };
    }
    if (boundingBox.minZ < effectiveMinZ) {
      return { 
        valid: false, 
        reason: "Obstacle too close to northern plot boundary",
        suggestion: "Move obstacle further south (positive Z direction)"
      };
    }
    if (boundingBox.maxZ > effectiveMaxZ) {
      return { 
        valid: false, 
        reason: "Obstacle too close to southern plot boundary",
        suggestion: "Move obstacle further north (negative Z direction)"
      };
    }
    if (boundingBox.minY < plotBoundaries.minY) {
      return { 
        valid: false, 
        reason: "Obstacle extends below ground level",
        suggestion: "Place obstacle higher up"
      };
    }
    if (boundingBox.maxY > plotBoundaries.maxY) {
      return { 
        valid: false, 
        reason: "Obstacle extends above height limit",
        suggestion: "Place obstacle lower down or use a smaller obstacle"
      };
    }

    return { valid: true };
  }

  /**
   * Check if obstacle collides with existing obstacles
   */
  private checkObstacleCollisions(plotId: string | undefined, boundingBox: BoundingBox): { valid: boolean; reason?: string; suggestion?: string } {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const existingObstacles = this.placedObstacles.get(plotKey) || [];

    for (const existingObstacle of existingObstacles) {
      const existingBoundingBox = this.createBoundingBox(existingObstacle.position, existingObstacle.bounds);
      
      if (this.boundingBoxesOverlap(boundingBox, existingBoundingBox)) {
        return {
          valid: false,
          reason: `Obstacle would overlap with existing ${existingObstacle.type} (${existingObstacle.size})`,
          suggestion: "Try placing the obstacle in a different location"
        };
      }
    }

    return { valid: true };
  }

  /**
   * Register a placed obstacle
   * CRITICAL: Always converts input position to chunk lattice coordinates for consistent storage
   */
  public registerObstacle(
    plotId: string | undefined,
    obstacleId: string,
    obstacleType: string,
    obstacleSize: string,
    position: Vector3Like,
    entityId?: string,
    config?: any,
    entity?: any
  ): boolean {
    const bounds = this.getObstacleBounds(obstacleType, obstacleSize);
    if (!bounds) return false;

    const plotKey = this.getRegionAwarePlotKey(plotId);
    if (!this.placedObstacles.has(plotKey)) {
      this.placedObstacles.set(plotKey, []);
    }

    // STANDARDIZATION: Always store positions in chunk lattice coordinates (integers)
    // This prevents coordinate drift and registration mismatches
    const chunkLatticePosition = this.toChunkLatticePosition(position);

    const obstacle: PlacedObstacle = {
      id: obstacleId,
      type: obstacleType,
      size: obstacleSize,
      position: chunkLatticePosition, // Store chunk lattice position
      bounds: bounds,
      entityId: entityId,
      config: config,
      entity: entity
    };

    this.placedObstacles.get(plotKey)!.push(obstacle);
    console.log(`[ObstacleCollisionManager] Registered obstacle: ${obstacleType} (${obstacleSize}) at chunk lattice position (${chunkLatticePosition.x}, ${chunkLatticePosition.y}, ${chunkLatticePosition.z}) (converted from input ${position.x}, ${position.y}, ${position.z})`);
    return true;
  }

  /**
   * Remove ALL registered obstacles at a position (for cleaning up duplicates)
   * CRITICAL: Converts input position to chunk lattice coordinates for consistent searching
   */
  public unregisterAllObstaclesAt(plotId: string | undefined, position: Vector3Like, searchRadius: number = 3): PlacedObstacle[] {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const obstacles = this.placedObstacles.get(plotKey);
    if (!obstacles) return [];

    // STANDARDIZATION: Convert input position to chunk lattice for consistent searching
    const chunkLatticeSearchPosition = this.toChunkLatticePosition(position);
    const removedObstacles: PlacedObstacle[] = [];
    
    // Remove all obstacles within the search radius (comparing chunk lattice positions)
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obstacle = obstacles[i];
      if (!obstacle) continue;
      
      const distance = Math.sqrt(
        Math.pow(obstacle.position.x - chunkLatticeSearchPosition.x, 2) +
        Math.pow(obstacle.position.y - chunkLatticeSearchPosition.y, 2) +
        Math.pow(obstacle.position.z - chunkLatticeSearchPosition.z, 2)
      );
      
      if (distance <= searchRadius) {
        const removedObstacleArray = obstacles.splice(i, 1);
        const removedObstacle = removedObstacleArray[0];
        if (removedObstacle) {
          removedObstacles.push(removedObstacle);
          console.log(`[ObstacleCollisionManager] Unregistered duplicate obstacle: ${removedObstacle.type} (${removedObstacle.size}) at chunk position (${removedObstacle.position.x}, ${removedObstacle.position.y}, ${removedObstacle.position.z})`);
        }
      }
    }

    console.log(`[ObstacleCollisionManager] Removed ${removedObstacles.length} duplicate obstacles at chunk lattice position (${chunkLatticeSearchPosition.x}, ${chunkLatticeSearchPosition.y}, ${chunkLatticeSearchPosition.z}) (converted from input ${position.x}, ${position.y}, ${position.z})`);
    return removedObstacles;
  }

  /**
   * Remove a registered obstacle (for obstacle removal)
   * CRITICAL: Converts input position to chunk lattice coordinates for consistent searching
   */
  public unregisterObstacle(plotId: string | undefined, position: Vector3Like, searchRadius: number = 3): PlacedObstacle | null {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const obstacles = this.placedObstacles.get(plotKey);
    if (!obstacles) return null;

    // STANDARDIZATION: Convert input position to chunk lattice for consistent searching
    const chunkLatticeSearchPosition = this.toChunkLatticePosition(position);
    
    for (let i = 0; i < obstacles.length; i++) {
      const obstacle = obstacles[i];
      if (!obstacle) continue;
      
      const distance = Math.sqrt(
        Math.pow(obstacle.position.x - chunkLatticeSearchPosition.x, 2) +
        Math.pow(obstacle.position.y - chunkLatticeSearchPosition.y, 2) +
        Math.pow(obstacle.position.z - chunkLatticeSearchPosition.z, 2)
      );
      
      if (distance <= searchRadius) {
        const removedObstacleArray = obstacles.splice(i, 1);
        const removedObstacle = removedObstacleArray[0];
        if (removedObstacle) {
          console.log(`[ObstacleCollisionManager] Unregistered obstacle: ${removedObstacle.type} (${removedObstacle.size}) at chunk position (${removedObstacle.position.x}, ${removedObstacle.position.y}, ${removedObstacle.position.z})`);
          return removedObstacle;
        }
      }
    }

    console.log(`[ObstacleCollisionManager] No obstacle found to unregister at chunk lattice position (${chunkLatticeSearchPosition.x}, ${chunkLatticeSearchPosition.y}, ${chunkLatticeSearchPosition.z})`);
    return null;
  }

  /**
   * Clear all obstacles for a plot (when plot is reset)
   * CRITICAL: This now properly despawns entities before clearing registry
   */
  public clearPlotObstacles(plotId: string): void {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const obstacles = this.placedObstacles.get(plotKey);
    
    if (obstacles) {
      // DESPAWN ALL ENTITIES before clearing registry
      for (const obstacle of obstacles) {
        if (obstacle.entity && typeof obstacle.entity.despawn === 'function') {
          try {
            obstacle.entity.despawn();
            console.log(`[ObstacleCollisionManager] Despawned ${obstacle.type} entity at (${obstacle.position.x}, ${obstacle.position.y}, ${obstacle.position.z})`);
          } catch (error) {
            console.error(`[ObstacleCollisionManager] Error despawning entity:`, error);
          }
        }
      }
    }
    
    // Now clear the registry
    this.placedObstacles.delete(plotKey);
    console.log(`[ObstacleCollisionManager] Cleared all obstacles for ${plotKey}`);
  }

  /**
   * Clear all obstacles within plot boundaries with coordinate system tolerance
   * This method handles both chunk lattice and entity spawn coordinate edge cases
   */
  public clearPlotObstaclesWithBoundaries(plotId: string, boundaries: {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
  }): number {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const obstacles = this.placedObstacles.get(plotKey);
    if (!obstacles) return 0;

    let removedCount = 0;
    const tolerance = 1.0; // 1 block tolerance to handle coordinate system edge cases

    // Expand boundaries by tolerance to catch entities on the edge
    const expandedBounds = {
      minX: Math.floor(boundaries.minX) - tolerance,
      maxX: Math.ceil(boundaries.maxX) + tolerance,
      minY: Math.floor(boundaries.minY) - tolerance,
      maxY: Math.ceil(boundaries.maxY) + tolerance,
      minZ: Math.floor(boundaries.minZ) - tolerance,
      maxZ: Math.ceil(boundaries.maxZ) + tolerance
    };

    console.log(`[ObstacleCollisionManager] Clearing obstacles within expanded boundaries:`, expandedBounds);

    // Remove obstacles within the expanded boundaries
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obstacle = obstacles[i];
      if (!obstacle) continue;

      // Check if obstacle is within expanded boundaries (remember positions are chunk lattice)
      if (obstacle.position.x >= expandedBounds.minX &&
          obstacle.position.x <= expandedBounds.maxX &&
          obstacle.position.y >= expandedBounds.minY &&
          obstacle.position.y <= expandedBounds.maxY &&
          obstacle.position.z >= expandedBounds.minZ &&
          obstacle.position.z <= expandedBounds.maxZ) {
        
        // Despawn entity if it exists
        if (obstacle.entity && typeof obstacle.entity.despawn === 'function') {
          obstacle.entity.despawn();
        }

        obstacles.splice(i, 1);
        removedCount++;
        console.log(`[ObstacleCollisionManager] Removed ${obstacle.type} at chunk position (${obstacle.position.x}, ${obstacle.position.y}, ${obstacle.position.z})`);
      }
    }

    console.log(`[ObstacleCollisionManager] Removed ${removedCount} obstacles within boundaries for plot ${plotId}`);
    return removedCount;
  }

  /**
   * Get all obstacles in a plot
   */
  public getPlotObstacles(plotId: string | undefined): PlacedObstacle[] {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    return this.placedObstacles.get(plotKey) || [];
  }

  /**
   * Get total obstacle count for a plot
   */
  public getObstacleCount(plotId: string | undefined): number {
    return this.getPlotObstacles(plotId).length;
  }

  /**
   * Check if a block placement would collide with existing obstacles
   * CRITICAL: Input position should be chunk lattice coordinates (block coordinates)
   */
  public canPlaceBlock(plotId: string | undefined, position: Vector3Like): { valid: boolean; reason?: string; suggestion?: string } {
    // Clean up any phantom entities before checking
    this.cleanupDespawnedEntities(plotId);
    
    // First check our registry (for non-entity obstacles like bounce pads)
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const existingObstacles = this.placedObstacles.get(plotKey) || [];

    // Create a 1x1x1 bounding box for the block at chunk lattice position
    // Blocks are placed at integer coordinates, so convert to entity physics space
    const entitySpawnPosition = this.toEntitySpawnPosition(position);
    const blockBoundingBox: BoundingBox = {
      minX: entitySpawnPosition.x - 0.5, // Center block at entity spawn position
      maxX: entitySpawnPosition.x + 0.5,
      minY: entitySpawnPosition.y - 0.5,
      maxY: entitySpawnPosition.y + 0.5,
      minZ: entitySpawnPosition.z - 0.5,
      maxZ: entitySpawnPosition.z + 0.5
    };

    for (const existingObstacle of existingObstacles) {
      // Existing obstacles are stored in chunk lattice positions, createBoundingBox handles conversion
      const obstacleBoundingBox = this.createBoundingBox(existingObstacle.position, existingObstacle.bounds);
      
      if (this.boundingBoxesOverlap(blockBoundingBox, obstacleBoundingBox)) {
        return {
          valid: false,
          reason: `Cannot place block - would overlap with ${existingObstacle.type} (${existingObstacle.size})`,
          suggestion: "Try placing the block away from the obstacle"
        };
      }
    }

    // Additionally check for actual mechanical entities in the world
    // This catches entities that exist but aren't in our registry
    if (this.world) {
      const hasNearbyEntity = this.checkForActualEntitiesNearPosition(position);
      if (hasNearbyEntity) {
        return {
          valid: false,
          reason: `Cannot place block - mechanical entity detected nearby`,
          suggestion: "Try placing the block away from the entity"
        };
      }
    }

    return { valid: true };
  }

  /**
   * Check for actual mechanical entities in the world near a position
   * This provides a reality check against our internal registry
   */
  private checkForActualEntitiesNearPosition(position: Vector3Like): boolean {
    if (!this.world) return false;

    // Convert to entity spawn position for checking
    const checkPos = this.toEntitySpawnPosition(position);
    const checkRadius = 2.0; // Check within 2 blocks

    // Get all entities from the world
    const allEntities = this.world.entityManager.getAllEntities();
    
    // Check each entity to see if it's a mechanical entity near our position
    for (const entity of allEntities) {
      // Check if this is a ConfigurableMechanicalEntity (by checking for specific properties/methods)
      if (entity && entity.position && 
          (entity.constructor.name === 'ConfigurableMechanicalEntity' || 
           entity.entityType === 'mechanical' ||
           (entity as any).isMechanicalEntity)) {
        
        // Calculate distance to the entity
        const distance = Math.sqrt(
          Math.pow(entity.position.x - checkPos.x, 2) +
          Math.pow(entity.position.y - checkPos.y, 2) +
          Math.pow(entity.position.z - checkPos.z, 2)
        );
        
        if (distance <= checkRadius) {
          console.log(`[ObstacleCollisionManager] Found actual mechanical entity at (${entity.position.x}, ${entity.position.y}, ${entity.position.z}) near check position`);
          return true;
        }
      }
    }
    
    return false;
  }

  
  /**
   * Get all mechanical entities for a plot (for saving)
   */
  public getPlotMechanicalEntities(plotId: string): any[] {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const obstacles = this.placedObstacles.get(plotKey) || [];
    
    return obstacles
      .filter(obstacle => obstacle.type === 'mechanical')
      .map(obstacle => ({
        id: obstacle.id,
        position: obstacle.position,
        type: obstacle.type,
        size: obstacle.size,
        config: obstacle.config,
        cost: obstacle.config?.cost || 2
      }));
  }
  
  /**
   * Clear all mechanical entities in a plot
   */
  public clearPlotMechanicalEntities(plotId: string): void {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const obstacles = this.placedObstacles.get(plotKey);
    
    if (!obstacles) return;
    
    // Remove mechanical entities
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obstacle = obstacles[i];
      if (obstacle.type === 'mechanical') {
        // Despawn the entity if it exists
        if (obstacle.entity && typeof obstacle.entity.despawn === 'function') {
          obstacle.entity.despawn();
        }
        // Remove from array
        obstacles.splice(i, 1);
      }
    }
    
    console.log(`[ObstacleCollisionManager] Cleared mechanical entities for plot ${plotId}`);
  }

  /**
   * Detect and remove duplicate obstacles at the same position
   * Returns number of duplicates removed
   */
  public detectAndRemoveDuplicates(plotId: string | undefined): number {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const obstacles = this.placedObstacles.get(plotKey);
    if (!obstacles || obstacles.length === 0) return 0;

    const positionMap = new Map<string, PlacedObstacle[]>();
    let duplicatesRemoved = 0;

    // Group obstacles by position
    for (const obstacle of obstacles) {
      const posKey = `${obstacle.position.x},${obstacle.position.y},${obstacle.position.z}`;
      if (!positionMap.has(posKey)) {
        positionMap.set(posKey, []);
      }
      positionMap.get(posKey)!.push(obstacle);
    }

    // Find and remove duplicates (keep first occurrence)
    for (const [posKey, obstaclesAtPos] of positionMap.entries()) {
      if (obstaclesAtPos.length > 1) {
        const [x, y, z] = posKey.split(',').map(Number);
        console.log(`[ObstacleCollisionManager] Found ${obstaclesAtPos.length} duplicates at position (${x}, ${y}, ${z})`);
        
        // Keep the first obstacle, remove the rest
        for (let i = 1; i < obstaclesAtPos.length; i++) {
          const duplicate = obstaclesAtPos[i];
          
          // Despawn entity if it exists
          if (duplicate.entity && typeof duplicate.entity.despawn === 'function') {
            duplicate.entity.despawn();
          }
          
          // Remove from obstacles array
          const index = obstacles.indexOf(duplicate);
          if (index > -1) {
            obstacles.splice(index, 1);
            duplicatesRemoved++;
            console.log(`[ObstacleCollisionManager] Removed duplicate ${duplicate.type} (${duplicate.size}) at (${x}, ${y}, ${z})`);
          }
        }
      }
    }

    if (duplicatesRemoved > 0) {
      console.log(`[ObstacleCollisionManager] Total duplicates removed: ${duplicatesRemoved}`);
    }

    return duplicatesRemoved;
  }

  /**
   * Validate that all stored positions are in chunk lattice format (integers)
   */
  public validatePositionFormat(plotId: string | undefined): { valid: boolean; issues: string[] } {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const obstacles = this.placedObstacles.get(plotKey) || [];
    const issues: string[] = [];

    for (const obstacle of obstacles) {
      // Check if positions are integers (chunk lattice format)
      if (!Number.isInteger(obstacle.position.x) || 
          !Number.isInteger(obstacle.position.y) || 
          !Number.isInteger(obstacle.position.z)) {
        issues.push(`Obstacle ${obstacle.id} at (${obstacle.position.x}, ${obstacle.position.y}, ${obstacle.position.z}) has non-integer coordinates`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Clean up registry entries for despawned entities
   * This removes "phantom" entries where the entity no longer exists
   */
  public cleanupDespawnedEntities(plotId: string | undefined): number {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const obstacles = this.placedObstacles.get(plotKey);
    if (!obstacles) return 0;

    let cleanedCount = 0;
    
    // If we have world access, verify entities actually exist
    if (this.world) {
      const worldEntities = this.world.entityManager.getAllEntities();
      const worldEntitySet = new Set(worldEntities);
      
      // Check each mechanical entity in our registry
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obstacle = obstacles[i];
        if (obstacle.type === 'mechanical' && obstacle.entity) {
          // Check if the entity exists in the world
          const entityExistsInWorld = worldEntitySet.has(obstacle.entity);
          
          if (!entityExistsInWorld) {
            // Entity no longer exists, remove from registry
            obstacles.splice(i, 1);
            cleanedCount++;
            console.log(`[ObstacleCollisionManager] Cleaned up phantom mechanical entity at (${obstacle.position.x}, ${obstacle.position.y}, ${obstacle.position.z})`);
          }
        }
      }
    } else {
      // Fallback: check entity properties if no world access
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obstacle = obstacles[i];
        if (obstacle.type === 'mechanical' && obstacle.entity) {
          const entityExists = obstacle.entity && 
                             (obstacle.entity.isSpawned || 
                              obstacle.entity._spawned || 
                              obstacle.entity.world);
          
          if (!entityExists) {
            obstacles.splice(i, 1);
            cleanedCount++;
            console.log(`[ObstacleCollisionManager] Cleaned up phantom mechanical entity at (${obstacle.position.x}, ${obstacle.position.y}, ${obstacle.position.z})`);
          }
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[ObstacleCollisionManager] Cleaned up ${cleanedCount} phantom entities from registry`);
    }

    return cleanedCount;
  }

  /**
   * Sync registry with actual world state for mechanical entities
   * This ensures our registry matches what actually exists in the world
   */
  public syncWithWorldState(plotId: string | undefined): void {
    if (!this.world) {
      console.warn(`[ObstacleCollisionManager] Cannot sync with world state - no world initialized`);
      return;
    }

    const plotKey = this.getRegionAwarePlotKey(plotId);
    console.log(`[ObstacleCollisionManager] Syncing registry with world state for ${plotKey}`);

    // First, clean up any despawned entities
    const cleanedCount = this.cleanupDespawnedEntities(plotId);
    
    // Get plot boundaries if available
    let plotBounds: any = null;
    if (plotId) {
      try {
        const { PlotBoundaryManager } = require('./PlotBoundaryManager');
        plotBounds = PlotBoundaryManager.getInstance().getCalculatedBoundaries(plotId);
      } catch (e) {
        console.warn(`[ObstacleCollisionManager] Could not get plot boundaries for ${plotId}`);
      }
    }

    // Check all world entities to find mechanical entities that should be registered
    const worldEntities = this.world.entityManager.getAllEntities();
    const obstacles = this.placedObstacles.get(plotKey) || [];
    const registeredEntities = new Set(obstacles.filter(o => o.entity).map(o => o.entity));
    
    let addedCount = 0;
    for (const entity of worldEntities) {
      // Check if this is a mechanical entity
      if (entity && entity.position && 
          (entity.constructor.name === 'ConfigurableMechanicalEntity' || 
           (entity as any).isMechanicalEntity)) {
        
        // Check if it's within plot boundaries (if we have them)
        if (plotBounds) {
          const pos = entity.position;
          if (pos.x < plotBounds.minX || pos.x > plotBounds.maxX ||
              pos.y < plotBounds.minY || pos.y > plotBounds.maxY ||
              pos.z < plotBounds.minZ || pos.z > plotBounds.maxZ) {
            continue; // Skip entities outside plot
          }
        }
        
        // Check if already registered
        if (!registeredEntities.has(entity)) {
          // Convert entity position to chunk lattice for registration
          const chunkPos = this.toChunkLatticePosition(entity.position);
          
          // Register this entity
          const obstacle: PlacedObstacle = {
            id: `sync_${Date.now()}_${addedCount}`,
            type: 'mechanical',
            size: 'custom',
            position: chunkPos,
            bounds: { width: 2, height: 2, length: 2 }, // Default bounds
            entity: entity
          };
          
          obstacles.push(obstacle);
          addedCount++;
          console.log(`[ObstacleCollisionManager] Added unregistered mechanical entity at (${chunkPos.x}, ${chunkPos.y}, ${chunkPos.z}) to registry`);
        }
      }
    }
    
    // Update the registry if we created a new obstacles array
    if (!this.placedObstacles.has(plotKey) && obstacles.length > 0) {
      this.placedObstacles.set(plotKey, obstacles);
    }
    
    console.log(`[ObstacleCollisionManager] Sync complete: cleaned ${cleanedCount}, added ${addedCount} entities`);
  }
} 