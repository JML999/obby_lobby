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
    
    // Plot assignment priority order: Display numbers 4→3→5→6→7→8→2→1
    private static readonly PLOT_ASSIGNMENT_ORDER: number[] = [
        0, // Display 4
        1, // Display 3
        4, // Display 5
        5, // Display 6
        6, // Display 7
        7, // Display 8
        2, // Display 2
        3  // Display 1
    ];
    
    // Directional block mapping for 180° rotation (same as PlotSaveManager)
    private static readonly DIRECTIONAL_BLOCK_FLIP_MAP: { [key: number]: number } = {
        104: 105, // conveyor-z- → conveyor-z+ (South → North)
        105: 104, // conveyor-z+ → conveyor-z- (North → South)  
        109: 110, // conveyor-x- → conveyor-x+ (West → East)
        110: 109  // conveyor-x+ → conveyor-x- (East → West)
    };

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
     * Transform directional block IDs when loading pool maps from one side to the other
     * This flips directional blocks (conveyor belts) to maintain proper orientation after 180° rotation
     */
    private transformDirectionalBlockId(blockTypeId: number): number {
        const flippedId = PlotManager.DIRECTIONAL_BLOCK_FLIP_MAP[blockTypeId];
        if (flippedId !== undefined) {
            console.log(`[PlotManager] 🔄 Transforming directional block: ${blockTypeId} → ${flippedId}`);
            return flippedId;
        }
        return blockTypeId; // Not a directional block, return unchanged
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
        
        // Find a free plot using the assignment priority order
        let plot: Plot | undefined;
        for (const plotIndex of PlotManager.PLOT_ASSIGNMENT_ORDER) {
            const candidatePlot = mw.plots[plotIndex];
            if (candidatePlot && !candidatePlot.ownerId) {
                plot = candidatePlot;
                console.log(`[PlotManager] Assigning player ${playerId} to plot ${plotIndex} (Display ${this.getClockwiseDisplayNumber(plotIndex)}) following priority order`);
                break;
            }
        }
        
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
        
        // Find a free plot using the assignment priority order
        let plot: Plot | undefined;
        for (const plotIndex of PlotManager.PLOT_ASSIGNMENT_ORDER) {
            const candidatePlot = mw.plots[plotIndex];
            if (candidatePlot && !candidatePlot.ownerId) {
                plot = candidatePlot;
                console.log(`[PlotManager] assignPlayerToPlotInWorld: Found free plot ${plotIndex} (Display ${this.getClockwiseDisplayNumber(plotIndex)}) for player ${playerId} following priority order`);
                break;
            }
        }
        
        if (!plot) {
            throw new Error(`No free plot found in world ${targetWorld.name}`);
        }
        
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

    // Create initial plots for a new world with specific pool map placement
    private async createInitialPlots(world: World): Promise<Plot[]> {
        const plots: Plot[] = [];
        
        // Load specific pool maps for displays 1 and 2
        let pool13: DefaultMapData | null = null;
        let pool14: DefaultMapData | null = null;
        
        try {
            pool13 = await this.defaultMapLoader.loadSpecificPoolMap(13);
            if (pool13) {
                console.log(`[PlotManager] Successfully loaded pool-13 for display 1`);
            }
        } catch (error) {
            console.warn(`[PlotManager] Could not load pool-13:`, error);
        }
        
        try {
            pool14 = await this.defaultMapLoader.loadSpecificPoolMap(14);
            if (pool14) {
                console.log(`[PlotManager] Successfully loaded pool-14 for display 2`);
            }
        } catch (error) {
            console.warn(`[PlotManager] Could not load pool-14:`, error);
        }
        
        // Load remaining pool maps for other slots (excluding 13 and 14)
        const allPoolMaps = await this.defaultMapLoader.loadAllPoolMaps();
        const otherPoolMaps = allPoolMaps.filter(map => {
            // Filter out pool-13 and pool-14 if they exist
            const mapData = map.obby?.plotData;
            if (!mapData) return true;
            
            // Check if this is pool-13 or pool-14 by comparing content
            const isPool13 = pool13 && mapData.creatorName === pool13.obby?.plotData?.creatorName && 
                           mapData.blocks?.length === pool13.obby?.plotData?.blocks?.length;
            const isPool14 = pool14 && mapData.creatorName === pool14.obby?.plotData?.creatorName && 
                           mapData.blocks?.length === pool14.obby?.plotData?.blocks?.length;
            
            return !isPool13 && !isPool14;
        });
        
        // Select 3 random maps from the remaining pool maps for displays 6, 7, 8
        const selectedOtherMaps = this.selectRandomUniquePoolMaps(otherPoolMaps, 3);
        
        // Create all 8 plots with specific assignments
        for (let i = 0; i < 8; i++) {
            const displayNumber = this.getClockwiseDisplayNumber(i);
            
            // Plot assignments based on display number
            if (i === 0 || i === 1 || i === 4) {
                // Display 4, 3, 5 - Empty for new players
                plots.push({ 
                    ownerId: null,
                    obby: null,
                    plotIndex: i
                });
                console.log(`[PlotManager] Plot ${i} (Display ${displayNumber}) left empty for new players`);
            } else if (i === 2 && pool14) {
                // Display 2 - Pool-14
                plots.push({ 
                    ownerId: null,
                    obby: pool14.obby,
                    plotIndex: i
                });
                console.log(`[PlotManager] Plot ${i} (Display ${displayNumber}) filled with pool-14`);
            } else if (i === 3 && pool13) {
                // Display 1 - Pool-13
                plots.push({ 
                    ownerId: null,
                    obby: pool13.obby,
                    plotIndex: i
                });
                console.log(`[PlotManager] Plot ${i} (Display ${displayNumber}) filled with pool-13`);
            } else if (i === 5 || i === 6 || i === 7) {
                // Display 6, 7, 8 - Other pool maps
                const mapIndex = i - 5; // 0, 1, 2 for selectedOtherMaps
                const poolMap = selectedOtherMaps[mapIndex];
                plots.push({ 
                    ownerId: null,
                    obby: poolMap ? poolMap.obby : null,
                    plotIndex: i
                });
                
                if (poolMap) {
                    const creatorName = poolMap.obby?.plotData?.creatorName || 'unknown';
                    console.log(`[PlotManager] Plot ${i} (Display ${displayNumber}) filled with pool map (${creatorName})`);
                } else {
                    console.log(`[PlotManager] Plot ${i} (Display ${displayNumber}) left empty (no pool map available)`);
                }
            } else {
                // Fallback - should not happen with current logic
                plots.push({ 
                    ownerId: null,
                    obby: null,
                    plotIndex: i
                });
                console.log(`[PlotManager] Plot ${i} (Display ${displayNumber}) left empty (fallback)`);
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

            // Apply directional block transformation if needed (same logic as PlotSaveManager)
            const transformedBlockTypeId = needsTransformation 
                ? this.transformDirectionalBlockId(block.blockTypeId)
                : block.blockTypeId;

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

            world.chunkLattice.setBlock(coordinate, transformedBlockTypeId);

            // Track the block placement in BOTH systems to ensure validation works
            const plotSaveManager = (await import('./PlotSaveManager')).PlotSaveManager.getInstance();
            plotSaveManager.trackBlockPlacement(plotId, coordinate, block.blockTypeId, world);
            // Also track as user-placed block so validation can find start/goal blocks
            plotSaveManager.trackUserPlacedBlock(world, coordinate, block.blockTypeId, plot.ownerId || plotData.creatorName, plotId);
        }

        // Spawn obstacles using direct obstacle creation, handling mechanical entities separately
        const obstaclePlacementManager = (await import('./ObstaclePlacementManager')).ObstaclePlacementManager.getInstance();
        obstaclePlacementManager.initializeWorld(world);
        
        // Separate mechanical entities from regular obstacles
        const mechanicalEntities: any[] = [];
        const regularObstacles: any[] = [];
        
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
            
            // Check if this is a mechanical entity (same logic as PlotSaveManager)
            const mechanicalTypes = ['mechanical', 'static', 'elevator', 'carousel', 'side-to-side', 'front-to-back'];
            if (mechanicalTypes.includes(obstacle.type) && obstacle.size === 'custom' && obstacle.config) {
                // Store mechanical entity data for later loading
                mechanicalEntities.push({
                    id: obstacle.id || `${obstacle.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    position: worldPos,
                    type: obstacle.type,
                    size: 'custom',
                    config: obstacle.config,
                    cost: obstacle.config.cost || 2
                });
                console.log(`[PlotManager] Prepared mechanical entity ${obstacle.config.entityType} for loading at world pos [${worldPos.x}, ${worldPos.y}, ${worldPos.z}]`);
            } else {
                // Regular obstacle
                regularObstacles.push({ obstacle, worldPos });
            }
        }
        
        // Load regular obstacles
        for (const { obstacle, worldPos } of regularObstacles) {
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
        
        // Load mechanical entities using MechanicalBlockManager
        if (mechanicalEntities.length > 0) {
            const { MechanicalBlockManager } = await import('./MechanicalBlockManager');
            const mechanicalManager = MechanicalBlockManager.getInstance();
            mechanicalManager.initializeWorld(world); // Initialize with world context
            
            // Calculate direction multiplier for movement transformation when needed
            let directionMultiplier: { x: number, z: number } | undefined;
            if (needsTransformation) {
                // 180° rotation: flip both X and Z movement directions
                directionMultiplier = { x: -1, z: -1 };
                console.log(`[PlotManager] 🔄 Applying mechanical movement transformation: X=${directionMultiplier.x}, Z=${directionMultiplier.z}`);
            }
            
            mechanicalManager.loadMechanicalEntities(plotId, mechanicalEntities, world, directionMultiplier);
            console.log(`[PlotManager] Loaded ${mechanicalEntities.length} mechanical entities for plot ${plotId} from default map with transformation=${!!needsTransformation}`);
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