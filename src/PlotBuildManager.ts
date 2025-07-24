import { Player, World, Vector3 } from 'hytopia';
import { BlockPlacementManager } from './BlockPlacementManager';
import { getPlotCoordinates } from './generateObbyHubMap';
import { PlotBoundaryManager } from './PlotBoundaryManager';
// import { PlotSaveManager } from './PlotSaveManager';

interface PlotBuildData {
    plotIndex: number;
    ownerId: string;
    spawnBlockPosition?: Vector3;
    buildHistory: Array<{
        action: 'place' | 'remove';
        position: Vector3;
        blockId: number;
        previousBlockId?: number;
        timestamp: number;
    }>;
    currentHistoryIndex: number; // For undo/redo functionality
}

export class PlotBuildManager {
    private static instance: PlotBuildManager;
    private plotData = new Map<number, PlotBuildData>();
    private blockPlacementManager: BlockPlacementManager;
    private plotBoundaryManager: PlotBoundaryManager;
    // private plotSaveManager: PlotSaveManager;
    private playerCurrentPlots = new Map<string, number>(); // Track which plot each player is in
    private playerNearPlots = new Map<string, number>(); // Track which plot entrance each player is near
    private playerActiveBuildPlots: Map<string, number | null> = new Map(); // Track which plot each player is actively building on

    constructor() {
        if (PlotBuildManager.instance) {
            console.warn('[PlotBuildManager] WARNING: New instance created when one already exists!');
            console.warn('[PlotBuildManager] Existing instance:', PlotBuildManager.instance);
            console.warn('[PlotBuildManager] Stack trace for new instance creation:');
            console.warn(new Error().stack);
        } else {
            console.log('[PlotBuildManager] Constructor called, creating singleton instance.');
        }
        PlotBuildManager.instance = this;
        this.blockPlacementManager = BlockPlacementManager.getInstance();
        this.plotBoundaryManager = PlotBoundaryManager.getInstance();
        // this.plotSaveManager = PlotSaveManager.getInstance();
    }

    public static getInstance(): PlotBuildManager {
        if (!PlotBuildManager.instance) {
            console.log('[PlotBuildManager] getInstance: No instance exists, creating new one.');
            PlotBuildManager.instance = new PlotBuildManager();
        } else {
            console.log('[PlotBuildManager] getInstance: Returning existing instance.');
        }
        // Log the current playerActiveBuildPlots map
        if (PlotBuildManager.instance) {
            const entries = Array.from(PlotBuildManager.instance.playerActiveBuildPlots.entries());
            console.log('[PlotBuildManager] getInstance: Current playerActiveBuildPlots:', entries);
        }
        return PlotBuildManager.instance;
    }

    /**
     * Initialize plot build data for a player
     */
    initializePlot(plotIndex: number, ownerId: string): void {
        if (!this.plotData.has(plotIndex)) {
            this.plotData.set(plotIndex, {
                plotIndex,
                ownerId,
                buildHistory: [],
                currentHistoryIndex: -1
            });
            
            // Register plot with boundary manager
            this.registerPlotBoundaries(plotIndex);
            
            console.log(`[PlotBuildManager] Initialized plot ${plotIndex} for owner ${ownerId}`);
        }
    }

    /**
     * Register plot boundaries with the PlotBoundaryManager
     */
    private registerPlotBoundaries(plotIndex: number): void {
        const plotCoords = getPlotCoordinates(plotIndex);
        const centerX = (plotCoords.xStart + plotCoords.xEnd) / 2;
        const centerZ = (plotCoords.zStart + plotCoords.zEnd) / 2;
        const width = plotCoords.xEnd - plotCoords.xStart;
        const length = plotCoords.zEnd - plotCoords.zStart;

        // Register with Roblox Obby Creator-style limitations
        this.plotBoundaryManager.registerPlot(
            `plot_${plotIndex}`,
            centerX,
            centerZ,
            {
                width: width - 2,  // Reduce by 2 blocks (1 block buffer on each side)
                length: length - 2, // Reduce by 2 blocks (1 block buffer on each side)
                groundLevel: 1, // Lowered ground level
                maxHeight: 100,  // 100 blocks above ground (like Roblox OC)
                undergroundDepth: 0 // NO underground building (like Roblox OC default)
            }
        );

        console.log(`[PlotBuildManager] Registered plot ${plotIndex} boundaries: ${width}×${length} at (${centerX}, ${centerZ})`);
    }

