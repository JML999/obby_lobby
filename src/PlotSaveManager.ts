import { Player, World, type Vector3Like } from 'hytopia';
import { ObstacleCollisionManager } from './ObstacleCollisionManager';
import { ObstaclePlacementManager } from './ObstaclePlacementManager';
import type { ScoreboardEntry } from './ScoreboardManager';
import { CashCalculator } from './CashCalculator';
import { PlayerObbyRegistry } from './PlayerObbyRegistry';

export interface SavedBlock {
  relativePos: Vector3Like;  // Position relative to plot center
  blockTypeId: number;
}

export interface SavedObstacle {
  id: string;
  type: string; // 'bounce_pad', 'rotating_beam', 'seesaw'
  size: string; // 'small', 'medium', 'large', 'standard'
  relativePos: Vector3Like;  // Position relative to plot center
  config?: any; // Additional configuration (rotation speed, etc.)
}

export interface PlotData {
  version: string;  // For future compatibility
  plotSize: { width: number; length: number; height: number };
  plotCenter: Vector3Like;  // Reference point for relative coordinates
  plotSide: 'left' | 'right';  // Which side of the map this plot was built on
  blocks: SavedBlock[];
  obstacles: SavedObstacle[];
  lastModified: number;
  creatorName: string;  // Username of who created this plot
  creatorId: string;    // Player ID of who created this plot
  scoreboard?: ScoreboardEntry[];  // Top 3 completion times for this obby
}

export interface PlayerObbyData {
  plotData: PlotData | null; // Single save per player
  cash: number; // Player's available cash for building
}

export class PlotSaveManager {
  private static instance: PlotSaveManager;
  private world?: World;
  private obstacleCollisionManager: ObstacleCollisionManager;
  private obstaclePlacementManager: ObstaclePlacementManager;
  
  // In-memory cache of obby data per player
  private playerObbyCache = new Map<string, PlayerObbyData>();
  
  // Real-time block tracking per plot - now region-aware with world name
  private plotBlocks = new Map<string, Map<string, SavedBlock>>();
  
  // User block tracking system - Map of worldId -> Set of user block position strings
  private userPlacedBlocksByWorld = new Map<string, Set<string>>();
  
  // Enhanced user block tracking with metadata - Map of worldId -> Map of position -> block metadata
  private userBlockMetadata = new Map<string, Map<string, {
    blockTypeId: number;
    playerId: string;
    timestamp: number;
    plotId?: string;
  }>>();

  public static getInstance(): PlotSaveManager {
    if (!PlotSaveManager.instance) {
      PlotSaveManager.instance = new PlotSaveManager();
    }
    return PlotSaveManager.instance;
  }

  private constructor() {
    this.obstacleCollisionManager = ObstacleCollisionManager.getInstance();
    this.obstaclePlacementManager = ObstaclePlacementManager.getInstance();
  }

  /**
   * Determine which side of the map a plot is on based on plot index
   */
  private getPlotSide(plotIndex: number): 'left' | 'right' {
    // plotIndex: 0-3 = left side, 4-7 = right side
    return plotIndex < 4 ? 'left' : 'right';
  }

  /**
   * Extract plot index from plotId (e.g., "plot_4" -> 4)
   */
  private getPlotIndexFromId(plotId: string): number {
    const plotIndexStr = plotId.split('_')[1] ?? '0';
    const plotIndex = parseInt(plotIndexStr);
    return isNaN(plotIndex) ? 0 : plotIndex;
  }

  /**
   * Transform coordinates when loading from one side to the other
   * This performs a 180° rotation around the plot center to maintain proper entrance orientation
   * Note: Input coordinates are relative to the original plot center
   */
  private transformCoordinatesForDifferentSide(relativePos: Vector3Like, plotCenter: Vector3Like, plotId?: string): Vector3Like {
    // The input coordinates are relative to the original plot center
    // We need to flip both X and Z coordinates to rotate 180°
    const rotatedRelativeX = -relativePos.x; // Flip X relative coordinate
    const rotatedRelativeZ = -relativePos.z; // Flip Z relative coordinate
    
    // Get actual plot boundaries if plotId is provided
    if (plotId) {
      const { PlotBoundaryManager } = require('./PlotBoundaryManager');
      const plotBoundaryManager = PlotBoundaryManager.getInstance();
      const boundaries = plotBoundaryManager.getCalculatedBoundaries(plotId);
      
      if (boundaries) {
        // Calculate the absolute world position after transformation
        const worldX = plotCenter.x + rotatedRelativeX;
        const worldZ = plotCenter.z + rotatedRelativeZ;
        
        // Clamp the transformed coordinates to stay within actual plot boundaries
        const clampedX = Math.max(boundaries.minX, Math.min(boundaries.maxX, worldX));
        const clampedY = Math.max(boundaries.minY, Math.min(boundaries.maxY, relativePos.y));
        const clampedZ = Math.max(boundaries.minZ, Math.min(boundaries.maxZ, worldZ));
        
        // Convert back to relative coordinates for the new plot center
        return {
          x: clampedX - plotCenter.x,
          y: clampedY,
          z: clampedZ - plotCenter.z
        };
      }
    }
    
    // Fallback: just flip the relative coordinates
    return {
      x: rotatedRelativeX,
      y: relativePos.y,
      z: rotatedRelativeZ
    };
  }

  /**
   * Handle backward compatibility for existing saved data without plotSide field
   * Attempts to determine plot side from plot center position
   */
  private inferPlotSideFromCenter(plotCenter: Vector3Like): 'left' | 'right' {
    // Left side plots have negative X centers, right side have positive X centers
    // This is based on the map layout where left plots are at negative X coordinates
    return plotCenter.x < 0 ? 'left' : 'right';
  }

