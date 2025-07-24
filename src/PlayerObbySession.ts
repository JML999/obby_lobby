import { Player, World, PlayerCameraMode } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import { ObbyPlayerEntity } from './ObbyPlayerEntity';
import { ObbyLevelController } from './ObbyLevelController';

export type ObbyGameState = 'Lobby' | 'Starting' | 'Playing' | 'Results' | 'Failed';

export interface ObbyPlayResult {
    completed: boolean;
    completionTime?: number; // in milliseconds
    reason: 'completed' | 'failed' | 'quit';
}

// Interface that ObbyLevelController expects from its manager
export interface IObbyPlayManager {
    getCurrentPlayer(): Player | null;
    handlePlayerFailed(reason: string): void;
    handlePlayerFinished(): void;
}

export class PlayerObbySession implements IObbyPlayManager {
    public readonly playerId: string;
    public readonly player: Player;
    public readonly plotIndex: number;
    public readonly plotId: string;
    public readonly world: World;
    
    private gameState: ObbyGameState = 'Lobby';
    private levelController: ObbyLevelController | null = null;
    private startTime: number = 0;
    private gameTimer: NodeJS.Timeout | null = null;
    private countdownTimer: NodeJS.Timeout | null = null;
    
    // Constants
    private readonly COUNTDOWN_DURATION = 3; // 3 seconds countdown
    private readonly RESULTS_DISPLAY_DURATION = 5000; // 5 seconds to show results

    constructor(player: Player, plotIndex: number, world: World) {
        this.playerId = player.id;
        this.player = player;
        this.plotIndex = plotIndex;
        this.plotId = `plot_${plotIndex}`;
        this.world = world;
        
        console.log(`[PlayerObbySession] Created session for player ${this.playerId} on plot ${this.plotIndex}`);
    }

    // IObbyPlayManager interface methods (required by ObbyLevelController)
    public getCurrentPlayer(): Player | null {
        return this.player;
    }

    // Note: handlePlayerFailed and handlePlayerFinished are implemented below in their full form

    /**
     * Get the ObbyPlayerEntity for this session's player
     */
    private getPlayerEntity(): ObbyPlayerEntity | null {
        const allPlayerEntities = this.world.entityManager.getAllPlayerEntities();
        const playerEntity = allPlayerEntities.find(entity => entity.player.id === this.playerId);
        return playerEntity as ObbyPlayerEntity || null;
    }

    /**
     * Initialize the session and start the course
     */
    public async initialize(): Promise<boolean> {
        console.log(`[PlayerObbySession] Initializing session for player ${this.playerId}`);
        
        // Create level controller for this session
        this.levelController = new ObbyLevelController(this.world, this.plotId, this);
        await this.levelController.initialize();

        // Show course entry message
        await this.showCourseStartMessage();
        
        // Start countdown after a brief delay
        setTimeout(() => {
            this.startCountdown();
        }, 2000);
        
        return true;
    }

    /**
     * Show the course starting message with creator info
     */
    private async showCourseStartMessage(): Promise<void> {
        const playerEntity = this.getPlayerEntity();
        if (!playerEntity) return;

        // Get creator name for this plot in THIS world
        const { PlotSaveManager } = await import('./PlotSaveManager');
        const plotSaveManager = PlotSaveManager.getInstance();
        const creatorName = await plotSaveManager.getPlotCreatorName(this.plotIndex, this.world);
        
        console.log(`[PlayerObbySession] Creator lookup for plot ${this.plotIndex} in world ${this.world.name}: "${creatorName}"`);
        
        // For pool maps (no creator), just show the plot number
        // For player builds, show "by [creator]"
        // Convert plot index to clockwise display number (same logic as PlotManager)
        const clockwiseMap: { [key: number]: number } = {
            0: 4, 1: 3, 2: 2, 3: 1, 4: 5, 5: 6, 6: 7, 7: 8
        };
        const displayNumber = clockwiseMap[this.plotIndex] || this.plotIndex + 1;
        const creatorText = creatorName ? `by ${creatorName}` : `Plot ${displayNumber}`;
        console.log(`[PlayerObbySession] Displaying text: "COURSE STARTING" / "${creatorText}"`);
        
        playerEntity.showAnimatedText('COURSE STARTING', creatorText, 2000, 'default');
    }

