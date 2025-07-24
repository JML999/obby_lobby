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
   */
  private createBoundingBox(position: Vector3Like, bounds: ObstacleBounds): BoundingBox {
    // Position is center of obstacle, so we need to calculate min/max from center
    const halfWidth = bounds.width / 2;
    const halfLength = bounds.length / 2;
    
    return {
      minX: position.x - halfWidth,
      maxX: position.x + halfWidth,
      minY: position.y, // Y position is bottom of obstacle
      maxY: position.y + bounds.height,
      minZ: position.z - halfLength,
      maxZ: position.z + halfLength
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

    // Use standard bounding box for all obstacles (5x5x5 for bounce pads and rotating beams)
    const collisionBoundingBox = this.createBoundingBox(position, bounds);
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
   */
  public registerObstacle(
    plotId: string | undefined,
    obstacleId: string,
    obstacleType: string,
    obstacleSize: string,
    position: Vector3Like,
    entityId?: string
  ): boolean {
    const bounds = this.getObstacleBounds(obstacleType, obstacleSize);
    if (!bounds) return false;

    const plotKey = this.getRegionAwarePlotKey(plotId);
    if (!this.placedObstacles.has(plotKey)) {
      this.placedObstacles.set(plotKey, []);
    }

    const obstacle: PlacedObstacle = {
      id: obstacleId,
      type: obstacleType,
      size: obstacleSize,
      position: new Vector3(position.x, position.y, position.z),
      bounds: bounds,
      entityId: entityId
    };

    this.placedObstacles.get(plotKey)!.push(obstacle);
    console.log(`[ObstacleCollisionManager] Registered obstacle: ${obstacleType} (${obstacleSize}) at`, position);
    return true;
  }

  /**
   * Remove a registered obstacle (for obstacle removal)
   */
  public unregisterObstacle(plotId: string | undefined, position: Vector3Like, searchRadius: number = 3): PlacedObstacle | null {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const obstacles = this.placedObstacles.get(plotKey);
    if (!obstacles) return null;

    const targetPos = new Vector3(position.x, position.y, position.z);
    
    for (let i = 0; i < obstacles.length; i++) {
      const obstacle = obstacles[i];
      if (!obstacle) continue;
      
      const distance = Math.sqrt(
        Math.pow(obstacle.position.x - targetPos.x, 2) +
        Math.pow(obstacle.position.y - targetPos.y, 2) +
        Math.pow(obstacle.position.z - targetPos.z, 2)
      );
      
      if (distance <= searchRadius) {
        const removedObstacleArray = obstacles.splice(i, 1);
        const removedObstacle = removedObstacleArray[0];
        if (removedObstacle) {
          console.log(`[ObstacleCollisionManager] Unregistered obstacle: ${removedObstacle.type} (${removedObstacle.size})`);
          return removedObstacle;
        }
      }
    }

    return null;
  }

  /**
   * Clear all obstacles for a plot (when plot is reset)
   */
  public clearPlotObstacles(plotId: string): void {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    this.placedObstacles.delete(plotKey);
    console.log(`[ObstacleCollisionManager] Cleared all obstacles for ${plotKey}`);
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
   */
  public canPlaceBlock(plotId: string | undefined, position: Vector3Like): { valid: boolean; reason?: string; suggestion?: string } {
    const plotKey = this.getRegionAwarePlotKey(plotId);
    const existingObstacles = this.placedObstacles.get(plotKey) || [];

    // Create a 1x1x1 bounding box for the block (blocks are 1 unit cubes)
    const blockBoundingBox: BoundingBox = {
      minX: position.x,
      maxX: position.x + 1,
      minY: position.y,
      maxY: position.y + 1,
      minZ: position.z,
      maxZ: position.z + 1
    };

    for (const existingObstacle of existingObstacles) {
      const obstacleBoundingBox = this.createBoundingBox(existingObstacle.position, existingObstacle.bounds);
      
      if (this.boundingBoxesOverlap(blockBoundingBox, obstacleBoundingBox)) {
        return {
          valid: false,
          reason: `Cannot place block - would overlap with ${existingObstacle.type} (${existingObstacle.size})`,
          suggestion: "Try placing the block away from the obstacle"
        };
      }
    }

    return { valid: true };
  }
} 