import { Player } from 'hytopia';
import { PoolPersistenceManager } from './PoolPersistenceManager';
import { isPoolCreator } from './PoolCreatorMapping';

export interface ScoreboardEntry {
    playerId: string;
    playerName: string;
    completionTime: number; // in milliseconds
    timestamp: number; // when the score was achieved
}

export interface PlotScoreboard {
    plotId: string;
    entries: ScoreboardEntry[];
    lastUpdated: number;
}

export class ScoreboardManager {
    private static instance: ScoreboardManager;
    private plotScoreboards: Map<string, PlotScoreboard> = new Map();
    private readonly MAX_ENTRIES = 3; // Keep top 3 times
    private poolPersistenceManager: PoolPersistenceManager;

    public static getInstance(): ScoreboardManager {
        if (!ScoreboardManager.instance) {
            ScoreboardManager.instance = new ScoreboardManager();
        }
        return ScoreboardManager.instance;
    }

    private constructor() {
        this.poolPersistenceManager = PoolPersistenceManager.getInstance();
    }

    /**
     * Create a region-aware plot key to prevent cross-region contamination
     */
    private getRegionAwarePlotKey(plotId: string, world?: { name?: string }): string {
        const worldName = world?.name || 'unknown';
        return `${worldName}:${plotId}`;
    }

    /**
     * Load all scoreboards from all players' persistence data
     * This should be called when the server starts to restore scoreboards from persistence
     */
    public async loadAllScoreboardsFromPersistence(): Promise<void> {
        console.log('[ScoreboardManager] Loading all scoreboards from persistence...');
        
        try {
            // Initialize pool persistence
            await this.poolPersistenceManager.initialize();
            
            // Load all pool scoreboards
            const pools = await this.poolPersistenceManager.loadAllPools();
            for (const [poolId, poolData] of pools) {
                if (poolData.scoreboard && poolData.scoreboard.length > 0) {
                    const scoreboard: PlotScoreboard = {
                        plotId: poolId,
                        entries: poolData.scoreboard,
                        lastUpdated: poolData.lastModified
                    };
                    this.plotScoreboards.set(poolId, scoreboard);
                    console.log(`[ScoreboardManager] Loaded ${poolData.scoreboard.length} scores for pool ${poolId}`);
                }
            }
            
            console.log('[ScoreboardManager] Pool scoreboards loaded. Player scoreboards will be loaded when plots are accessed');
        } catch (error) {
            console.error('[ScoreboardManager] Error loading scoreboards from persistence:', error);
        }
    }

    /**
     * Load scoreboard from persisted plot data
     */
    public async loadScoreboardFromPlot(plotId: string, plotData: any, world?: { name?: string }): Promise<void> {
        if (plotData.scoreboard && Array.isArray(plotData.scoreboard)) {
            // Use region-aware key to prevent cross-region contamination
            const regionAwareKey = this.getRegionAwarePlotKey(plotId, world);
            console.log(`[ScoreboardManager] Loading ${plotData.scoreboard.length} scores for ${regionAwareKey}`);
            
            const scoreboard: PlotScoreboard = {
                plotId: regionAwareKey, // Store with region-aware key
                entries: plotData.scoreboard,
                lastUpdated: Date.now()
            };
            
            this.plotScoreboards.set(regionAwareKey, scoreboard);
        }
    }

    /**
     * Load scoreboard for a pool plot
     */
    public async loadPoolScoreboard(poolId: string): Promise<void> {
        try {
            const scoreboard = await this.poolPersistenceManager.getPoolScoreboard(poolId);
            if (scoreboard.length > 0) {
                const plotScoreboard: PlotScoreboard = {
                    plotId: poolId,
                    entries: scoreboard,
                    lastUpdated: Date.now()
                };
                this.plotScoreboards.set(poolId, plotScoreboard);
                console.log(`[ScoreboardManager] Loaded ${scoreboard.length} scores for pool ${poolId}`);
            }
        } catch (error) {
            console.error(`[ScoreboardManager] Error loading pool scoreboard for ${poolId}:`, error);
        }
    }

    /**
     * Load pool scoreboard into memory from persistence
     */
    private async loadPoolScoreboardIntoMemory(poolId: string): Promise<void> {
        try {
            await this.poolPersistenceManager.initialize();
            const scoreboard = await this.poolPersistenceManager.getPoolScoreboard(poolId);
            if (scoreboard.length > 0) {
                const plotScoreboard: PlotScoreboard = {
                    plotId: poolId,
                    entries: scoreboard,
                    lastUpdated: Date.now()
                };
                this.plotScoreboards.set(poolId, plotScoreboard);
                console.log(`[ScoreboardManager] Loaded ${scoreboard.length} existing scores into memory for pool ${poolId}`);
            }
        } catch (error) {
            console.error(`[ScoreboardManager] Error loading pool scoreboard into memory for ${poolId}:`, error);
        }
    }


