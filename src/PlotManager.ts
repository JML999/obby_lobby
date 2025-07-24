import { World, Vector3 } from 'hytopia';
import { PlotEntranceEntity } from './entities/PlotEntranceEntity';
import { PlotNumberEntity } from './entities/PlotNumberEntity';
import { getPlotCoordinates } from './generateObbyHubMap';
import { DefaultMapLoader } from './DefaultMapLoader';
import type { DefaultMapData } from './DefaultMapLoader';
import { PlayerObbyRegistry } from './PlayerObbyRegistry';

const PLOTS_PER_WORLD = 8;

interface Plot {
    ownerId: string | null;
    obby: any | null; // Replace 'any' with your obby data type
    plotIndex: number;
    defaultMapId?: string; // ID of default map if this plot has one
}

interface ManagedWorld {
    world: World;
    plots: Plot[];
    plotEntrances: PlotEntranceEntity[]; // Track plot entrances
    plotNumbers: PlotNumberEntity[]; // Track plot numbers
}

export class PlotManager {
    private static instance: PlotManager;
    private managedWorlds: ManagedWorld[] = [];
    private defaultMapLoader: DefaultMapLoader;

    private constructor() {
        this.defaultMapLoader = DefaultMapLoader.getInstance();
    }

    static getInstance(): PlotManager {
        if (!PlotManager.instance) {
            PlotManager.instance = new PlotManager();
        }
        return PlotManager.instance;
    }

    // Call this once at server start with the default world
    async initializeDefaultWorld(world: World) {
        const plots = await this.createInitialPlots(world);
        const plotEntrances = this.spawnPlotEntrances(world, plots);
        
        // Create managed world structure with empty plot numbers initially
        const managedWorld: ManagedWorld = { world, plots, plotEntrances, plotNumbers: [] };
        this.managedWorlds.push(managedWorld);
        
        // Update all plot entrance names to use correct display numbers
        this.updateAllPlotEntranceNames(managedWorld);
        
        // Spawn default maps into the world
        await this.spawnDefaultMaps(world, plots);
        
        // Spawn plot numbers with a delay to ensure world is fully loaded
        setTimeout(() => {
            const plotNumbers = this.spawnPlotNumbers(world, plots);
            managedWorld.plotNumbers = plotNumbers; // Update the plot numbers
        }, 1000); // 1 second delay
     
    }

    // Initialize an existing world with plots, entrances, numbers, and default maps
    async initializeExistingWorld(world: World): Promise<void> {
        
        // Check if this world is already managed
        const existingManagedWorld = this.managedWorlds.find(mw => mw.world === world);
        if (existingManagedWorld) {
            return;
        }
        
        const plots = await this.createInitialPlots(world);
        
        const plotEntrances = this.spawnPlotEntrances(world, plots);
        
        // Create managed world structure with empty plot numbers initially
        const managedWorld: ManagedWorld = { world, plots, plotEntrances, plotNumbers: [] };
        this.managedWorlds.push(managedWorld);
        
        // Update all plot entrance names to use correct display numbers
        this.updateAllPlotEntranceNames(managedWorld);
        
        // Update plot entrance ownership for any plots that already have owners
        for (let i = 0; i < plots.length; i++) {
            const plot = plots[i];
            if (plot && plot.ownerId) {
                this.updatePlotEntranceOwnership(world, i, plot.ownerId);
            }
        }
        
        // Spawn default maps into the world
        await this.spawnDefaultMaps(world, plots);
        
        // Spawn plot numbers with a delay to ensure world is fully loaded
        setTimeout(() => {
            const plotNumbers = this.spawnPlotNumbers(world, plots);
            managedWorld.plotNumbers = plotNumbers; // Update the plot numbers
        }, 1000); // 1 second delay
    }



    // Find a world with at least 1 open plot
    findWorldWithOpenPlots(): ManagedWorld | null {
        for (const mw of this.managedWorlds) {
            const open = mw.plots.filter(p => !p.ownerId && !p.defaultMapId).length;
            if (open > 0) {
                return mw;
            }
        }
        return null;
    }

    // Find managed world by world instance (public method for external access)
    public findManagedWorld(world: World): ManagedWorld | null {
        return this.managedWorlds.find(mw => mw.world === world) || null;
    }

