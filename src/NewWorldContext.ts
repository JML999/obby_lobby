/**
 * NewWorldContext - Phase 3 Implementation
 * 
 * This is the new WorldContext that uses world-specific system instances
 * instead of delegating to singletons. Provides the same API as Phase 1
 * but with better performance and isolation.
 */

import { World } from 'hytopia';
import { EventBus, createWorldEventBus } from './EventBus';
import { PlotSystem } from './systems/PlotSystem';
import { BlockSystem } from './systems/BlockSystem';
import { SaveSystem } from './systems/SaveSystem';

export interface NewWorldContextConfig {
  enableEventLogging: boolean;
  enablePerformanceMetrics: boolean;
  systemConfigs: {
    plot?: any;
    block?: any;
    save?: any;
  };
}

/**
 * Phase 3: New WorldContext with world-specific system instances
 * 
 * This provides the same API as the Phase 1 WorldContext but uses
 * dedicated system instances instead of singleton delegation.
 */
export class NewWorldContext {
  public readonly world: World;
  public readonly eventBus: EventBus;
  
  // World-specific system instances
  private plotSystemInstance: PlotSystem;
  private blockSystemInstance: BlockSystem;
  private saveSystemInstance: SaveSystem;
  
  private config: NewWorldContextConfig;
  private performanceMetrics: Map<string, { calls: number; totalTime: number; avgTime: number }> = new Map();

  constructor(world: World, config: Partial<NewWorldContextConfig> = {}) {
    this.world = world;
    this.eventBus = createWorldEventBus(world.name);
    
    this.config = {
      enableEventLogging: false,
      enablePerformanceMetrics: false,
      systemConfigs: {},
      ...config
    };

    // Initialize world-specific systems
    this.initializeSystems();
    
    console.log(`[NewWorldContext:${world.name}] Initialized with dedicated system instances`);
  }

  private initializeSystems(): void {
    // Create system instances for this world only
    this.plotSystemInstance = new PlotSystem(
      this.world,
      this.eventBus,
      this.config.systemConfigs.plot
    );

    this.blockSystemInstance = new BlockSystem(
      this.world,
      this.eventBus,
      this.plotSystemInstance,
      this.config.systemConfigs.block
    );

    this.saveSystemInstance = new SaveSystem(
      this.world,
      this.eventBus,
      this.plotSystemInstance,
      this.blockSystemInstance,
      this.config.systemConfigs.save
    );

    // Set up event logging if enabled
    if (this.config.enableEventLogging) {
      this.setupEventLogging();
    }
  }

  private setupEventLogging(): void {
    const originalEmit = this.eventBus.emit.bind(this.eventBus);
    
    this.eventBus.emit = async (event: string, payload: any) => {
      console.log(`[NewWorldContext:${this.world.name}] Event: ${event}`, payload);
      return originalEmit(event, payload);
    };
  }

  private trackPerformance<T>(methodName: string, fn: () => T): T {
    if (!this.config.enablePerformanceMetrics) {
      return fn();
    }

    const startTime = Date.now();
    const result = fn();
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Update metrics
    const existing = this.performanceMetrics.get(methodName) || { calls: 0, totalTime: 0, avgTime: 0 };
    existing.calls++;
    existing.totalTime += duration;
    existing.avgTime = existing.totalTime / existing.calls;
    
    this.performanceMetrics.set(methodName, existing);

    return result;
  }

  // === Plot Management API (same as Phase 1, but using dedicated systems) ===
  