    /**
     * Save scoreboard to plot owner's persistence data or pool persistence
     */
    public async saveScoreboardToPlot(plotId: string, player: Player): Promise<void> {
        try {
            // Get the plot owner's name from the specific world
            const { PlotSaveManager } = await import('./PlotSaveManager');
            const plotSaveManager = PlotSaveManager.getInstance();
            
            // Extract plot index from plotId (e.g., "plot_3" -> 3)
            const plotIndexStr = plotId.split('_')[1] ?? '0';
            const plotIndex = parseInt(plotIndexStr);
            if (isNaN(plotIndex)) {
                console.error(`[ScoreboardManager] Invalid plot index in ${plotId}`);
                return;
            }
            
            // Pass the player's world to search in the correct region
            const creatorName = await plotSaveManager.getPlotCreatorName(plotIndex, player.world);
            if (!creatorName) {
                console.error(`[ScoreboardManager] No creator found for plot ${plotId} in world ${player.world?.name}`);
                return;
            }

            // Determine the correct scoreboard key
            let scoreboardKey: string;
            let scoreboard: PlotScoreboard | undefined;
            
            if (isPoolCreator(creatorName)) {
                // For pool plots, use global creator name as key
                scoreboardKey = creatorName;
                scoreboard = this.plotScoreboards.get(creatorName);
            } else {
                // For regular plots, use region-aware key
                scoreboardKey = this.getRegionAwarePlotKey(plotId, player.world);
                scoreboard = this.plotScoreboards.get(scoreboardKey);
            }
            
            if (!scoreboard?.entries || scoreboard.entries.length === 0) {
                console.log(`[ScoreboardManager] No scoreboard to save for ${scoreboardKey}`);
                return;
            }

            // Handle pool plot persistence using creator-based approach
            if (isPoolCreator(creatorName)) {
                console.log(`[ScoreboardManager] Pool map ${plotId} (creator: ${creatorName}) - saving to pool persistence: ${creatorName}`);
                // Ensure pool persistence is initialized
                await this.poolPersistenceManager.initialize();
                await this.poolPersistenceManager.updatePoolScoreboard(creatorName, scoreboard.entries);
                return;
            }
            
            // Skip persistence for other default maps
            if (creatorName.startsWith('OBBY-') || creatorName === 'default-map') {
                console.log(`[ScoreboardManager] Default map ${plotId} (creator: ${creatorName}) - keeping scoreboard in memory only`);
                return;
            }

            // Find the creator player in the world
            const creatorPlayer = player.world?.entityManager.getAllPlayerEntities()
                .find(entity => String(entity.player.username) === String(creatorName) || String(entity.player.id) === String(creatorName))?.player;
            
            if (!creatorPlayer) {
                console.error(`[ScoreboardManager] Creator ${creatorName} not found in world ${player.world?.name} for plot ${plotId}`);
                return;
            }

            // Get the creator's current persisted data
            const persistedData = await creatorPlayer.getPersistedData();
            const obbyData = persistedData?.obby as any;
            
            if (!obbyData?.plotData) {
                console.error(`[ScoreboardManager] No plot data found in creator's persistence for plot ${plotId}`);
                return;
            }

            // Update the plot data with the new scoreboard
            const updatedPlotData = {
                ...obbyData.plotData,
                scoreboard: scoreboard?.entries,
                lastModified: Date.now()
            };

            // Save the updated data back to the creator's persistence
            await creatorPlayer.setPersistedData({ 
                obby: { 
                    plotData: updatedPlotData 
                } 
            });

            // Update the cache
            const cache = (plotSaveManager as any).playerObbyCache;
            if (cache) {
                cache.set(String(creatorPlayer.id ?? 'unknown'), { plotData: updatedPlotData });
            }

            console.log(`[ScoreboardManager] Saved ${scoreboard.entries?.length || 0} scores to creator ${creatorName} for ${regionAwareKey} in world ${player.world?.name}`);
            
        } catch (error) {
            console.error(`[ScoreboardManager] Error saving scoreboard for ${regionAwareKey}:`, error);
        }
    }

