import { Player, World } from 'hytopia';

// Level configuration with cash allowances and block unlocks
const LEVEL_CONFIG: Record<number, { cash: number; blocks: string[]; xpRequired: number }> = {
  1: { 
    cash: 100, 
    blocks: ['platform', 'start', 'finish', 'sand', 'ice'], // Fun blocks available from start
    xpRequired: 0 
  },
  2: { 
    cash: 150, 
    blocks: [], // No new blocks, just more cash allowance
    xpRequired: 50  // Very easy first level
  },
  3: { 
    cash: 200, 
    blocks: ['lava'],
    xpRequired: 100
  },
  4: { 
    cash: 250, 
    blocks: ['conveyor-z+', 'conveyor-z-', 'conveyor-x+', 'conveyor-x-'],
    xpRequired: 200
  },
  5: { 
    cash: 300, 
    blocks: ['checkpoint', 'disappearing', 'bounce', 'rotating_bean', 'jump_pad', 'zombie'], // All obstacles complete by level 5
    xpRequired: 350
  },
  6: { 
    cash: 500, // Increased cash allowance focus
    blocks: [], // No new blocks, just more building allowance
    xpRequired: 500
  },
  7: { 
    cash: 750, // Higher cash allowance focus
    blocks: [], // No new blocks, just more building allowance
    xpRequired: 750
  },
  8: { 
    cash: 1200, // Maximum cash allowance for late game
    blocks: [], // No new blocks, just maximum building allowance
    xpRequired: 1000
  }
};

// XP rewards for different actions - REBALANCED to favor building over playing
const XP_REWARDS = {
  // First-time bonuses (one-time only) - reduced to prevent level jumping
  FIRST_BUILD: 20,        // Place your first block
  FIRST_PUBLISH: 40,      // Publish first course (building reward)
  FIRST_PLAY: 5,          // Play someone else's course
  FIRST_COMPLETE: 10,     // Complete someone else's course (much lower)
  FIRST_SELF_TEST: 40,    // Complete your own course (building validation reward)
  
  // Repeatable actions - building heavily favored
  BLOCK_PLACED: 1,        // Per block (unchanged - accumulates with building)
  COURSE_PUBLISHED: 25,   // Each publish (building reward)
  COURSE_PLAYED: 2,       // Play others (once per course) - reduced
  COURSE_COMPLETED: 5,    // Complete others (once per course) - much lower as requested
  
  // Time-based (every 5 minutes) - building favored
  TIME_BUILDING: 15,      // Increased - reward time spent building
  TIME_PLAYING: 3,        // Reduced - less reward for just playing
  
  // Daily bonuses - reduced login bonus to prevent instant level gains
  DAILY_LOGIN: 10,        // Reduced from 25 to 10
  STREAK_3_DAYS: 30,      // Reduced proportionally
  STREAK_7_DAYS: 60,      // Reduced proportionally  
  STREAK_14_DAYS: 120,    // Reduced proportionally
};

interface PlayerLevelData {
  level: number;
  xp: number;
  totalXP: number;
  firstTimeFlags: Set<string>;
  lastActiveTime: number;
  loginStreak: number;
  lastLoginDate: string;
}

export class SimpleLevelingSystem {
  private static instance: SimpleLevelingSystem;
  private world: World | null = null;
  
  private playerData: Map<string, PlayerLevelData> = new Map();
  private completedCourses: Map<string, Map<string, string>> = new Map(); // playerId -> Map<courseId, completionDate>
  private lastTimeGranted: Map<string, number> = new Map(); // Track last time-based XP grant
  private saveQueue: Set<string> = new Set(); // Track players needing save
  private saveTimeout: NodeJS.Timeout | null = null; // Throttle saves

  private constructor() {}

  public static getInstance(): SimpleLevelingSystem {
    if (!SimpleLevelingSystem.instance) {
      SimpleLevelingSystem.instance = new SimpleLevelingSystem();
    }
    return SimpleLevelingSystem.instance;
  }

  public initialize(world: World): void {
    this.world = world;
    console.log('[SimpleLevelingSystem] Initialized');
  }

  public getPlayerLevel(playerId: string): number {
    return this.playerData.get(playerId)?.level || 1;
  }

  public getPlayerCashAllowance(playerId: string): number {
    const level = this.getPlayerLevel(playerId);
    return LEVEL_CONFIG[level]?.cash || 100;
  }