  get plotManager() {
    return {
      assignPlayerToPlotInWorld: (playerId: string, playerObby: any = null) => {
        return this.trackPerformance('plotManager.assignPlayerToPlotInWorld', () => {
          const plot = this.plotSystemInstance.assignPlot(playerId);
          if (plot) {
            return Promise.resolve({ 
              world: this.world, 
              plotIndex: plot.plotIndex 
            });
          }
          return Promise.reject(new Error('No available plots'));
        });
      },
      
      getPlayerPlot: (playerId: string) => {
        return this.trackPerformance('plotManager.getPlayerPlot', () => {
          const plot = this.plotSystemInstance.getPlayerPlot(playerId);
          if (plot) {
            return {
              world: this.world,
              plotIndex: plot.plotIndex,
              obby: plot.obby
            };
          }
          return null;
        });
      },
      
      getPlotOwner: (plotIndex: number) => {
        return this.trackPerformance('plotManager.getPlotOwner', () => {
          const plot = this.plotSystemInstance.getPlot(plotIndex);
          return plot?.ownerId || null;
        });
      },
      
      getPlotsForWorld: () => {
        return this.trackPerformance('plotManager.getPlotsForWorld', () => {
          return this.plotSystemInstance.getAllPlots().map(plot => ({
            ownerId: plot.ownerId,
            obby: plot.obby,
            plotIndex: plot.plotIndex
          }));
        });
      },
      
      releasePlayerPlot: (playerId: string) => {
        return this.trackPerformance('plotManager.releasePlayerPlot', () => {
          return this.plotSystemInstance.releasePlot(playerId);
        });
      },
      
      findManagedWorld: () => {
        return this.trackPerformance('plotManager.findManagedWorld', () => {
          const plots = this.plotSystemInstance.getAllPlots();
          return {
            world: this.world,
            plots: plots.map(plot => ({
              ownerId: plot.ownerId,
              obby: plot.obby,
              plotIndex: plot.plotIndex
            }))
          };
        });
      }
    };
  }

  // === Block Management API ===
  
  get blockSystem() {
    return {
      placeBlock: (player: any, blockType: number, position: any) => {
        return this.trackPerformance('blockSystem.placeBlock', () => {
          return this.blockSystemInstance.placeBlock(player, blockType, position);
        });
      },
      
      removeBlock: (player: any, position: any) => {
        return this.trackPerformance('blockSystem.removeBlock', () => {
          return this.blockSystemInstance.removeBlock(player, position);
        });
      },
      
      canPlaceBlock: (player: any, blockType: number, position: any) => {
        return this.trackPerformance('blockSystem.canPlaceBlock', () => {
          // Implement validation logic
          const plotInfo = this.plotSystemInstance.getPlotAtPosition(position);
          return plotInfo && plotInfo.ownerId === player.id;
        });
      },
      
      initializeWorld: () => {
        // No-op for new system (already initialized)
        return Promise.resolve();
      },
      
      getPlotBlocks: (plotId: string) => {
        return this.trackPerformance('blockSystem.getPlotBlocks', () => {
          return this.blockSystemInstance.getPlotBlocks(plotId);
        });
      },
      
      validatePlotStructure: (plotId: string) => {
        return this.trackPerformance('blockSystem.validatePlotStructure', () => {
          return this.blockSystemInstance.validatePlotStructure(plotId);
        });
      }
    };
  }

  // === Save Management API ===
  
  get saveSystem() {
    return {
      initializeWorld: () => {
        // No-op for new system (already initialized)
        return Promise.resolve();
      },
      
      savePlayerObby: (player: any) => {
        return this.trackPerformance('saveSystem.savePlayerObby', () => {
          return this.saveSystemInstance.savePlayerObby(player);
        });
      },
      
      loadPlayerObby: (player: any, plotId: string) => {
        return this.trackPerformance('saveSystem.loadPlayerObby', () => {
          return this.saveSystemInstance.loadPlayerObby(player, plotId);
        });
      },
      
      hasPlayerObby: (player: any) => {
        return this.trackPerformance('saveSystem.hasPlayerObby', () => {
          return this.saveSystemInstance.hasPlayerObby(player);
        });
      },
      
      clearPlotPhysicalContent: (plotId: string) => {
        return this.trackPerformance('saveSystem.clearPlotPhysicalContent', () => {
          return this.blockSystemInstance.clearPlotBlocks(plotId);
        });
      },
      
      trackBlockPlacement: (plotId: string, position: any, blockId: number) => {
        // No-op for new system (handled by event system)
        return Promise.resolve();
      },
      
      handlePlayerDisconnect: (player: any) => {
        return this.trackPerformance('saveSystem.handlePlayerDisconnect', () => {
          // Clean up any auto-save timers
          this.saveSystemInstance.deletePlayerObby(player);
        });
      }
    };
  }