    /**
     * Start the countdown sequence (3, 2, 1, GO!)
     */
    private startCountdown(): void {
        if (!this.levelController) return;

        this.gameState = 'Starting';
        console.log(`[PlayerObbySession] Starting countdown for player ${this.playerId}`);

        // Teleport player to start position and pause movement
        const startPosition = this.levelController.getStartPosition();
        const playerEntity = this.getPlayerEntity();
        
        if (startPosition && playerEntity) {
            console.log(`[PlayerObbySession] Teleporting player ${this.playerId} to start position:`, startPosition);
            playerEntity.setPosition(startPosition);
        } else {
            console.warn(`[PlayerObbySession] Could not teleport player ${this.playerId} - missing requirements`);
        }
        
        // Pause player movement
        this.setPlayerMovementPaused(true);

        // Use the animated text countdown sequence
        if (playerEntity) {
            console.log(`[PlayerObbySession] Starting animated countdown sequence for player ${this.playerId}`);
            playerEntity.runCountdownSequence(() => {
                console.log(`[PlayerObbySession] Countdown complete for player ${this.playerId} - starting gameplay`);
                this.startPlaying();
            });
        } else {
            // Fallback countdown if no player entity
            console.warn(`[PlayerObbySession] No player entity for animated countdown for player ${this.playerId} - using fallback`);
            this.fallbackCountdown();
        }
    }

    /**
     * Fallback countdown using chat messages
     */
    private fallbackCountdown(): void {
        let countdownValue = this.COUNTDOWN_DURATION;
        
        const doCountdown = () => {
            if (countdownValue > 0) {
                this.world.chatManager.sendPlayerMessage(
                    this.player, 
                    `🚀 Starting in ${countdownValue}...`, 
                    'FFFF00'
                );
                countdownValue--;
                this.countdownTimer = setTimeout(doCountdown, 1000);
            } else {
                this.world.chatManager.sendPlayerMessage(
                    this.player, 
                    '🏁 GO!', 
                    '00FF00'
                );
                this.startPlaying();
            }
        };

        doCountdown();
    }

    /**
     * Begin the actual playing phase
     */
    private startPlaying(): void {
        if (!this.levelController) return;

        this.gameState = 'Playing';
        this.startTime = Date.now();
        
        console.log(`[PlayerObbySession] Starting play phase for player ${this.playerId}`);

        // Enable movement
        this.setPlayerMovementPaused(false);

        // Initialize the level controller for gameplay
        this.levelController.startPlaying();

        // Show timer UI
        this.world.chatManager.sendPlayerMessage(
            this.player,
            '⏱️ Timer started! Reach the goal block to finish!',
            'FFFFFF'
        );
        
        // Start the timer UI updates
        this.startTimerUpdates();
    }

    /**
     * Handle player completing the course
     */
    public handlePlayerFinished(): void {
        if (this.gameState !== 'Playing') return;

        const completionTime = Date.now() - this.startTime;
        console.log(`[PlayerObbySession] Player ${this.playerId} finished in ${completionTime}ms`);

        // Add score to scoreboard
        const { ScoreboardManager } = require('./ScoreboardManager');
        const scoreboardManager = ScoreboardManager.getInstance();
        const scoreboardResult = scoreboardManager.addScore(this.plotId, this.player, completionTime, this.world);

        // Show completion animation immediately
        const playerEntity = this.getPlayerEntity();
        if (playerEntity) {
            const timeInSeconds = (completionTime / 1000).toFixed(2);
            playerEntity.showSuccess('COURSE COMPLETED!', `Time: ${timeInSeconds}s`, 3000);
        }

        this.showResults({
            completed: true,
            completionTime,
            reason: 'completed'
        }, scoreboardResult);
    }

    /**
     * Handle player failing (falling too much, quitting, etc.)
     */
    public handlePlayerFailed(reason: string): void {
        if (this.gameState !== 'Playing') return;

        console.log(`[PlayerObbySession] Player ${this.playerId} failed: ${reason}`);

        // Show failure animation immediately
        const playerEntity = this.getPlayerEntity();
        if (playerEntity) {
            playerEntity.showWarning('COURSE FAILED!', reason, 3000);
        }

        this.showResults({
            completed: false,
            reason: 'failed'
        });
    }