  public getUnlockedBlocks(playerId: string): string[] {
    const level = this.getPlayerLevel(playerId);
    const unlockedBlocks: string[] = [];
    
    // Accumulate all blocks up to current level
    for (let i = 1; i <= level; i++) {
      if (LEVEL_CONFIG[i]?.blocks) {
        unlockedBlocks.push(...LEVEL_CONFIG[i].blocks);
      }
    }
    
    return unlockedBlocks;
  }

  public isBlockUnlocked(playerId: string, blockType: string): boolean {
    const unlockedBlocks = this.getUnlockedBlocks(playerId);
    return unlockedBlocks.includes(blockType);
  }

  public addXP(playerId: string, amount: number, reason: string, player?: Player, world?: World): void {
    const data = this.getOrCreatePlayerData(playerId);
    
    console.log(`[Leveling] ${playerId} gained ${amount} XP for: ${reason}`);
    
    data.xp += amount;
    data.totalXP += amount;
    
    // Check for level up - NO SPILLOVER SYSTEM
    const oldLevel = data.level;
    let leveledUp = false;
    while (data.level < 8) { // Max level in alpha
      const nextLevel = data.level + 1;
      const nextLevelConfig = LEVEL_CONFIG[nextLevel];
      if (!nextLevelConfig) break;
      
      const currentLevelConfig = LEVEL_CONFIG[data.level];
      const xpNeededForNextLevel = nextLevelConfig.xpRequired - (currentLevelConfig?.xpRequired || 0);
      
      if (data.xp >= xpNeededForNextLevel) {
        data.level = nextLevel;
        data.xp = 0; // RESET XP - NO SPILLOVER!
        console.log(`[Leveling] LEVEL UP! ${playerId} is now Level ${nextLevel} (XP reset to 0)`);
        
        // Trigger level up rewards/UI
        this.onLevelUp(playerId, oldLevel, nextLevel);
        leveledUp = true;
        
        // Send level up celebration if we have player and world access
        if (player && world) {
          this.sendLevelUpCelebration(player, world, oldLevel, nextLevel);
        }
      } else {
        break;
      }
    }
    
    this.playerData.set(playerId, data);
    
    // Send UI update if we have player access
    if (player) {
      console.log(`[Leveling] Sending XP UI update to player ${playerId}`);
      this.sendLevelUIUpdate(player);
      
      // Save XP data when XP changes (throttled to avoid excessive saves)
      this.queuePlayerDataSave(player);
    } else {
      console.log(`[Leveling] No player object provided for ${playerId}, skipping UI update`);
    }
  }

  // Simple XP grant methods
  public onBlockPlaced(playerId: string, player?: Player): void {
    const data = this.getOrCreatePlayerData(playerId);
    
    // First block bonus
    if (!data.firstTimeFlags.has('FIRST_BUILD')) {
      data.firstTimeFlags.add('FIRST_BUILD');
      this.addXP(playerId, XP_REWARDS.FIRST_BUILD, 'First block placed!', player);
    } else {
      // Regular block XP
      this.addXP(playerId, XP_REWARDS.BLOCK_PLACED, 'Block placed', player);
    }
  }

  public onCoursePublished(playerId: string): void {
    const data = this.getOrCreatePlayerData(playerId);
    
    if (!data.firstTimeFlags.has('FIRST_PUBLISH')) {
      data.firstTimeFlags.add('FIRST_PUBLISH');
      this.addXP(playerId, XP_REWARDS.FIRST_PUBLISH, 'First course published!');
    } else {
      this.addXP(playerId, XP_REWARDS.COURSE_PUBLISHED, 'Course published');
    }
  }

