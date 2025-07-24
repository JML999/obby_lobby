import { World, Player, PlayerCameraMode } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import { ObbyPlayerEntity } from './ObbyPlayerEntity';
import { PlotBuildManager } from './PlotBuildManager';
import { PlayerStateManager, PlayerGameState } from './PlayerGameState';
import { PlayerObbySession } from './PlayerObbySession';
import type { IObbyPlayManager } from './PlayerObbySession';

export class ObbyPlayManager implements IObbyPlayManager {
    private static instance: ObbyPlayManager;
    private world?: World;
    private plotBuildManager: PlotBuildManager;
    private playerStateManager: PlayerStateManager;
    
    // Multi-player session management
    private activeSessions: Map<string, PlayerObbySession> = new Map();

    public static getInstance(): ObbyPlayManager {
        if (!ObbyPlayManager.instance) {
            ObbyPlayManager.instance = new ObbyPlayManager();
        }
        return ObbyPlayManager.instance;
    }

    private constructor() {
        this.plotBuildManager = PlotBuildManager.getInstance();
        this.playerStateManager = PlayerStateManager.getInstance();
    }

    public initializeWorld(world: World): void {
        this.world = world;
        console.log('[ObbyPlayManager] Initialized with world');
    }

    /**
     * Start playing an obby course for a player
     */
    public async startObbyPlay(player: Player, plotIndex: number): Promise<boolean> {
        if (!player.world) {
            console.error('[ObbyPlayManager] Player has no world');
            return false;
        }
        
        // Update world reference to player's actual world
        this.world = player.world;
        console.log(`[ObbyPlayManager] Using player's world: ${this.world.name}`);

        // Check if this player already has an active session
        if (this.activeSessions.has(player.id)) {
            this.world.chatManager.sendPlayerMessage(player, '❌ You are already playing a course!', 'FF0000');
            return false;
        }

        console.log(`[ObbyPlayManager] Starting obby play for player ${player.id} on plot ${plotIndex}`);

        // Validate the plot has a valid course
        const plotId = `plot_${plotIndex}`;
        console.log(`[ObbyPlayManager] Validating plot ${plotId} using tracked blocks in world: ${this.world.name}`);
        const isValidCourse = await this.validatePlotForPlay(plotId);
        
        if (!isValidCourse) {
            this.world.chatManager.sendPlayerMessage(player, '❌ This plot does not have a valid course! (Need start and goal blocks)', 'FF0000');
            return false;
        }

        // Scoreboard data is now loaded automatically when the plot is loaded
        // No need to load it here anymore
        
        // Create new session for this player
        const session = new PlayerObbySession(player, plotIndex, this.world);
        this.activeSessions.set(player.id, session);

        // Change player state to PLAYING
        this.playerStateManager.setPlayerState(player.id, PlayerGameState.PLAYING, plotIndex, player);

        // Initialize the session (this will handle countdown and start)
        await session.initialize();
        
        console.log(`[ObbyPlayManager] Session created and started for player ${player.id}. Total active sessions: ${this.activeSessions.size}`);
        return true;
    }



