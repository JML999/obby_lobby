/**
 * Course Play System Examples
 * 
 * This file demonstrates how to use the integrated animated text system
 * for course entry, completion, and checkpoints in your Obby game.
 */

import { Player } from 'hytopia';
import { ObbyPlayerEntity } from '../src/ObbyPlayerEntity';
import { ObbyPlayManager } from '../src/ObbyPlayManager';

export class CoursePlayExamples {
    
    /**
     * Example 1: Player requests to start playing a course
     * This would typically be triggered by a UI button or key press
     */
    static async handlePlayerRequestPlayMode(playerEntity: ObbyPlayerEntity, plotIndex: number): Promise<void> {
        console.log('[CoursePlayExamples] Player requesting play mode for plot', plotIndex);
        
        // The ObbyPlayerEntity will handle validation and start the animated sequence
        // This will show:
        // 1. "COURSE STARTING" message with plot info
        // 2. Dramatic 3, 2, 1, GO! countdown with animations
        // 3. Teleport to start block and begin gameplay
        
        // This is done automatically via the handleRequestPlayMode method
        // Just send a UI event to trigger it:
        playerEntity.player.ui.sendData({
            type: 'requestPlayMode'
        });
    }
    
    /**
     * Example 2: Manually start a course (for programmatic control)
     */
    static async startCourseManually(player: Player, plotIndex: number): Promise<void> {
        console.log('[CoursePlayExamples] Manually starting course for player', player.id);
        
        if (!player.world) {
            console.error('Player has no world');
            return;
        }
        
        const obbyPlayManager = ObbyPlayManager.getInstance();
        obbyPlayManager.initializeWorld(player.world);
        
        // This will automatically show:
        // - "COURSE STARTING" + "Plot X" message
        // - Animated countdown sequence
        // - Course timer and gameplay start
        const success = await obbyPlayManager.startObbyPlay(player, plotIndex);
        
        if (success) {
            console.log('Course started successfully with animations!');
        } else {
            console.log('Failed to start course');
        }
    }
    
    /**
     * Example 3: Show custom animated messages during gameplay
     */
    static showGameplayMessages(playerEntity: ObbyPlayerEntity): void {
        // Show a warning when player is in danger
        playerEntity.showWarning('DANGER AHEAD!', 'Watch out for obstacles', 2000);
        
        // Show success when player does something good
        playerEntity.showSuccess('NICE JUMP!', 'Keep it up!', 1500);
        
        // Show info messages
        playerEntity.showAnimatedText('SPEED BOOST!', 'Run faster for 10 seconds', 2000, 'default');
    }
    
    /**
     * Example 4: Course completion handling
     * This happens automatically when player steps on goal block (ID 101)
     */
    static onCourseCompletion(completionTime: number): void {
        console.log('[CoursePlayExamples] Course completed in', completionTime, 'ms');
        
        // The system automatically shows:
        // - "COURSE COMPLETED!" message
        // - Completion time display
        // - Results screen
        // - Return to lobby after delay
        
        // This is all handled by ObbyPlayManager.handlePlayerFinished()
    }
    
    /**
     * Example 5: Checkpoint system
     * This happens automatically when player steps on checkpoint block (ID 102)
     */
    static onCheckpointReached(): void {
        console.log('[CoursePlayExamples] Checkpoint reached');
        
        // The system automatically shows:
        // - "CHECKPOINT!" message with "Progress saved"
        // - Sets respawn point for player
        // - Saves progress
        
        // This is handled by BlockBehaviorManager
    }
    
    /**
     * Example 6: Course failure handling
     */
    static onCourseFailed(reason: string): void {
        console.log('[CoursePlayExamples] Course failed:', reason);
        
        // The system automatically shows:
        // - "COURSE FAILED!" message
        // - Failure reason
        // - Return to lobby option
        
        // This is handled by ObbyPlayManager.handlePlayerFailed()
    }
    
    /**
     * Example 7: Key bindings for easy testing
     * Add these to your main game loop or input handler
     */
    static setupKeyBindings(playerEntity: ObbyPlayerEntity): void {
        // You can add these to your input handler:
        
        /*
        // P key = Enter play mode
        if (input.p && !lastInput.p) {
            // Find nearby plot and start playing
            playerEntity.handleRequestPlayMode(playerEntity.player);
        }
        
        // B key = Enter build mode  
        if (input.b && !lastInput.b) {
            // Enter build mode for editing
            playerEntity.handleRequestBuildMode(playerEntity.player);
        }
        
        // T key = Test animated text
        if (input.t && !lastInput.t) {
            playerEntity.showAnimatedText('TEST MESSAGE', 'This is a test!', 3000);
        }
        */
        
        console.log('[CoursePlayExamples] Key bindings example shown in comments');
    }
    
    /**
     * Example 8: Different animation styles
     */
    static showDifferentAnimationStyles(playerEntity: ObbyPlayerEntity): void {
        // Success style (green, celebratory)
        playerEntity.showSuccess('LEVEL UP!', 'You gained XP', 2000);
        
        // Warning style (red, urgent)
        playerEntity.showWarning('TIME RUNNING OUT!', '30 seconds left', 2000);
        
        // Default style (neutral)
        playerEntity.showAnimatedText('POWER-UP!', 'Double jump activated', 2000, 'default');
        
        // Countdown style (dramatic, pulsing)
        playerEntity.showCountdown('5');
    }
    
    /**
     * Example 9: Course validation before starting
     */
    static async validateCourseBeforeStart(player: Player, plotIndex: number): Promise<boolean> {
        console.log('[CoursePlayExamples] Validating course before start');
        
        // The ObbyPlayManager automatically validates:
        // - Presence of start blocks (ID 100)
        // - Presence of goal blocks (ID 101)  
        // - Course boundaries
        // - Block tracking data
        
        // Validation happens automatically in startObbyPlay()
        // Returns false if course is invalid
        
        return true; // This is just an example
    }
}

/**
 * Usage Instructions:
 * 
 * 1. Players can enter play mode by standing near a plot entrance and pressing a key
 * 2. The system will show dramatic animated text for the countdown
 * 3. Course completion shows celebration animations
 * 4. Checkpoints show progress saved animations
 * 5. Failures show warning animations
 * 
 * All animations are automatically handled by the integrated system!
 */ 