    /**
     * Get plot ID string for boundary checking
     */
    public getPlotId(plotIndex: number): string {
        return `plot_${plotIndex}`;
    }

    /**
     * Get the plot index a player is currently in (if any)
     */
    public getPlayerCurrentPlot(playerId: string): number | null {
        return this.playerCurrentPlots.get(playerId) || null;
    }

    /**
     * Set which plot a player is currently in
     */
    public setPlayerCurrentPlot(playerId: string, plotIndex: number | null): void {
        if (plotIndex === null) {
            this.playerCurrentPlots.delete(playerId);
        } else {
            this.playerCurrentPlots.set(playerId, plotIndex);
        }
    }

    /**
     * Set which plot entrance a player is currently near
     */
    public setPlayerNearPlot(playerId: string, plotIndex: number | null): void {
        if (plotIndex === null) {
            this.playerNearPlots.delete(playerId);
            console.log(`[PlotBuildManager] Player ${playerId} is no longer near any plot entrance`);
        } else {
            this.playerNearPlots.set(playerId, plotIndex);
            console.log(`[PlotBuildManager] Player ${playerId} is now near plot ${plotIndex} entrance`);
        }
    }

    /**
     * Get which plot entrance a player is currently near (if any)
     */
    public getPlayerNearPlot(playerId: string): number | null {
        return this.playerNearPlots.get(playerId) || null;
    }

    /**
     * Set which plot a player is actively building on (persists even when moving away from entrance)
     */
    public setPlayerActiveBuildPlot(playerId: string, plotIndex: number | null): void {
        console.log(`[PlotBuildManager] setPlayerActiveBuildPlot called for playerId=${playerId}, plotIndex=${plotIndex}`);
        this.playerActiveBuildPlots.set(playerId, plotIndex);
        console.log('[PlotBuildManager] playerActiveBuildPlots after set:', Array.from(this.playerActiveBuildPlots.entries()));
    }

    /**
     * Get which plot a player is actively building on (if any)
     */
    public getPlayerActiveBuildPlot(playerId: string): number | null {
        const plotIndex = this.playerActiveBuildPlots.get(playerId) ?? null;
        console.log(`[PlotBuildManager] getPlayerActiveBuildPlot for playerId=${playerId}: ${plotIndex}`);
        console.log('[PlotBuildManager] playerActiveBuildPlots at get:', Array.from(this.playerActiveBuildPlots.entries()));
        return plotIndex;
    }

    /**
     * Find which plot a position belongs to
     */
    public findPlotAtPosition(position: Vector3): number | null {
        // Check all possible plots (0-9) to see which one contains this position
        // Don't just check initialized plots, check all plot indices
        for (let plotIndex = 0; plotIndex < 10; plotIndex++) {
            if (this.isWithinPlotBoundaries(position, plotIndex)) {
                return plotIndex;
            }
        }
        return null;
    }

    /**
     * Enter build mode - teleport player to spawn block or create one
     */
    async enterBuildMode(player: Player, plotIndex: number): Promise<boolean> {
        const world = player.world;
        if (!world) return false;

        console.log(`[PlotBuildManager] Entering build mode for player ${player.id} on plot ${plotIndex}`);

        // Initialize plot data if needed
        this.initializePlot(plotIndex, player.id);
        
        // Set player's current plot
        this.setPlayerCurrentPlot(player.id, plotIndex);
        
        const plotData = this.plotData.get(plotIndex)!;

        // Calculate spawn position and teleport player there
        const spawnPosition = this.getPlotSpawnPosition(plotIndex);
        if (!spawnPosition) {
            console.error(`[PlotBuildManager] Failed to calculate spawn position for plot ${plotIndex}`);
            return false;
        }

        // Teleport player to the spawn position (slightly above ground level)
        const teleportPosition = new Vector3(
            spawnPosition.x + 0.5, // Center of block
            spawnPosition.y + 1.1, // Slightly above ground level
            spawnPosition.z + 0.5   // Center of block
        );

        this.teleportPlayerToPosition(player, teleportPosition);

        // Enable fly mode for easier building
        this.enablePlayerFlyMode(player);

        // Send success message with plot limits
        world.chatManager.sendPlayerMessage(player, `🔨 Welcome to your plot! Start building your obby course!`, '00FF00');
        world.chatManager.sendPlayerMessage(player, `💡 Fly mode enabled automatically! Press F to toggle`, 'FFFF00');
        
        // Show plot limits
        const limitsInfo = this.plotBoundaryManager.getPlotLimitsSummary(this.getPlotId(plotIndex));
        if (limitsInfo) {
            world.chatManager.sendPlayerMessage(player, limitsInfo, 'CCCCCC');
        }

        return true;
    }

