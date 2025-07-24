import { PersistenceManager, Player } from 'hytopia';

export interface PlayerObbyMetadata {
    playerId: string;
    obbyData: any;           // The actual obby structure
    lastUpdated: number;     // Timestamp when last saved
    displayName: string;     // Player's display name for UI
    worldSnapshots: {       // Track which worlds have loaded this obby
        [worldId: string]: number; // timestamp when loaded into that world
    };
}

export interface GlobalObbyRegistry {
    [playerId: string]: PlayerObbyMetadata;
}

export class PlayerObbyRegistry {
    private static readonly GLOBAL_REGISTRY_KEY = 'player-obby-registry';
    
    /**
     * Save a player's obby to both their personal data and the global registry
     */
    static async savePlayerObby(player: Player, obbyData: any): Promise<void> {
        try {
            // Save to player's personal data  
            const playerData = await player.getPersistedData() || {};
            playerData.obby = obbyData;
            await player.setPersistedData(playerData);
            
            // Update global registry
            const registry = await this.getGlobalRegistry();
            const playerId = player.id;
            
            registry[playerId] = {
                playerId,
                obbyData,
                lastUpdated: Date.now(),
                displayName: player.id, // Use player.id as display name
                worldSnapshots: registry[playerId]?.worldSnapshots || {}
            };
            
            await PersistenceManager.instance.setGlobalData(this.GLOBAL_REGISTRY_KEY, registry);
            console.log(`[PlayerObbyRegistry] Saved obby for player ${playerId} to global registry`);
            
        } catch (error) {
            console.error(`[PlayerObbyRegistry] Error saving obby for player ${player.id}:`, error);
            throw error;
        }
    }
    
    /**
     * Get the global registry of all player obbies
     */
    static async getGlobalRegistry(): Promise<GlobalObbyRegistry> {
        try {
            const registry = await PersistenceManager.instance.getGlobalData(this.GLOBAL_REGISTRY_KEY);
            return (registry as GlobalObbyRegistry) || {};
        } catch (error) {
            console.error(`[PlayerObbyRegistry] Error loading global registry:`, error);
            return {};
        }
    }
    
    /**
     * Get a random player obby for loading into a world
     * Excludes the current player's obby to avoid conflicts
     */
    static async getRandomPlayerObby(excludePlayerId?: string, worldId?: string): Promise<PlayerObbyMetadata | null> {
        try {
            const registry = await this.getGlobalRegistry();
            const availableObbies = Object.values(registry).filter(metadata => {
                // Exclude the current player
                if (excludePlayerId && metadata.playerId === excludePlayerId) {
                    return false;
                }
                
                // Must have valid obby data
                if (!metadata.obbyData) {
                    return false;
                }
                
                return true;
            });
            
            if (availableObbies.length === 0) {
                console.log(`[PlayerObbyRegistry] No available player obbies found`);
                return null;
            }
            
            // Select random obby
            const randomIndex = Math.floor(Math.random() * availableObbies.length);
            const selectedObby = availableObbies[randomIndex];
            
            if (!selectedObby) {
                return null;
            }
            
            // Track that this world has loaded this obby (for future reference)
            if (worldId) {
                selectedObby.worldSnapshots[worldId] = Date.now();
                await PersistenceManager.instance.setGlobalData(this.GLOBAL_REGISTRY_KEY, registry);
            }
            
            console.log(`[PlayerObbyRegistry] Selected random obby from player ${selectedObby.playerId} (${selectedObby.displayName})`);
            return selectedObby;
            
        } catch (error) {
            console.error(`[PlayerObbyRegistry] Error getting random player obby:`, error);
            return null;
        }
    }
    
    /**
     * Get all available player obbies (for debugging/admin purposes)
     */
    static async getAllPlayerObbies(): Promise<PlayerObbyMetadata[]> {
        try {
            const registry = await this.getGlobalRegistry();
            return Object.values(registry);
        } catch (error) {
            console.error(`[PlayerObbyRegistry] Error getting all player obbies:`, error);
            return [];
        }
    }
    
    /**
     * Remove a player's obby from the global registry
     */
    static async removePlayerObby(playerId: string): Promise<void> {
        try {
            const registry = await this.getGlobalRegistry();
            delete registry[playerId];
            await PersistenceManager.instance.setGlobalData(this.GLOBAL_REGISTRY_KEY, registry);
            console.log(`[PlayerObbyRegistry] Removed obby for player ${playerId} from global registry`);
        } catch (error) {
            console.error(`[PlayerObbyRegistry] Error removing obby for player ${playerId}:`, error);
            throw error;
        }
    }
} 