    /**
     * Validate that a plot has the required blocks for a playable course
     */
    private async validatePlotForPlay(plotId: string): Promise<boolean> {
        const plotBoundaries = this.plotBuildManager.getPlotBoundaries(plotId);
        if (!plotBoundaries) {
            console.log(`[ObbyPlayManager] No boundaries found for plot ${plotId}`);
            return false;
        }

        if (!this.world) {
            console.error(`[ObbyPlayManager] ERROR: this.world is undefined in validatePlotForPlay!`);
            return false;
        }

        console.log(`[ObbyPlayManager] Validating plot ${plotId} using user-placed blocks in world: ${this.world.name}`);

        // Get user-placed blocks from PlotSaveManager (same as clear plot)
        const plotSaveManager = (await import('./PlotSaveManager')).PlotSaveManager.getInstance();
        const userPlacedBlocks = plotSaveManager.getUserPlacedBlocksInPlot(this.world, plotId);
        console.log(`[ObbyPlayManager] Found ${userPlacedBlocks.length} user-placed blocks in plot ${plotId}`);

        let hasStartBlock = false;
        let hasGoalBlock = false;

        // Analyze user-placed blocks
        for (const block of userPlacedBlocks) {
            const blockId = block.blockTypeId;
            if (blockId === 100) hasStartBlock = true; // Start block
            if (blockId === 101) hasGoalBlock = true; // Goal block
            if (hasStartBlock && hasGoalBlock) break;
        }

        console.log(`[ObbyPlayManager] Plot ${plotId} validation - Start: ${hasStartBlock}, Goal: ${hasGoalBlock}`);

        // If plot is valid, also load the scoreboard from the creator's persistence
        if (hasStartBlock && hasGoalBlock) {
            try {
                // Extract plot index from plotId (e.g., "plot_3" -> 3)
                const plotIndexStr = plotId.split('_')[1] ?? '0';
                const plotIndex = parseInt(plotIndexStr);
                if (!isNaN(plotIndex)) {
                    // Get the creator's name
                    const creatorName = await plotSaveManager.getPlotCreatorName(plotIndex, this.world);
                    if (creatorName) {
                        // Find the creator player in the world
                        const creatorPlayer = this.world.entityManager.getAllPlayerEntities()
                            .find(entity => String(entity.player.username) === String(creatorName) || String(entity.player.id) === String(creatorName))?.player;
                        
                        if (creatorPlayer) {
                            // Load the creator's persistence data to get scoreboard
                            const persistedData = await creatorPlayer.getPersistedData();
                            const obbyData = persistedData?.obby as any;
                            
                            if (obbyData?.plotData?.scoreboard) {
                                // Load the scoreboard into memory
                                const { ScoreboardManager } = await import('./ScoreboardManager');
                                const scoreboardManager = ScoreboardManager.getInstance();
                                await scoreboardManager.loadScoreboardFromPlot(plotId, obbyData.plotData, this.world);
                                console.log(`[ObbyPlayManager] Loaded ${obbyData.plotData.scoreboard.length} scoreboard entries for plot ${plotId}`);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`[ObbyPlayManager] Error loading scoreboard for plot ${plotId}:`, error);
                // Don't fail validation if scoreboard loading fails
            }
        }

        return hasStartBlock && hasGoalBlock;
    }

    /**
     * Force quit all sessions (legacy method for compatibility)
     */
    public forceQuit(): void {
        console.log(`[ObbyPlayManager] Force quitting all active sessions (${this.activeSessions.size} sessions)`);
        
        // Force quit all active sessions
        for (const session of this.activeSessions.values()) {
            session.forceQuit();
        }
        
        // Clear all sessions
        this.activeSessions.clear();
        
        console.log('[ObbyPlayManager] All sessions force quit');
    }

    /**
     * Force quit a specific player's session
     */
    public forceQuitPlayer(playerId: string): void {
        const session = this.activeSessions.get(playerId);
        if (session) {
            console.log(`[ObbyPlayManager] Force quitting session for player ${playerId}`);
            session.forceQuit();
            this.activeSessions.delete(playerId);
        } else {
            console.log(`[ObbyPlayManager] No active session found for player ${playerId}`);
        }
    }

    /**
     * Clean up session when player disconnects
     */
    public cleanupPlayerSession(playerId: string): void {
        const session = this.activeSessions.get(playerId);
        if (session) {
            console.log(`[ObbyPlayManager] Cleaning up session for disconnected player ${playerId}`);
            session.forceQuit();
            this.activeSessions.delete(playerId);
        }
    }

    /**
     * Remove a session from active sessions (called by PlayerObbySession on cleanup)
     */
    public removeSession(playerId: string): void {
        if (this.activeSessions.has(playerId)) {
            this.activeSessions.delete(playerId);
            console.log(`[ObbyPlayManager] Removed session for player ${playerId}. Active sessions: ${this.activeSessions.size}`);
        }
    }

    // IObbyPlayManager interface methods (for compatibility with ObbyLevelController)
    public getCurrentPlayer(): Player | null {
        // This is a legacy method - in multi-player mode, there's no single "current" player
        // Return the first active player if any, or null
        const firstSession = this.activeSessions.values().next().value;
        return firstSession ? firstSession.player : null;
    }

    public handlePlayerFinished(): void {
        // This is a legacy method - individual sessions handle their own completion
        console.warn('[ObbyPlayManager] handlePlayerFinished called on manager - this should be handled by individual sessions');
    }

    public handlePlayerFailed(reason: string): void {
        // This is a legacy method - individual sessions handle their own failures
        console.warn('[ObbyPlayManager] handlePlayerFailed called on manager - this should be handled by individual sessions');
    }

    // Utility methods
    public getActiveSessionCount(): number {
        return this.activeSessions.size;
    }

    public getPlayerSession(playerId: string): PlayerObbySession | undefined {
        return this.activeSessions.get(playerId);
    }

    public isPlayerPlaying(playerId: string): boolean {
        const session = this.activeSessions.get(playerId);
        return session ? session.isPlaying() : false;
    }

    public getAllActivePlayers(): Player[] {
        return Array.from(this.activeSessions.values()).map(session => session.player);
    }

    public getPlayersOnPlot(plotIndex: number): Player[] {
        return Array.from(this.activeSessions.values())
            .filter(session => session.plotIndex === plotIndex)
            .map(session => session.player);
    }
} 