    /**
     * Activate build mode without teleporting - just set up the plot for building
     */
    async activateBuildMode(player: Player, plotIndex: number): Promise<boolean> {
        const world = player.world;
        if (!world) return false;

        console.log(`[PlotBuildManager] Activating build mode for player ${player.id} on plot ${plotIndex}`);

        // Initialize plot data if needed
        this.initializePlot(plotIndex, player.id);
        
        // Set player's current plot and active build plot
        this.setPlayerCurrentPlot(player.id, plotIndex);
        this.setPlayerActiveBuildPlot(player.id, plotIndex);
        console.log(`[PlotBuildManager] Called setPlayerActiveBuildPlot for player ${player.id} with plotIndex ${plotIndex}`);

        // Load player's saved obby data onto this plot
        // const plotId = this.getPlotId(plotIndex);
        // await this.plotSaveManager.loadPlayerObby(player, plotId);

        // Calculate spawn position and teleport player there
        const spawnPosition = this.getPlotSpawnPosition(plotIndex);
        if (!spawnPosition) {
            console.error(`[PlotBuildManager] Failed to calculate spawn position for plot ${plotIndex}`);
            return false;
        }

        // Teleport player to the spawn position
        this.teleportPlayerToPosition(player, spawnPosition);

        // Enable fly mode for easier building
        this.enablePlayerFlyMode(player);

        // Show plot limits
        world.chatManager.sendPlayerMessage(player, `🔨 Build mode activated! You can now build on your plot.`, '00FF00');
        const limitsInfo = this.plotBoundaryManager.getPlotLimitsSummary(this.getPlotId(plotIndex));
        if (limitsInfo) {
            world.chatManager.sendPlayerMessage(player, limitsInfo, 'CCCCCC');
        }

        console.log(`[PlotBuildManager] Build mode activated for player ${player.id} on plot ${plotIndex}`);
        return true;
    }

    /**
     * Exit build mode - teleport player back to lobby/plot entrance
     */
    exitBuildMode(player: Player, plotIndex: number): boolean {
        const world = player.world;
        if (!world) return false;

        console.log(`[PlotBuildManager] Exiting build mode for player ${player.id} from plot ${plotIndex}`);

        // Disable fly mode before exiting
        this.disablePlayerFlyMode(player);

        // Clear player's current plot and active build plot
        this.setPlayerCurrentPlot(player.id, null);
        this.setPlayerActiveBuildPlot(player.id, null);

        // Get plot coordinates to find the entrance
        const plotCoords = getPlotCoordinates(plotIndex);
        const entrancePosition = {
            x: plotCoords.xStart + (plotCoords.xEnd - plotCoords.xStart) / 2, // Center of plot entrance
            y: 4, // Standard lobby height
            z: plotCoords.zStart - 2 // In front of the plot
        };

        // Get player entity and teleport
        const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
        if (playerEntities.length > 0) {
            const playerEntity = playerEntities[0];
            if (playerEntity) {
                playerEntity.setPosition(entrancePosition);
                console.log(`[PlotBuildManager] Teleported player ${player.id} back to plot entrance at`, entrancePosition);
            }
        }

        world.chatManager.sendPlayerMessage(player, `🏠 Returned to lobby area`, 'FFFF00');
        return true;
    }

    /**
     * Get plot boundaries for a specific plot
     */
    public getPlotBoundaries(plotId: string): any {
        return this.plotBoundaryManager.getCalculatedBoundaries(plotId);
    }

    /**
     * Check if a position is valid for placement within a plot
     */
    public isValidPlacement(plotId: string, position: Vector3): boolean {
        return this.plotBoundaryManager.isValidPlacement(plotId, position);
    }

