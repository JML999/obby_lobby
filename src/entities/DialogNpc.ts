import { World, Entity, Player, ColliderShape, Vector3, SimpleEntityController, RigidBodyType, SceneUI, PlayerEntity, EntityEvent } from 'hytopia';
import { PlayerStateManager, PlayerGameState } from '../PlayerGameState';
import { MobileDetectionManager } from '../MobileDetectionManager';

// Define a cooldown period in milliseconds
export const NPC_INTERACTION_COOLDOWN_MS = 500; // 0.5 seconds

// Configuration structure for NPCs
export interface NpcConfig {
    id: string;
    definitionId: string;
    name?: string;
    position: { x: number; y: number; z: number };
    facing: { x: number; y: number; z: number };
    modelUri: string;
    modelScale: number;
    interaction?: {
        type: 'dialog';
        prompt?: string;
        options?: { text: string; response: string; }[];
        fallbackStories?: { prompt: string; response: string; }[];
    };
    idleAnimation?: string;          // Optional: Name of the idle animation loop (defaults to 'idle')
    interactAnimation?: string;      // Optional: Name of the animation to play on interaction start
    interactAnimationLooped?: boolean; // Optional: Set to true if interactAnimation should loop (defaults to false/one-shot)
}

// Interface to hold per-player UI and state
export interface PlayerInteractionUI {
    dialog?: SceneUI;
    options?: SceneUI;
    cleanupTimer?: any | null;
    currentFallbackResponse?: string;
}

export abstract class DialogNpc {
    protected entity?: Entity;
    // Store UI and state per interacting player
    protected interactingPlayers: Map<string, PlayerInteractionUI> = new Map();
    protected interactionRadius: number = 2; // Default radius

    constructor(
        protected world: World,
        protected stateManager: PlayerStateManager,
        protected config: NpcConfig
    ) {}

    public spawn(): void {
        // Explicitly define the options for the Entity constructor
        const entityOptions: any = {
            name: `NPC - ${this.config.id} (${this.config.definitionId})`,
            controller: new SimpleEntityController(),
            modelUri: this.config.modelUri,
            modelScale: this.config.modelScale,
            modelLoopedAnimations: ['idle'],
            rigidBodyOptions: {
                type: RigidBodyType.KINEMATIC_POSITION
            }
        };

        console.log(`[DialogNpc ${this.config.id}] Spawning entity with options:`, JSON.stringify(entityOptions));

        try {
            this.entity = new Entity(entityOptions);
        } catch (error) {
             console.error(`[DialogNpc ${this.config.id}] FATAL ERROR during Entity construction:`, error);
             console.error(`[DialogNpc ${this.config.id}] Entity Options used:`, JSON.stringify(entityOptions));
             throw error;
        }

        // Face direction, Spawn, Add Collider
        const npcEntityController = this.entity.controller as SimpleEntityController;
        if (this.config.facing) {
            npcEntityController.face(this.config.facing, 1);
        } else {
            console.warn(`[DialogNpc ${this.config.id}] NPC has no 'facing' data in config.`);
        }

        this.entity.spawn(this.world, this.config.position);

        // Add sensor collider for interaction
        this.entity.createAndAddChildCollider({
            shape: ColliderShape.CYLINDER,
            radius: this.interactionRadius,
            halfHeight: 2,
            isSensor: true,
            onCollision: (other: any, started: boolean) => {
                if (other instanceof PlayerEntity) {
                    const player = other.player;
                    const idleAnim = this.config.idleAnimation || 'idle';

                    if (started) {
                        if (!this.interactingPlayers.has(player.id)) {
                             console.log(`[DialogNpc ${this.config.id}] Collision start detected with player ${player.id}. Initiating interaction.`);

                             // Interaction Animation Logic
                             const interactAnim = this.config.interactAnimation;
                             const loopInteractAnim = !!this.config.interactAnimationLooped;

                             if (interactAnim) {
                                 console.log(`[DialogNpc ${this.config.id}] Starting interact animation: ${interactAnim} (Looped: ${loopInteractAnim})`);
                                 this.entity?.stopModelAnimations([idleAnim]);
                                 if (loopInteractAnim) {
                                     this.entity?.startModelLoopedAnimations([interactAnim]);
                                 } else {
                                     this.entity?.startModelOneshotAnimations([interactAnim]);
                                 }
                             }

                             this.handlePlayerInteraction(player);
                        }
                    } else { // Player left
                         console.log(`[DialogNpc ${this.config.id}] Player ${player.id} leaving radius. Returning to idle: ${idleAnim}`);
                         
                         const interactAnim = this.config.interactAnimation;
                         if (interactAnim) {
                              this.entity?.stopModelAnimations([interactAnim]);
                         }
                         this.entity?.startModelLoopedAnimations([idleAnim]);
                         this.handlePlayerLeave(player);
                    }
                }
            },
        });
    }

