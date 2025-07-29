/**
 * PlotSystem - Phase 2 System Implementation
 * 
 * New plot management system that operates per-world instead of globally.
 * Provides cleaner separation and better performance than singleton approach.
 */

import { World } from 'hytopia';
import { EventBus } from '../EventBus';
import type { PlotEvents, PlayerEvents } from '../EventBus';

export interface PlotInfo {
  plotIndex: number;
  plotId: string;
  ownerId: string | null;
  obby: any | null;
  assignedAt: number | null;
  boundaries: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

export interface PlotSystemConfig {
  maxPlots: number;
  plotSize: { width: number; length: number; height: number };
  groundLevel: number;
  undergroundDepth: number;
}

export class PlotSystem {
  private plots: Map<number, PlotInfo> = new Map();
  private playerPlots: Map<string, number> = new Map(); // playerId -> plotIndex
  private config: PlotSystemConfig;

  constructor(
    private world: World,
    private eventBus: EventBus,
    config: Partial<PlotSystemConfig> = {}
  ) {
    this.config = {
      maxPlots: 8,
      plotSize: { width: 30, length: 30, height: 100 },
      groundLevel: 1,
      undergroundDepth: 0,
      ...config
    };

    this.initializePlots();
    this.setupEventHandlers();
    
    console.log(`[PlotSystem:${world.name}] Initialized with ${this.config.maxPlots} plots`);
  }

  private initializePlots(): void {
    for (let i = 0; i < this.config.maxPlots; i++) {
      const plotInfo: PlotInfo = {
        plotIndex: i,
        plotId: `plot_${i}`,
        ownerId: null,
        obby: null,
        assignedAt: null,
        boundaries: this.calculatePlotBoundaries(i)
      };
      
      this.plots.set(i, plotInfo);
    }
  }

  private calculatePlotBoundaries(plotIndex: number): PlotInfo['boundaries'] {
    // Use existing getPlotCoordinates logic but return structured data
    const { getPlotCoordinates } = require('../generateObbyHubMap');
    const coords = getPlotCoordinates(plotIndex);
    
    return {
      minX: coords.xStart + 1, // Add 1 block buffer
      maxX: coords.xEnd - 1,   // Remove 1 block buffer
      minY: this.config.groundLevel,
      maxY: this.config.groundLevel + this.config.plotSize.height,
      minZ: coords.zStart + 1,
      maxZ: coords.zEnd - 1
    };
  }

  private setupEventHandlers(): void {
    // Listen for player events to manage plot assignments
    this.eventBus.on<PlayerEvents['player.joined']>('player.joined', async (payload) => {
      console.log(`[PlotSystem:${this.world.name}] Player ${payload.playerId} joined`);
    });

    this.eventBus.on<PlayerEvents['player.left']>('player.left', async (payload) => {
      console.log(`[PlotSystem:${this.world.name}] Player ${payload.playerId} left`);
      this.releasePlot(payload.playerId);
    });
  }

  /**
   * Assign a plot to a player
   */
  assignPlot(playerId: string, preferredPlotIndex?: number): PlotInfo | null {
    // Check if player already has a plot
    const existingPlotIndex = this.playerPlots.get(playerId);
    if (existingPlotIndex !== undefined) {
      const existingPlot = this.plots.get(existingPlotIndex);
      if (existingPlot) {
        console.log(`[PlotSystem:${this.world.name}] Player ${playerId} already has plot ${existingPlotIndex}`);
        return existingPlot;
      }
    }

    // Try preferred plot first
    if (preferredPlotIndex !== undefined) {
      const preferredPlot = this.plots.get(preferredPlotIndex);
      if (preferredPlot && !preferredPlot.ownerId) {
        return this.assignPlotToPlayer(preferredPlot, playerId);
      }
    }

    // Find any available plot
    for (const [plotIndex, plot] of this.plots) {
      if (!plot.ownerId) {
        return this.assignPlotToPlayer(plot, playerId);
      }
    }

    console.warn(`[PlotSystem:${this.world.name}] No available plots for player ${playerId}`);
    return null;
  }