    /**
     * Check plot boundaries and get violation details
     */
    public checkBoundaries(plotId: string, position: Vector3): any {
        return this.plotBoundaryManager.checkBoundaries(plotId, position);
    }

    /**
     * Calculate the spawn position at the center of a plot (without placing any blocks)
     */
    private getPlotSpawnPosition(plotIndex: number): Vector3 | null {
        const plotCoords = getPlotCoordinates(plotIndex);
        
        const centerX = Math.floor(plotCoords.xStart + (plotCoords.xEnd - plotCoords.xStart) / 2);
        const centerZ = Math.floor(plotCoords.zStart + (plotCoords.zEnd - plotCoords.zStart) / 2);
        const spawnY = 4; // Standard spawn height

        const spawnPosition = new Vector3(centerX, spawnY, centerZ);
        console.log(`[PlotBuildManager] Calculated spawn position for plot ${plotIndex}:`, spawnPosition);
        return spawnPosition;
    }

    /**
     * Teleport player to a specific position
     */
    private teleportPlayerToPosition(player: Player, position: Vector3): void {
        const playerEntities = player.world?.entityManager.getPlayerEntitiesByPlayer(player);
        if (playerEntities && playerEntities.length > 0) {
            const playerEntity = playerEntities[0];
            if (playerEntity) {
                playerEntity.setPosition(position);
                console.log(`[PlotBuildManager] Teleported player ${player.id} to position:`, position);
            }
        }
    }

    /**
     * Enable fly mode for a player
     */
    public enablePlayerFlyMode(player: Player): void {
        const playerEntities = player.world?.entityManager.getPlayerEntitiesByPlayer(player);
        if (playerEntities && playerEntities.length > 0) {
            const playerEntity = playerEntities[0] as any; // Cast to access controller
            if (playerEntity && playerEntity.controller) {
                playerEntity.controller.enableFlyMode(playerEntity);
                console.log(`[PlotBuildManager] Enabled fly mode for player ${player.id}`);
            }
        }
    }

    /**
     * Disable fly mode for a player
     */
    public disablePlayerFlyMode(player: Player): void {
        const playerEntities = player.world?.entityManager.getPlayerEntitiesByPlayer(player);
        if (playerEntities && playerEntities.length > 0) {
            const playerEntity = playerEntities[0] as any; // Cast to access controller
            if (playerEntity && playerEntity.controller) {
                playerEntity.controller.disableFlyMode(playerEntity);
                console.log(`[PlotBuildManager] Disabled fly mode for player ${player.id}`);
            }
        }
    }

    /**
     * Save current plot state
     */
    savePlot(player: Player, plotIndex: number): boolean {
        const world = player.world;
        if (!world) return false;

        const plotData = this.plotData.get(plotIndex);
        if (!plotData || plotData.ownerId !== player.id) {
            world.chatManager.sendPlayerMessage(player, '❌ You can only save plots you own!', 'FF0000');
            return false;
        }

        // TODO: Implement actual save to file/database
        // For now, just confirm the save
        const displayNumber = this.getDisplayNumber(plotIndex);
        world.chatManager.sendPlayerMessage(player, `💾 Plot ${displayNumber} saved successfully!`, '00FF00');
        world.chatManager.sendPlayerMessage(player, `📊 Build history: ${plotData.buildHistory.length} actions`, 'FFFFFF');
        
        console.log(`[PlotBuildManager] Saved plot ${plotIndex} with ${plotData.buildHistory.length} build actions`);
        return true;
    }