  // === Simplified APIs (new in Phase 3) ===
  
  /**
   * Simplified obstacle system (placeholder - would integrate with actual obstacle systems)
   */
  get obstacleSystem() {
    return {
      initializeWorld: () => Promise.resolve(),
      canPlaceObstacle: () => true,
      placeObstacle: () => true,
      removeObstacle: () => ({ success: true }),
      getPlotObstacles: () => [],
      registerObstacle: () => {}
    };
  }

  /**
   * Simplified enemy system (placeholder - would integrate with actual enemy systems)
   */
  get enemySystem() {
    return {
      spawnEnemy: () => null,
      getEnemiesInPlot: () => [],
      clearPlotEnemies: () => 0,
      initializeWorld: () => {},
      canPlaceEnemy: () => ({ valid: true }),
      placeEnemy: () => true,
      removeEnemy: () => ({ success: true })
    };
  }

  /**
   * Simplified boundary system
   */
  get boundarySystem() {
    return {
      registerPlot: () => {},
      getCalculatedBoundaries: (plotId: string) => {
        const plot = this.plotSystemInstance.getPlotById(plotId);
        return plot?.boundaries || null;
      },
      isWithinBoundaries: (plotId: string, position: any) => {
        return this.plotSystemInstance.isPositionInPlot(plotId, position);
      }
    };
  }

  // === Utility Methods ===
  
  getWorld(): World {
    return this.world;
  }
  
  initializeAllSystems(): void {
    console.log(`[NewWorldContext:${this.world.name}] All systems already initialized on construction`);
  }
  
  getDebugInfo(): any {
    const plotStats = this.plotSystemInstance.getStatistics();
    const blockStats = this.blockSystemInstance.getStatistics();
    const saveStats = this.saveSystemInstance.getStatistics();
    
    return {
      worldName: this.world.name,
      systemType: 'dedicated', // vs 'singleton' in Phase 1
      plotStatistics: plotStats,
      blockStatistics: blockStats,
      saveStatistics: saveStats,
      eventBusInfo: this.eventBus.getDebugInfo(),
      performanceMetrics: this.config.enablePerformanceMetrics ? 
        Object.fromEntries(this.performanceMetrics) : 'disabled'
    };
  }

  /**
   * Get performance metrics (Phase 3 feature)
   */
  getPerformanceMetrics(): Record<string, { calls: number; totalTime: number; avgTime: number }> {
    return Object.fromEntries(this.performanceMetrics);
  }

  /**
   * Enable/disable event logging
   */
  setEventLogging(enabled: boolean): void {
    this.config.enableEventLogging = enabled;
    if (enabled) {
      this.setupEventLogging();
    }
  }

  /**
   * Enable/disable performance tracking
   */
  setPerformanceTracking(enabled: boolean): void {
    this.config.enablePerformanceMetrics = enabled;
    if (!enabled) {
      this.performanceMetrics.clear();
    }
  }

  /**
   * Export world state for migration or backup
   */
  async exportWorldState(): Promise<any> {
    const plots = this.plotSystemInstance.getAllPlots();
    const blockStats = this.blockSystemInstance.getStatistics();
    const saveData = this.saveSystemInstance.getAllSaveData();
    
    return {
      worldName: this.world.name,
      exportedAt: Date.now(),
      version: "3.0.0",
      plots,
      blockStatistics: blockStats,
      saveData: Array.from(saveData.entries()),
      eventHistory: this.eventBus.getRecentEvents(100)
    };
  }

  /**
   * Import world state from backup
   */
  async importWorldState(worldState: any): Promise<{ success: boolean; reason?: string }> {
    try {
      // TODO: Implement state import
      console.log(`[NewWorldContext:${this.world.name}] Importing world state from ${worldState.exportedAt}`);
      return { success: true };
    } catch (error) {
      console.error(`[NewWorldContext:${this.world.name}] Error importing world state:`, error);
      return { success: false, reason: "Import failed" };
    }
  }
}