    public despawn(): void {
        if (this.entity) {
            this.entity.despawn();
        }
        // Clean up UI for all interacting players
        this.interactingPlayers.forEach((ui, playerId) => {
            this.cleanupPlayerInteractionById(playerId);
        });
        this.interactingPlayers.clear();
    }

    // Helper to clean up just by ID, used in despawn
    protected cleanupPlayerInteractionById(playerId: string): void {
        const playerUI = this.interactingPlayers.get(playerId);
        if (!playerUI) return;

        console.log(`[DialogNpc ${this.config.id}] Cleaning up interaction for player ID ${playerId} (likely due to despawn).`);

        if (playerUI.cleanupTimer) {
            clearTimeout(playerUI.cleanupTimer);
        }
        if (playerUI.dialog) { try { playerUI.dialog.unload(); } catch(e) {} }
        if (playerUI.options) { try { playerUI.options.unload(); } catch(e) {} }

        this.interactingPlayers.delete(playerId);
    }

    // Called when a player enters the NPC's interaction radius
    protected handlePlayerInteraction(player: Player): void {
        const playerData = this.stateManager.getPlayerState(player.id);
        if (!playerData) return;

        // Cooldown Check - using a simple timestamp approach
        const lastInteractionTime = playerData.lastNpcInteractionTime?.[this.config.id];
        const now = Date.now();
        if (lastInteractionTime && (now - lastInteractionTime < NPC_INTERACTION_COOLDOWN_MS)) {
            console.log(`[DialogNpc ${this.config.id}] Interaction attempt from player ${player.id} ignored due to cooldown.`);
            return;
        }

        // Already interacting check
        if (this.interactingPlayers.has(player.id)) {
             console.log(`[DialogNpc ${this.config.id}] Player ${player.id} is already interacting.`);
            return;
        }

        const playerEntities = this.world.entityManager.getPlayerEntitiesByPlayer(player);
        if (!playerEntities || playerEntities.length === 0) { 
            console.warn(`[DialogNpc ${this.config.id}] No player entity found for player ${player.id}`);
            return; 
        }
        const playerEntity = playerEntities[0];

        console.log(`[DialogNpc ${this.config.id}] Player ${player.id} starting interaction.`);

        // Get initial prompt and options from subclass
        const initialPrompt = this.getInitialPrompt(player);
        const displayOptions = this.getDisplayOptions(player);
        const currentFallbackResponse = this.getFallbackResponse();

        // Create Per-Player UI
        const playerUI: PlayerInteractionUI = { currentFallbackResponse };

        // Create NPC Dialog Bubble with SceneUI tracking
        if (this.entity) {
             console.log(`[DialogNpc ${this.config.id}] Creating dialog UI for player ${player.id} with prompt: "${initialPrompt}"`);
             console.log(`[DialogNpc ${this.config.id}] NPC entity position:`, this.entity.position);
             console.log(`[DialogNpc ${this.config.id}] NPC entity world:`, this.world.name);
             console.log(`[DialogNpc ${this.config.id}] Dialog offset: { x: 0, y: ${this.config.modelScale * 1.2}, z: 0 }`);
             
             // Calculate expected dialog position
             const expectedPosition = {
                 x: this.entity.position.x,
                 y: this.entity.position.y + (this.config.modelScale * 1.2),
                 z: this.entity.position.z
             };
             console.log(`[DialogNpc ${this.config.id}] Expected dialog position:`, expectedPosition);
             
             playerUI.dialog = new SceneUI({
                 templateId: 'npc-dialogue',
                 attachedToEntity: this.entity,
                 offset: { x: 0, y: 1.5, z: 0 },
                 state: { text: initialPrompt, owningPlayerId: player.id }
             });
             
             try { 
                 console.log(`[DialogNpc ${this.config.id}] Loading dialog UI for player ${player.id}...`);
                 playerUI.dialog.load(this.world); 
                 console.log(`[DialogNpc ${this.config.id}] Dialog UI loaded successfully for player ${player.id}`);
                 
                 // Send a message to the client to help track the SceneUI
                 player.ui.sendData({
                     type: 'sceneUIDebug',
                     message: `Dialog UI loaded for NPC ${this.config.id}`,
                     npcPosition: this.entity.position,
                     expectedDialogPosition: expectedPosition,
                     worldName: this.world.name
                 });
                 
             } catch (error) { 
                 console.error(`[DialogNpc ${this.config.id}] Error loading dialog UI for player ${player.id}:`, error);
                 playerUI.dialog = undefined; 
             }
        } else {
             console.error(`[DialogNpc ${this.config.id}] No entity available to attach dialog UI for player ${player.id}`);
        }

        // Check if mobile and send mobile options
        const isMobile = MobileDetectionManager.getInstance().isPlayerMobile(player.id);
        console.log(`[DialogNpc ${this.config.id}] Player ${player.id} is mobile: ${isMobile}`);
        
        if (isMobile) {
            console.log(`[DialogNpc ${this.config.id}] Sending options to mobile client UI for player ${player.id}`);
            if (displayOptions.length > 0) {
                player.ui.sendData({
                    type: 'showMobileNpcOptions',
                    options: displayOptions
                });
                console.log(`[DialogNpc ${this.config.id}] Sent 'showMobileNpcOptions' event to player ${player.id}`);
            }   
        } else {
            // Create Player Options UI for desktop
            if (displayOptions.length > 0) {
                console.log(`[DialogNpc ${this.config.id}] Creating options UI for player ${player.id} with options: [${displayOptions.join(', ')}]`);
                playerUI.options = new SceneUI({
                    templateId: 'player-options',
                    attachedToEntity: playerEntity,
                    offset: { x: 0, y: -0.5, z: 0 },
                    state: { options: displayOptions, owningPlayerId: player.id }
                });
                try { 
                    console.log(`[DialogNpc ${this.config.id}] Loading options UI for player ${player.id}...`);
                    playerUI.options.load(this.world); 
                    console.log(`[DialogNpc ${this.config.id}] Options UI loaded successfully for player ${player.id}`);
                } catch (error) { 
                    console.error(`[DialogNpc ${this.config.id}] Error loading options UI for player ${player.id}:`, error);
                    playerUI.options = undefined; 
                }
            } else {
                console.log(`[DialogNpc ${this.config.id}] No options to display for player ${player.id}`);
            }
        }
        
        // Store player UI state
        this.interactingPlayers.set(player.id, playerUI);

        // Set up input handling for Q, E, R keys (desktop only)
        if (!isMobile) {
            this.setupInputHandling(player, displayOptions);
        }

        console.log(`[DialogNpc ${this.config.id}] Interaction setup complete for player ${player.id}. Map size: ${this.interactingPlayers.size}`);
    }

