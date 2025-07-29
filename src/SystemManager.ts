/**
 * SystemManager - All Phases Orchestrator
 * 
 * Manages the transition between architecture phases and provides
 * a unified interface for all system implementations.
 */

import { World } from 'hytopia';
import { FEATURE_FLAGS, isEnabled, shouldUseNewFeatures } from './FeatureFlags';
import { WorldContext } from './WorldContext'; // Phase 1
import { NewWorldContext } from './NewWorldContext'; // Phase 3
import { GlobalRegistry } from './GlobalRegistry'; // Phase 4
import { GlobalEventBus } from './EventBus'; // Phase 2

export type SystemType = 'legacy' | 'phase1' | 'phase3' | 'phase4';

export interface SystemManagerConfig {
  defaultSystemType: SystemType;
  enableFallback: boolean;
  performanceThreshold: number; // ms
}

/**
 * Central manager for all system implementations
 */
export class SystemManager {
  private static instance: SystemManager;
  private globalRegistry?: GlobalRegistry;
  private worldContexts: Map<string, WorldContext | NewWorldContext> = new Map();
  private systemTypes: Map<string, SystemType> = new Map(); // worldId -> systemType
  private config: SystemManagerConfig;

  private constructor(config: Partial<SystemManagerConfig> = {}) {
    this.config = {
      defaultSystemType: 'phase1',
      enableFallback: true,
      performanceThreshold: 100, // 100ms
      ...config
    };

    this.initializeGlobalSystems();
    console.log('[SystemManager] Initialized with config:', this.config);
  }

  public static getInstance(config?: Partial<SystemManagerConfig>): SystemManager {
    if (!SystemManager.instance) {
      SystemManager.instance = new SystemManager(config);
    }
    return SystemManager.instance;
  }

  private initializeGlobalSystems(): void {
    // Initialize global registry if Phase 4 is enabled
    if (isEnabled('useGlobalRegistry')) {
      this.globalRegistry = GlobalRegistry.getInstance({
        maxPlayersPerWorld: 5,
        maxWorldInstances: 20,
        worldCleanupDelayMs: 300000,
        enableWorldPooling: isEnabled('enableWorldPooling')
      });
      console.log('[SystemManager] Global registry initialized');
    }

    // Set up global event listeners if event bus is enabled
    if (isEnabled('useEventBus')) {
      this.setupGlobalEventHandlers();
    }
  }

  private setupGlobalEventHandlers(): void {
    GlobalEventBus.on('system.performance.warning', (payload: any) => {
      console.warn(`[SystemManager] Performance warning for ${payload.worldId}: ${payload.operation} took ${payload.duration}ms`);
      
      if (payload.duration > this.config.performanceThreshold && this.config.enableFallback) {
        this.considerSystemDowngrade(payload.worldId);
      }
    });

    GlobalEventBus.on('system.error', (payload: any) => {
      console.error(`[SystemManager] System error for ${payload.worldId}:`, payload.error);
      
      if (this.config.enableFallback) {
        this.fallbackToLegacySystem(payload.worldId);
      }
    });
  }