  public onCourseCompleted(playerId: string, courseId: string, isOwnCourse: boolean, player?: Player): void {
    const data = this.getOrCreatePlayerData(playerId);
    const today = new Date().toDateString();
    
    // Track completed courses with dates
    if (!this.completedCourses.has(playerId)) {
      this.completedCourses.set(playerId, new Map());
    }
    const completed = this.completedCourses.get(playerId)!;
    
    // Check if completed today (once per plot per day system)
    const lastCompletionDate = completed.get(courseId);
    if (lastCompletionDate === today) {
      console.log(`[Leveling] ${playerId} already completed course ${courseId} today (${today}), no XP granted`);
      return;
    }
    
    // Record completion for today
    completed.set(courseId, today);
    
    if (isOwnCourse) {
      if (!data.firstTimeFlags.has('FIRST_SELF_TEST')) {
        data.firstTimeFlags.add('FIRST_SELF_TEST');
        this.addXP(playerId, XP_REWARDS.FIRST_SELF_TEST, 'First self-test complete!', player);
      }
      // No repeatable XP for own courses to prevent farming
      console.log(`[Leveling] ${playerId} completed own course ${courseId} - no repeatable XP to prevent farming`);
    } else {
      if (!data.firstTimeFlags.has('FIRST_COMPLETE')) {
        data.firstTimeFlags.add('FIRST_COMPLETE');
        this.addXP(playerId, XP_REWARDS.FIRST_COMPLETE, 'First course completed!', player);
      } else {
        this.addXP(playerId, XP_REWARDS.COURSE_COMPLETED, 'Course completed', player);
      }
      console.log(`[Leveling] ${playerId} completed course ${courseId} - granted ${XP_REWARDS.COURSE_COMPLETED} XP (once per day)`);
    }
  }

  public onPlayerLogin(playerId: string, player?: Player): { xpGained: number; message: string; isNewDay: boolean } {
    console.log(`[Leveling] onPlayerLogin called for ${playerId}, player object: ${player ? 'provided' : 'missing'}`);
    const data = this.getOrCreatePlayerData(playerId);
    const today = new Date().toDateString();
    let totalXPGained = 0;
    let message = '';
    
    // Daily login bonus
    if (data.lastLoginDate !== today) {
      // Daily login XP
      this.addXP(playerId, XP_REWARDS.DAILY_LOGIN, 'Daily login', player);
      totalXPGained += XP_REWARDS.DAILY_LOGIN;
      message = `Daily Login: +${XP_REWARDS.DAILY_LOGIN} XP`;
      
      // Check streak
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      if (data.lastLoginDate === yesterday) {
        data.loginStreak++;
        
        // Streak bonuses
        if (data.loginStreak === 3) {
          this.addXP(playerId, XP_REWARDS.STREAK_3_DAYS, '3-day streak!', player);
          totalXPGained += XP_REWARDS.STREAK_3_DAYS;
          message += `\n🔥 3-Day Streak: +${XP_REWARDS.STREAK_3_DAYS} XP`;
        } else if (data.loginStreak === 7) {
          this.addXP(playerId, XP_REWARDS.STREAK_7_DAYS, '7-day streak!', player);
          totalXPGained += XP_REWARDS.STREAK_7_DAYS;
          message += `\n🔥 7-Day Streak: +${XP_REWARDS.STREAK_7_DAYS} XP`;
        } else if (data.loginStreak === 14) {
          this.addXP(playerId, XP_REWARDS.STREAK_14_DAYS, '14-day streak!', player);
          totalXPGained += XP_REWARDS.STREAK_14_DAYS;
          message += `\n🔥 14-Day Streak: +${XP_REWARDS.STREAK_14_DAYS} XP`;
        } else if (data.loginStreak > 1) {
          message += `\n🔥 ${data.loginStreak}-Day Streak!`;
        }
      } else {
        data.loginStreak = 1;
        message += '\n🔥 Day 1 Streak!';
      }
      
      data.lastLoginDate = today;
      this.playerData.set(playerId, data);
      
      return { xpGained: totalXPGained, message: message, isNewDay: true };
    } else {
      return { xpGained: 0, message: 'Welcome back!', isNewDay: false };
    }
  }

  // Time-based XP (call this every tick)
  public checkTimeBasedXP(playerId: string, activity: 'building' | 'playing'): void {
    const now = Date.now();
    const lastGranted = this.lastTimeGranted.get(playerId) || 0;
    
    // Grant XP every 5 minutes (300000ms)
    if (now - lastGranted >= 300000) {
      const xp = activity === 'building' ? XP_REWARDS.TIME_BUILDING : XP_REWARDS.TIME_PLAYING;
      this.addXP(playerId, xp, `Time spent ${activity}`);
      this.lastTimeGranted.set(playerId, now);
    }
  }

