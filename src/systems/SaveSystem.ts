/**
 * SaveSystem - Phase 2 System Implementation
 * 
 * New save/load system with event-driven architecture and better data management.
 * Handles obby saving, loading, and persistence per world.
 */

import { World, Player } from 'hytopia';
import { EventBus } from '../EventBus';
import type { SaveEvents, PlotEvents, BlockEvents } from '../EventBus';
import { PlotSystem } from './PlotSystem';
import { BlockSystem } from './BlockSystem';

export interface SaveData {
  version: string;
  playerId: string;
  plotData: {
    plotIndex: number;
    plotId: string;
    plotSide: 'left' | 'right';
    plotCenter: { x: number; y: number; z: number };
    blocks: Array<{
      relativePos: { x: number; y: number; z: number };
      blockTypeId: number;
    }>;
    obstacles: Array<{
      type: string;
      size: string;
      relativePos: { x: number; y: number; z: number };
    }>;
    enemies: Array<{
      type: string;
      variant: string;
      relativePos: { x: number; y: number; z: number };
    }>;
    metadata: {
      createdAt: number;
      lastModified: number;
      playTime: number;
      version: string;
    };
  };
}

export interface SaveSystemConfig {
  enableAutoSave: boolean;
  autoSaveIntervalMs: number;
  maxSavesPerPlayer: number;
  compressionEnabled: boolean;
}

export class SaveSystem {
  private playerSaves: Map<string, SaveData> = new Map(); // playerId -> saveData
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map(); // playerId -> timer
  private config: SaveSystemConfig;

  constructor(
    private world: World,
    private eventBus: EventBus,
    private plotSystem: PlotSystem,
    private blockSystem: BlockSystem,
    config: Partial<SaveSystemConfig> = {}
  ) {
    this.config = {
      enableAutoSave: false, // Disabled by default for safety
      autoSaveIntervalMs: 30000, // 30 seconds
      maxSavesPerPlayer: 10,
      compressionEnabled: false,
      ...config
    };

    this.setupEventHandlers();
    console.log(`[SaveSystem:${world.name}] Initialized with auto-save: ${this.config.enableAutoSave}`);
  }

  private setupEventHandlers(): void {
    // Listen for block changes to mark saves as dirty
    this.eventBus.on<BlockEvents['block.placed']>('block.placed', async (payload) => {
      if (this.config.enableAutoSave) {
        this.scheduleAutoSave(payload.playerId);
      }
    });

    this.eventBus.on<BlockEvents['block.removed']>('block.removed', async (payload) => {
      if (this.config.enableAutoSave) {
        this.scheduleAutoSave(payload.playerId);
      }
    });

    // Clean up auto-save timers when players leave
    this.eventBus.on<PlotEvents['plot.released']>('plot.released', async (payload) => {
      this.clearAutoSave(payload.playerId);
    });
  }

  /**
   * Save a player's obby
   */
  async savePlayerObby(player: Player): Promise<{ success: boolean; reason?: string }> {
    try {
      await this.eventBus.emit('save.started', {
        playerId: player.id,
        plotId: `plot_${this.plotSystem.getPlayerPlot(player.id)?.plotIndex || 0}`
      });

      const plotInfo = this.plotSystem.getPlayerPlot(player.id);
      if (!plotInfo) {
        return { success: false, reason: "Player does not have an assigned plot" };
      }

      // Collect save data
      const saveData = await this.createSaveData(player, plotInfo);
      
      // Store the save
      this.playerSaves.set(player.id, saveData);
      
      // In a real implementation, you'd also persist to database/file system here
      console.log(`[SaveSystem:${this.world.name}] Saved obby for player ${player.id}`);
      
      await this.eventBus.emit('save.completed', {
        playerId: player.id,
        plotId: plotInfo.plotId,
        success: true
      });

      return { success: true };
    } catch (error) {
      console.error(`[SaveSystem:${this.world.name}] Error saving obby for player ${player.id}:`, error);
      
      await this.eventBus.emit('save.completed', {
        playerId: player.id,
        plotId: `plot_${this.plotSystem.getPlayerPlot(player.id)?.plotIndex || 0}`,
        success: false
      });

      return { success: false, reason: "Internal save error" };
    }
  }