  /**
   * Test method to verify plot side transformation logic
   * This can be called for debugging purposes
   */
  public testPlotSideTransformation(): void {
    console.log('[PlotSaveManager] Testing plot side transformation logic...');
    
    // Test plot side detection
    for (let i = 0; i < 8; i++) {
      const side = this.getPlotSide(i);
      console.log(`[PlotSaveManager] Plot ${i} (plot_${i}): ${side} side`);
    }
    
    // Test coordinate transformation
    const testCenter = { x: 0, y: 1, z: 0 };
    const testPos = { x: 5, y: 2, z: 3 };
    const transformed = this.transformCoordinatesForDifferentSide(testPos, testCenter);
    console.log(`[PlotSaveManager] Test transformation: [${testPos.x}, ${testPos.y}, ${testPos.z}] → [${transformed.x}, ${transformed.y}, ${transformed.z}]`);
    
    // Test backward compatibility
    const leftCenter = { x: -50, y: 1, z: 0 };
    const rightCenter = { x: 50, y: 1, z: 0 };
    console.log(`[PlotSaveManager] Backward compatibility test: left center ${leftCenter.x} → ${this.inferPlotSideFromCenter(leftCenter)}`);
    console.log(`[PlotSaveManager] Backward compatibility test: right center ${rightCenter.x} → ${this.inferPlotSideFromCenter(rightCenter)}`);
  }

  public initializeWorld(world: World): void {
    this.world = world;
    
    // Clean up any invalid block IDs in the tracking system
    this.cleanupInvalidBlockIds(world);
    
    console.log(`[PlotSaveManager] Initialized with world ${world.name}`);
  }

  /**
   * Clean up invalid block IDs from the tracking system
   */
  private cleanupInvalidBlockIds(world: World): void {
    const { blockRegistry } = require('./BlockRegistry');
    const metadata = this.getUserBlockMetadata(world);
    const userBlocks = this.getUserPlacedSet(world);
    
    let removedCount = 0;
    const keysToRemove: string[] = [];
    
    for (const [posKey, blockData] of metadata.entries()) {
      const blockExists = blockRegistry.getBlock(blockData.blockTypeId);
      if (!blockExists) {
        console.warn(`[PlotSaveManager] Found invalid block ID ${blockData.blockTypeId} at ${posKey}, removing from tracking...`);
        keysToRemove.push(posKey);
        removedCount++;
      }
    }
    
    // Remove invalid entries
    for (const key of keysToRemove) {
      metadata.delete(key);
      userBlocks.delete(key);
    }
    
    if (removedCount > 0) {
      console.log(`[PlotSaveManager] Cleaned up ${removedCount} invalid block IDs from tracking system in world ${world.name}`);
    }
  }

  /**
   * Get user placed blocks set for a specific world
   */
  private getUserPlacedSet(world: World): Set<string> {
    if (!this.userPlacedBlocksByWorld.has(world.name)) {
      this.userPlacedBlocksByWorld.set(world.name, new Set<string>());
    }
    return this.userPlacedBlocksByWorld.get(world.name)!;
  }

  /**
   * Get user block metadata map for a specific world
   */
  private getUserBlockMetadata(world: World): Map<string, { blockTypeId: number; playerId: string; timestamp: number; plotId?: string }> {
    if (!this.userBlockMetadata.has(world.name)) {
      this.userBlockMetadata.set(world.name, new Map<string, { blockTypeId: number; playerId: string; timestamp: number; plotId?: string }>());
    }
    return this.userBlockMetadata.get(world.name)!;
  }