    // Create a new world (mocked for now, you can expand this)
    async createNewWorld(worldFactory: () => World): Promise<ManagedWorld> {
        const world = worldFactory();
        
        const plots = await this.createInitialPlots(world);
        
        const plotEntrances = this.spawnPlotEntrances(world, plots);
        
        // Create managed world structure with empty plot numbers initially
        const mw: ManagedWorld = { world, plots, plotEntrances, plotNumbers: [] };
        this.managedWorlds.push(mw);
        
        // Spawn default maps into the world
        await this.spawnDefaultMaps(world, plots);
        
        // Spawn plot numbers with a delay to ensure world is fully loaded
        setTimeout(() => {
            const plotNumbers = this.spawnPlotNumbers(world, plots);
            mw.plotNumbers = plotNumbers; // Update the plot numbers
        }, 1000); // 1 second delay
        
        return mw;
    }

    // Spawn plot entrances for all plots in a world
    private spawnPlotEntrances(world: World, plots: Plot[]): PlotEntranceEntity[] {
        const plotEntrances: PlotEntranceEntity[] = [];
        
        for (let plotIndex = 0; plotIndex < PLOTS_PER_WORLD; plotIndex++) {
            const { xStart, xEnd, zStart, zEnd } = getPlotCoordinates(plotIndex);
            // Determine entrance position (center of entrance on road-facing side)
            const side = plotIndex < 4 ? -1 : 1;
            // Fix right side positioning - move closer to the wall
            const entranceX = side === -1 ? xEnd + 1 : xStart + 0.25; // Changed from xStart + 0.5 to xStart + 0.25
            const entranceZ = (zStart + zEnd) / 2;
            const entrancePosition = { x: entranceX, y: 2.1, z: entranceZ } as Vector3;
            
            // Calculate clockwise display number (same as plot number entities)
            const displayNumber = this.getClockwiseDisplayNumber(plotIndex);
            const plotName = `Plot ${displayNumber}`;
            
            // Create the entrance entity
            const entrance = new PlotEntranceEntity({
                plotIndex,
                plotName,
                owner: undefined // Will be set later when plots are assigned
            });
            
            try {
                entrance.spawnWithCollider(world, entrancePosition);
                
                // Face towards the plot center
                const plotCenter = { x: (xStart + xEnd) / 2, y: 2.1, z: (zStart + zEnd) / 2 } as Vector3;
                entrance.faceTowards(plotCenter);
                
                plotEntrances.push(entrance);
            } catch (error) {
                console.error(`[PlotManager] spawnPlotEntrances: Error spawning entrance for plot ${plotIndex}:`, error);
            }
        }
        
        return plotEntrances;
    }

