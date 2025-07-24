import { World, Vector3, PlayerEntity } from "hytopia";
import type { Player, Vector3Like } from "hytopia";
import { BouncePadObstacle } from "./obstacles/BouncePadObstacle";
import RotatingBeamEntity from "./obstacles/RotatingBeamEntity";
import SeesawEntity from "./obstacles/SeesawEntity";
import { PlotBoundaryManager } from "./PlotBoundaryManager";
import { ObstacleCollisionManager } from "./ObstacleCollisionManager";

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
    
    // Enemies - Zombies
    { id: 'zombie_normal', name: 'Zombie', type: 'zombie', size: 'normal', description: 'Basic zombie enemy - follows and attacks players', category: 'enemy' },
    { id: 'zombie_fast', name: 'Fast Zombie', type: 'zombie', size: 'fast', description: 'Quick zombie - faster movement and attacks', category: 'enemy' },
    { id: 'zombie_strong', name: 'Strong Zombie', type: 'zombie', size: 'strong', description: 'Tough zombie - more health and damage', category: 'enemy' }
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
  public placeObstacle(player: Player, obstacleId: string, position: Vector3Like, plotId?: string): boolean {
    if (!this.world) return false;
    
    const obstacleType = this.OBSTACLE_CATALOG.find(o => o.id === obstacleId);
    if (!obstacleType) {
      console.log(`[ObstaclePlacementManager] Obstacle ID ${obstacleId} not found in catalog`);
      return false;
    }
    
    // Check if this is an enemy (zombie) - delegate to EnemyPlacementManager
    if (obstacleType.type === 'zombie') {
      const { EnemyPlacementManager } = require('./EnemyPlacementManager');
      const enemyPlacementManager = EnemyPlacementManager.getInstance();
      
      // Initialize world if needed
      enemyPlacementManager.initializeWorld(this.world);
      
      return enemyPlacementManager.placeEnemy(player, obstacleId, position, plotId);
    }
    
    // Handle regular obstacles
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
    
    // First try to remove enemies (zombies)
    const { EnemyPlacementManager } = require('./EnemyPlacementManager');
    const enemyPlacementManager = EnemyPlacementManager.getInstance();
    enemyPlacementManager.initializeWorld(this.world);
    
    const enemyRemovalResult = enemyPlacementManager.removeEnemy(player, position, plotId);
    if (enemyRemovalResult.success) {
      // Enemy was removed, return enemy data for cash refund
      return {
        success: true,
        obstacleType: 'zombie',
        obstacleSize: enemyRemovalResult.enemyVariant || 'normal'
      };
    }
    
    // No enemy found, try regular obstacles
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
    
    this.world.chatManager.sendPlayerMessage(player, 'No obstacle or enemy found to remove here!', 'FF0000');
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
          
        default:
          console.log(`[ObstaclePlacementManager] Unknown obstacle type: ${obstacleType.type}`);
          return false;
      }

      if (obstacle) {
        // Spawn the obstacle
        obstacle.spawn(this.world, position);
        
        // Activate obstacles that need activation
        if (obstacleType.type === 'rotating_beam' || obstacleType.type === 'seesaw') {
          obstacle.activate();
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
} 