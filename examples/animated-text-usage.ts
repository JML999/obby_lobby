/**
 * Example usage of the Animated Text System in your Obby game
 * 
 * This file shows various ways to use the animated text functionality
 * that was copied from the Hytopia Havoc reference project.
 */

import { Player } from 'hytopia';
import { ObbyPlayerEntity } from '../src/ObbyPlayerEntity';

export class AnimatedTextExamples {
    
    /**
     * Example: Start a countdown when a player enters a course
     */
    static async startCourseCountdown(playerEntity: ObbyPlayerEntity): Promise<void> {
        console.log('[AnimatedTextExamples] Starting course countdown');
        
        // Run the full countdown sequence (3, 2, 1, GO!)
        await playerEntity.runCountdownSequence(() => {
            console.log('Countdown complete - course started!');
            // Here you could enable player movement, start timers, etc.
        });
    }

    /**
     * Example: Show checkpoint reached message
     */
    static showCheckpointReached(playerEntity: ObbyPlayerEntity, checkpointNumber: number): void {
        console.log(`[AnimatedTextExamples] Player reached checkpoint ${checkpointNumber}`);
        
        playerEntity.showSuccess(
            'CHECKPOINT!',
            `${checkpointNumber}/10 reached`,
            2000  // Show for 2 seconds
        );
    }

    /**
     * Example: Show course completion
     */
    static showCourseCompleted(playerEntity: ObbyPlayerEntity, completionTime: string): void {
        console.log('[AnimatedTextExamples] Player completed course');
        
        playerEntity.showSuccess(
            'COURSE COMPLETED!',
            `Time: ${completionTime}`,
            4000  // Show for 4 seconds
        );
    }

    /**
     * Example: Show out of bounds warning
     */
    static showOutOfBounds(playerEntity: ObbyPlayerEntity): void {
        console.log('[AnimatedTextExamples] Player went out of bounds');
        
        playerEntity.showWarning(
            'OUT OF BOUNDS!',
            'Returning to checkpoint...',
            2000
        );
    }

    /**
     * Example: Show course failed message
     */
    static showCourseFailed(playerEntity: ObbyPlayerEntity, reason: string): void {
        console.log(`[AnimatedTextExamples] Player failed course: ${reason}`);
        
        playerEntity.showWarning(
            'COURSE FAILED!',
            reason,
            3000
        );
    }

    /**
     * Example: Show custom achievement message
     */
    static showAchievement(playerEntity: ObbyPlayerEntity, achievementName: string): void {
        console.log(`[AnimatedTextExamples] Player earned achievement: ${achievementName}`);
        
        playerEntity.showSuccess(
            'ACHIEVEMENT!',
            achievementName,
            3000
        );
    }

    /**
     * Example: Show custom message with specific style
     */
    static showCustomMessage(
        playerEntity: ObbyPlayerEntity, 
        line1: string, 
        line2: string = '',
        style: 'default' | 'success' | 'warning' | 'countdown' = 'default'
    ): void {
        console.log(`[AnimatedTextExamples] Showing custom message: ${line1}`);
        
        playerEntity.showAnimatedText(line1, line2, 3000, style);
    }

    /**
     * Example: Integration with course system
     */
    static handleCourseEvents(playerEntity: ObbyPlayerEntity, eventType: string, data: any): void {
        switch (eventType) {
            case 'course_start':
                this.startCourseCountdown(playerEntity);
                break;
                
            case 'checkpoint_reached':
                this.showCheckpointReached(playerEntity, data.checkpointNumber);
                break;
                
            case 'course_completed':
                this.showCourseCompleted(playerEntity, data.completionTime);
                break;
                
            case 'out_of_bounds':
                this.showOutOfBounds(playerEntity);
                break;
                
            case 'course_failed':
                this.showCourseFailed(playerEntity, data.reason);
                break;
                
            case 'achievement_earned':
                this.showAchievement(playerEntity, data.achievementName);
                break;
                
            default:
                console.warn(`[AnimatedTextExamples] Unknown event type: ${eventType}`);
        }
    }

    /**
     * Example: Multiplayer announcement (showing to all players)
     * Note: This would require a broadcast system similar to UIBridge.broadcastAnimatedText()
     */
    static broadcastAnnouncement(players: ObbyPlayerEntity[], message: string, subtitle: string = ''): void {
        console.log(`[AnimatedTextExamples] Broadcasting announcement to ${players.length} players`);
        
        players.forEach(playerEntity => {
            playerEntity.showAnimatedText(message, subtitle, 4000, 'success');
        });
    }
}

/**
 * Example of how to integrate with your existing course system
 */
export class CourseManager {
    private playerEntities: Map<string, ObbyPlayerEntity> = new Map();

    addPlayer(playerId: string, playerEntity: ObbyPlayerEntity): void {
        this.playerEntities.set(playerId, playerEntity);
    }

    removePlayer(playerId: string): void {
        this.playerEntities.delete(playerId);
    }

    /**
     * Start a course for a player with countdown
     */
    async startCourse(playerId: string): Promise<void> {
        const playerEntity = this.playerEntities.get(playerId);
        if (!playerEntity) {
            console.warn(`[CourseManager] Player entity not found: ${playerId}`);
            return;
        }

        // Show countdown before starting
        await AnimatedTextExamples.startCourseCountdown(playerEntity);
        
        // Now start the actual course logic
        this.beginCourseGameplay(playerId);
    }

    /**
     * Handle player reaching checkpoint
     */
    onCheckpointReached(playerId: string, checkpointNumber: number): void {
        const playerEntity = this.playerEntities.get(playerId);
        if (playerEntity) {
            AnimatedTextExamples.showCheckpointReached(playerEntity, checkpointNumber);
        }
    }

    /**
     * Handle course completion
     */
    onCourseCompleted(playerId: string, completionTime: number): void {
        const playerEntity = this.playerEntities.get(playerId);
        if (playerEntity) {
            const timeString = this.formatTime(completionTime);
            AnimatedTextExamples.showCourseCompleted(playerEntity, timeString);
        }
    }

    private beginCourseGameplay(playerId: string): void {
        // Your existing course start logic here
        console.log(`[CourseManager] Starting course gameplay for ${playerId}`);
    }

    private formatTime(milliseconds: number): string {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
} 