    /**
     * Show results and return to lobby after delay
     */
    private showResults(result: ObbyPlayResult, scoreboardResult?: any): void {
        this.gameState = 'Results';
        
        // Pause movement and set camera to spectator
        this.setPlayerMovementPaused(true);

        if (result.completed && result.completionTime) {
            const timeInSeconds = (result.completionTime / 1000).toFixed(2);
            
            // Show scoreboard results if available
            if (scoreboardResult) {
                const { ScoreboardManager } = require('./ScoreboardManager');
                const scoreboardManager = ScoreboardManager.getInstance();
                
                // Only show leaderboard achievements if the leaderboard was actually updated
                if (scoreboardResult.wasUpdated) {
                    // Create position-specific message and compact leaderboard
                    const { primaryMessage, secondaryMessage } = this.createPositionBasedMessage(scoreboardResult, scoreboardManager);
                    
                    // Show position-specific message with leaderboard in animated text panel
                    const playerEntity = this.getPlayerEntity();
                    if (playerEntity) {
                        playerEntity.showSuccess(
                            primaryMessage,
                            secondaryMessage,
                            6000 // Show for 6 seconds to give time to read leaderboard
                        );
                    }
                } else {
                    // Leaderboard was not updated (worse time) - show simple completion
                    const timeInSeconds = (scoreboardResult.playerTime / 1000).toFixed(2);
                    const playerEntity = this.getPlayerEntity();
                    if (playerEntity) {
                        playerEntity.showSuccess('COURSE COMPLETED!', `Time: ${timeInSeconds}s`, 3000);
                    }
                }
                
                // Also send to chat for reference
                this.world.chatManager.sendPlayerMessage(
                    this.player,
                    `🎉 Course completed in ${timeInSeconds} seconds!`,
                    '00FF00'
                );
                
                // No more achievement chat messages - just the animated panel
            } else {
                // No scoreboard data, just show completion
                const playerEntity = this.getPlayerEntity();
                if (playerEntity) {
                    playerEntity.showSuccess('COURSE COMPLETED!', `Time: ${timeInSeconds}s`, 3000);
                }
                
                this.world.chatManager.sendPlayerMessage(
                    this.player,
                    `🎉 Course completed in ${timeInSeconds} seconds!`,
                    '00FF00'
                );
            }
        } else {
            // Course failed
            const playerEntity = this.getPlayerEntity();
            if (playerEntity) {
                playerEntity.showWarning('COURSE FAILED!', 'Better luck next time!', 3000);
            }
            
            this.world.chatManager.sendPlayerMessage(
                this.player,
                '❌ Course failed! Better luck next time!',
                'FF6B6B'
            );
        }

        // Return to lobby after delay (longer if showing leaderboard)
        const displayDuration = (result.completed && scoreboardResult) ? 7000 : this.RESULTS_DISPLAY_DURATION;
        setTimeout(() => {
            this.returnToLobby();
        }, displayDuration);
    }

    /**
     * Return player to lobby state
     */
    private returnToLobby(): void {
        console.log(`[PlayerObbySession] Returning player ${this.playerId} to lobby`);

        const playerEntity = this.getPlayerEntity();
        if (playerEntity) {
            // Simple safe position
            const lobbyPosition = { x: 0, y: 20, z: 0 };
            console.log(`[PlayerObbySession] Teleporting player ${this.playerId} to lobby:`, lobbyPosition);
            playerEntity.setPosition(lobbyPosition);
        }

        // Reset camera mode
        this.player.camera.setMode(PlayerCameraMode.THIRD_PERSON);
        
        // Clean up this session
        this.cleanup();
    }

    /**
     * Force quit the session
     */
    public forceQuit(): void {
        console.log(`[PlayerObbySession] Force quitting session for player ${this.playerId}`);
        
        this.world.chatManager.sendPlayerMessage(
            this.player,
            '🚪 Exited course',
            'FFAA00'
        );
        
        this.returnToLobby();
    }

