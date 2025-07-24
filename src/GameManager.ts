import { Player, PlayerManager, World } from 'hytopia';
import GameRegion from './GameRegion';
import ObbyRegion from './ObbyRegion';
import { PlotManager } from './PlotManager';

export default class GameManager {
  public static readonly instance = new GameManager();

  private regions: Map<string, GameRegion> = new Map();
  private defaultRegion: GameRegion | null = null;
  private plotManager: PlotManager;
  private regionCounter: number = 1;

  private constructor() {
    this.plotManager = PlotManager.getInstance();
    
    // Set up the world selection handler - this is the key Frontiers pattern
    PlayerManager.instance.worldSelectionHandler = this._selectWorldForPlayer;
  }

  // Helper method to convert plot index to clockwise display number (same as PlotManager)
  private getClockwiseDisplayNumber(plotIndex: number): number {
    const clockwiseMap: { [key: number]: number } = {
      0: 4, // Left top → 4
      1: 3, // Left middle-top → 3
      2: 2, // Left middle-bottom → 2
      3: 1, // Left bottom → 1
      4: 5, // Right top → 5
      5: 6, // Right middle-top → 6
      6: 7, // Right middle-bottom → 7
      7: 8  // Right bottom → 8
    };
    
    return clockwiseMap[plotIndex] || plotIndex + 1;
  }

  public initialize(): void {
    console.log('[GameManager] Initializing GameManager...');
    
    // Create the default region
    this.createDefaultRegion();
    
    console.log('[GameManager] GameManager initialized successfully');
  }

  private createDefaultRegion(): void {
    console.log('[GameManager] Creating default region...');
    
    const defaultRegion = new ObbyRegion('Obby Region 1');
    this.regions.set(defaultRegion.id, defaultRegion);
    this.defaultRegion = defaultRegion;
    
    console.log(`[GameManager] Created default region: ${defaultRegion.id}`);
  }

  private createNewRegion(): GameRegion {
    this.regionCounter++;
    const regionId = `Obby Region ${this.regionCounter}`;
    
    console.log(`[GameManager] Creating new region: ${regionId}`);
    
    const region = new ObbyRegion(regionId);
    this.regions.set(region.id, region);
    
    console.log(`[GameManager] Created new region: ${regionId}, total regions: ${this.regions.size}`);
    
    return region;
  }

  private findRegionWithSpace(): GameRegion | null {
    console.log(`[GameManager] Looking for region with space among ${this.regions.size} regions`);
    
    for (const [regionId, region] of this.regions) {
      console.log(`[GameManager] Checking region ${regionId}: ${region.getPlayerCount()}/5 players, hasSpace: ${region.hasSpace()}`);
      if (region.hasSpace()) {
        console.log(`[GameManager] Found region with space: ${regionId}`);
        return region;
      }
    }
    
    console.log('[GameManager] No region with space found');
    return null;
  }

  // This is the key method - called by PlayerManager.worldSelectionHandler
  private _selectWorldForPlayer = async (player: Player): Promise<World | undefined> => {
    console.log(`[GameManager] 🌍 WorldSelectionHandler called for player ${player.id}`);
    
    // Try to find a region with space
    let targetRegion = this.findRegionWithSpace();
    
    // If no region has space, create a new one
    if (!targetRegion) {
      console.log(`[GameManager] No region with space, creating new region for player ${player.id}`);
      targetRegion = this.createNewRegion();
    }
    
    console.log(`[GameManager] Selected region ${targetRegion.id} for player ${player.id}`);
    
    // Assign player to a plot in this specific region
    console.log(`[GameManager] Assigning player ${player.id} to plot in region ${targetRegion.id}`);
    try {
      const { world, plotIndex } = await this.plotManager.assignPlayerToPlotInWorld(
        player.id, 
        targetRegion.world,
        null // playerObby
      );
      
      const displayNumber = this.getClockwiseDisplayNumber(plotIndex);
      console.log(`[GameManager] ✅ Player ${player.id} assigned to plot ${displayNumber} in region ${targetRegion.id}`);
      console.log(`[GameManager] ✅ Returning world ${world.name} for player ${player.id}`);
      return targetRegion.world;
    } catch (error) {
      console.error(`[GameManager] ❌ Error assigning player ${player.id} to plot:`, error);
      return this.defaultRegion?.world;
    }
  };

  // Public methods for debugging/management
  public getRegions(): Map<string, GameRegion> {
    return this.regions;
  }

  public getRegionByWorld(world: World): GameRegion | undefined {
    for (const region of this.regions.values()) {
      if (region.world === world) {
        return region;
      }
    }
    return undefined;
  }

  public releasePlayerPlot(playerId: string): void {
    console.log(`[GameManager] Releasing plot for player ${playerId}`);
    this.plotManager.releasePlayerPlot(playerId);
  }
}