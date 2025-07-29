/**
 * GlobalRegistry - Phase 4 Implementation
 * 
 * Manages cross-world data and operations efficiently.
 * Replaces singleton pattern with centralized registry for better performance.
 */

import { World } from 'hytopia';
import { GlobalEventBus } from './EventBus';
import type { PlotEvents, PlayerEvents } from './EventBus';

export interface PlotAssignment {
  playerId: string;
  worldId: string;
  plotIndex: number;
  assignedAt: number;
}

export interface WorldSlot {
  worldId: string;
  world: World;
  plotIndex: number;
  available: boolean;
}

export interface WorldInstance {
  worldId: string;
  world: World;
  region: any; // ObbyRegion instance
  playerCount: number;
  availablePlots: number;
  totalPlots: number;
  createdAt: number;
  lastActivity: number;
}

export interface GlobalRegistryConfig {
  maxPlayersPerWorld: number;
  maxWorldInstances: number;
  worldCleanupDelayMs: number;
  enableWorldPooling: boolean;
}

/**
 * Global registry for managing cross-world plot assignments and world instances
 */
export class GlobalRegistry {
  private static instance: GlobalRegistry;
  
  // Core registries
  private playerAssignments: Map<string, PlotAssignment> = new Map(); // playerId -> assignment
  private worldInstances: Map<string, WorldInstance> = new Map(); // worldId -> instance
  private availableSlots: WorldSlot[] = []; // Sorted by priority
  private worldCleanupTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // Performance indexes
  private playersByWorld: Map<string, Set<string>> = new Map(); // worldId -> playerIds
  private plotsByWorld: Map<string, boolean[]> = new Map(); // worldId -> plot availability
  
  private config: GlobalRegistryConfig;

  private constructor(config: Partial<GlobalRegistryConfig> = {}) {
    this.config = {
      maxPlayersPerWorld: 5,
      maxWorldInstances: 20,
      worldCleanupDelayMs: 300000, // 5 minutes
      enableWorldPooling: true,
      ...config
    };

    this.setupEventHandlers();
    console.log('[GlobalRegistry] Initialized with config:', this.config);
  }

  public static getInstance(config?: Partial<GlobalRegistryConfig>): GlobalRegistry {
    if (!GlobalRegistry.instance) {
      GlobalRegistry.instance = new GlobalRegistry(config);
    }
    return GlobalRegistry.instance;
  }

  private setupEventHandlers(): void {
    // Listen for plot assignments
    GlobalEventBus.on<PlotEvents['plot.assigned']>('plot.assigned', async (payload) => {
      this.onPlotAssigned(payload);
    });

    // Listen for plot releases
    GlobalEventBus.on<PlotEvents['plot.released']>('plot.released', async (payload) => {
      this.onPlotReleased(payload);
    });

    // Listen for player events
    GlobalEventBus.on<PlayerEvents['player.joined']>('player.joined', async (payload) => {
      this.onPlayerJoined(payload);
    });

    GlobalEventBus.on<PlayerEvents['player.left']>('player.left', async (payload) => {
      this.onPlayerLeft(payload);
    });
  }

  // === World Instance Management ===

