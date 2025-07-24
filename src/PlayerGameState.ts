import { MobileDetectionManager } from './MobileDetectionManager';

export enum PlayerGameState {
    LOBBY = 'LOBBY',           // Player is in lobby/hub, browsing plots
    PLAYING = 'PLAYING',       // Player is playing an obby course
    BUILDING = 'BUILDING'      // Player is building their obby course
}

export interface PlayerStateData {
    playerId: string;
    state: PlayerGameState;
    plotIndex?: number;        // Which plot they're associated with
    startTime?: number;        // When they started current activity
    lives?: number;            // Lives remaining (for PLAYING state)
    checkpoints?: number[];    // Checkpoint progress (for PLAYING state)
    lastCheckpoint?: { x: number, y: number, z: number }; // Last checkpoint position
    lastNpcInteractionTime?: { [npcId: string]: number }; // Cooldown timestamps for NPC interactions
}

export class PlayerStateManager {
    private static instance: PlayerStateManager;
    private playerStates = new Map<string, PlayerStateData>();

    static getInstance(): PlayerStateManager {
        if (!PlayerStateManager.instance) {
            PlayerStateManager.instance = new PlayerStateManager();
        }
        return PlayerStateManager.instance;
    }

    /**
     * Send UI notification to player about state change
     */
    private notifyPlayerStateChange(player: any, state: PlayerGameState, plotIndex?: number): void {
        if (player && player.ui) {
            try {
                // Check if player is on mobile device
                const isMobile = MobileDetectionManager.getInstance().isPlayerMobile(player.id);
                
                const data: any = {
                    type: 'playerStateChanged',
                    state: state,
                    plotIndex: plotIndex,
                    isMobile: isMobile
                };

                // Add mobile-specific control information
                if (isMobile) {
                    if (state === PlayerGameState.BUILDING) {
                        data.mobileControls = {
                            showJumpButton: false,      // No jump in build mode
                            showFlyControls: true,      // Show fly up/down controls
                            showInventoryButton: true,  // Show inventory access
                            showHotbar: true            // Show hotbar
                        };
                    } else if (state === PlayerGameState.PLAYING) {
                        data.mobileControls = {
                            showJumpButton: true,       // Show jump in play mode
                            showFlyControls: false,     // No fly controls in play mode
                            showInventoryButton: false, // No inventory in play mode
                            showHotbar: false           // No hotbar in play mode
                        };
                    } else if (state === PlayerGameState.LOBBY) {
                        data.mobileControls = {
                            showJumpButton: true,       // Show jump in lobby
                            showFlyControls: false,     // No fly controls in lobby
                            showInventoryButton: false, // No inventory in lobby
                            showHotbar: false           // No hotbar in lobby
                        };
                    }
                }

                // If entering build mode, include cash information
                if (state === PlayerGameState.BUILDING) {
                    const { PlotSaveManager } = require('./PlotSaveManager');
                    const { CashCalculator } = require('./CashCalculator');
                    const plotSaveManager = PlotSaveManager.getInstance();
                    
                    const currentCash = plotSaveManager.getPlayerCash(player);
                    data.cash = currentCash;
                    data.maxCash = CashCalculator.DEFAULT_STARTING_CASH;
                    
                    console.log(`[PlayerStateManager] Sending build mode cash info: ${currentCash}`);
                }

                player.ui.sendData(data);
                console.log(`[PlayerStateManager] Sent UI notification to player ${player.id}: state=${state}, plotIndex=${plotIndex}, isMobile=${isMobile}`);
            } catch (e) {
                console.warn(`[PlayerStateManager] Failed to send UI notification to player ${player.id}:`, e);
            }
        }
    }

    /**
     * Set a player's game state
     */
    setPlayerState(playerId: string, state: PlayerGameState, plotIndex?: number, player?: any): void {
        const currentData = this.playerStates.get(playerId);
        
        const newData: PlayerStateData = {
            playerId,
            state,
            plotIndex,
            startTime: Date.now(),
            // Preserve certain data during state transitions
            lives: state === PlayerGameState.PLAYING ? (currentData?.lives ?? 3) : undefined,
            checkpoints: state === PlayerGameState.PLAYING ? (currentData?.checkpoints ?? []) : undefined,
            lastCheckpoint: state === PlayerGameState.PLAYING ? currentData?.lastCheckpoint : undefined
        };

        this.playerStates.set(playerId, newData);
        console.log(`[PlayerStateManager] Player ${playerId} state changed to ${state}${plotIndex !== undefined ? ` (plot ${plotIndex})` : ''}`);
        
        // Notify the UI about the state change if player object is provided
        if (player) {
            this.notifyPlayerStateChange(player, state, plotIndex);
        }
    }

    /**
     * Get a player's current state
     */
    getPlayerState(playerId: string): PlayerStateData | undefined {
        return this.playerStates.get(playerId);
    }

    /**
     * Get current state enum for quick checks
     */
    getCurrentState(playerId: string): PlayerGameState {
        return this.playerStates.get(playerId)?.state ?? PlayerGameState.LOBBY;
    }

    /**
     * Check if player is in a specific state
     */
    isPlayerInState(playerId: string, state: PlayerGameState): boolean {
        return this.getCurrentState(playerId) === state;
    }

    /**
     * Get all players in a specific state
     */
    getPlayersInState(state: PlayerGameState): PlayerStateData[] {
        return Array.from(this.playerStates.values()).filter(data => data.state === state);
    }

    /**
     * Remove player state (when they disconnect)
     */
    removePlayer(playerId: string): void {
        this.playerStates.delete(playerId);
        
        // Also remove from mobile detection manager
        MobileDetectionManager.getInstance().removePlayer(playerId);
        
        console.log(`[PlayerStateManager] Removed state for player ${playerId}`);
    }

    /**
     * Update player lives (for PLAYING state)
     */
    updatePlayerLives(playerId: string, lives: number): void {
        const data = this.playerStates.get(playerId);
        if (data && data.state === PlayerGameState.PLAYING) {
            data.lives = lives;
            console.log(`[PlayerStateManager] Player ${playerId} now has ${lives} lives`);
        }
    }

    /**
     * Add checkpoint for player (for PLAYING state)
     */
    addCheckpoint(playerId: string, checkpointId: number, position: { x: number, y: number, z: number }): void {
        const data = this.playerStates.get(playerId);
        if (data && data.state === PlayerGameState.PLAYING) {
            if (!data.checkpoints) data.checkpoints = [];
            if (!data.checkpoints.includes(checkpointId)) {
                data.checkpoints.push(checkpointId);
                data.lastCheckpoint = position;
                console.log(`[PlayerStateManager] Player ${playerId} reached checkpoint ${checkpointId}`);
            }
        }
    }

    /**
     * Get player's last checkpoint position for respawning
     */
    getLastCheckpoint(playerId: string): { x: number, y: number, z: number } | undefined {
        const data = this.playerStates.get(playerId);
        return data?.lastCheckpoint;
    }

    /**
     * Get time spent in current state
     */
    getTimeInCurrentState(playerId: string): number {
        const data = this.playerStates.get(playerId);
        if (!data?.startTime) return 0;
        return Date.now() - data.startTime;
    }

    /**
     * Debug: Log all player states
     */
    logAllStates(): void {
        console.log('[PlayerStateManager] Current player states:');
        for (const [playerId, data] of this.playerStates) {
            const timeInState = Math.round((Date.now() - (data.startTime ?? 0)) / 1000);
            console.log(`  ${playerId}: ${data.state}${data.plotIndex !== undefined ? ` (plot ${data.plotIndex})` : ''} - ${timeInState}s`);
        }
    }
} 