    // Spawn plot numbers for all plots in a world
    private spawnPlotNumbers(world: World, plots: Plot[]): PlotNumberEntity[] {
        const plotNumbers: PlotNumberEntity[] = [];

        // Find the managed world to get the plot entrances
        const managedWorld = this.managedWorlds.find(mw => mw.world === world);
        if (!managedWorld || !managedWorld.plotEntrances) {
            console.error(`[PlotManager] spawnPlotNumbers: Could not find managed world or plot entrances for world ${world.name}`);
            return plotNumbers;
        }

        // Spawn numbered blocks using existing entrance positions
        for (let plotIndex = 0; plotIndex < managedWorld.plotEntrances.length; plotIndex++) {
            const entrance = managedWorld.plotEntrances[plotIndex];
            if (!entrance || !entrance.isSpawned) {
                console.warn(`[PlotManager] spawnPlotNumbers: Plot entrance ${plotIndex} not spawned, skipping number block`);
                continue;
            }

            const entrancePos = entrance.position;
            const entrancePlotIndex = entrance.getPlotIndex();
            
            if (!entrancePos) {
                console.warn(`[PlotManager] spawnPlotNumbers: Could not get position for plot entrance ${plotIndex}`);
                continue;
            }

            // Calculate clockwise display number (1-8)
            const displayNumber = this.getClockwiseDisplayNumber(entrancePlotIndex);
            
            // Position two columns of number blocks - one on each side of the entrance doorway
            const side = entrancePlotIndex < 4 ? -1 : 1;  // -1 for left side, 1 for right side
            
            // Move toward the road center from the entrance
            const roadCenterX = side === -1 ? entrancePos.x + 1 : entrancePos.x - 1;
            const baseY = 2.5; // Consistent base Y coordinate for all worlds
            
            // Create two columns: one to the left and one to the right of the entrance
            const leftColumnX = roadCenterX;
            const rightColumnX = roadCenterX;
            const leftColumnZ = entrancePos.z - 2;
            const rightColumnZ = entrancePos.z + 2;
            
            // Spawn left column (3 blocks stacked)
            for (let y = 0; y < 3; y++) {
                const leftBlockPos = { x: leftColumnX, y: baseY + y, z: leftColumnZ };
                const leftNumberEntity = new PlotNumberEntity(displayNumber);
                try {
                    leftNumberEntity.spawn(world, leftBlockPos as Vector3);
                    plotNumbers.push(leftNumberEntity);
                } catch (error) {
                    console.error(`[PlotManager] spawnPlotNumbers: ❌ Failed to spawn left column block ${displayNumber} at Y=${baseY + y} for plot ${entrancePlotIndex}:`, error);
                }
            }
            
            // Spawn right column (3 blocks stacked)
            for (let y = 0; y < 3; y++) {
                const rightBlockPos = { x: rightColumnX, y: baseY + y, z: rightColumnZ };
                const rightNumberEntity = new PlotNumberEntity(displayNumber);
                try {
                    rightNumberEntity.spawn(world, rightBlockPos as Vector3);
                    plotNumbers.push(rightNumberEntity);
                } catch (error) {
                    console.error(`[PlotManager] spawnPlotNumbers: ❌ Failed to spawn right column block ${displayNumber} at Y=${baseY + y} for plot ${entrancePlotIndex}:`, error);
                }
            }
        }

        return plotNumbers;
    }

    /**
     * Convert plotIndex to clockwise display number (Option 2: Clockwise Sequential)
     * Layout: 4→3→2→1→5→6→7→8 (left side top to bottom, then right side top to bottom)
     */
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

    /**
     * Determine which side of the map a plot is on based on plot index
     */
    private getPlotSide(plotIndex: number): 'left' | 'right' {
        // plotIndex: 0-3 = left side, 4-7 = right side
        return plotIndex < 4 ? 'left' : 'right';
    }

    /**
     * Handle backward compatibility for existing saved data without plotSide field
     * Attempts to determine plot side from plot center position
     */
    private inferPlotSideFromCenter(plotCenter: { x: number; y: number; z: number }): 'left' | 'right' {
        // Left side plots have negative X centers, right side have positive X centers
        // This is based on the map layout where left plots are at negative X coordinates
        return plotCenter.x < 0 ? 'left' : 'right';
    }