  /**
   * Register a new world instance
   */
  registerWorldInstance(worldId: string, world: World, region: any): void {
    const instance: WorldInstance = {
      worldId,
      world,
      region,
      playerCount: 0,
      availablePlots: this.config.maxPlayersPerWorld, // Assuming 1 plot per player
      totalPlots: this.config.maxPlayersPerWorld,
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    this.worldInstances.set(worldId, instance);
    this.playersByWorld.set(worldId, new Set());
    this.plotsByWorld.set(worldId, new Array(this.config.maxPlayersPerWorld).fill(true));

    // Add available slots for this world
    for (let i = 0; i < this.config.maxPlayersPerWorld; i++) {
      this.availableSlots.push({
        worldId,
        world,
        plotIndex: i,
        available: true
      });
    }

    // Sort available slots by world creation time (newer worlds last)
    this.sortAvailableSlots();

    console.log(`[GlobalRegistry] Registered world instance: ${worldId}`);
  }

  /**
   * Unregister a world instance
   */
  unregisterWorldInstance(worldId: string): void {
    // Remove from all registries
    this.worldInstances.delete(worldId);
    this.playersByWorld.delete(worldId);
    this.plotsByWorld.delete(worldId);

    // Remove available slots for this world
    this.availableSlots = this.availableSlots.filter(slot => slot.worldId !== worldId);

    // Clear cleanup timer
    const timer = this.worldCleanupTimers.get(worldId);
    if (timer) {
      clearTimeout(timer);
      this.worldCleanupTimers.delete(worldId);
    }

    console.log(`[GlobalRegistry] Unregistered world instance: ${worldId}`);
  }

  /**
   * Find the best available slot for a new player
   */
  findAvailableSlot(): WorldSlot | null {
    // Return first available slot (already sorted by priority)
    const slot = this.availableSlots.find(slot => slot.available);
    return slot || null;
  }

  /**
   * Create a new world instance if needed
   */
  async createNewWorldInstance(worldFactory: () => { world: World; region: any }): Promise<WorldSlot | null> {
    if (this.worldInstances.size >= this.config.maxWorldInstances) {
      console.warn('[GlobalRegistry] Maximum world instances reached');
      return null;
    }

    try {
      const { world, region } = worldFactory();
      const worldId = world.name;

      // Register the new world
      this.registerWorldInstance(worldId, world, region);

      // Return the first slot in the new world
      const slot = this.availableSlots.find(s => s.worldId === worldId && s.available);
      return slot || null;
    } catch (error) {
      console.error('[GlobalRegistry] Error creating new world instance:', error);
      return null;
    }
  }

  // === Plot Assignment Management ===

  /**
   * Assign a plot to a player
   */
  async assignPlot(playerId: string, worldFactory?: () => { world: World; region: any }): Promise<PlotAssignment | null> {
    // Check if player already has an assignment
    const existing = this.playerAssignments.get(playerId);
    if (existing) {
      console.log(`[GlobalRegistry] Player ${playerId} already has plot ${existing.plotIndex} in world ${existing.worldId}`);
      return existing;
    }

    // Find available slot
    let slot = this.findAvailableSlot();
    
    // Create new world if no slots available
    if (!slot && worldFactory) {
      slot = await this.createNewWorldInstance(worldFactory);
    }

    if (!slot) {
      console.warn(`[GlobalRegistry] No available slots for player ${playerId}`);
      return null;
    }

    // Mark slot as taken
    slot.available = false;

    // Create assignment
    const assignment: PlotAssignment = {
      playerId,
      worldId: slot.worldId,
      plotIndex: slot.plotIndex,
      assignedAt: Date.now()
    };

    // Register assignment
    this.playerAssignments.set(playerId, assignment);

    // Update world tracking
    const worldPlots = this.plotsByWorld.get(slot.worldId);
    if (worldPlots) {
      worldPlots[slot.plotIndex] = false; // Mark plot as occupied
    }

    // Update world instance stats
    const worldInstance = this.worldInstances.get(slot.worldId);
    if (worldInstance) {
      worldInstance.availablePlots--;
      worldInstance.lastActivity = Date.now();
    }

    console.log(`[GlobalRegistry] Assigned plot ${slot.plotIndex} in world ${slot.worldId} to player ${playerId}`);
    return assignment;
  }

  /**
   * Release a plot from a player
   */
  releasePlot(playerId: string): boolean {
    const assignment = this.playerAssignments.get(playerId);
    if (!assignment) {
      return false;
    }

    // Remove assignment
    this.playerAssignments.delete(playerId);

    // Mark slot as available
    const slot = this.availableSlots.find(s => 
      s.worldId === assignment.worldId && 
      s.plotIndex === assignment.plotIndex
    );
    if (slot) {
      slot.available = true;
    }

    // Update world tracking
    const worldPlots = this.plotsByWorld.get(assignment.worldId);
    if (worldPlots) {
      worldPlots[assignment.plotIndex] = true; // Mark plot as available
    }

    // Update world instance stats
    const worldInstance = this.worldInstances.get(assignment.worldId);
    if (worldInstance) {
      worldInstance.availablePlots++;
      worldInstance.lastActivity = Date.now();
    }

    // Sort available slots to prioritize this world if it now has space
    this.sortAvailableSlots();

    console.log(`[GlobalRegistry] Released plot ${assignment.plotIndex} in world ${assignment.worldId} from player ${playerId}`);
    return true;
  }

  /**
   * Get player's plot assignment
   */
  getPlayerAssignment(playerId: string): PlotAssignment | null {
    return this.playerAssignments.get(playerId) || null;
  }

  // === Event Handlers ===

  private onPlotAssigned(payload: PlotEvents['plot.assigned']): void {
    // Update last activity for the world
    const worldInstance = this.worldInstances.get(payload.worldId);
    if (worldInstance) {
      worldInstance.lastActivity = Date.now();
    }

    // Cancel cleanup timer if world was scheduled for cleanup
    const timer = this.worldCleanupTimers.get(payload.worldId);
    if (timer) {
      clearTimeout(timer);
      this.worldCleanupTimers.delete(payload.worldId);
    }
  }

  private onPlotReleased(payload: PlotEvents['plot.released']): void {
    // Update last activity for the world
    const worldInstance = this.worldInstances.get(payload.worldId);
    if (worldInstance) {
      worldInstance.lastActivity = Date.now();
    }

    // Schedule world cleanup if it becomes empty
    this.scheduleWorldCleanupIfEmpty(payload.worldId);
  }

  private onPlayerJoined(payload: PlayerEvents['player.joined']): void {
    // Update player tracking
    let playersInWorld = this.playersByWorld.get(payload.worldId);
    if (!playersInWorld) {
      playersInWorld = new Set();
      this.playersByWorld.set(payload.worldId, playersInWorld);
    }
    playersInWorld.add(payload.playerId);

    // Update world instance stats
    const worldInstance = this.worldInstances.get(payload.worldId);
    if (worldInstance) {
      worldInstance.playerCount = playersInWorld.size;
      worldInstance.lastActivity = Date.now();
    }
  }

  private onPlayerLeft(payload: PlayerEvents['player.left']): void {
    // Update player tracking
    const playersInWorld = this.playersByWorld.get(payload.worldId);
    if (playersInWorld) {
      playersInWorld.delete(payload.playerId);

      // Update world instance stats
      const worldInstance = this.worldInstances.get(payload.worldId);
      if (worldInstance) {
        worldInstance.playerCount = playersInWorld.size;
        worldInstance.lastActivity = Date.now();
      }
    }

    // Schedule world cleanup if it becomes empty
    this.scheduleWorldCleanupIfEmpty(payload.worldId);
  }

  // === Utility Methods ===

  private sortAvailableSlots(): void {
    this.availableSlots.sort((a, b) => {
      // Prioritize worlds with existing players (better utilization)
      const aPlayers = this.playersByWorld.get(a.worldId)?.size || 0;
      const bPlayers = this.playersByWorld.get(b.worldId)?.size || 0;
      
      if (aPlayers !== bPlayers) {
        return bPlayers - aPlayers; // Higher player count first
      }

      // Then prioritize by creation time (older worlds first)
      const aInstance = this.worldInstances.get(a.worldId);
      const bInstance = this.worldInstances.get(b.worldId);
      
      if (aInstance && bInstance) {
        return aInstance.createdAt - bInstance.createdAt;
      }

      return 0;
    });
  }

  private scheduleWorldCleanupIfEmpty(worldId: string): void {
    const playersInWorld = this.playersByWorld.get(worldId);
    const playerCount = playersInWorld?.size || 0;

    if (playerCount === 0 && this.config.enableWorldPooling) {
      // Schedule cleanup after delay
      const timer = setTimeout(() => {
        const currentPlayerCount = this.playersByWorld.get(worldId)?.size || 0;
        if (currentPlayerCount === 0) {
          console.log(`[GlobalRegistry] Cleaning up empty world: ${worldId}`);
          this.unregisterWorldInstance(worldId);
          
          // Optionally destroy the world instance
          const worldInstance = this.worldInstances.get(worldId);
          if (worldInstance?.region?.cleanup) {
            worldInstance.region.cleanup();
          }
        }
      }, this.config.worldCleanupDelayMs);

      this.worldCleanupTimers.set(worldId, timer);
      console.log(`[GlobalRegistry] Scheduled cleanup for empty world ${worldId} in ${this.config.worldCleanupDelayMs}ms`);
    }
  }

  // === Statistics and Debug ===

  /**
   * Get global statistics
   */
  getGlobalStatistics(): {
    totalWorlds: number;
    totalPlayers: number;
    totalPlots: number;
    availablePlots: number;
    averagePlayersPerWorld: number;
    worldUtilization: number;
  } {
    const totalWorlds = this.worldInstances.size;
    const totalPlayers = Array.from(this.playersByWorld.values()).reduce((sum, players) => sum + players.size, 0);
    const totalPlots = Array.from(this.worldInstances.values()).reduce((sum, world) => sum + world.totalPlots, 0);
    const availablePlots = this.availableSlots.filter(slot => slot.available).length;
    const averagePlayersPerWorld = totalWorlds > 0 ? totalPlayers / totalWorlds : 0;
    const worldUtilization = totalPlots > 0 ? ((totalPlots - availablePlots) / totalPlots) * 100 : 0;

    return {
      totalWorlds,
      totalPlayers,
      totalPlots,
      availablePlots,
      averagePlayersPerWorld,
      worldUtilization
    };
  }

  /**
   * Get world statistics
   */
  getWorldStatistics(): Array<{
    worldId: string;
    playerCount: number;
    availablePlots: number;
    totalPlots: number;
    utilization: number;
    ageMinutes: number;
  }> {
    const now = Date.now();
    
    return Array.from(this.worldInstances.values()).map(world => ({
      worldId: world.worldId,
      playerCount: world.playerCount,
      availablePlots: world.availablePlots,
      totalPlots: world.totalPlots,
      utilization: world.totalPlots > 0 ? ((world.totalPlots - world.availablePlots) / world.totalPlots) * 100 : 0,
      ageMinutes: Math.round((now - world.createdAt) / 60000)
    }));
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    const globalStats = this.getGlobalStatistics();
    const worldStats = this.getWorldStatistics();
    
    return {
      config: this.config,
      globalStatistics: globalStats,
      worldStatistics: worldStats,
      playerAssignments: Array.from(this.playerAssignments.entries()),
      availableSlots: this.availableSlots.filter(slot => slot.available).length,
      cleanupTimers: this.worldCleanupTimers.size,
      eventBusInfo: GlobalEventBus.getDebugInfo()
    };
  }

  /**
   * Force cleanup of all empty worlds
   */
  forceCleanupEmptyWorlds(): number {
    let cleanedCount = 0;
    
    for (const [worldId, players] of this.playersByWorld) {
      if (players.size === 0) {
        this.unregisterWorldInstance(worldId);
        cleanedCount++;
      }
    }
    
    console.log(`[GlobalRegistry] Force cleaned ${cleanedCount} empty worlds`);
    return cleanedCount;
  }
}