  /**
   * Track a user-placed block with metadata
   */
  public trackUserPlacedBlock(world: World, position: Vector3Like, blockTypeId: number, playerId: string, plotId?: string): void {
    const key = `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;
    const userBlocks = this.getUserPlacedSet(world);
    const metadata = this.getUserBlockMetadata(world);
    
    if (blockTypeId === 0) {
      // Block removed
      userBlocks.delete(key);
      metadata.delete(key);
      // console.log(`[PlotSaveManager] Removed user block tracking at ${key} in world ${world.name}`);
    } else {
      // Validate block ID before storing
      const { blockRegistry } = require('./BlockRegistry');
      const blockExists = blockRegistry.getBlock(blockTypeId);
      if (!blockExists) {
        console.warn(`[PlotSaveManager] Attempted to track invalid block ID ${blockTypeId} at ${key}, ignoring...`);
        return;
      }
      // Block placed
      userBlocks.add(key);
      metadata.set(key, {
        blockTypeId,
        playerId,
        timestamp: Date.now(),
        plotId
      });
      // console.log(`[PlotSaveManager] Tracking user block ID ${blockTypeId} at ${key} by player ${playerId} in world ${world.name}`);
    }
  }

  /**
   * Get all user-placed blocks in a specific plot
   */
  public getUserPlacedBlocksInPlot(world: World, plotId: string): Array<{ position: Vector3Like; blockTypeId: number; playerId: string; timestamp: number }> {
    const metadata = this.getUserBlockMetadata(world);
    const plotBlocks: Array<{ position: Vector3Like; blockTypeId: number; playerId: string; timestamp: number }> = [];
    
    // Import blockRegistry to validate block IDs
    const { blockRegistry } = require('./BlockRegistry');
    
    for (const [posKey, blockData] of metadata.entries()) {
      if (blockData.plotId === plotId) {
        const coords = posKey.split(',').map(Number);
        if (coords.length === 3 && coords.every(coord => !isNaN(coord))) {
          // Validate that the block ID exists in the registry
          const blockExists = blockRegistry.getBlock(blockData.blockTypeId);
          if (!blockExists) {
            console.warn(`[PlotSaveManager] Invalid block ID ${blockData.blockTypeId} found in metadata for position ${posKey}, skipping...`);
            // Remove the invalid entry from metadata
            metadata.delete(posKey);
            continue;
          }
          
          plotBlocks.push({
            position: { x: coords[0]!, y: coords[1]!, z: coords[2]! },
            blockTypeId: blockData.blockTypeId,
            playerId: blockData.playerId,
            timestamp: blockData.timestamp
          });
        }
      }
    }
    
    return plotBlocks;
  }

  /**
   * Clear user blocks in a specific plot using efficient approach
   */
  public clearUserBlocksInPlot(world: World, plotId: string, plotBoundaries: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }): number {
    
    const userBlocks = this.getUserPlacedSet(world);
    const metadata = this.getUserBlockMetadata(world);
    let totalBlocksCleared = 0;

    // Method 1: Direct clearing of tracked blocks in plot
    const plotBlocks = this.getUserPlacedBlocksInPlot(world, plotId);
    for (const block of plotBlocks) {
      const key = `${block.position.x},${block.position.y},${block.position.z}`;
      world.chunkLattice.setBlock(block.position, 0);
      userBlocks.delete(key);
      metadata.delete(key);
      totalBlocksCleared++;
    }

    // Method 2: Boundary-based clearing for any remaining blocks
    const blocksToRemove: string[] = [];
    for (const [posKey, blockData] of metadata.entries()) {
      const coords = posKey.split(',').map(Number);
      if (coords.length === 3 && coords.every(coord => !isNaN(coord))) {
        const [x, y, z] = coords;
        
        // Check if this position is within plot boundaries
        if (x && y && z && x >= plotBoundaries.minX && x <= plotBoundaries.maxX &&
            y >= plotBoundaries.minY && y <= plotBoundaries.maxY &&
            z >= plotBoundaries.minZ && z <= plotBoundaries.maxZ) {
          
          world.chunkLattice.setBlock({ x: x!, y: y!, z: z! }, 0);
          blocksToRemove.push(posKey);
          totalBlocksCleared++;
        }
      }
    }

    // Remove tracked blocks after clearing
    for (const key of blocksToRemove) {
      userBlocks.delete(key);
      metadata.delete(key);
    }

    return totalBlocksCleared;
  }

  /**
   * Get player's current cash
   */
  public getPlayerCash(player: Player): number {
    const playerData = this.playerObbyCache.get(player.id);
    return playerData?.cash ?? CashCalculator.DEFAULT_STARTING_CASH;
  }

  /**
   * Set player's cash
   */
  public setPlayerCash(player: Player, cash: number): void {
    const playerData = this.playerObbyCache.get(player.id);
    if (playerData) {
      playerData.cash = Math.max(0, cash);
    } else {
      // Initialize if doesn't exist
      this.playerObbyCache.set(player.id, { 
        plotData: null, 
        cash: Math.max(0, cash) 
      });
    }
  }

  /**
   * Clear all user blocks in world (use with caution!)
   */
  public clearAllUserBlocksInWorld(world: World): number {
    
    const userBlocks = this.getUserPlacedSet(world);
    const metadata = this.getUserBlockMetadata(world);
    let totalBlocksCleared = 0;

    // Clear all tracked blocks
    for (const [posKey, blockData] of metadata.entries()) {
      const coords = posKey.split(',').map(Number);
      if (coords.length === 3 && coords.every(coord => !isNaN(coord))) {
        const [x, y, z] = coords;
        world.chunkLattice.setBlock({ x: x!, y: y!, z: z! }, 0);
        totalBlocksCleared++;
      }
    }

    // Clear tracking data
    userBlocks.clear();
    metadata.clear();

    return totalBlocksCleared;
  }

  /**
   * Create a region-aware plot key to prevent cross-region contamination
   */
  private getRegionAwarePlotKey(plotId: string, world?: World): string {
    const targetWorld = world || this.world;
    const worldName = targetWorld?.name || 'unknown';
    return `${worldName}:${plotId}`;
  }

  /**
   * Check if player has a saved obby
   */
  public async hasPlayerObby(player: Player): Promise<boolean> {
    try {
      // Check cache first
      const cached = this.playerObbyCache.get(player.id);
      if (cached) {
        return cached.plotData !== null;
      }

      // Check persisted data
      const persistedData = await player.getPersistedData();
      let playerObbyData: PlayerObbyData;
      
      if (persistedData && persistedData.obby && 
          typeof persistedData.obby === 'object' && 'plotData' in persistedData.obby &&
          persistedData.obby.plotData !== null) { // FIX: Check that plotData is not null
        const rawObbyData = persistedData.obby as any;
        
        // Handle backward compatibility - add missing creator fields if they don't exist
        if (rawObbyData.plotData && !rawObbyData.plotData.creatorName) {
          rawObbyData.plotData.creatorName = player.username || player.id;
          rawObbyData.plotData.creatorId = player.id;
        }
        
        playerObbyData = rawObbyData as PlayerObbyData;
        // Ensure cash is set for backward compatibility
        if (playerObbyData.cash === undefined) {
          playerObbyData.cash = CashCalculator.DEFAULT_STARTING_CASH;
        }
      } else {
        playerObbyData = { plotData: null, cash: CashCalculator.DEFAULT_STARTING_CASH };
      }
      
      // Cache the result
      this.playerObbyCache.set(player.id, playerObbyData);
      
      return playerObbyData.plotData !== null;
    } catch (error) {
      console.error(`[PlotSaveManager] Error checking obby data for player ${player.username}:`, error);
      return false;
    }
  }

  /**
   * Calculate the correct cash balance based on loaded blocks and obstacles
   */
  private calculateCashFromLoadedContent(plotData: PlotData): number {
    let totalCost = 0;
    
    // Calculate cost of all blocks
    for (const block of plotData.blocks) {
      const blockCost = CashCalculator.getBlockCost(block.blockTypeId);
      totalCost += blockCost;
    }
    
    // Calculate cost of all obstacles
    for (const obstacle of plotData.obstacles) {
      // Map obstacle type to entity type for cash calculation
      let entityType = 'obstacle'; // Default fallback
      switch (obstacle.type) {
        case 'bounce_pad':
          entityType = 'bounce-pad';
          break;
        case 'rotating_beam':
          entityType = 'rotating-beam';
          break;
        case 'seesaw':
          entityType = 'obstacle'; // Use generic for now
          break;
        default:
          entityType = 'obstacle';
      }
      const obstacleCost = CashCalculator.getEntityCost(entityType);
      totalCost += obstacleCost;
    }
    
    const remainingCash = Math.max(0, CashCalculator.DEFAULT_STARTING_CASH - totalCost);
    console.log(`[PlotSaveManager] Calculated cash for loaded content: ${plotData.blocks.length} blocks, ${plotData.obstacles.length} obstacles, total cost: ${totalCost}, remaining cash: ${remainingCash}`);
    
    return remainingCash;
  }

  /**
   * Load player's obby data onto their assigned plot (basic implementation)
   */
  public async loadPlayerObby(player: Player, plotId: string): Promise<void> {
    if (!this.world) return;

    try {
      // Get player's persisted data
      const persistedData = await player.getPersistedData();
      let playerObbyData: PlayerObbyData;
      
      if (persistedData && persistedData.obby && 
          typeof persistedData.obby === 'object' && persistedData.obby !== null && 'plotData' in persistedData.obby &&
          persistedData.obby.plotData !== null) { // FIX: Check that plotData is not null
        const rawObbyData = persistedData.obby as any;
        
        // Handle backward compatibility - add missing creator fields if they don't exist
        if (rawObbyData.plotData && !rawObbyData.plotData.creatorName) {
          rawObbyData.plotData.creatorName = player.username || player.id;
          rawObbyData.plotData.creatorId = player.id;
        }
        
        playerObbyData = rawObbyData as PlayerObbyData;
        // Ensure cash is set for backward compatibility
        if (playerObbyData.cash === undefined) {
          playerObbyData.cash = CashCalculator.DEFAULT_STARTING_CASH;
        }
      } else {
        playerObbyData = { plotData: null, cash: CashCalculator.DEFAULT_STARTING_CASH };
      }
      
      // Cache the player's obby data
      this.playerObbyCache.set(player.id, playerObbyData);
      
      const plotData = playerObbyData.plotData;
      if (!plotData) {
        console.log(`[PlotSaveManager] No saved obby found for player ${player.username}`);
        return;
      }

      console.log(`[PlotSaveManager] Loading obby for player ${player.username} onto plot ${plotId}`);
      console.log(`[PlotSaveManager] Loading ${plotData.blocks.length} blocks and ${plotData.obstacles.length} obstacles`);
      
      // Calculate the correct cash balance based on loaded content
      const calculatedCash = this.calculateCashFromLoadedContent(plotData);
      this.setPlayerCash(player, calculatedCash);
      
      // Update the cached data with the calculated cash
      playerObbyData.cash = calculatedCash;
      this.playerObbyCache.set(player.id, playerObbyData);
      
      console.log(`[PlotSaveManager] Set player ${player.username} cash to ${calculatedCash} based on loaded content`);
      
      // CLEAR THE PLOT FIRST before loading new content
      console.log(`[PlotSaveManager] Clearing plot ${plotId} before loading player ${player.username}'s obby`);
      await this.clearPlotPhysicalContent(plotId, player.world);

      // Calculate new plot center for loading
      const plotBuildManager = (await import('./PlotBuildManager')).PlotBuildManager.getInstance();
      
      // Extract plot index from plotId (e.g., "plot_3" -> 3)
      const plotIdParts = plotId.split('_');
      if (plotIdParts.length < 2 || !plotIdParts[1]) {
        console.error(`[PlotSaveManager] Invalid plot ID format: ${plotId}`);
        return;
      }
      const plotIndex = parseInt(plotIdParts[1]);
      if (isNaN(plotIndex)) {
        console.error(`[PlotSaveManager] Invalid plot index in ID: ${plotId}`);
        return;
      }
      
      // Initialize plot if not already initialized (this registers the boundaries)
      // Use fallback ID if player.id is undefined (should not happen in practice)
      plotBuildManager.initializePlot(plotIndex, player.id || `temp_${Date.now()}`);
      
      const plotBoundaries = plotBuildManager.getPlotBoundaries(plotId);
      
      if (!plotBoundaries) {
        console.error(`[PlotSaveManager] Could not get plot boundaries for ${plotId} after initialization`);
        return;
      }

      const newPlotCenter = {
        x: (plotBoundaries.minX + plotBoundaries.maxX) / 2,
        y: plotBoundaries.minY,
        z: (plotBoundaries.minZ + plotBoundaries.maxZ) / 2
      };

      console.log(`[PlotSaveManager] Loading with plot center:`, newPlotCenter);

      // Check if plot side transformation is needed
      const currentPlotSide = this.getPlotSide(plotIndex);
      const savedPlotSide = plotData.plotSide || this.inferPlotSideFromCenter(plotData.plotCenter); // Use backward compatibility if missing
      const needsTransformation = savedPlotSide !== currentPlotSide;
      
      if (!plotData.plotSide) {
        console.log(`[PlotSaveManager] 🔄 Using backward compatibility: inferred plot side as ${savedPlotSide} from plot center [${plotData.plotCenter.x}, ${plotData.plotCenter.y}, ${plotData.plotCenter.z}]`);
      }
      
      if (needsTransformation) {
        console.log(`[PlotSaveManager] 🔄 Plot side transformation needed: saved on ${savedPlotSide} side, loading on ${currentPlotSide} side`);
        this.world.chatManager.sendPlayerMessage(
          player,
          `🔄 Adapting your layout from ${savedPlotSide} side to ${currentPlotSide} side...`,
          'FFAA00'
        );
      } else {
        console.log(`[PlotSaveManager] ✅ Plot sides match: ${savedPlotSide} → ${currentPlotSide}`);
      }

      // Load blocks using relative positions  
      for (const savedBlock of plotData.blocks) {
        // Apply transformation if needed
        const transformedRelativePos = needsTransformation 
          ? this.transformCoordinatesForDifferentSide(savedBlock.relativePos, newPlotCenter, plotId)
          : savedBlock.relativePos;
        
        const worldPos = {
          x: newPlotCenter.x + transformedRelativePos.x,
          y: newPlotCenter.y + transformedRelativePos.y,
          z: newPlotCenter.z + transformedRelativePos.z
        };
        
        // Get the player's actual world (same as manual placement)
        const playerWorld = player.world;
        if (!playerWorld) {
          console.warn(`[PlotSaveManager] ⚠️ Player ${player.id} has no world, skipping block ${savedBlock.blockTypeId}`);
          continue;
        }
        
        // Simulate manual block placement - place block directly in world
        const coordinate = {
          x: Math.floor(worldPos.x),
          y: Math.floor(worldPos.y),
          z: Math.floor(worldPos.z)
        };
        
        playerWorld.chunkLattice.setBlock(coordinate, savedBlock.blockTypeId);
        
        // Track the loaded block in BOTH systems - for clearing AND for saving
        this.trackUserPlacedBlock(playerWorld, coordinate, savedBlock.blockTypeId, player.id, plotId);
        this.trackBlockPlacement(plotId, coordinate, savedBlock.blockTypeId, playerWorld);
        
        // Verify the block was placed
        const placedBlockId = playerWorld.chunkLattice.getBlockId(coordinate);
        if (placedBlockId === savedBlock.blockTypeId) {
        } else {
          console.warn(`[PlotSaveManager] ⚠️ Block verification failed - expected: ${savedBlock.blockTypeId}, actual: ${placedBlockId}`);
        }
      }

      // Load obstacles using relative positions
      for (const savedObstacle of plotData.obstacles) {
        // Apply transformation if needed
        const transformedRelativePos = needsTransformation 
          ? this.transformCoordinatesForDifferentSide(savedObstacle.relativePos, newPlotCenter, plotId)
          : savedObstacle.relativePos;
        
        const worldPos = {
          x: newPlotCenter.x + transformedRelativePos.x,
          y: newPlotCenter.y + transformedRelativePos.y,
          z: newPlotCenter.z + transformedRelativePos.z
        };
        const obstacleId = `${savedObstacle.type}_${savedObstacle.size}`;
        const success = this.obstaclePlacementManager.placeObstacle(
          player,
          obstacleId,
          worldPos,
          plotId
        );
        if (!success) {
          console.warn(`[PlotSaveManager] Failed to load obstacle ${savedObstacle.type} (${savedObstacle.size}) at world pos [${worldPos.x}, ${worldPos.y}, ${worldPos.z}]`);
        } else {
          console.log(`[PlotSaveManager] Loaded obstacle ${savedObstacle.type} (${savedObstacle.size}) at world pos [${worldPos.x}, ${worldPos.y}, ${worldPos.z}] (relative [${savedObstacle.relativePos.x}, ${savedObstacle.relativePos.y}, ${savedObstacle.relativePos.z}])`);
        }
      }

      // Load scoreboard data if it exists
      if (plotData.scoreboard && plotData.scoreboard.length > 0) {
        const { ScoreboardManager } = await import('./ScoreboardManager');
        const scoreboardManager = ScoreboardManager.getInstance();
        await scoreboardManager.loadScoreboardFromPlot(plotId, plotData, this.world);
        console.log(`[PlotSaveManager] Loaded ${plotData.scoreboard.length} scoreboard entries for plot ${plotId}`);
      } else {
        console.log(`[PlotSaveManager] No scoreboard data found in plot ${plotId}`);
      }

      this.world.chatManager.sendPlayerMessage(
        player,
        `💾 Loaded your obby: ${plotData.blocks.length} blocks, ${plotData.obstacles.length} obstacles${plotData.scoreboard && plotData.scoreboard.length > 0 ? `, ${plotData.scoreboard.length} scores` : ''}`,
        '00FF00'
      );

    } catch (error) {
      console.error(`[PlotSaveManager] Error loading obby data for player ${player.username}:`, error);
      this.world?.chatManager.sendPlayerMessage(player, '❌ Error loading your obby!', 'FF0000');
    }
  }

  /**
   * Save current plot that player is building on (simplified)
   */
  public async saveCurrentPlot(player: Player): Promise<void> {
    if (!this.world) return;

    try {
      console.log(`[PlotSaveManager] Saving current plot for player ${player.username}`);
      this.world.chatManager.sendPlayerMessage(player, '❌ Plot save system needs plot boundaries - will be fixed!', 'FF0000');
      return;
    } catch (error) {
      console.error(`[PlotSaveManager] Error saving plot data for ${player.username}:`, error);
      this.world?.chatManager.sendPlayerMessage(player, '❌ Error saving plot data!', 'FF0000');
    }
  }

  /**
   * Save blocks within specific plot boundaries
   */
  public async savePlotWithBoundaries(player: Player, plotBoundaries: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }, plotId?: string): Promise<void> {
    if (!this.world) return;

    try {
      console.log(`[PlotSaveManager] Saving plot for player ${player.username} with boundaries`, plotBoundaries);

      // Calculate plot center for relative coordinates
      const plotCenter = {
        x: (plotBoundaries.minX + plotBoundaries.maxX) / 2,
        y: plotBoundaries.minY, // Use ground level as Y reference
        z: (plotBoundaries.minZ + plotBoundaries.maxZ) / 2
      };

      console.log(`[PlotSaveManager] Plot center for relative coordinates:`, plotCenter);

      // Use user-placed blocks instead of tracked blocks to ensure ALL blocks are saved
      const userPlacedBlocks = plotId && player.world ? this.getUserPlacedBlocksInPlot(player.world, plotId) : [];
      const blocks: SavedBlock[] = [];
      
      // Convert user-placed blocks to relative coordinates
      for (const userBlock of userPlacedBlocks) {
        const relativePos = {
          x: userBlock.position.x - plotCenter.x,
          y: userBlock.position.y - plotCenter.y,
          z: userBlock.position.z - plotCenter.z
        };
        blocks.push({
          relativePos,
          blockTypeId: userBlock.blockTypeId
        });
      }

      // Collect obstacles from ObstacleCollisionManager
      const obstacles: SavedObstacle[] = [];
      if (plotId) {
        const plotObstacles = this.obstacleCollisionManager.getPlotObstacles(plotId);
        for (const obstacle of plotObstacles) {
          const relativePos = {
            x: obstacle.position.x - plotCenter.x,
            y: obstacle.position.y - plotCenter.y,
            z: obstacle.position.z - plotCenter.z
          };
          obstacles.push({
            id: obstacle.id,
            type: obstacle.type,
            size: obstacle.size,
            relativePos,
            config: {} // Additional config can be added later
          });
        }
      }

      // Get current scoreboard for this plot
      const { ScoreboardManager } = await import('./ScoreboardManager');
      const scoreboardManager = ScoreboardManager.getInstance();
      const currentScoreboard = scoreboardManager.getScoreboard(plotId || 'unknown', this.world);

      // Determine plot side based on plotId
      const plotSide = plotId ? this.getPlotSide(this.getPlotIndexFromId(plotId)) : 'left';

      // Create the plot data with both blocks and obstacles
      const plotData: PlotData = {
        version: '1.0',
        plotSize: {
          width: plotBoundaries.maxX - plotBoundaries.minX,
          length: plotBoundaries.maxZ - plotBoundaries.minZ,
          height: plotBoundaries.maxY - plotBoundaries.minY
        },
        plotCenter,
        plotSide,
        blocks,
        obstacles,
        lastModified: Date.now(),
        creatorName: player.username || player.id,  // Use username if available, fallback to ID
        creatorId: player.id,
        scoreboard: currentScoreboard // Include current scoreboard (already an array)
      };

      // Update cache
      const currentCash = this.playerObbyCache.get(player.id)?.cash ?? CashCalculator.DEFAULT_STARTING_CASH;
      this.playerObbyCache.set(player.id, { plotData, cash: currentCash });

      // Save to player persistence
      const currentCashForSave = this.playerObbyCache.get(player.id)?.cash ?? CashCalculator.DEFAULT_STARTING_CASH;
      await player.setPersistedData({ obby: { plotData, cash: currentCashForSave } });

      // Also save to global registry for random loading in other worlds
      try {
        await PlayerObbyRegistry.savePlayerObby(player, { plotData, cash: currentCashForSave });
        console.log(`[PlotSaveManager] Updated global obby registry for player ${player.id}`);
      } catch (error) {
        console.error(`[PlotSaveManager] Failed to update global obby registry for player ${player.id}:`, error);
        // Don't fail the whole save operation if global registry update fails
      }

      console.log(`[PlotSaveManager] Saved plot for ${player.username}: ${blocks.length} blocks, ${obstacles.length} obstacles`);
      // Use player's world to ensure message goes to correct region
      const targetWorld = player.world || this.world;
      if (targetWorld) {
        targetWorld.chatManager.sendPlayerMessage(
          player,
          `💾 Plot saved: ${blocks.length} blocks, ${obstacles.length} obstacles!`,
          '00AA00'
        );
      } else {
        console.error(`[PlotSaveManager] No world available to send save success message to player ${player.username}`);
      }

    } catch (error) {
      console.error(`[PlotSaveManager] Error saving plot data for ${player.username}:`, error);
      // Use player's world to ensure error message goes to correct region
      const targetWorld = player.world || this.world;
      if (targetWorld) {
        targetWorld.chatManager.sendPlayerMessage(player, '❌ Error saving plot data!', 'FF0000');
      } else {
        console.error(`[PlotSaveManager] No world available to send save error message to player ${player.username}`);
      }
    }
  }

  /**
   * Clear player's saved obby and physical plot
   */
  public async clearPlayerObby(player: Player, plotId: string): Promise<void> {
    if (!this.world) return;

    try {
      // Clear scoreboard for this plot
      const { ScoreboardManager } = await import('./ScoreboardManager');
      const scoreboardManager = ScoreboardManager.getInstance();
      scoreboardManager.clearPlotScoreboard(plotId, this.world);
      
      // Clear persisted data
      await player.setPersistedData({ obby: { plotData: null } });
      
      // Clear cache
      this.playerObbyCache.set(player.id, { plotData: null, cash: CashCalculator.DEFAULT_STARTING_CASH });
      
      this.world.chatManager.sendPlayerMessage(player, '🧹 Obby data and scoreboard cleared successfully!', '00FF00');
      console.log(`[PlotSaveManager] Cleared obby data and scoreboard for player ${player.username}`);

    } catch (error) {
      console.error(`[PlotSaveManager] Error clearing obby for ${player.username}:`, error);
      this.world?.chatManager.sendPlayerMessage(player, '❌ Error clearing obby!', 'FF0000');
    }
  }

  /**
   * Clear physical plot blocks with boundaries
   */
  public async clearPlotWithBoundaries(player: Player, plotBoundaries: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }, plotId?: string): Promise<void> {
    // Use player's world instead of stored world for region-aware clearing
    const targetWorld = player.world;
    if (!targetWorld) {
      console.error(`[PlotSaveManager] Player ${player.id} has no world for clearing plot`);
      return;
    }

    try {
      // Delete block (ID 106) is now registered in the main block registry
      const DELETE_BLOCK_ID = 106;
      
      let blocksCleared = 0;
      if (plotId) {
        // Get all user-placed blocks in this plot
        const plotBlocks = this.getUserPlacedBlocksInPlot(targetWorld, plotId);
        
        // Validate block IDs before processing to prevent crashes
        const { blockRegistry } = require('./BlockRegistry');
        const validBlocks = plotBlocks.filter(block => {
          const blockExists = blockRegistry.getBlock(block.blockTypeId);
          if (!blockExists) {
            console.warn(`[PlotSaveManager] Skipping invalid block ID ${block.blockTypeId} at position ${block.position.x},${block.position.y},${block.position.z}`);
            return false;
          }
          return true;
        });
        
        // First loop: Set ALL blocks to delete_block
        for (const block of validBlocks) {
          targetWorld.chunkLattice.setBlock(block.position, DELETE_BLOCK_ID);
        }
        
        // Wait 1 second before clearing to air
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Second loop: Set ALL blocks to air
        for (const block of validBlocks) {
          targetWorld.chunkLattice.setBlock(block.position, 0);
        }
        
        // Clear tracking data (for all blocks, including invalid ones)
        const userBlocks = this.getUserPlacedSet(targetWorld);
        const metadata = this.getUserBlockMetadata(targetWorld);
        for (const block of plotBlocks) {
          const key = `${block.position.x},${block.position.y},${block.position.z}`;
          userBlocks.delete(key);
          metadata.delete(key);
        }
        
        blocksCleared = validBlocks.length;
      } else {
        console.log(`[PlotSaveManager] No plotId provided, skipping user block clearing`);
      }
      
      // Clear obstacles using obstacle collision manager
      if (plotId) {
        const plotObstacles = this.obstacleCollisionManager.getPlotObstacles(plotId);
        
        // Despawn the actual obstacle entities
        for (const obstacle of plotObstacles) {
          const obstacles = targetWorld.entityManager.getEntitiesByTag('obstacle');
          for (const entity of obstacles) {
            const entityPos = entity.position;
            const obstaclePos = obstacle.position;
            const distance = Math.sqrt(
              Math.pow(entityPos.x - obstaclePos.x, 2) +
              Math.pow(entityPos.y - obstaclePos.y, 2) +
              Math.pow(entityPos.z - obstaclePos.z, 2)
            );
            
            if (distance <= 2) { // Close enough to be the same obstacle
              entity.despawn();
              break;
            }
          }
        }
        
        // Clear from collision manager tracking
        this.obstacleCollisionManager.clearPlotObstacles(plotId);
        
        // Clear tracked blocks for this plot - NOW WITH PLAYER'S WORLD FOR REGION AWARENESS
        this.clearTrackedBlocks(plotId, targetWorld);
      }

      targetWorld.chatManager.sendPlayerMessage(player, `🧹 Plot cleared successfully! (${blocksCleared} blocks removed)`, '00FF00');
      console.log(`[PlotSaveManager] Cleared plot blocks and obstacles for player ${player.username} in world ${targetWorld.name}: ${blocksCleared} blocks, obstacles cleared`);

    } catch (error) {
      console.error(`[PlotSaveManager] Error clearing plot blocks for ${player.username}:`, error);
      targetWorld?.chatManager.sendPlayerMessage(player, '❌ Error clearing plot blocks!', 'FF0000');
    }
  }

  /**
   * Handle player disconnect cleanup
   */
  public async handlePlayerDisconnect(player: Player): Promise<void> {
    // Remove from cache
    this.playerObbyCache.delete(player.id);
    console.log(`[PlotSaveManager] Cleaned up data for disconnected player ${player.id}`);
  }

  /**
   * Clean up tracked blocks for a specific plot (when plot is reset or reassigned)
   */
  public cleanupPlotTracking(plotId: string, world?: World): void {
    this.clearTrackedBlocks(plotId, world);
  }

  /**
   * Track a block placement in real-time
   */
  public trackBlockPlacement(plotId: string, position: Vector3Like, blockTypeId: number, world?: World): void {
    // Always use the provided world, or fallback to this.world
    const regionAwareKey = this.getRegionAwarePlotKey(plotId, world || this.world);
    
    if (!this.plotBlocks.has(regionAwareKey)) {
      this.plotBlocks.set(regionAwareKey, new Map());
    }
    
    const plotBlockMap = this.plotBlocks.get(regionAwareKey)!;
    const posKey = `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`;
    
    if (blockTypeId === 0) {
      // Block removed
      plotBlockMap.delete(posKey);
    } else {
      plotBlockMap.set(posKey, { relativePos: position, blockTypeId });
    }
  }

  /**
   * Get all tracked blocks for a plot in the current region
   */
  public getTrackedBlocks(plotId: string, world?: World): SavedBlock[] {
    // Always use the provided world, or fallback to this.world
    const regionAwareKey = this.getRegionAwarePlotKey(plotId, world || this.world);
    const plotBlockMap = this.plotBlocks.get(regionAwareKey);
    
    if (!plotBlockMap) {
      return [];
    }
    
    const blocks: SavedBlock[] = [];
    for (const [posKey, block] of plotBlockMap.entries()) {
      blocks.push(block);
    }
    
    return blocks;
  }

  /**
   * Clear all tracked blocks for a plot in the current region
   */
  public clearTrackedBlocks(plotId: string, world?: World): void {
    // Always use the provided world, or fallback to this.world
    const regionAwareKey = this.getRegionAwarePlotKey(plotId, world || this.world);
    this.plotBlocks.delete(regionAwareKey);
  }

  /**
   * Get the creator name for a specific plot by checking all players' saved data
   * @param plotIndex The plot index to look up
   * @param world The specific world to search in (for multi-region support)
   */
  public async getPlotCreatorName(plotIndex: number, world?: World): Promise<string | null> {
    const targetWorld = world || this.world;
    if (!targetWorld) {
      console.log(`[PlotSaveManager] No world available for creator lookup`);
      return null;
    }

    const plotId = `plot_${plotIndex}`;
    
    // Check if we have any tracked blocks for this plot (indicates someone has built on it)
    const trackedBlocks = this.getTrackedBlocks(plotId, targetWorld);
    
    if (trackedBlocks.length === 0) {
      console.log(`[PlotSaveManager] No content on ${plotId}, no creator to find`);
      return null; // No content on this plot
    }

    // Check if this is a pool map by looking at the user-placed blocks
    const userPlacedBlocks = this.getUserPlacedBlocksInPlot(targetWorld, plotId);
    const isPoolMap = userPlacedBlocks.some(block => 
      block.playerId && block.playerId.startsWith('pool-')
    );
    
    if (isPoolMap) {
      console.log(`[PlotSaveManager] Plot ${plotId} is a pool map - using local leaderboards only`);
      return null; // Pool maps don't have creators - use local leaderboards only
    }

    // PRIORITY CHECK: First check if this is a default map by looking at PlotManager
    const { PlotManager } = await import('./PlotManager');
    const plotManager = PlotManager.getInstance();
    const managedWorld = plotManager.findManagedWorld(targetWorld);
    if (managedWorld) {
      const plot = managedWorld.plots[plotIndex];
      if (plot?.defaultMapId) {
        console.log(`[PlotSaveManager] Plot ${plotId} is a default map with ID: ${plot.defaultMapId}`);
        return plot.defaultMapId; // Return the default map ID as the creator
      }
    }

    // Strategy: Check persisted data of all connected players in the TARGET world
    // We'll check both cache and persisted data for each connected player
    console.log(`[PlotSaveManager] Checking connected players in world ${targetWorld.name}`);
    const allPlayerEntities = targetWorld.entityManager.getAllPlayerEntities();
    
    for (const playerEntity of allPlayerEntities) {
      try {
        const playerId = playerEntity.player.id;
        
        // First check cache for this specific player
        const cachedData = this.playerObbyCache.get(playerId);
        if (cachedData?.plotData?.creatorName) {
          return cachedData.plotData.creatorName;
        }
        
        // If not in cache, check persisted data
        const persistedData = await playerEntity.player.getPersistedData();
        const playerObbyData = persistedData?.obby as PlayerObbyData;
        
        if (playerObbyData?.plotData?.creatorName) {
          // Cache the result for future use
          this.playerObbyCache.set(playerId, playerObbyData);
          return playerObbyData.plotData.creatorName;
        }
      } catch (error) {
        console.warn(`[PlotSaveManager] Error loading persisted data for player ${playerEntity.player.id}:`, error);
      }
    }

    // If we still don't have a creator, but there's content, maybe it was built before creator tracking
    console.log(`[PlotSaveManager] No explicit creator found for ${plotId} with ${trackedBlocks.length} blocks - content may predate creator tracking`);
    
    return null; // No creator found
  }

  /**
   * Get player's current position - simplified approach
   */
  private getPlayerPosition(player: Player): Vector3Like | null {
    // Since position detection is problematic, use a broad area for plot 3
    // This is a temporary solution - we'll scan the entire plot area
    return { x: -25, y: 5, z: 95 }; // Center of plot 3 area based on logs
  }

  /**
   * Clear physical content of a plot (blocks and obstacles)
   */
  public async clearPlotPhysicalContent(plotId: string, world?: World): Promise<void> {
    const targetWorld = world || this.world;
    if (!targetWorld) {
      console.warn(`[PlotSaveManager] No world available, cannot clear plot ${plotId}`);
      return;
    }

    // Get plot boundaries from PlotBuildManager
    const { PlotBuildManager } = await import('./PlotBuildManager');
    const plotBuildManager = PlotBuildManager.getInstance();
    const plotBoundaries = plotBuildManager.getPlotBoundaries(plotId);
    
    if (!plotBoundaries) {
      console.warn(`[PlotSaveManager] Could not get plot boundaries for ${plotId}, cannot clear physical content.`);
      return;
    }

    // Delete block (ID 106) is now registered in the main block registry
    const DELETE_BLOCK_ID = 106;
    
    // Collect all blocks to clear
    const blocksToClear: Vector3Like[] = [];
    for (let x = plotBoundaries.minX; x <= plotBoundaries.maxX; x++) {
      for (let y = plotBoundaries.minY; y <= plotBoundaries.maxY; y++) {
        for (let z = plotBoundaries.minZ; z <= plotBoundaries.maxZ; z++) {
          const blockTypeId = targetWorld.chunkLattice.getBlockId({ x, y, z });
          if (blockTypeId !== 0) { // Only clear non-air blocks
            blocksToClear.push({ x, y, z });
          }
        }
      }
    }

    // First loop: Set ALL blocks to delete_block (cloud texture)
    for (const blockPos of blocksToClear) {
      targetWorld.chunkLattice.setBlock(blockPos, DELETE_BLOCK_ID);
    }

    // Wait 1 second before clearing to air
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Second loop: Set ALL blocks to air
    for (const blockPos of blocksToClear) {
      targetWorld.chunkLattice.setBlock(blockPos, 0);
    }
    
    // CRITICAL: Clear ALL tracking metadata for this plot to prevent ghost blocks
    this.clearTrackedBlocks(plotId, targetWorld);
    
    // Also clear user-placed block metadata for this plot
    const userBlocks = this.getUserPlacedSet(targetWorld);
    const metadata = this.getUserBlockMetadata(targetWorld);
    const metadataToRemove: string[] = [];
    
    for (const [posKey, blockData] of metadata.entries()) {
        if (blockData.plotId === plotId) {
            metadataToRemove.push(posKey);
        }
    }
    
    for (const key of metadataToRemove) {
        userBlocks.delete(key);
        metadata.delete(key);
    }
    
    // Clear obstacles using obstacle collision manager
    const plotObstacles = this.obstacleCollisionManager.getPlotObstacles(plotId);
    
    // Despawn the actual obstacle entities
    for (const obstacle of plotObstacles) {
      const obstacles = targetWorld.entityManager.getEntitiesByTag('obstacle');
      for (const entity of obstacles) {
        const entityPos = entity.position;
        const obstaclePos = obstacle.position;
        const distance = Math.sqrt(
          Math.pow(entityPos.x - obstaclePos.x, 2) +
          Math.pow(entityPos.y - obstaclePos.y, 2) +
          Math.pow(entityPos.z - obstaclePos.z, 2)
        );
        
        if (distance <= 2) { // Close enough to be the same obstacle
          entity.despawn();
          break;
        }
      }
    }
    
    // Clear from collision manager tracking
    this.obstacleCollisionManager.clearPlotObstacles(plotId);
    
    // Clear tracked blocks for this plot using target world
    this.clearTrackedBlocks(plotId, targetWorld);

    console.log(`[PlotSaveManager] Physical content cleared for plot ${plotId} in world ${targetWorld.name}`);
  }
} 