    /**
     * Convert plot index to clockwise display number
     */
    private getDisplayNumber(plotIndex: number): number {
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
     * Undo last action
     */
    undo(player: Player, plotIndex: number): boolean {
        const world = player.world;
        if (!world) return false;

        const plotData = this.plotData.get(plotIndex);
        if (!plotData || plotData.ownerId !== player.id) {
            world.chatManager.sendPlayerMessage(player, '❌ You can only undo on plots you own!', 'FF0000');
            return false;
        }

        if (plotData.currentHistoryIndex < 0) {
            world.chatManager.sendPlayerMessage(player, '❌ Nothing to undo!', 'FF0000');
            return false;
        }

        const actionToUndo = plotData.buildHistory[plotData.currentHistoryIndex];
        if (!actionToUndo) return false;

        try {
            if (actionToUndo.action === 'place') {
                // Undo place by removing the block
                world.chunkLattice.setBlock(actionToUndo.position, actionToUndo.previousBlockId || 0);
                console.log(`[PlotBuildManager] Undid block placement at`, actionToUndo.position);
            } else if (actionToUndo.action === 'remove') {
                // Undo remove by placing the block back
                world.chunkLattice.setBlock(actionToUndo.position, actionToUndo.blockId);
                console.log(`[PlotBuildManager] Undid block removal at`, actionToUndo.position);
            }

            plotData.currentHistoryIndex--;
            world.chatManager.sendPlayerMessage(player, `↩️ Undid last action`, 'FFA500');
            return true;
        } catch (error) {
            console.error(`[PlotBuildManager] Undo failed:`, error);
            world.chatManager.sendPlayerMessage(player, '❌ Undo failed!', 'FF0000');
            return false;
        }
    }

    /**
     * Redo last undone action
     */
    redo(player: Player, plotIndex: number): boolean {
        const world = player.world;
        if (!world) return false;

        const plotData = this.plotData.get(plotIndex);
        if (!plotData || plotData.ownerId !== player.id) {
            world.chatManager.sendPlayerMessage(player, '❌ You can only redo on plots you own!', 'FF0000');
            return false;
        }

        if (plotData.currentHistoryIndex >= plotData.buildHistory.length - 1) {
            world.chatManager.sendPlayerMessage(player, '❌ Nothing to redo!', 'FF0000');
            return false;
        }

        const actionToRedo = plotData.buildHistory[plotData.currentHistoryIndex + 1];
        if (!actionToRedo) return false;

        try {
            if (actionToRedo.action === 'place') {
                // Redo place by placing the block
                world.chunkLattice.setBlock(actionToRedo.position, actionToRedo.blockId);
                console.log(`[PlotBuildManager] Redid block placement at`, actionToRedo.position);
            } else if (actionToRedo.action === 'remove') {
                // Redo remove by removing the block
                world.chunkLattice.setBlock(actionToRedo.position, actionToRedo.previousBlockId || 0);
                console.log(`[PlotBuildManager] Redid block removal at`, actionToRedo.position);
            }

            plotData.currentHistoryIndex++;
            world.chatManager.sendPlayerMessage(player, `↪️ Redid action`, '00FF00');
            return true;
        } catch (error) {
            console.error(`[PlotBuildManager] Redo failed:`, error);
            world.chatManager.sendPlayerMessage(player, '❌ Redo failed!', 'FF0000');
            return false;
        }
    }

    /**
     * Add action to build history (called by BlockPlacementManager)
     */
    addToHistory(plotIndex: number, action: {
        action: 'place' | 'remove';
        position: Vector3;
        blockId: number;
        previousBlockId?: number;
        timestamp: number;
    }): void {
        const plotData = this.plotData.get(plotIndex);
        if (!plotData) return;

        // Remove any actions after current index (for when player undid then did new action)
        plotData.buildHistory = plotData.buildHistory.slice(0, plotData.currentHistoryIndex + 1);

        // Add new action
        plotData.buildHistory.push(action);
        plotData.currentHistoryIndex = plotData.buildHistory.length - 1;

        // Limit history size to prevent memory issues
        const MAX_HISTORY = 1000;
        if (plotData.buildHistory.length > MAX_HISTORY) {
            plotData.buildHistory = plotData.buildHistory.slice(-MAX_HISTORY);
            plotData.currentHistoryIndex = plotData.buildHistory.length - 1;
        }

        console.log(`[PlotBuildManager] Added ${action.action} action to plot ${plotIndex} history (${plotData.buildHistory.length} total)`);
    }

    /**
     * Get plot build data
     */
    getPlotData(plotIndex: number): PlotBuildData | undefined {
        return this.plotData.get(plotIndex);
    }

    /**
     * Check if position is within plot boundaries
     */
    isWithinPlotBoundaries(position: Vector3, plotIndex: number): boolean {
        const plotCoords = getPlotCoordinates(plotIndex);
        return position.x >= plotCoords.xStart && position.x <= plotCoords.xEnd &&
               position.z >= plotCoords.zStart && position.z <= plotCoords.zEnd;
    }
} 