    /**
     * Set up input handling for Q, E, R keys to select options (desktop only)
     */
    private setupInputHandling(player: Player, options: string[]) {
        const playerId = player.id;
        
        // Use the entity's tick event instead of this.on
        if (this.entity) {
            this.entity.on(EntityEvent.TICK, () => {
                if (!this.interactingPlayers.has(playerId)) return;
                
                const player = this.world?.entityManager.getAllPlayerEntities()
                    .find(playerEntity => playerEntity.player.id === playerId)?.player;
                
                if (!player || !player.input) return;
                
                const input = player.input;
                
                // Map Q, E, R keys to option indices
                if (input.q && options.length > 0) {
                    this.handleOption(player, 0);
                } else if (input.e && options.length > 1) {
                    this.handleOption(player, 1);
                } else if (input.r && options.length > 2) {
                    this.handleOption(player, 2);
                }
            });
        }
    }

    // Abstract methods for subclasses to define behavior
    protected abstract getInitialPrompt(player: Player): string;
    protected abstract getDisplayOptions(player: Player): string[];
    protected abstract getFallbackResponse(): string;

    // Handles player selection of a dialog option (BASE IMPLEMENTATION)
    public handleOption(player: Player, option: number): void {
        const playerUI = this.interactingPlayers.get(player.id);

        if (!playerUI) {
            console.warn(`[DialogNpc Base ${this.config.id}] Received option ${option} from non-interacting player ${player.id}.`);
            return;
        }

        console.log(`[DialogNpc Base ${this.config.id}] handleOption called for player ${player.id} with option: ${option}`);

        let npcResponseText = playerUI.currentFallbackResponse || "I see.";
        let endInteraction = true;

        // Check if option corresponds to configured options
        const optionsConfig = this.config.interaction?.options;
        if (optionsConfig && optionsConfig[option]) {
             console.log(`[DialogNpc Base ${this.config.id}] Matched standard option index ${option}.`);
            const configResponse = optionsConfig[option].response;
            npcResponseText = configResponse && configResponse.trim() !== "" ? configResponse : (playerUI.currentFallbackResponse || "I understand.");
        } else {
            console.log(`[DialogNpc Base ${this.config.id}] No specific option matched, using fallback/default response.`);
        }

        console.log(`[DialogNpc Base ${this.config.id}] Responding to player ${player.id} with: "${npcResponseText}". Ending Interaction: ${endInteraction}`);

        // Update the specific player's dialogue bubble
        if (playerUI.dialog) {
            try { 
                playerUI.dialog.setState({ text: npcResponseText }); 
                console.log(`[DialogNpc Base ${this.config.id}] Successfully updated dialog for player ${player.id}`);
            } catch(e) { 
                console.error(`[DialogNpc Base ${this.config.id}] Error updating dialog for player ${player.id}:`, e);
            }
        }

        // Hide/unload the specific player's options UI
        if (playerUI.options) {
             try { playerUI.options.unload(); } catch (e) {}
             playerUI.options = undefined;
        }

        // Cleanup for mobile
        const isMobile = MobileDetectionManager.getInstance().isPlayerMobile(player.id);
        if (isMobile) {
            player.ui.sendData({
                type: 'npcInteractionEnded',
                npcId: this.config.id
            });
        }

        // Schedule cleanup
        if (endInteraction) {
             if (playerUI.cleanupTimer) {
                 clearTimeout(playerUI.cleanupTimer);
             }
             const hideDelay = 10000; // 3 seconds
             playerUI.cleanupTimer = setTimeout(() => {
                this.cleanupPlayerInteraction(player);
             }, hideDelay);
        }
    }