  private assignPlotToPlayer(plot: PlotInfo, playerId: string): PlotInfo {
    plot.ownerId = playerId;
    plot.assignedAt = Date.now();
    
    this.playerPlots.set(playerId, plot.plotIndex);
    
    // Emit event
    this.eventBus.emitSync('plot.assigned', {
      playerId,
      plotIndex: plot.plotIndex,
      worldId: this.world.name
    });
    
    console.log(`[PlotSystem:${this.world.name}] Assigned plot ${plot.plotIndex} to player ${playerId}`);
    return plot;
  }

  /**
   * Release a plot from a player
   */
  releasePlot(playerId: string): boolean {
    const plotIndex = this.playerPlots.get(playerId);
    if (plotIndex === undefined) {
      return false;
    }

    const plot = this.plots.get(plotIndex);
    if (!plot || plot.ownerId !== playerId) {
      return false;
    }

    plot.ownerId = null;
    plot.obby = null;
    plot.assignedAt = null;
    
    this.playerPlots.delete(playerId);
    
    // Emit event
    this.eventBus.emitSync('plot.released', {
      playerId,
      plotIndex: plot.plotIndex,
      worldId: this.world.name
    });
    
    console.log(`[PlotSystem:${this.world.name}] Released plot ${plotIndex} from player ${playerId}`);
    return true;
  }

  /**
   * Get plot information for a player
   */
  getPlayerPlot(playerId: string): PlotInfo | null {
    const plotIndex = this.playerPlots.get(playerId);
    if (plotIndex === undefined) {
      return null;
    }
    
    return this.plots.get(plotIndex) || null;
  }

  /**
   * Get plot by index
   */
  getPlot(plotIndex: number): PlotInfo | null {
    return this.plots.get(plotIndex) || null;
  }

  /**
   * Get plot by ID
   */
  getPlotById(plotId: string): PlotInfo | null {
    for (const plot of this.plots.values()) {
      if (plot.plotId === plotId) {
        return plot;
      }
    }
    return null;
  }

  /**
   * Get all plots
   */
  getAllPlots(): PlotInfo[] {
    return Array.from(this.plots.values());
  }

  /**
   * Get available plots
   */
  getAvailablePlots(): PlotInfo[] {
    return Array.from(this.plots.values()).filter(plot => !plot.ownerId);
  }

  /**
   * Get occupied plots
   */
  getOccupiedPlots(): PlotInfo[] {
    return Array.from(this.plots.values()).filter(plot => plot.ownerId);
  }

  /**
   * Check if a position is within plot boundaries
   */
  isPositionInPlot(plotId: string, position: { x: number; y: number; z: number }): boolean {
    const plot = this.getPlotById(plotId);
    if (!plot) return false;

    const { boundaries } = plot;
    return position.x >= boundaries.minX && position.x <= boundaries.maxX &&
           position.y >= boundaries.minY && position.y <= boundaries.maxY &&
           position.z >= boundaries.minZ && position.z <= boundaries.maxZ;
  }

  /**
   * Get plot that contains a position
   */
  getPlotAtPosition(position: { x: number; y: number; z: number }): PlotInfo | null {
    for (const plot of this.plots.values()) {
      if (this.isPositionInPlot(plot.plotId, position)) {
        return plot;
      }
    }
    return null;
  }

  /**
   * Clear all content from a plot
   */
  async clearPlot(plotId: string): Promise<void> {
    const plot = this.getPlotById(plotId);
    if (!plot) return;

    // Emit event to let other systems clean up their data
    await this.eventBus.emit('plot.cleared', {
      plotId,
      worldId: this.world.name
    });

    console.log(`[PlotSystem:${this.world.name}] Cleared plot ${plotId}`);
  }

  /**
   * Get statistics about plot usage
   */
  getStatistics(): {
    total: number;
    occupied: number;
    available: number;
    occupancyRate: number;
  } {
    const total = this.plots.size;
    const occupied = this.getOccupiedPlots().length;
    const available = total - occupied;
    const occupancyRate = total > 0 ? (occupied / total) * 100 : 0;

    return { total, occupied, available, occupancyRate };
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    const stats = this.getStatistics();
    const plotDetails = Array.from(this.plots.values()).map(plot => ({
      plotIndex: plot.plotIndex,
      plotId: plot.plotId,
      ownerId: plot.ownerId,
      assignedAt: plot.assignedAt,
      hasObby: !!plot.obby
    }));

    return {
      worldName: this.world.name,
      config: this.config,
      statistics: stats,
      plots: plotDetails,
      playerAssignments: Object.fromEntries(this.playerPlots)
    };
  }
}