    /**
     * Add a completion time to a plot's scoreboard
     */
    public async addScore(plotId: string, player: Player, completionTime: number, world?: { name?: string }): Promise<ScoreboardResult> {
        const targetWorld = world || player.world;
        
        // Check if this is a pool plot by getting creator name
        const { PlotSaveManager } = await import('./PlotSaveManager');
        const plotSaveManager = PlotSaveManager.getInstance();
        
        // Extract plot index from plotId (e.g., "plot_3" -> 3)
        const plotIndexStr = plotId.split('_')[1] ?? '0';
        const plotIndex = parseInt(plotIndexStr);
        let scoreboardKey: string;
        let isPoolPlot = false;
        
        if (!isNaN(plotIndex)) {
            const creatorName = await plotSaveManager.getPlotCreatorName(plotIndex, targetWorld);
            if (creatorName && isPoolCreator(creatorName)) {
                // For pool plots, use global creator name as key
                scoreboardKey = creatorName;
                isPoolPlot = true;
                console.log(`[ScoreboardManager] Adding score for player ${player.id} on GLOBAL pool ${creatorName}: ${completionTime}ms`);
            } else {
                // For regular plots, use region-aware key
                scoreboardKey = this.getRegionAwarePlotKey(plotId, targetWorld);
                console.log(`[ScoreboardManager] Adding score for player ${player.id} on ${scoreboardKey}: ${completionTime}ms`);
            }
        } else {
            // Fallback to region-aware key
            scoreboardKey = this.getRegionAwarePlotKey(plotId, targetWorld);
            console.log(`[ScoreboardManager] Adding score for player ${player.id} on ${scoreboardKey}: ${completionTime}ms`);
        }
        
        let scoreboard = this.plotScoreboards.get(scoreboardKey);
        if (!scoreboard) {
            scoreboard = {
                plotId: scoreboardKey,
                entries: [],
                lastUpdated: Date.now()
            };
            this.plotScoreboards.set(scoreboardKey, scoreboard);
            
            // For pool plots, try to load existing scores from persistence
            if (isPoolPlot) {
                try {
                    await this.loadPoolScoreboardIntoMemory(scoreboardKey);
                    // Reload the scoreboard after loading from persistence
                    scoreboard = this.plotScoreboards.get(scoreboardKey) || scoreboard;
                } catch (error) {
                    console.error(`[ScoreboardManager] Error loading pool scoreboard for ${scoreboardKey}:`, error);
                }
            }
        }

        // Always add the new entry (do not remove old entries for the same player)
        const newEntry: ScoreboardEntry = {
            playerId: player.id,
            playerName: player.username, // Use player username for display
            completionTime,
            timestamp: Date.now()
        };
        scoreboard.entries.push(newEntry);
        scoreboard.entries.sort((a, b) => a.completionTime - b.completionTime);
        scoreboard.entries = scoreboard.entries.slice(0, this.MAX_ENTRIES);
        scoreboard.lastUpdated = Date.now();

        // Determine player's position and achievements
        const position = scoreboard.entries.findIndex(entry => entry === newEntry) + 1;
        const isNewRecord = position === 1;
        const isTopThree = position > 0 && position <= 3;

        let logMessage = `[ScoreboardManager] Player ${player.id} achieved position ${position} on ${scoreboardKey}`;
        if (isNewRecord) logMessage += ' (NEW RECORD!)';
        console.log(logMessage);

        // Save to persistence when score is added (use original plotId for persistence)
        this.saveScoreboardToPlot(plotId, player).catch(error => {
            console.error(`[ScoreboardManager] Failed to save scoreboard for ${scoreboardKey}:`, error);
        });

        return {
            position,
            isNewRecord,
            isTopThree,
            wasUpdated: true,
            scoreboard: await this.getScoreboard(plotId, targetWorld),
            playerTime: completionTime
        };
    }

