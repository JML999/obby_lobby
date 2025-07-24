import { Vector3 } from "hytopia";
import type { Vector3Like, Player } from "hytopia";

export interface PlotBoundaries {
  plotId: string;
  centerX: number;
  centerZ: number;
  width: number;     // Total width (X-axis)
  length: number;    // Total length (Z-axis)
  groundLevel: number; // Y coordinate of ground level
  maxHeight: number;   // Maximum build height above ground
  undergroundDepth: number; // How deep below ground (0 = no underground)
}

export interface BoundaryViolation {
  type: 'underground' | 'height' | 'horizontal' | 'valid';
  message: string;
  suggestion?: string;
}

export class PlotBoundaryManager {
  private static instance: PlotBoundaryManager;
  private plotBoundaries: Map<string, PlotBoundaries> = new Map();
  
  // Default plot settings (Roblox Obby Creator style)
  private readonly DEFAULT_PLOT_SIZE = {
    width: 50,        // 50 blocks wide
    length: 50,       // 50 blocks long  
    groundLevel: 42,  // Default ground level (matching your hub)
    maxHeight: 100,   // 100 blocks above ground
    undergroundDepth: 0  // NO underground building by default
  };

  public static getInstance(): PlotBoundaryManager {
    if (!PlotBoundaryManager.instance) {
      PlotBoundaryManager.instance = new PlotBoundaryManager();
    }
    return PlotBoundaryManager.instance;
  }

  private constructor() {}

  /**
   * Register a plot with its boundaries
   */
  public registerPlot(plotId: string, centerX: number, centerZ: number, overrides?: Partial<PlotBoundaries>): void {
    const boundaries: PlotBoundaries = {
      plotId,
      centerX,
      centerZ,
      width: overrides?.width ?? this.DEFAULT_PLOT_SIZE.width,
      length: overrides?.length ?? this.DEFAULT_PLOT_SIZE.length,
      groundLevel: overrides?.groundLevel ?? this.DEFAULT_PLOT_SIZE.groundLevel,
      maxHeight: overrides?.maxHeight ?? this.DEFAULT_PLOT_SIZE.maxHeight,
      undergroundDepth: overrides?.undergroundDepth ?? this.DEFAULT_PLOT_SIZE.undergroundDepth
    };

    this.plotBoundaries.set(plotId, boundaries);
    console.log(`[PlotBoundaryManager] Registered plot ${plotId} with boundaries:`, boundaries);
  }

  /**
   * Check if a position is within plot boundaries and return violation details
   */
  public checkBoundaries(plotId: string, position: Vector3Like): BoundaryViolation {
    const boundaries = this.plotBoundaries.get(plotId);
    if (!boundaries) {
      return {
        type: 'valid',
        message: 'Plot not found - allowing placement'
      };
    }

    // Check underground building (like Roblox Obby Creator)
    const minY = boundaries.groundLevel - boundaries.undergroundDepth;
    if (position.y < minY) {
      if (boundaries.undergroundDepth === 0) {
        return {
          type: 'underground',
          message: '❌ Cannot build underground!',
          suggestion: '💡 Try building above ground level'
        };
      } else {
        return {
          type: 'underground',
          message: `❌ Cannot build below Y=${minY}!`,
          suggestion: `💡 Underground limit: ${boundaries.undergroundDepth} blocks below ground`
        };
      }
    }

    // Check height limit
    const maxY = boundaries.groundLevel + boundaries.maxHeight;
    if (position.y > maxY) {
      return {
        type: 'height',
        message: `❌ Cannot build above Y=${maxY}!`,
        suggestion: `💡 Height limit: ${boundaries.maxHeight} blocks above ground`
      };
    }

    // Check horizontal boundaries
    const halfWidth = boundaries.width / 2;
    const halfLength = boundaries.length / 2;
    const minX = boundaries.centerX - halfWidth;
    const maxX = boundaries.centerX + halfWidth;
    const minZ = boundaries.centerZ - halfLength;
    const maxZ = boundaries.centerZ + halfLength;

    if (position.x < minX || position.x > maxX || position.z < minZ || position.z > maxZ) {
      return {
        type: 'horizontal',
        message: '❌ Cannot build outside plot boundaries!',
        suggestion: `💡 Plot size: ${boundaries.width}×${boundaries.length} blocks`
      };
    }

    return {
      type: 'valid',
      message: 'Position is within boundaries'
    };
  }

