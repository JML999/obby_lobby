/**
 * BlockSystem - Phase 2 System Implementation
 * 
 * New block management system with event-driven architecture.
 * Handles block placement, validation, and tracking per world.
 */

import { World, Player } from 'hytopia';
import { EventBus } from '../EventBus';
import type { BlockEvents, PlotEvents } from '../EventBus';
import { PlotSystem } from './PlotSystem';

export interface BlockPlacement {
  position: { x: number; y: number; z: number };
  blockId: number;
  previousBlockId: number;
  playerId: string;
  plotId: string;
  timestamp: number;
}

export interface BlockSystemConfig {
  enableValidation: boolean;
  enableHistory: boolean;
  maxHistorySize: number;
  allowedBlocks: number[];
}

export class BlockSystem {
  private blockHistory: Map<string, BlockPlacement[]> = new Map(); // plotId -> placements
  private userBlocks: Map<string, BlockPlacement> = new Map(); // positionKey -> placement
  private config: BlockSystemConfig;

  constructor(
    private world: World,
    private eventBus: EventBus,
    private plotSystem: PlotSystem,
    config: Partial<BlockSystemConfig> = {}
  ) {
    this.config = {
      enableValidation: true,
      enableHistory: true,
      maxHistorySize: 1000,
      allowedBlocks: [], // Empty = allow all
      ...config
    };

    this.setupEventHandlers();
    console.log(`[BlockSystem:${world.name}] Initialized with validation: ${this.config.enableValidation}`);
  }

  private setupEventHandlers(): void {
    // Clean up when plots are cleared
    this.eventBus.on<PlotEvents['plot.cleared']>('plot.cleared', async (payload) => {
      await this.clearPlotBlocks(payload.plotId);
    });

    // Clean up when players leave
    this.eventBus.on<PlotEvents['plot.released']>('plot.released', async (payload) => {
      // Keep blocks but mark them as historical
      const plotId = `plot_${payload.plotIndex}`;
      console.log(`[BlockSystem:${this.world.name}] Player ${payload.playerId} released plot, preserving blocks`);
    });
  }

  /**
   * Place a block in the world
   */
  async placeBlock(
    player: Player, 
    blockId: number, 
    position: { x: number; y: number; z: number }
  ): Promise<{ success: boolean; reason?: string }> {
    const plotInfo = this.plotSystem.getPlotAtPosition(position);
    
    // Validate placement
    const validation = await this.validatePlacement(player, blockId, position, plotInfo);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    const plotId = plotInfo!.plotId;
    
    // Get previous block
    const previousBlockId = this.world.chunkLattice.getBlockId(position);
    
    // Place the block
    this.world.chunkLattice.setBlock(position, blockId);
    
    // Create placement record
    const placement: BlockPlacement = {
      position: { ...position },
      blockId,
      previousBlockId,
      playerId: player.id,
      plotId,
      timestamp: Date.now()
    };
    
    // Track the placement
    this.trackPlacement(placement);
    
    // Emit event
    await this.eventBus.emit('block.placed', {
      playerId: player.id,
      plotId,
      position,
      blockId
    });
    
    console.log(`[BlockSystem:${this.world.name}] Player ${player.id} placed block ${blockId} at (${position.x}, ${position.y}, ${position.z}) in ${plotId}`);
    
    return { success: true };
  }

  /**
   * Remove a block from the world
   */
  async removeBlock(
    player: Player,
    position: { x: number; y: number; z: number }
  ): Promise<{ success: boolean; reason?: string }> {
    const plotInfo = this.plotSystem.getPlotAtPosition(position);
    
    // Validate removal
    const validation = await this.validateRemoval(player, position, plotInfo);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    const plotId = plotInfo!.plotId;
    
    // Get current block
    const currentBlockId = this.world.chunkLattice.getBlockId(position);
    
    // Remove the block (set to air)
    this.world.chunkLattice.setBlock(position, 0);
    
    // Create placement record for removal
    const placement: BlockPlacement = {
      position: { ...position },
      blockId: 0, // Air
      previousBlockId: currentBlockId,
      playerId: player.id,
      plotId,
      timestamp: Date.now()
    };
    
    // Track the removal
    this.trackPlacement(placement);
    
    // Remove from user blocks tracking
    const positionKey = this.getPositionKey(position);
    this.userBlocks.delete(positionKey);
    
    // Emit event
    await this.eventBus.emit('block.removed', {
      playerId: player.id,
      plotId,
      position,
      previousBlockId: currentBlockId
    });
    
    console.log(`[BlockSystem:${this.world.name}] Player ${player.id} removed block ${currentBlockId} at (${position.x}, ${position.y}, ${position.z}) from ${plotId}`);
    
    return { success: true };
  }

  /**
   * Validate block placement
   */
  private async validatePlacement(
    player: Player,
    blockId: number,
    position: { x: number; y: number; z: number },
    plotInfo: any
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!this.config.enableValidation) {
      return { valid: true };
    }

    // Check if position is in a plot
    if (!plotInfo) {
      return { valid: false, reason: "Cannot place blocks outside of plots" };
    }

    // Check if player owns the plot
    if (plotInfo.ownerId !== player.id) {
      return { valid: false, reason: "You can only build in your own plot" };
    }

    // Check if block type is allowed
    if (this.config.allowedBlocks.length > 0 && !this.config.allowedBlocks.includes(blockId)) {
      return { valid: false, reason: "This block type is not allowed" };
    }

    // Check plot boundaries
    if (!this.plotSystem.isPositionInPlot(plotInfo.plotId, position)) {
      return { valid: false, reason: "Position is outside plot boundaries" };
    }