  /**
   * Create or get world context based on feature flags and world ID
   */
  getWorldContext(world: World, regionId?: string): WorldContext | NewWorldContext | null {
    const worldId = world.name;
    
    // Check if context already exists
    const existing = this.worldContexts.get(worldId);
    if (existing) {
      return existing;
    }

    // Determine which system type to use
    const systemType = this.determineSystemType(worldId, regionId);
    
    try {
      let context: WorldContext | NewWorldContext;

      switch (systemType) {
        case 'phase1':
          if (!isEnabled('enableWorldContext')) {
            console.warn(`[SystemManager] Phase 1 disabled, cannot create context for ${worldId}`);
            return null;
          }
          context = new WorldContext(world);
          break;

        case 'phase3':
          if (!isEnabled('useNewWorldContext')) {
            console.warn(`[SystemManager] Phase 3 disabled, falling back to Phase 1 for ${worldId}`);
            context = new WorldContext(world);
            break;
          }
          context = new NewWorldContext(world, {
            enableEventLogging: isEnabled('enableEventLogging'),
            enablePerformanceMetrics: isEnabled('enablePerformanceMetrics'),
            systemConfigs: {
              plot: { maxPlots: 8 },
              block: { enableValidation: true, enableHistory: true },
              save: { enableAutoSave: false }
            }
          });
          break;

        case 'phase4':
          // Phase 4 uses Phase 3 systems + global registry
          if (!isEnabled('useGlobalRegistry') || !this.globalRegistry) {
            console.warn(`[SystemManager] Phase 4 disabled, falling back to Phase 3 for ${worldId}`);
            context = new NewWorldContext(world);
            break;
          }
          context = new NewWorldContext(world, {
            enableEventLogging: isEnabled('enableEventLogging'),
            enablePerformanceMetrics: isEnabled('enablePerformanceMetrics')
          });
          break;

        default:
          console.warn(`[SystemManager] Unknown system type ${systemType}, using Phase 1 for ${worldId}`);
          context = new WorldContext(world);
          break;
      }

      // Store context and system type
      this.worldContexts.set(worldId, context);
      this.systemTypes.set(worldId, systemType);

      // Register with global registry if Phase 4
      if (systemType === 'phase4' && this.globalRegistry) {
        // Note: region parameter would need to be passed to register properly
        console.log(`[SystemManager] Would register ${worldId} with global registry`);
      }

      console.log(`[SystemManager] ✅ Created ${systemType} context for world ${worldId}`);
      console.log(`[SystemManager] 🔧 Context features - PlotManager: ${!!context.plotManager}, BlockSystem: ${!!context.blockSystem}, SaveSystem: ${!!context.saveSystem}`);
      return context;

    } catch (error) {
      console.error(`[SystemManager] Error creating context for ${worldId}:`, error);
      
      if (this.config.enableFallback) {
        // Fallback to Phase 1
        try {
          const fallbackContext = new WorldContext(world);
          this.worldContexts.set(worldId, fallbackContext);
          this.systemTypes.set(worldId, 'phase1');
          console.log(`[SystemManager] Created fallback Phase 1 context for ${worldId}`);
          return fallbackContext;
        } catch (fallbackError) {
          console.error(`[SystemManager] Fallback failed for ${worldId}:`, fallbackError);
          return null;
        }
      }

      return null;
    }
  }

  /**
   * Determine which system type to use for a world
   */
  private determineSystemType(worldId: string, regionId?: string): SystemType {
    // Check for A/B testing
    if (regionId && shouldUseNewFeatures(regionId)) {
      if (isEnabled('useGlobalRegistry')) {
        return 'phase4';
      } else if (isEnabled('useNewWorldContext')) {
        return 'phase3';
      }
    }

    // Check specific feature flags
    if (isEnabled('useGlobalRegistry') && this.globalRegistry) {
      return 'phase4';
    } else if (isEnabled('useNewWorldContext')) {
      return 'phase3';
    } else if (isEnabled('enableWorldContext')) {
      return 'phase1';
    }

    return 'legacy';
  }

  /**
   * Consider downgrading a world's system due to performance issues
   */
  private considerSystemDowngrade(worldId: string): void {
    const currentType = this.systemTypes.get(worldId);
    if (!currentType) return;

    let newType: SystemType;

    switch (currentType) {
      case 'phase4':
        newType = 'phase3';
        break;
      case 'phase3':
        newType = 'phase1';
        break;
      case 'phase1':
        newType = 'legacy';
        break;
      default:
        return; // Already at lowest level
    }

    console.warn(`[SystemManager] Downgrading ${worldId} from ${currentType} to ${newType} due to performance`);
    this.migrateWorldSystem(worldId, newType);
  }

  /**
   * Fallback to legacy system for a world
   */
  private fallbackToLegacySystem(worldId: string): void {
    const currentType = this.systemTypes.get(worldId);
    if (currentType === 'legacy') return;

    console.error(`[SystemManager] Falling back ${worldId} to legacy system`);
    
    // Remove new context
    this.worldContexts.delete(worldId);
    this.systemTypes.set(worldId, 'legacy');
    
    // Emit event for cleanup
    GlobalEventBus.emitSync('system.fallback', { worldId, fromType: currentType });
  }