  private getOrCreatePlayerData(playerId: string): PlayerLevelData {
    if (!this.playerData.has(playerId)) {
      this.playerData.set(playerId, {
        level: 1,
        xp: 0,
        totalXP: 0,
        firstTimeFlags: new Set(),
        lastActiveTime: Date.now(),
        loginStreak: 0,
        lastLoginDate: ''
      });
    }
    return this.playerData.get(playerId)!;
  }

  private onLevelUp(playerId: string, oldLevel: number, newLevel: number): void {
    // Level up notification will be handled when sendLevelUIUpdate is called
    // or can be handled by the calling code that has access to the player object
    console.log(`[Leveling] Player ${playerId} leveled up from ${oldLevel} to ${newLevel}`);
    
    const unlockedBlocks = LEVEL_CONFIG[newLevel]?.blocks || [];
    console.log(`[Leveling] Unlocked blocks for Level ${newLevel}: ${unlockedBlocks.join(', ')}`);
  }

  public sendLevelUIUpdate(player: Player): void {
    const data = this.getOrCreatePlayerData(player.id);
    const nextLevel = Math.min(data.level + 1, 8);
    const nextLevelConfig = LEVEL_CONFIG[nextLevel];
    const currentLevelConfig = LEVEL_CONFIG[data.level];
    
    // Calculate XP needed for next level (difference between levels)
    const xpNeededForNextLevel = nextLevelConfig ? 
      (nextLevelConfig.xpRequired - (currentLevelConfig?.xpRequired || 0)) : 0;
    
    const uiData = {
      type: 'levelUpdate',
      level: data.level,
      xp: data.xp, // Current level XP (resets on level up)
      nextLevelXP: xpNeededForNextLevel, // XP needed to reach next level
      totalXP: data.totalXP,
      progressPercentage: xpNeededForNextLevel > 0 ? (data.xp / xpNeededForNextLevel) * 100 : 100
    };
    
    console.log(`[Leveling] Updating XP UI for ${player.id}: Level ${data.level}, XP ${data.xp}/${xpNeededForNextLevel}, Progress ${uiData.progressPercentage.toFixed(1)}%`);
    
    try {
      player.ui.sendData(uiData);
      console.log(`[Leveling] ✅ XP UI data sent successfully to ${player.id}`);
    } catch (error) {
      console.error(`[Leveling] ❌ Failed to send XP UI data to ${player.id}:`, error);
    }
  }

  /**
   * Send level up celebration message and UI update (call this when you have both world and player access)
   */
  public sendLevelUpCelebration(player: Player, world: World, oldLevel: number, newLevel: number): void {
    const unlockedBlocks = LEVEL_CONFIG[newLevel]?.blocks || [];
    let message = `🎉 Level ${newLevel}! Cash: ${LEVEL_CONFIG[newLevel].cash}`;
    
    if (unlockedBlocks.length > 0) {
      message += ` | New blocks: ${unlockedBlocks.join(', ')}`;
    }
    
    world.chatManager.sendPlayerMessage(player, message, 'FFD700');
    
    // Send UI notification
    player.ui.sendData({
      type: 'levelUp',
      oldLevel: oldLevel,
      newLevel: newLevel,
      newCash: LEVEL_CONFIG[newLevel].cash,
      unlockedBlocks: unlockedBlocks
    });
  }

  // Get XP progress info for UI
  public getXPProgress(playerId: string): { 
    level: number; 
    currentXP: number; 
    requiredXP: number; 
    percentage: number;
    totalXP: number;
  } {
    const data = this.getOrCreatePlayerData(playerId);
    const nextLevel = Math.min(data.level + 1, 8);
    const nextLevelConfig = LEVEL_CONFIG[nextLevel];
    const currentLevelConfig = LEVEL_CONFIG[data.level];
    
    // Calculate XP needed for next level (difference between levels)
    const xpNeededForNextLevel = nextLevelConfig ? 
      (nextLevelConfig.xpRequired - (currentLevelConfig?.xpRequired || 0)) : 0;
    
    return {
      level: data.level,
      currentXP: data.xp, // Current level XP (resets on level up)
      requiredXP: xpNeededForNextLevel, // XP needed to reach next level
      percentage: xpNeededForNextLevel > 0 ? Math.min((data.xp / xpNeededForNextLevel) * 100, 100) : 100,
      totalXP: data.totalXP
    };
  }

