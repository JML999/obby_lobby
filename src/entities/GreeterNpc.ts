import { Player } from 'hytopia';
import { DialogNpc, type NpcConfig } from './DialogNpc';
import { PlayerStateManager, PlayerGameState } from '../PlayerGameState';
import { PlotBuildManager } from '../PlotBuildManager';
import { MobileDetectionManager } from '../MobileDetectionManager';

export class GreeterNpc extends DialogNpc {
    private plotBuildManager: PlotBuildManager;

    constructor(world: any, stateManager: PlayerStateManager, config: NpcConfig) {
        super(world, stateManager, config);
        this.plotBuildManager = PlotBuildManager.getInstance();
    }

    protected getInitialPrompt(player: Player): string {
        return "Welcome!";
    }

    protected getDisplayOptions(player: Player): string[] {
        return [
            "What is this place?",
            "How can I play?",
            "Nevermind"
        ];
    }

    protected getFallbackResponse(): string {
        return "Let me know if you need anything!";
    }

    // Override handleOption to provide custom logic for the greeter
    public override handleOption(player: Player, option: number): void {
        const playerUI = this.interactingPlayers.get(player.id);

        if (!playerUI) {
            console.warn(`[GreeterNpc ${this.config.id}] Received option ${option} from non-interacting player ${player.id}.`);
            return;
        }

        console.log(`[GreeterNpc ${this.config.id}] handleOption called for player ${player.id} with option: ${option}`);

        let response = "";
        switch (option) {
            case 0:
                response = "OBBY LOBBY — a creative hub where you can build, play, and share your own obstacle courses (obbys) with others!";
                break;
            case 1:
                response = "To play, walk up to any plot entrance and press 'Play' to try someone else's obby, or press 'Build' on your own plot to start creating!";
                break;
            case 2:
            default:
                response = "Alright, let me know if you have any questions!";
                break;
        }

        console.log(`[GreeterNpc ${this.config.id}] Responding to player ${player.id} with: "${response}"`);

        // Show the response in the dialog bubble
        if (playerUI && playerUI.dialog) {
            try { 
                playerUI.dialog.setState({ text: response }); 
                console.log(`[GreeterNpc ${this.config.id}] Successfully updated dialog for player ${player.id}`);
            } catch(e) { 
                console.error(`[GreeterNpc ${this.config.id}] Error updating dialog for player ${player.id}:`, e);
            }
        }

        // Hide/unload the specific player's options UI (for desktop)
        if (playerUI.options) {
             try { playerUI.options.unload(); } catch (e) {}
             playerUI.options = undefined;
        }

        // Cleanup for mobile
        const isMobile = MobileDetectionManager.getInstance().isPlayerMobile(player.id);
        if (isMobile) {
            console.log(`[GreeterNpc ${this.config.id}] Sending npcInteractionEnded for mobile player ${player.id}`);
            player.ui.sendData({
                type: 'npcInteractionEnded',
                npcId: this.config.id
            });
        }

        // Schedule cleanup after showing response
        if (playerUI.cleanupTimer) {
            clearTimeout(playerUI.cleanupTimer);
        }
        const hideDelay = 10000; // 3 seconds
        playerUI.cleanupTimer = setTimeout(() => {
            this.cleanupPlayerInteraction(player);
        }, hideDelay);
    }

    private async startBuildMode(player: Player, plotIndex: number) {
        console.log(`[GreeterNpc] Starting build mode for player ${player.id} on plot ${plotIndex}`);

        // Set player state to BUILDING
        this.stateManager.setPlayerState(player.id, PlayerGameState.BUILDING, plotIndex, player);

        // Initialize plot for building without teleporting
        const success = await this.plotBuildManager.activateBuildMode(player, plotIndex);

        if (!success) {
            // Reset state if build mode activation failed
            this.stateManager.setPlayerState(player.id, PlayerGameState.LOBBY, undefined, player);
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, '❌ Failed to enter build mode!', 'FF0000');
            }
        } else {
            if (player.world) {
                player.world.chatManager.sendPlayerMessage(player, `🔨 Build mode activated! Start creating your obby course!`, '00FF00');
                player.world.chatManager.sendPlayerMessage(player, `💡 Tip: Press F to toggle fly mode, press 2 to undo`, 'FFFF00');
            }
        }
    }
} 