  /**
   * Migrate a world from one system to another
   */
  private async migrateWorldSystem(worldId: string, newType: SystemType): Promise<boolean> {
    try {
      const existingContext = this.worldContexts.get(worldId);
      if (!existingContext) return false;

      // Export current state if possible
      let worldState = null;
      if ('exportWorldState' in existingContext) {
        worldState = await existingContext.exportWorldState();
      }

      // Remove old context
      this.worldContexts.delete(worldId);
      
      // Create new context
      const world = existingContext.getWorld();
      const newContext = this.getWorldContext(world);
      
      // Import state if possible
      if (worldState && newContext && 'importWorldState' in newContext) {
        await newContext.importWorldState(worldState);
      }

      console.log(`[SystemManager] Successfully migrated ${worldId} to ${newType}`);
      return true;

    } catch (error) {
      console.error(`[SystemManager] Error migrating ${worldId}:`, error);
      this.fallbackToLegacySystem(worldId);
      return false;
    }
  }

  /**
   * Get system type for a world
   */
  getWorldSystemType(worldId: string): SystemType {
    return this.systemTypes.get(worldId) || 'legacy';
  }

  /**
   * Get global registry (Phase 4 only)
   */
  getGlobalRegistry(): GlobalRegistry | null {
    return this.globalRegistry || null;
  }

  /**
   * Force cleanup of a world's context
   */
  cleanupWorldContext(worldId: string): void {
    const context = this.worldContexts.get(worldId);
    if (context) {
      // Cleanup event listeners, timers, etc.
      if ('cleanup' in context && typeof context.cleanup === 'function') {
        context.cleanup();
      }
      
      this.worldContexts.delete(worldId);
      this.systemTypes.delete(worldId);
      console.log(`[SystemManager] Cleaned up context for ${worldId}`);
    }

    // Cleanup from global registry
    if (this.globalRegistry) {
      this.globalRegistry.unregisterWorldInstance(worldId);
    }
  }

  /**
   * Get statistics about all systems
   */
  getSystemStatistics(): {
    totalWorlds: number;
    systemDistribution: Record<SystemType, number>;
    globalStats?: any;
    worldDetails: Array<{
      worldId: string;
      systemType: SystemType;
      hasContext: boolean;
      debugInfo?: any;
    }>;
  } {
    const totalWorlds = this.worldContexts.size;
    const systemDistribution: Record<SystemType, number> = {
      legacy: 0,
      phase1: 0,
      phase3: 0,
      phase4: 0
    };

    const worldDetails: any[] = [];

    for (const [worldId, context] of this.worldContexts) {
      const systemType = this.getWorldSystemType(worldId);
      systemDistribution[systemType]++;

      const debugInfo = context.getDebugInfo ? context.getDebugInfo() : null;

      worldDetails.push({
        worldId,
        systemType,
        hasContext: true,
        debugInfo
      });
    }

    const result: any = {
      totalWorlds,
      systemDistribution,
      worldDetails
    };

    if (this.globalRegistry) {
      result.globalStats = this.globalRegistry.getGlobalStatistics();
    }

    return result;
  }

  /**
   * Run compatibility tests across all systems
   */
  async runCompatibilityTests(): Promise<{
    passed: number;
    failed: number;
    results: Array<{ worldId: string; systemType: SystemType; passed: boolean; details: string }>
  }> {
    const results: any[] = [];
    let passed = 0;
    let failed = 0;

    for (const [worldId, context] of this.worldContexts) {
      const systemType = this.getWorldSystemType(worldId);
      
      try {
        // Run basic API tests
        const plotManager = context.plotManager;
        const blockSystem = context.blockSystem;
        const saveSystem = context.saveSystem;

        // Test that all required methods exist
        const requiredMethods = ['getPlayerPlot', 'canPlaceBlock', 'hasPlayerObby'];
        const hasAllMethods = requiredMethods.every(method => {
          return (plotManager && typeof plotManager[method] === 'function') ||
                 (blockSystem && typeof blockSystem[method] === 'function') ||
                 (saveSystem && typeof saveSystem[method] === 'function');
        });

        if (hasAllMethods) {
          passed++;
          results.push({
            worldId,
            systemType,
            passed: true,
            details: 'All required methods available'
          });
        } else {
          failed++;
          results.push({
            worldId,
            systemType,
            passed: false,
            details: 'Missing required methods'
          });
        }

      } catch (error) {
        failed++;
        results.push({
          worldId,
          systemType,
          passed: false,
          details: `Error: ${error.message}`
        });
      }
    }

    return { passed, failed, results };
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    const stats = this.getSystemStatistics();
    
    return {
      config: this.config,
      featureFlags: FEATURE_FLAGS,
      systemStatistics: stats,
      globalRegistryEnabled: !!this.globalRegistry,
      eventBusEnabled: isEnabled('useEventBus')
    };
  }
}