    /**
     * Clean up session resources
     */
    private cleanup(): void {
        console.log(`[PlayerObbySession] Cleaning up session for player ${this.playerId}`);
        
        // Clear timers
        if (this.gameTimer) {
            clearTimeout(this.gameTimer);
            this.gameTimer = null;
        }
        if (this.countdownTimer) {
            clearTimeout(this.countdownTimer);
            this.countdownTimer = null;
        }
        
        // Clean up level controller
        if (this.levelController) {
            this.levelController.cleanup();
            this.levelController = null;
        }
        
        // Reset game state
        this.gameState = 'Lobby';
        
        // Enable movement
        this.setPlayerMovementPaused(false);
        
        // Notify ObbyPlayManager to remove this session
        const { ObbyPlayManager } = require('./ObbyPlayManager');
        const playManager = ObbyPlayManager.getInstance();
        playManager.removeSession(this.playerId);
        
        // Reset player state to LOBBY
        const { PlayerStateManager, PlayerGameState } = require('./PlayerGameState');
        const stateManager = PlayerStateManager.getInstance();
        stateManager.setPlayerState(this.playerId, PlayerGameState.LOBBY, undefined, this.player);
    }

    /**
     * Create position-based messages for animated text display
     */
    private createPositionBasedMessage(scoreboardResult: any, scoreboardManager: any): { primaryMessage: string; secondaryMessage: string } {
        const leaderboardLines = scoreboardManager.formatScoreboard(this.plotId, this.world);
        const compactLeaderboard = this.createCompactLeaderboard(leaderboardLines);
        
        let primaryMessage: string;
        
        if (scoreboardResult.isNewRecord) {
            // 1st place - NEW RECORD!
            primaryMessage = '🏆 NEW RECORD!';
        } else if (scoreboardResult.position === 2) {
            // 2nd place
            primaryMessage = '🥈 YOU SCORED 2ND!';
        } else if (scoreboardResult.position === 3) {
            // 3rd place
            primaryMessage = '🥉 YOU SCORED 3RD!';
        } else {
            // Not in top 3 - default completion message
            const timeInSeconds = (scoreboardResult.playerTime / 1000).toFixed(2);
            primaryMessage = `✅ COMPLETED! ${timeInSeconds}s`;
        }
        
        return {
            primaryMessage,
            secondaryMessage: compactLeaderboard
        };
    }

    /**
     * Create a vertical leaderboard format for animated text display
     */
    private createCompactLeaderboard(leaderboardLines: string[]): string {
        // Skip the "📊 LEADERBOARD" header line
        const entries = leaderboardLines.slice(1);
        
        if (entries.length === 0) {
            return 'No scores yet!';
        }
        
        // Create a vertical format with line breaks
        const verticalEntries = entries.map(entry => {
            // Extract medal, player name, and time from format like "🥇 1. Player1 - 15.20s"
            const match = entry.match(/([🥇🥈🥉])\s+\d+\.\s+(.+?)\s+-\s+(.+)/);
            if (match) {
                const medal = match[1];
                const playerName = match[2];
                const time = match[3];
                return `${medal} ${playerName} ${time}`;
            }
            return entry; // Fallback to original if parsing fails
        });
        
        // Join with line breaks for vertical display
        return verticalEntries.join('\n');
    }

    /**
     * Set player movement paused/unpaused
     */
    private setPlayerMovementPaused(paused: boolean): void {
        const playerEntity = this.getPlayerEntity();
        if (playerEntity && playerEntity.controller) {
            (playerEntity.controller as any).pauseMovement = paused;
            console.log(`[PlayerObbySession] Set movement paused=${paused} for player ${this.playerId}`);
        }
    }

    /**
     * Start timer UI updates
     */
    private startTimerUpdates(): void {
        const updateTimer = () => {
            if (this.gameState !== 'Playing') return;
            
            const elapsed = Date.now() - this.startTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const displaySeconds = seconds % 60;
            
            // Update UI with timer (could be enhanced with actual UI element)
            // For now, just log periodically
            if (seconds % 10 === 0) { // Every 10 seconds
                console.log(`[PlayerObbySession] Player ${this.playerId} time: ${minutes}:${displaySeconds.toString().padStart(2, '0')}`);
            }
            
            this.gameTimer = setTimeout(updateTimer, 1000);
        };
        
        updateTimer();
    }

    // Getters
    public getGameState(): ObbyGameState {
        return this.gameState;
    }

    public getElapsedTime(): number {
        if (this.gameState !== 'Playing') return 0;
        return Date.now() - this.startTime;
    }

    public isPlaying(): boolean {
        return this.gameState === 'Playing';
    }
} 