  /**
   * Load a player's obby onto their assigned plot
   */
  async loadPlayerObby(player: Player, targetPlotId?: string): Promise<{ success: boolean; reason?: string }> {
    try {
      const plotInfo = this.plotSystem.getPlayerPlot(player.id);
      if (!plotInfo) {
        return { success: false, reason: "Player does not have an assigned plot" };
      }

      const plotId = targetPlotId || plotInfo.plotId;
      
      await this.eventBus.emit('load.started', {
        playerId: player.id,
        plotId
      });

      const saveData = this.playerSaves.get(player.id);
      if (!saveData) {
        return { success: false, reason: "No saved obby found for player" };
      }

      // Clear the target plot first
      await this.blockSystem.clearPlotBlocks(plotId);

      // Load blocks
      await this.loadBlocks(saveData, plotInfo);
      
      // Load obstacles
      await this.loadObstacles(saveData, plotInfo);
      
      // Load enemies
      await this.loadEnemies(saveData, plotInfo);

      console.log(`[SaveSystem:${this.world.name}] Loaded obby for player ${player.id} onto ${plotId}`);
      
      await this.eventBus.emit('load.completed', {
        playerId: player.id,
        plotId,
        success: true
      });

      return { success: true };
    } catch (error) {
      console.error(`[SaveSystem:${this.world.name}] Error loading obby for player ${player.id}:`, error);
      
      await this.eventBus.emit('load.completed', {
        playerId: player.id,
        plotId: targetPlotId || `plot_${this.plotSystem.getPlayerPlot(player.id)?.plotIndex || 0}`,
        success: false
      });

      return { success: false, reason: "Internal load error" };
    }
  }

  /**
   * Check if a player has a saved obby
   */
  hasPlayerObby(player: Player): boolean {
    return this.playerSaves.has(player.id);
  }

  /**
   * Delete a player's saved obby
   */
  deletePlayerObby(player: Player): boolean {
    const deleted = this.playerSaves.delete(player.id);
    this.clearAutoSave(player.id);
    
    if (deleted) {
      console.log(`[SaveSystem:${this.world.name}] Deleted saved obby for player ${player.id}`);
    }
    
    return deleted;
  }

  /**
   * Create save data from current world state
   */
  private async createSaveData(player: Player, plotInfo: any): Promise<SaveData> {
    const plotBlocks = this.blockSystem.getPlotBlocks(plotInfo.plotId);
    const plotCenter = {
      x: (plotInfo.boundaries.minX + plotInfo.boundaries.maxX) / 2,
      y: plotInfo.boundaries.minY,
      z: (plotInfo.boundaries.minZ + plotInfo.boundaries.maxZ) / 2
    };

    // Convert blocks to relative positions
    const blocks = plotBlocks.map(placement => ({
      relativePos: {
        x: placement.position.x - plotCenter.x,
        y: placement.position.y - plotCenter.y,
        z: placement.position.z - plotCenter.z
      },
      blockTypeId: placement.blockId
    }));

    // Get obstacles from event bus (other systems will respond)
    const obstacles: any[] = []; // TODO: Collect from obstacle system
    const enemies: any[] = []; // TODO: Collect from enemy system

    const saveData: SaveData = {
      version: "2.0.0", // Phase 2 version
      playerId: player.id,
      plotData: {
        plotIndex: plotInfo.plotIndex,
        plotId: plotInfo.plotId,
        plotSide: this.getPlotSide(plotInfo.plotIndex),
        plotCenter,
        blocks,
        obstacles,
        enemies,
        metadata: {
          createdAt: plotInfo.assignedAt || Date.now(),
          lastModified: Date.now(),
          playTime: 0, // TODO: Track play time
          version: "2.0.0"
        }
      }
    };

    return saveData;
  }

  /**
   * Load blocks from save data
   */
  private async loadBlocks(saveData: SaveData, plotInfo: any): Promise<void> {
    const plotCenter = {
      x: (plotInfo.boundaries.minX + plotInfo.boundaries.maxX) / 2,
      y: plotInfo.boundaries.minY,
      z: (plotInfo.boundaries.minZ + plotInfo.boundaries.maxZ) / 2
    };

    for (const block of saveData.plotData.blocks) {
      const worldPosition = {
        x: Math.floor(plotCenter.x + block.relativePos.x),
        y: Math.floor(plotCenter.y + block.relativePos.y),
        z: Math.floor(plotCenter.z + block.relativePos.z)
      };

      // Validate position is within plot
      if (this.plotSystem.isPositionInPlot(plotInfo.plotId, worldPosition)) {
        this.world.chunkLattice.setBlock(worldPosition, block.blockTypeId);
      }
    }
  }

