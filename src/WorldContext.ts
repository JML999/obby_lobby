import { World } from 'hytopia';
import { PlotManager } from './PlotManager';
import { BlockPlacementManager } from './BlockPlacementManager';
import { ObstaclePlacementManager } from './ObstaclePlacementManager';
import { ObstacleCollisionManager } from './ObstacleCollisionManager';
import { PlotSaveManager } from './PlotSaveManager';
import { PlotBuildManager } from './PlotBuildManager';
import { PlotBoundaryManager } from './PlotBoundaryManager';
import { EnemyManager } from './EnemyManager';
import { EnemyPlacementManager } from './EnemyPlacementManager';

/**
 * WorldContext - Phase 1 of architecture refactoring
 * 
 * This is a compatibility wrapper that provides world-scoped access to existing singletons.
 * NO BEHAVIOR CHANGES - all methods delegate to existing singleton implementations.
 * 
 * Purpose:
 * - Prepare for future phases where each world will have its own manager instances
 * - Provide cleaner API without requiring world parameter passing
 * - Maintain 100% backward compatibility
 * 
 * Safety:
 * - Can be removed at any time to revert to original system
 * - All existing code continues to work unchanged
 * - No data structures or logic modified
 */
export class WorldContext {
  public readonly world: World;

  constructor(world: World) {
    this.world = world;
    console.log(`[WorldContext] Created context wrapper for world: ${world.name}`);
  }

  // === Plot Management ===
  
  /**
   * Access to plot management functionality
   * Currently delegates to PlotManager singleton
   */
  get plotManager() {
    return {
      // Delegate to existing singleton methods - no behavior change
      assignPlayerToPlotInWorld: (playerId: string, playerObby: any = null) => {
        return PlotManager.getInstance().assignPlayerToPlotInWorld(playerId, this.world, playerObby);
      },
      
      getPlayerPlot: (playerId: string) => {
        return PlotManager.getInstance().getPlayerPlot(playerId);
      },
      
      getPlotOwner: (plotIndex: number) => {
        return PlotManager.getInstance().getPlotOwner(this.world, plotIndex);
      },
      
      getPlotsForWorld: () => {
        return PlotManager.getInstance().getPlotsForWorld(this.world);
      },
      
      releasePlayerPlot: (playerId: string) => {
        return PlotManager.getInstance().releasePlayerPlot(playerId);
      },
      
      findManagedWorld: () => {
        return PlotManager.getInstance().findManagedWorld(this.world);
      }
    };
  }

  // === Block Management ===
  
  /**
   * Access to block placement functionality
   * Currently delegates to BlockPlacementManager singleton
   */
  get blockSystem() {
    return {
      // Delegate to existing singleton - ensures world context is passed correctly
      placeBlock: (player: any, blockType: number, position: any, plotId?: string) => {
        // BlockPlacementManager expects: placeBlock(player, position, world, plotId)
        // The blockType is handled internally by getting the selectedBlockId from the player entity
        return BlockPlacementManager.getInstance().placeBlock(player, position, this.world, plotId);
      },
      
      removeBlock: (player: any, position: any, plotId?: string) => {
        return BlockPlacementManager.getInstance().removeBlock(player, position, this.world, plotId);
      },
      
      canPlaceBlock: (player: any, blockType: number, position: any) => {
        return BlockPlacementManager.getInstance().canPlaceBlock(player, blockType, position, this.world);
      },
      
      initializeWorld: () => {
        return BlockPlacementManager.getInstance().initializeWorld(this.world);
      }
    };
  }

  // === Build Management ===
  
  /**
   * Access to plot building functionality
   * Currently delegates to PlotBuildManager singleton
   */
  get buildManager() {
    return {
      initializePlot: (plotIndex: number, ownerId: string) => {
        return PlotBuildManager.getInstance().initializePlot(plotIndex, ownerId);
      },
      
      getPlayerCurrentPlot: (playerId: string) => {
        return PlotBuildManager.getInstance().getPlayerCurrentPlot(playerId);
      },
      
      setPlayerCurrentPlot: (playerId: string, plotIndex: number | null) => {
        return PlotBuildManager.getInstance().setPlayerCurrentPlot(playerId, plotIndex);
      },
      
      getPlayerActiveBuildPlot: (playerId: string) => {
        return PlotBuildManager.getInstance().getPlayerActiveBuildPlot(playerId);
      },
      
      setPlayerActiveBuildPlot: (playerId: string, plotIndex: number | null) => {
        return PlotBuildManager.getInstance().setPlayerActiveBuildPlot(playerId, plotIndex);
      },
      
      getPlotBoundaries: (plotId: string) => {
        return PlotBuildManager.getInstance().getPlotBoundaries(plotId);
      }
    };
  }

  // === Save Management ===
  
  /**
   * Access to save/load functionality
   * Currently delegates to PlotSaveManager singleton
   */
  get saveSystem() {
    return {
      initializeWorld: () => {
        return PlotSaveManager.getInstance().initializeWorld(this.world);
      },
      
      savePlayerObby: (player: any) => {
        return PlotSaveManager.getInstance().savePlayerObby(player);
      },
      
      loadPlayerObby: (player: any, plotId: string) => {
        return PlotSaveManager.getInstance().loadPlayerObby(player, plotId);
      },
      
      hasPlayerObby: (player: any) => {
        return PlotSaveManager.getInstance().hasPlayerObby(player);
      },
      
      clearPlotPhysicalContent: (plotId: string) => {
        return PlotSaveManager.getInstance().clearPlotPhysicalContent(plotId, this.world);
      },
      
      trackBlockPlacement: (plotId: string, position: any, blockId: number) => {
        return PlotSaveManager.getInstance().trackBlockPlacement(plotId, position, blockId, this.world);
      },
      
      handlePlayerDisconnect: (player: any) => {
        return PlotSaveManager.getInstance().handlePlayerDisconnect(player);
      }
    };
  }

