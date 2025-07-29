import { Player } from 'hytopia';

interface QueuedMessage {
    message: string;
    bonus?: string;
    rarity?: string;
    duration?: number;
    playerId: string;
    timestamp: number;
}

interface GameMessageOptions {
    bonus?: string;
    rarity?: string;
    duration?: number;
}

export class MessageManager {
    private static readonly MESSAGE_DURATION = 5000; // Back to 5 seconds to match original
    private static readonly MIN_INTERVAL_MS = 800; // Reduced minimum interval
    private static readonly QUEUE_DELAY_MS = 3000; // 3 second delay between queued messages
    private recentMessages: Map<string, number> = new Map(); // Track recent messages (message -> timestamp)
    private messageQueue: QueuedMessage[] = []; // Queue for pending messages
    private isProcessingQueue: boolean = false; // Flag to track if queue is being processed
    private lastMessageSent: number = 0; // Timestamp of last message sent

    constructor() {}

    /**
     * Sends a simple text message to the player's UI using the Achievement Popup system.
     * Includes de-duplication and queuing to prevent spamming.
     */
    sendGameMessage(message: string, player: Player) {
        this.sendRichGameMessage(message, player, {});
    }

    /**
     * Sends a rich message with optional bonus text, rarity, and custom duration.
     * Includes de-duplication and queuing to prevent spamming.
     */
    sendRichGameMessage(message: string, player: Player, options: GameMessageOptions = {}) {
        const now = Date.now();
        
        // Create a unique key for deduplication that includes main message and bonus
        const dedupeKey = options.bonus ? `${message}|${options.bonus}` : message;
        
        // Deduplication logic: skip if same message sent recently
        const lastSent = this.recentMessages.get(dedupeKey);
        if (lastSent && (now - lastSent < MessageManager.MIN_INTERVAL_MS)) {
            console.log(`[MessageManager] Skipping duplicate message (sent < ${MessageManager.MIN_INTERVAL_MS / 1000}s ago): "${message}"`);
            return;
        }
        
        this.recentMessages.set(dedupeKey, now);
        
        // Check if we can send immediately (no recent message sent)
        const timeSinceLastMessage = now - this.lastMessageSent;
        
        if (timeSinceLastMessage >= MessageManager.QUEUE_DELAY_MS && this.messageQueue.length === 0) {
            // Send immediately
            this.sendMessageToUI(message, player, options);
            this.lastMessageSent = now;
            console.log(`[MessageManager] Sent rich message immediately: "${message}"`);
        } else {
            // Add to queue
            this.messageQueue.push({
                message,
                bonus: options.bonus,
                rarity: options.rarity,
                duration: options.duration,
                playerId: player.id,
                timestamp: now
            });
            console.log(`[MessageManager] Queued rich message (${this.messageQueue.length} in queue): "${message}"`);
            
            // Start processing queue if not already processing
            if (!this.isProcessingQueue) {
                this.processMessageQueue(player);
            }
        }
        
        // Occasionally clean up old entries
        if (Math.random() < 0.05) {
            this.cleanupRecentMessages();
        }
    }

    /**
     * Processes the message queue with proper delays between messages
     */
    private async processMessageQueue(initialPlayer: Player) {
        if (this.isProcessingQueue) return;
        
        this.isProcessingQueue = true;
        console.log(`[MessageManager] Starting to process queue with ${this.messageQueue.length} messages`);
        
        while (this.messageQueue.length > 0) {
            const queuedMessage = this.messageQueue.shift();
            if (!queuedMessage) break;
            
            // Skip if we can't find the player (they may have disconnected)
            if (queuedMessage.playerId !== initialPlayer.id) {
                console.warn(`[MessageManager] Skipping queued message for different player: ${queuedMessage.playerId}`);
                continue;
            }
            
            // Calculate how long to wait before sending this message
            const now = Date.now();
            const timeSinceLastMessage = now - this.lastMessageSent;
            const waitTime = Math.max(0, MessageManager.QUEUE_DELAY_MS - timeSinceLastMessage);
            
            if (waitTime > 0) {
                console.log(`[MessageManager] Waiting ${waitTime}ms before sending next message`);
                await this.delay(waitTime);
            }
            
            // Send the message using the initial player reference
            this.sendMessageToUI(queuedMessage.message, initialPlayer, {
                bonus: queuedMessage.bonus,
                rarity: queuedMessage.rarity,
                duration: queuedMessage.duration
            });
            this.lastMessageSent = Date.now();
            console.log(`[MessageManager] Sent queued rich message: "${queuedMessage.message}"`);
        }
        
        this.isProcessingQueue = false;
        console.log(`[MessageManager] Finished processing message queue`);
    }

    /**
     * Actually sends the message to the UI with rich formatting
     */
    private sendMessageToUI(message: string, player: Player, options: GameMessageOptions = {}) {
        const uiData: any = {
            type: 'achievementPopup',
            title: message,
            duration: options.duration || MessageManager.MESSAGE_DURATION
        };
        
        // Add optional fields if provided
        if (options.bonus) {
            uiData.bonus = options.bonus;
        }
        if (options.rarity) {
            uiData.rarity = options.rarity;
        }
        
        player.ui.sendData(uiData);
    }

    /**
     * Promise-based delay helper
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private cleanupRecentMessages(): void {
        const now = Date.now();
        const entriesToDelete: string[] = [];
        
        for (const [message, timestamp] of this.recentMessages.entries()) {
            // Delete entries older than 1 minute
            if (now - timestamp > 60000) { 
                entriesToDelete.push(message);
            }
        }
        
        entriesToDelete.forEach(message => this.recentMessages.delete(message));
        
        if (entriesToDelete.length > 0) {
            console.log(`[MessageManager] Cleaned up ${entriesToDelete.length} old message entries.`);
        }
    }
}