    return { valid: true };
  }

  /**
   * Validate block removal
   */
  private async validateRemoval(
    player: Player,
    position: { x: number; y: number; z: number },
    plotInfo: any
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!this.config.enableValidation) {
      return { valid: true };
    }

    // Check if position is in a plot
    if (!plotInfo) {
      return { valid: false, reason: "Cannot remove blocks outside of plots" };
    }

    // Check if player owns the plot
    if (plotInfo.ownerId !== player.id) {
      return { valid: false, reason: "You can only remove blocks from your own plot" };
    }

    // Check if there's actually a block to remove
    const currentBlockId = this.world.chunkLattice.getBlockId(position);
    if (currentBlockId === 0) {
      return { valid: false, reason: "No block to remove at this position" };
    }

    return { valid: true };
  }

  /**
   * Track a block placement/removal
   */
  private trackPlacement(placement: BlockPlacement): void {
    const positionKey = this.getPositionKey(placement.position);
    
    // Track in user blocks (current state)
    if (placement.blockId !== 0) {
      this.userBlocks.set(positionKey, placement);
    } else {
      this.userBlocks.delete(positionKey);
    }
    
    // Track in history if enabled
    if (this.config.enableHistory) {
      if (!this.blockHistory.has(placement.plotId)) {
        this.blockHistory.set(placement.plotId, []);
      }
      
      const history = this.blockHistory.get(placement.plotId)!;
      history.push(placement);
      
      // Trim history if too large
      if (history.length > this.config.maxHistorySize) {
        history.splice(0, history.length - this.config.maxHistorySize);
      }
    }
  }

  /**
   * Get position key for tracking
   */
  private getPositionKey(position: { x: number; y: number; z: number }): string {
    return `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;
  }

  /**
   * Get all blocks placed by users in a plot
   */
  getPlotBlocks(plotId: string): BlockPlacement[] {
    return Array.from(this.userBlocks.values()).filter(placement => placement.plotId === plotId);
  }

  /**
   * Get block history for a plot
   */
  getPlotHistory(plotId: string): BlockPlacement[] {
    return this.blockHistory.get(plotId) || [];
  }

  /**
   * Clear all blocks from a plot
   */
  async clearPlotBlocks(plotId: string): Promise<number> {
    const plotBlocks = this.getPlotBlocks(plotId);
    let clearedCount = 0;
    
    for (const placement of plotBlocks) {
      // Set block to air
      this.world.chunkLattice.setBlock(placement.position, 0);
      
      // Remove from tracking
      const positionKey = this.getPositionKey(placement.position);
      this.userBlocks.delete(positionKey);
      
      clearedCount++;
    }
    
    // Clear history
    this.blockHistory.delete(plotId);
    
    console.log(`[BlockSystem:${this.world.name}] Cleared ${clearedCount} blocks from ${plotId}`);
    return clearedCount;
  }

  /**
   * Get blocks placed by a specific player
   */
  getPlayerBlocks(playerId: string): BlockPlacement[] {
    return Array.from(this.userBlocks.values()).filter(placement => placement.playerId === playerId);
  }

  /**
   * Validate plot structure (check for start/goal blocks, etc.)
   */
  async validatePlotStructure(plotId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const plotBlocks = this.getPlotBlocks(plotId);
    
    // Check for required blocks (start, goal, etc.)
    const startBlocks = plotBlocks.filter(p => this.isStartBlock(p.blockId));
    const goalBlocks = plotBlocks.filter(p => this.isGoalBlock(p.blockId));
    
    if (startBlocks.length === 0) {
      errors.push("Plot must have at least one start block");
    }
    
    if (goalBlocks.length === 0) {
      errors.push("Plot must have at least one goal block");
    }
    
    if (startBlocks.length > 1) {
      errors.push("Plot can only have one start block");
    }
    
    if (goalBlocks.length > 1) {
      errors.push("Plot can only have one goal block");
    }
    
    const valid = errors.length === 0;
    
    // Emit validation event
    await this.eventBus.emit('block.validated', {
      plotId,
      isValid: valid,
      errors
    });
    
    return { valid, errors };
  }

  /**
   * Check if block ID is a start block
   */
  private isStartBlock(blockId: number): boolean {
    // Add your start block IDs here
    const startBlockIds = [10]; // Example: wool block
    return startBlockIds.includes(blockId);
  }

  /**
   * Check if block ID is a goal block
   */
  private isGoalBlock(blockId: number): boolean {
    // Add your goal block IDs here
    const goalBlockIds = [11]; // Example: different wool block
    return goalBlockIds.includes(blockId);
  }

  /**
   * Get statistics about block usage
   */
  getStatistics(): {
    totalBlocks: number;
    blocksByPlot: Record<string, number>;
    blocksByPlayer: Record<string, number>;
    blockTypeDistribution: Record<number, number>;
  } {
    const totalBlocks = this.userBlocks.size;
    const blocksByPlot: Record<string, number> = {};
    const blocksByPlayer: Record<string, number> = {};
    const blockTypeDistribution: Record<number, number> = {};
    
    for (const placement of this.userBlocks.values()) {
      // Count by plot
      blocksByPlot[placement.plotId] = (blocksByPlot[placement.plotId] || 0) + 1;
      
      // Count by player
      blocksByPlayer[placement.playerId] = (blocksByPlayer[placement.playerId] || 0) + 1;
      
      // Count by block type
      blockTypeDistribution[placement.blockId] = (blockTypeDistribution[placement.blockId] || 0) + 1;
    }
    
    return {
      totalBlocks,
      blocksByPlot,
      blocksByPlayer,
      blockTypeDistribution
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
      historySize: Array.from(this.blockHistory.values()).reduce((sum, history) => sum + history.length, 0),
      trackedBlocks: this.userBlocks.size
    };
  }
}