  // === Obstacle Management ===
  
  /**
   * Access to obstacle functionality
   * Currently delegates to ObstaclePlacementManager and ObstacleCollisionManager singletons
   */
  get obstacleSystem() {
    return {
      // Placement methods
      initializeWorld: () => {
        ObstaclePlacementManager.getInstance().initializeWorld(this.world);
        ObstacleCollisionManager.getInstance().initializeWorld(this.world);
      },
      
      canPlaceObstacle: (plotId: string | undefined, obstacleType: any, position: any) => {
        return ObstaclePlacementManager.getInstance().canPlaceObstacle(plotId, obstacleType, position);
      },
      
      placeObstacle: (player: any, obstacleId: string, position: any, plotId?: string) => {
        return ObstaclePlacementManager.getInstance().placeObstacle(player, obstacleId, position, plotId);
      },
      
      removeObstacle: (player: any, position: any, plotId?: string) => {
        return ObstaclePlacementManager.getInstance().removeObstacle(player, position, plotId);
      },
      
      // Collision methods
      getPlotObstacles: (plotId: string) => {
        return ObstacleCollisionManager.getInstance().getPlotObstacles(plotId);
      },
      
      registerObstacle: (plotId: string, obstacleId: string, type: string, size: string, position: any) => {
        return ObstacleCollisionManager.getInstance().registerObstacle(plotId, obstacleId, type, size, position);
      }
    };
  }

  // === Enemy Management ===
  
  /**
   * Access to enemy functionality
   * Currently delegates to EnemyManager and EnemyPlacementManager singletons
   */
  get enemySystem() {
    return {
      // Enemy Manager methods (dynamically imported to avoid circular deps)
      spawnEnemy: (options: any) => {
        try {
          const enemyManager = require('./EnemyManager').EnemyManager.getInstance();
          return enemyManager?.spawnEnemy(options);
        } catch (error) {
          console.warn('[WorldContext] EnemyManager not available:', error);
          return null;
        }
      },
      
      getEnemiesInPlot: (plotId: string) => {
        try {
          const enemyManager = require('./EnemyManager').EnemyManager.getInstance();
          return enemyManager?.getEnemiesInPlot(plotId) || [];
        } catch (error) {
          console.warn('[WorldContext] EnemyManager not available for getEnemiesInPlot:', error);
          return [];
        }
      },
      
      clearPlotEnemies: (plotId: string) => {
        try {
          const enemyManager = require('./EnemyManager').EnemyManager.getInstance();
          return enemyManager?.clearPlotEnemies(plotId) || 0;
        } catch (error) {
          console.warn('[WorldContext] EnemyManager not available for clearPlotEnemies:', error);
          return 0;
        }
      },
      
      // Enemy Placement Manager methods
      initializeWorld: () => {
        return EnemyPlacementManager.getInstance().initializeWorld(this.world);
      },
      
      canPlaceEnemy: (plotId: string | undefined, enemyType: any, position: any) => {
        return EnemyPlacementManager.getInstance().canPlaceEnemy(plotId, enemyType, position);
      },
      
      placeEnemy: (player: any, enemyId: string, position: any, plotId?: string) => {
        return EnemyPlacementManager.getInstance().placeEnemy(player, enemyId, position, plotId);
      },
      
      removeEnemy: (player: any, position: any, plotId?: string) => {
        return EnemyPlacementManager.getInstance().removeEnemy(player, position, plotId);
      }
    };
  }

  // === Boundary Management ===
  
  /**
   * Access to plot boundary functionality
   * Currently delegates to PlotBoundaryManager singleton
   */
  get boundarySystem() {
    return {
      registerPlot: (plotId: string, centerX: number, centerZ: number, dimensions: any) => {
        return PlotBoundaryManager.getInstance().registerPlot(plotId, centerX, centerZ, dimensions);
      },
      
      getCalculatedBoundaries: (plotId: string) => {
        return PlotBoundaryManager.getInstance().getCalculatedBoundaries(plotId);
      },
      
      isWithinBoundaries: (plotId: string, position: any) => {
        return PlotBoundaryManager.getInstance().isWithinBoundaries(plotId, position);
      }
    };
  }

  // === Utility Methods ===
  
  /**
   * Get the world this context represents
   */
  getWorld(): World {
    return this.world;
  }
  
  /**
   * Initialize all world-specific managers
   * This is a convenience method that calls initializeWorld on all relevant singletons
   */
  initializeAllSystems(): void {
    console.log(`[WorldContext] Initializing all systems for world: ${this.world.name}`);
    
    try {
      // Initialize all managers for this world - same as ObbyRegion does now
      this.blockSystem.initializeWorld();
      this.saveSystem.initializeWorld();
      this.obstacleSystem.initializeWorld();
      this.enemySystem.initializeWorld();
      
      console.log(`[WorldContext] Successfully initialized all systems for world: ${this.world.name}`);
    } catch (error) {
      console.error(`[WorldContext] Error initializing systems for world ${this.world.name}:`, error);
      throw error;
    }
  }
  
  /**
   * Debug method to get information about this world context
   */
  getDebugInfo(): any {
    const managedWorld = this.plotManager.findManagedWorld();
    const plots = this.plotManager.getPlotsForWorld();
    
    return {
      worldName: this.world.name,
      isManaged: !!managedWorld,
      plotCount: plots.length,
      occupiedPlots: plots.filter(p => p.ownerId).length,
      availablePlots: plots.filter(p => !p.ownerId).length
    };
  }
}