    /**
     * Transform coordinates when loading from one side to the other
     * This performs a 180° rotation around the plot center to maintain proper entrance orientation
     * Note: Input coordinates are relative to the original plot center
     */
    private transformCoordinatesForDifferentSide(relativePos: { x: number; y: number; z: number }, plotCenter: { x: number; y: number; z: number }, plotId?: string): { x: number; y: number; z: number } {
        // The input coordinates are relative to the original plot center
        // We need to flip both X and Z coordinates to rotate 180°
        const rotatedRelativeX = -relativePos.x; // Flip X relative coordinate
        const rotatedRelativeZ = -relativePos.z; // Flip Z relative coordinate
        
        // Apply asymmetry correction for the 1-block map layout difference
        // Move the map 1 block away from the parking lot (negative Z direction)
        const asymmetryCorrection = 1.0; // Shift by 1 block toward the back (away from parking lot)
        const correctedRelativeZ = rotatedRelativeZ - asymmetryCorrection;
        
        // Get actual plot boundaries if plotId is provided
        if (plotId) {
            const { PlotBoundaryManager } = require('./PlotBoundaryManager');
            const plotBoundaryManager = PlotBoundaryManager.getInstance();
            const boundaries = plotBoundaryManager.getCalculatedBoundaries(plotId);
            
            if (boundaries) {
                // Calculate the absolute world position after transformation and correction
                const worldX = plotCenter.x + rotatedRelativeX;
                const worldZ = plotCenter.z + correctedRelativeZ;
                
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
        
        // Fallback: just flip the relative coordinates with asymmetry correction
        return {
            x: rotatedRelativeX,
            y: relativePos.y,
            z: correctedRelativeZ
        };
    }

    // Update plot entrance ownership
    private updatePlotEntranceOwnership(world: World, plotIndex: number, ownerId: string | null) {
        const mw = this.managedWorlds.find(mw => mw.world === world);
        if (!mw) {
            console.warn(`[PlotManager] updatePlotEntranceOwnership: World not found`);
            return;
        }
        
        const entrance = mw.plotEntrances.find(e => e.getPlotIndex() === plotIndex);
        if (entrance) {
            entrance.setOwner(ownerId);
        } else {
            console.warn(`[PlotManager] updatePlotEntranceOwnership: Plot entrance ${plotIndex} not found`);
            if (plotIndex === 0) {
                console.error(`[PlotManager] (ERROR) Failed to update plot 0 entrance ownership!`);
            }
        }
    }

    // Update all plot entrance names to use correct display numbers
    private updateAllPlotEntranceNames(managedWorld: ManagedWorld): void {
        for (const entrance of managedWorld.plotEntrances) {
            entrance.updatePlotName();
        }
    }

    // Assign a player to a plot on join
    async assignPlayerToPlot(playerId: string, playerObby: any | null, worldFactory: () => World): Promise<{ world: World, plotIndex: number }> {
        let mw = this.findWorldWithOpenPlots();
        if (!mw) {
            mw = await this.createNewWorld(worldFactory);
        }
        
        // Find a free plot (all plots are now assignable)
        const plot = mw.plots.find(p => !p.ownerId);
        if (!plot) {
            throw new Error('No free plot found (should not happen)');
        }
        
        // Assign the plot to the player
        plot!.ownerId = playerId;
        plot!.obby = playerObby;
        
        // Update the plot entrance ownership
        this.updatePlotEntranceOwnership(mw.world, plot!.plotIndex, playerId);
        
        return { world: mw.world, plotIndex: plot!.plotIndex };
    }

    // Assign a player to a plot in a specific world/region
    async assignPlayerToPlotInWorld(playerId: string, targetWorld: World, playerObby: any | null = null): Promise<{ world: World, plotIndex: number }> {
        console.log(`[PlotManager] assignPlayerToPlotInWorld: Assigning player ${playerId} to plot in world ${targetWorld.name}`);
        
        // Find the managed world for this specific world
        let mw = this.managedWorlds.find(mw => mw.world === targetWorld);
        if (!mw) {
            console.log(`[PlotManager] assignPlayerToPlotInWorld: World ${targetWorld.name} not managed yet, initializing it`);
            // Initialize the world if it's not managed yet
            await this.initializeExistingWorld(targetWorld);
            mw = this.managedWorlds.find(mw => mw.world === targetWorld);
            if (!mw) {
                throw new Error(`Failed to initialize world ${targetWorld.name}`);
            }
        }
        
        // Debug: show all plot statuses before assignment
        console.log(`[PlotManager] assignPlayerToPlotInWorld: Current plot statuses in world ${targetWorld.name}:`);
        for (let i = 0; i < mw.plots.length; i++) {
            const plot = mw.plots[i];
            const displayNum = this.getClockwiseDisplayNumber(i);
            const status = plot && plot.ownerId ? `OWNED by ${plot.ownerId}` : 'AVAILABLE';
            console.log(`[PlotManager]   Plot ${i} (Display ${displayNum}): ${status}`);
        }
        
        // Find a free plot (all plots are now assignable)
        const plot = mw.plots.find(p => !p.ownerId);
        if (!plot) {
            throw new Error(`No free plot found in world ${targetWorld.name}`);
        }
        
        console.log(`[PlotManager] assignPlayerToPlotInWorld: Found free plot ${plot.plotIndex} (Display ${this.getClockwiseDisplayNumber(plot.plotIndex)}) for player ${playerId} in world ${targetWorld.name}`);
        
        // Assign the plot to the player
        plot.ownerId = playerId;
        plot.obby = playerObby;
        
        // Update the plot entrance ownership
        this.updatePlotEntranceOwnership(targetWorld, plot.plotIndex, playerId);
        
        console.log(`[PlotManager] assignPlayerToPlotInWorld: Successfully assigned player ${playerId} to plot ${plot.plotIndex} (Display ${this.getClockwiseDisplayNumber(plot.plotIndex)}) in world ${targetWorld.name}`);
        return { world: targetWorld, plotIndex: plot.plotIndex };
    }

    // On player leave, free their plot
    releasePlayerPlot(playerId: string) {
        for (const mw of this.managedWorlds) {
            for (const plot of mw.plots) {
                if (plot.ownerId === playerId) {
                    
                    // Clear block tracking data for this plot before releasing
                    const plotId = `plot_${plot.plotIndex}`;
                    
                    // IMPORTANT: Do NOT clear metadata when player leaves
                    // Metadata should persist until next player claims the plot
                    // This allows other players to continue playing the obby
                    
                    plot.ownerId = null;
                    plot.obby = null;
                    
                    // Update the plot entrance ownership
                    this.updatePlotEntranceOwnership(mw.world, plot.plotIndex, null);
                }
            }
        }
    }

    // Create initial plots for a new world: All 8 plots filled with random pool maps
    private async createInitialPlots(world: World): Promise<Plot[]> {
        const plots: Plot[] = [];
        
        // Load all available pool maps
        const allPoolMaps = await this.defaultMapLoader.loadAllPoolMaps();
        
        // Randomly select 8 unique pool maps from the available pool maps
        const selectedPoolMaps = this.selectRandomUniquePoolMaps(allPoolMaps, 8);
        
        // Create all 8 plots with random pool map content
        for (let i = 0; i < 8; i++) {
            const poolMap = selectedPoolMaps[i];
            plots.push({ 
                ownerId: null, // Keep assignable to players
                obby: poolMap ? poolMap.obby : null, // Load pool content
                plotIndex: i
                // NOTE: NOT setting defaultMapId - all plots remain assignable to players
            });
            
            if (poolMap) {
                const displayNumber = this.getClockwiseDisplayNumber(i);
            } else {
                }
            }
        
        return plots;
    }

    /**
     * Randomly select unique pool maps from available pool maps
     */
    private selectRandomUniquePoolMaps(availablePoolMaps: DefaultMapData[], count: number): DefaultMapData[] {
        if (availablePoolMaps.length <= count) {
            // If we have fewer or equal pool maps than needed, return all of them
            return [...availablePoolMaps];
        }
        
        const selectedMaps: DefaultMapData[] = [];
        const availableCopy = [...availablePoolMaps];
        
        for (let i = 0; i < count && availableCopy.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * availableCopy.length);
            const selectedMap = availableCopy[randomIndex];
            if (selectedMap) {
                selectedMaps.push(selectedMap);
                availableCopy.splice(randomIndex, 1); // Remove to avoid duplicates
            }
        }
        
        return selectedMaps;
    }

    /**
     * Physically spawn pool maps into the world
     */
    private async spawnDefaultMaps(world: World, plots: Plot[]): Promise<void> {
        
        for (const plot of plots) {
            if (plot.obby) {
                await this.spawnDefaultMapIntoWorld(world, plot);
            }
        }
    }

    /**
     * Spawn a single pool map into the world
     */
    private async spawnDefaultMapIntoWorld(world: World, plot: Plot): Promise<void> {
        if (!plot.obby) return;

        const plotId = `plot_${plot.plotIndex}`;
        const plotData = plot.obby.plotData;
        
        if (!plotData) {
            console.warn(`[PlotManager] No plot data found for default map ${plot.ownerId}`);
            return;
        }

        // Get plot boundaries
        const plotBuildManager = (await import('./PlotBuildManager')).PlotBuildManager.getInstance();
        plotBuildManager.initializePlot(plot.plotIndex, `pool-${plot.plotIndex}`);
        
        const plotBoundaries = plotBuildManager.getPlotBoundaries(plotId);
        if (!plotBoundaries) {
            console.error(`[PlotManager] Could not get plot boundaries for ${plotId}`);
            return;
        }

        const plotCenter = {
            x: (plotBoundaries.minX + plotBoundaries.maxX) / 2,
            y: plotBoundaries.minY,
            z: (plotBoundaries.minZ + plotBoundaries.maxZ) / 2
        };

        // Check if plot side transformation is needed (same logic as PlotSaveManager)
        const currentPlotSide = this.getPlotSide(plot.plotIndex);
        const savedPlotSide = plotData.plotSide || this.inferPlotSideFromCenter(plotData.plotCenter);
        const needsTransformation = savedPlotSide !== currentPlotSide;
        
        if (!plotData.plotSide) {
        }
        
        if (needsTransformation) {
        } else {
        }

        // Spawn blocks
        for (const block of plotData.blocks) {
            // Apply transformation if needed (same logic as PlotSaveManager)
            const transformedRelativePos = needsTransformation 
                ? this.transformCoordinatesForDifferentSide(block.relativePos, plotCenter, plotId)
                : block.relativePos;

            const worldPos = {
                x: plotCenter.x + transformedRelativePos.x,
                y: plotCenter.y + transformedRelativePos.y,
                z: plotCenter.z + transformedRelativePos.z
            };

            const coordinate = {
                x: Math.floor(worldPos.x),
                y: Math.floor(worldPos.y),
                z: Math.floor(worldPos.z)
            };

            world.chunkLattice.setBlock(coordinate, block.blockTypeId);

            // Track the block placement in BOTH systems to ensure validation works
            const plotSaveManager = (await import('./PlotSaveManager')).PlotSaveManager.getInstance();
            plotSaveManager.trackBlockPlacement(plotId, coordinate, block.blockTypeId, world);
            // Also track as user-placed block so validation can find start/goal blocks
            plotSaveManager.trackUserPlacedBlock(world, coordinate, block.blockTypeId, plot.ownerId || `pool-${plot.plotIndex}`, plotId);
        }

        // Spawn obstacles using direct obstacle creation
        const obstaclePlacementManager = (await import('./ObstaclePlacementManager')).ObstaclePlacementManager.getInstance();
        obstaclePlacementManager.initializeWorld(world);

        for (const obstacle of plotData.obstacles) {
            // Apply transformation if needed (same logic as PlotSaveManager)
            const transformedRelativePos = needsTransformation 
                ? this.transformCoordinatesForDifferentSide(obstacle.relativePos, plotCenter, plotId)
                : obstacle.relativePos;

            const worldPos = {
                x: plotCenter.x + transformedRelativePos.x,
                y: plotCenter.y + transformedRelativePos.y,
                z: plotCenter.z + transformedRelativePos.z
            };
            
            try {
                // Create obstacle type for the catalog lookup
                const obstacleType = {
                    id: obstacle.type,
                    type: obstacle.type,
                    size: obstacle.size || 'small',
                    name: obstacle.type
                };
                
                // Use the private spawnObstacle method directly
                const success = (obstaclePlacementManager as any).spawnObstacle(obstacleType, worldPos);
                
                if (success) {
                    // Register the obstacle in the collision manager
                    const obstacleCollisionManager = (await import('./ObstacleCollisionManager')).ObstacleCollisionManager.getInstance();
                    obstacleCollisionManager.initializeWorld(world);
                    obstacleCollisionManager.registerObstacle(
                        plotId,
                        obstacle.type,
                        obstacle.type,
                        obstacle.size || 'small',
                        worldPos
                    );
                    
                } else {
                    console.warn(`[PlotManager] ⚠️ Failed to spawn obstacle ${obstacle.type}`);
                }
            } catch (error) {
                console.error(`[PlotManager] Error spawning obstacle ${obstacle.type}:`, error);
            }
        }
    }

    // Get plot data for a world
    getPlotsForWorld(world: World): Plot[] {
        const mw = this.managedWorlds.find(mw => mw.world === world);
        return mw ? mw.plots : [];
    }

    // Get the plot for a player
    getPlayerPlot(playerId: string): { world: World, plotIndex: number, obby: any } | null {
        for (const mw of this.managedWorlds) {
            for (const plot of mw.plots) {
                if (plot.ownerId === playerId) {
                    return { world: mw.world, plotIndex: plot.plotIndex, obby: plot.obby };
                }
            }
        }
        return null;
    }

    // Get plot owner by plot index and world
    getPlotOwner(world: World, plotIndex: number): string | null {
        const mw = this.managedWorlds.find(mw => mw.world === world);
        if (!mw) return null;
        
        const plot = mw.plots.find(p => p.plotIndex === plotIndex);
        return plot?.ownerId || null;
    }
} 