    // Method to clean up a specific player's interaction fully
    protected cleanupPlayerInteraction(player: Player): void {
         const playerUI = this.interactingPlayers.get(player.id);
         if (!playerUI) return;

         const isMobile = MobileDetectionManager.getInstance().isPlayerMobile(player.id);
         if (isMobile) {
             console.log(`[DialogNpc ${this.config.id}] Sending npcInteractionEnded to mobile player ${player.id}`);
             player.ui.sendData({
                 type: 'npcInteractionEnded',
             });
         }

         console.log(`[DialogNpc ${this.config.id}] Cleaning up interaction state and UI for player ${player.id}.`);

         // Clear timer if it exists
         if (playerUI.cleanupTimer) {
             clearTimeout(playerUI.cleanupTimer);
             playerUI.cleanupTimer = null;
         }

         // Unload UI
         if (playerUI.dialog) { try { playerUI.dialog.unload(); } catch(e) {} }
         if (playerUI.options) { try { playerUI.options.unload(); } catch(e) {} }

         // Remove from map
         this.interactingPlayers.delete(player.id);

         // Set cooldown timestamp
         const playerData = this.stateManager.getPlayerState(player.id);
         if (playerData) {
             if (!playerData.lastNpcInteractionTime) {
                 playerData.lastNpcInteractionTime = {};
             }
             playerData.lastNpcInteractionTime[this.config.id] = Date.now();
         }

         console.log(`[DialogNpc ${this.config.id}] Cleanup complete for player ${player.id}. Map size: ${this.interactingPlayers.size}`);
    }

    // Handles player leaving the interaction radius
    protected handlePlayerLeave(player: Player): void {
         if (this.interactingPlayers.has(player.id)) {
             console.log(`[DialogNpc ${this.config.id}] Interacting player ${player.id} left radius.`);
             
             // Immediately hide mobile UI when player leaves
             const isMobile = MobileDetectionManager.getInstance().isPlayerMobile(player.id);
             if (isMobile) {
                 console.log(`[DialogNpc ${this.config.id}] Hiding mobile UI for player ${player.id} who left radius`);
                 player.ui.sendData({
                     type: 'npcInteractionEnded',
                     npcId: this.config.id
                 });
             }
             
             this.cleanupPlayerInteraction(player);
         }
    }
} 