  /**
   * Check if a position is valid for placement (simple boolean)
   */
  public isValidPlacement(plotId: string, position: Vector3Like): boolean {
    const violation = this.checkBoundaries(plotId, position);
    return violation.type === 'valid';
  }

  /**
   * Get plot boundaries for a specific plot
   */
  public getPlotBoundaries(plotId: string): PlotBoundaries | null {
    return this.plotBoundaries.get(plotId) || null;
  }

  /**
   * Get all registered plots
   */
  public getAllPlots(): PlotBoundaries[] {
    return Array.from(this.plotBoundaries.values());
  }

  /**
   * Remove a plot registration
   */
  public unregisterPlot(plotId: string): boolean {
    return this.plotBoundaries.delete(plotId);
  }

  /**
   * Find which plot a position belongs to (if any)
   */
  public findPlotAtPosition(position: Vector3Like): PlotBoundaries | null {
    for (const boundaries of this.plotBoundaries.values()) {
      if (this.isValidPlacement(boundaries.plotId, position)) {
        return boundaries;
      }
    }
    return null;
  }

  /**
   * Get a detailed summary of plot limits for UI display
   */
  public getPlotLimitsSummary(plotId: string): string | null {
    const boundaries = this.plotBoundaries.get(plotId);
    if (!boundaries) return null;

    const underground = boundaries.undergroundDepth > 0 
      ? `${boundaries.undergroundDepth} blocks below ground` 
      : 'No underground building';

    return `📐 Plot Limits:
🏗️ Size: ${boundaries.width}×${boundaries.length} blocks
⬆️ Height: ${boundaries.maxHeight} blocks above ground  
⬇️ Underground: ${underground}
🌍 Ground Level: Y=${boundaries.groundLevel}`;
  }

  /**
   * Check if player is within any plot boundary
   */
  public isPlayerInPlot(playerPosition: Vector3Like): string | null {
    for (const [plotId, boundaries] of this.plotBoundaries.entries()) {
      if (this.isValidPlacement(plotId, playerPosition)) {
        return plotId;
      }
    }
    return null;
  }

  /**
   * Get calculated boundary coordinates (useful for collision detection)
   */
  public getCalculatedBoundaries(plotId: string): { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number } | null {
    const boundaries = this.plotBoundaries.get(plotId);
    if (!boundaries) return null;

    const halfWidth = boundaries.width / 2;
    const halfLength = boundaries.length / 2;
    
    return {
      minX: boundaries.centerX - halfWidth,
      maxX: boundaries.centerX + halfWidth,
      minZ: boundaries.centerZ - halfLength,
      maxZ: boundaries.centerZ + halfLength,
      minY: boundaries.groundLevel - boundaries.undergroundDepth,
      maxY: boundaries.groundLevel + boundaries.maxHeight
    };
  }

  /**
   * Get boundaries with buffer zone (useful for warnings)
   */
  public isNearBoundary(plotId: string, position: Vector3Like, bufferBlocks: number = 3): boolean {
    const boundaries = this.plotBoundaries.get(plotId);
    if (!boundaries) return false;

    const halfWidth = boundaries.width / 2;
    const halfLength = boundaries.length / 2;
    const minX = boundaries.centerX - halfWidth + bufferBlocks;
    const maxX = boundaries.centerX + halfWidth - bufferBlocks;
    const minZ = boundaries.centerZ - halfLength + bufferBlocks;
    const maxZ = boundaries.centerZ + halfLength - bufferBlocks;
    const minY = boundaries.groundLevel - boundaries.undergroundDepth + bufferBlocks;
    const maxY = boundaries.groundLevel + boundaries.maxHeight - bufferBlocks;

    return position.x < minX || position.x > maxX || 
           position.z < minZ || position.z > maxZ ||
           position.y < minY || position.y > maxY;
  }
} 