    /**
     * Get the current scoreboard for a plot
     */
    public async getScoreboard(plotId: string, world?: { name?: string }): Promise<ScoreboardEntry[]> {
        // Check if this is a pool plot by getting creator name
        const { PlotSaveManager } = await import('./PlotSaveManager');
        const plotSaveManager = PlotSaveManager.getInstance();
        
        // Extract plot index from plotId (e.g., "plot_3" -> 3)
        const plotIndexStr = plotId.split('_')[1] ?? '0';
        const plotIndex = parseInt(plotIndexStr);
        let scoreboardKey: string;
        
        if (!isNaN(plotIndex)) {
            const creatorName = await plotSaveManager.getPlotCreatorName(plotIndex, world);
            if (creatorName && isPoolCreator(creatorName)) {
                // For pool plots, use global creator name as key
                scoreboardKey = creatorName;
                console.log(`[ScoreboardManager] getScoreboard for GLOBAL pool ${creatorName}: found ${this.plotScoreboards.get(scoreboardKey)?.entries?.length || 0} entries`);
            } else {
                // For regular plots, use region-aware key
                scoreboardKey = this.getRegionAwarePlotKey(plotId, world);
                console.log(`[ScoreboardManager] getScoreboard for ${scoreboardKey}: found ${this.plotScoreboards.get(scoreboardKey)?.entries?.length || 0} entries`);
            }
        } else {
            // Fallback to region-aware key
            scoreboardKey = this.getRegionAwarePlotKey(plotId, world);
            console.log(`[ScoreboardManager] getScoreboard for ${scoreboardKey}: found ${this.plotScoreboards.get(scoreboardKey)?.entries?.length || 0} entries`);
        }
        
        const scoreboard = this.plotScoreboards.get(scoreboardKey);
        return scoreboard ? [...scoreboard.entries] : [];
    }

    /**
     * Get a player's best time on a specific plot
     */
    public getPlayerBestTime(plotId: string, playerId: string): number | null {
        const scoreboard = this.plotScoreboards.get(plotId);
        if (!scoreboard) return null;

        const playerEntry = scoreboard.entries.find(entry => entry.playerId === playerId);
        return playerEntry ? playerEntry.completionTime : null;
    }

    /**
     * Check if a player has a score on this plot
     */
    public playerHasScore(plotId: string, playerId: string, world?: { name?: string }): boolean {
        const regionAwareKey = this.getRegionAwarePlotKey(plotId, world);
        const scoreboard = this.plotScoreboards.get(regionAwareKey);
        if (!scoreboard) return false;

        return scoreboard.entries.some(entry => entry.playerId === playerId);
    }

    /**
     * Clear all scores for a plot (when plot is cleared)
     */
    public clearPlotScoreboard(plotId: string, world?: { name?: string }): void {
        const regionAwareKey = this.getRegionAwarePlotKey(plotId, world);
        console.log(`[ScoreboardManager] Clearing scoreboard for ${regionAwareKey}`);
        this.plotScoreboards.delete(regionAwareKey);
    }

    /**
     * Get achievement message based on player's performance
     */
    public getAchievementMessage(result: ScoreboardResult): string {
        const timeInSeconds = (result.playerTime / 1000).toFixed(2);
        
        if (result.isNewRecord) {
            return `🏆 NEW RECORD! You completed the course in ${timeInSeconds}s and set a new best time!`;
        } else if (result.position === 2) {
            return `🥈 2nd Place! You completed the course in ${timeInSeconds}s - great job!`;
        } else if (result.position === 3) {
            return `🥉 3rd Place! You completed the course in ${timeInSeconds}s - well done!`;
        } else if (result.isTopThree) {
            return `🎯 Top 3! You completed the course in ${timeInSeconds}s and made the leaderboard!`;
        } else {
            return `✅ Completed! You finished the course in ${timeInSeconds}s. Keep practicing to reach the top 3!`;
        }
    }

    /**
     * Format scoreboard for display
     */
    public async formatScoreboard(plotId: string, world?: { name?: string }): Promise<string[]> {
        const scores = await this.getScoreboard(plotId, world);
        
        if (!scores || scores.length === 0) {
            return ['📊 No scores yet - be the first to complete this course!'];
        }

        const lines: string[] = [];
        lines.push('📊 Leaderboard:');
        
        scores.forEach((entry, index) => {
            const position = index + 1;
            const time = (entry.completionTime / 1000).toFixed(2);
            const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : '🥉';
            lines.push(`${medal} ${position}. ${entry.playerName} - ${time}s`);
        });

        return lines;
    }

    /**
     * Get debug info for a plot
     */
    public getDebugInfo(plotId: string): any {
        const scoreboard = this.plotScoreboards.get(plotId);
        return {
            plotId,
            hasScoreboard: !!scoreboard,
            entryCount: scoreboard?.entries.length || 0,
            lastUpdated: scoreboard?.lastUpdated || null,
            entries: scoreboard?.entries || []
        };
    }
}

export interface ScoreboardResult {
    position: number; // 1 = 1st place, 2 = 2nd place, etc.
    isNewRecord: boolean;
    isTopThree: boolean;
    scoreboard: ScoreboardEntry[];
    playerTime: number;
    wasUpdated: boolean; // Added this field
} 