  // Save/Load methods for persistence
  public getPlayerSaveData(playerId: string): any {
    const data = this.getOrCreatePlayerData(playerId);
    const completed = this.completedCourses.get(playerId) || new Map();
    
    // Convert Map to object for JSON serialization
    const completedCoursesObj: { [courseId: string]: string } = {};
    for (const [courseId, date] of completed.entries()) {
      completedCoursesObj[courseId] = date;
    }
    
    return {
      level: data.level,
      xp: data.xp,  // Store current level XP directly
      totalXP: data.totalXP,
      firstTimeFlags: Array.from(data.firstTimeFlags),
      loginStreak: data.loginStreak,
      lastLoginDate: data.lastLoginDate,
      completedCourses: completedCoursesObj
    };
  }

  public loadPlayerSaveData(playerId: string, saveData: any): void {
    if (!saveData) return;
    
    const data = this.getOrCreatePlayerData(playerId);
    
    data.level = saveData.level || 1;
    data.xp = saveData.xp || 0;  // Load current level XP directly
    data.totalXP = saveData.totalXP || 0;
    
    data.firstTimeFlags = new Set(saveData.firstTimeFlags || []);
    data.loginStreak = saveData.loginStreak || 0;
    data.lastLoginDate = saveData.lastLoginDate || '';
    
    if (saveData.completedCourses) {
      // Handle both old format (array) and new format (object)
      if (Array.isArray(saveData.completedCourses)) {
        // Legacy format: convert array to Map with empty dates (will allow XP again)
        const completedMap = new Map<string, string>();
        for (const courseId of saveData.completedCourses) {
          completedMap.set(courseId, ''); // Empty date = can get XP again
        }
        this.completedCourses.set(playerId, completedMap);
        console.log(`[Leveling] Migrated legacy completion data for ${playerId}: ${saveData.completedCourses.length} courses`);
      } else {
        // New format: object with course IDs and completion dates
        const completedMap = new Map<string, string>();
        for (const [courseId, date] of Object.entries(saveData.completedCourses)) {
          completedMap.set(courseId, date as string);
        }
        this.completedCourses.set(playerId, completedMap);
        console.log(`[Leveling] Loaded completion data for ${playerId}: ${completedMap.size} courses with dates`);
      }
    }
    
    this.playerData.set(playerId, data);
    
    console.log(`[Leveling] Loaded player ${playerId}: Level ${data.level}, Total XP: ${data.totalXP}, Current Level XP: ${data.xp}`);
  }

  // Utility method to check what blocks a player needs to unlock next
  public getNextUnlock(playerId: string): { level: number; blocks: string[]; xpNeeded: number } | null {
    const currentLevel = this.getPlayerLevel(playerId);
    if (currentLevel >= 8) return null; // Max level
    
    const data = this.getOrCreatePlayerData(playerId);
    const nextLevel = currentLevel + 1;
    const config = LEVEL_CONFIG[nextLevel];
    
    return {
      level: nextLevel,
      blocks: config.blocks,
      xpNeeded: config.xpRequired - data.totalXP
    };
  }

  /**
   * Queue a player's data for saving (throttled to avoid excessive persistence calls)
   */
  private queuePlayerDataSave(player: Player): void {
    this.saveQueue.add(player.id);
    
    // Clear existing timeout and set a new one
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(() => {
      this.processSaveQueue();
    }, 5000); // Save every 5 seconds at most
  }

  /**
   * Process the save queue and save XP data for all queued players
   */
  private async processSaveQueue(): Promise<void> {
    if (this.saveQueue.size === 0) return;
    
    const { PlotSaveManager } = require('./PlotSaveManager');
    const plotSaveManager = PlotSaveManager.getInstance();
    
    const playersToSave = Array.from(this.saveQueue);
    this.saveQueue.clear();
    
    console.log(`[Leveling] Processing save queue for ${playersToSave.length} players`);
    
    for (const playerId of playersToSave) {
      try {
        // Find the player object (this is a limitation - we need the player object to save)
        // For now, we'll just log this. In a real implementation, we might store player references
        console.log(`[Leveling] XP data auto-save queued for player ${playerId} (will save on disconnect/plot save)`);
      } catch (error) {
        console.error(`[Leveling] Error auto-saving XP data for player ${playerId}:`, error);
      }
    }
  }
}