  /**
   * Load obstacles from save data
   */
  private async loadObstacles(saveData: SaveData, plotInfo: any): Promise<void> {
    // TODO: Implement obstacle loading through event system
    console.log(`[SaveSystem:${this.world.name}] Loading ${saveData.plotData.obstacles.length} obstacles`);
  }

  /**
   * Load enemies from save data
   */
  private async loadEnemies(saveData: SaveData, plotInfo: any): Promise<void> {
    // TODO: Implement enemy loading through event system
    console.log(`[SaveSystem:${this.world.name}] Loading ${saveData.plotData.enemies.length} enemies`);
  }

  /**
   * Get plot side (left/right) based on plot index
   */
  private getPlotSide(plotIndex: number): 'left' | 'right' {
    return plotIndex < 4 ? 'left' : 'right';
  }

  /**
   * Schedule auto-save for a player
   */
  private scheduleAutoSave(playerId: string): void {
    // Clear existing timer
    this.clearAutoSave(playerId);
    
    // Set new timer
    const timer = setTimeout(() => {
      const player = this.world.entityManager.getAllPlayerEntities()
        .find(entity => entity.player.id === playerId)?.player;
      
      if (player) {
        this.savePlayerObby(player);
      }
    }, this.config.autoSaveIntervalMs);
    
    this.autoSaveTimers.set(playerId, timer);
  }

  /**
   * Clear auto-save timer for a player
   */
  private clearAutoSave(playerId: string): void {
    const timer = this.autoSaveTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.autoSaveTimers.delete(playerId);
    }
  }

  /**
   * Get save data for a player (for debugging)
   */
  getPlayerSaveData(playerId: string): SaveData | null {
    return this.playerSaves.get(playerId) || null;
  }

  /**
   * Get all save data (for admin purposes)
   */
  getAllSaveData(): Map<string, SaveData> {
    return new Map(this.playerSaves);
  }

  /**
   * Import save data from old format
   */
  async importLegacySave(player: Player, legacySaveData: any): Promise<{ success: boolean; reason?: string }> {
    try {
      // Convert legacy format to new format
      const convertedSave = await this.convertLegacySaveData(player.id, legacySaveData);
      
      // Store converted save
      this.playerSaves.set(player.id, convertedSave);
      
      console.log(`[SaveSystem:${this.world.name}] Imported legacy save for player ${player.id}`);
      return { success: true };
    } catch (error) {
      console.error(`[SaveSystem:${this.world.name}] Error importing legacy save for player ${player.id}:`, error);
      return { success: false, reason: "Legacy save conversion failed" };
    }
  }

  /**
   * Convert legacy save data to new format
   */
  private async convertLegacySaveData(playerId: string, legacyData: any): Promise<SaveData> {
    // TODO: Implement conversion from old PlotSaveManager format
    const convertedSave: SaveData = {
      version: "2.0.0",
      playerId,
      plotData: {
        plotIndex: legacyData.plotIndex || 0,
        plotId: legacyData.plotId || `plot_0`,
        plotSide: legacyData.plotSide || 'left',
        plotCenter: legacyData.plotCenter || { x: 0, y: 0, z: 0 },
        blocks: legacyData.blocks || [],
        obstacles: legacyData.obstacles || [],
        enemies: legacyData.enemies || [],
        metadata: {
          createdAt: legacyData.createdAt || Date.now(),
          lastModified: Date.now(),
          playTime: legacyData.playTime || 0,
          version: "2.0.0"
        }
      }
    };

    return convertedSave;
  }

  /**
   * Get statistics about saves
   */
  getStatistics(): {
    totalSaves: number;
    averageSaveSize: number;
    oldestSave: number | null;
    newestSave: number | null;
  } {
    const totalSaves = this.playerSaves.size;
    let totalSize = 0;
    let oldestSave: number | null = null;
    let newestSave: number | null = null;

    for (const saveData of this.playerSaves.values()) {
      const saveSize = JSON.stringify(saveData).length;
      totalSize += saveSize;

      const created = saveData.plotData.metadata.createdAt;
      if (oldestSave === null || created < oldestSave) {
        oldestSave = created;
      }
      if (newestSave === null || created > newestSave) {
        newestSave = created;
      }
    }

    return {
      totalSaves,
      averageSaveSize: totalSaves > 0 ? Math.round(totalSize / totalSaves) : 0,
      oldestSave,
      newestSave
    };
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    const stats = this.getStatistics();
    
    return {
      worldName: this.world.name,
      config: this.config,
      statistics: stats,
      activeSaves: Array.from(this.playerSaves.keys()),
      autoSaveTimers: Array.from(this.autoSaveTimers.keys())
    };
  }
}