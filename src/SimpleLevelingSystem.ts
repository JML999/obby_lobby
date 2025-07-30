import { Player, World } from 'hytopia';
import { MessageManager } from './MessageManager';

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
  private messageManager: MessageManager = new MessageManager();
  
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
    console.log('[SimpleLevelingSystem] Initialized with world:', world.name);
  }

  /**
   * Get or create player data with defaults
   */
  private getOrCreatePlayerData(playerId: string): PlayerLevelData {
    if (!this.playerData.has(playerId)) {
      // Create default data - will be replaced by loadPlayerData if persisted data exists
      this.playerData.set(playerId, {
        level: 1,
        xp: 0,
        totalXP: 0,
        firstTimeFlags: new Set(),
        lastActiveTime: Date.now(),
        loginStreak: 1,
        lastLoginDate: new Date().toDateString()
      });
      console.log(`[SimpleLevelingSystem] Created new player data for ${playerId}`);
    }
    return this.playerData.get(playerId)!;
  }

  /**
   * Load player data from persistence - COMPLETELY REWRITTEN
   */
  public async loadPlayerData(player: Player): Promise<void> {
    console.log(`[SimpleLevelingSystem] Loading persisted data for player ${player.id}...`);
    
    try {
      const persistedData = await player.getPersistedData();
      console.log(`[SimpleLevelingSystem] Raw persisted data for ${player.id}:`, JSON.stringify(persistedData, null, 2));
      
      let level = 1;
      let xp = 0;
      let totalXP = 0;
      
      // Check multiple possible locations for level data
      if (persistedData) {
        // PRIORITY 1: Check obby.levelData (where the real data is!)
        if (persistedData.obby && persistedData.obby.levelData) {
          console.log(`[SimpleLevelingSystem] 🎯 Found obby.levelData (REAL DATA):`, persistedData.obby.levelData);
          level = persistedData.obby.levelData.level || 1;
          xp = persistedData.obby.levelData.xp || 0;
          totalXP = persistedData.obby.levelData.totalXP || 0;
        }
        // PRIORITY 2: Check if levelData exists
        else if (persistedData.levelData) {
          console.log(`[SimpleLevelingSystem] Found levelData:`, persistedData.levelData);
          level = persistedData.levelData.level || 1;
          xp = persistedData.levelData.xp || 0;
          totalXP = persistedData.levelData.totalXP || 0;
        }
        // PRIORITY 3: Check if it's stored under a different key
        else if (persistedData.level !== undefined) {
          console.log(`[SimpleLevelingSystem] Found level in root:`, persistedData.level);
          level = persistedData.level;
          xp = persistedData.xp || 0;
          totalXP = persistedData.totalXP || 0;
        }
        // PRIORITY 4: Check if it's stored under player data
        else if (persistedData.playerData) {
          console.log(`[SimpleLevelingSystem] Found playerData:`, persistedData.playerData);
          level = persistedData.playerData.level || 1;
          xp = persistedData.playerData.xp || 0;
          totalXP = persistedData.playerData.totalXp || 0;
        }
      }
      
      console.log(`[SimpleLevelingSystem] Extracted values for ${player.id}: Level ${level}, XP ${xp}, Total ${totalXP}`);
      
      // Create the player data object
      const playerData: PlayerLevelData = {
        level,
        xp,
        totalXP,
        firstTimeFlags: new Set(),
        lastActiveTime: Date.now(),
        loginStreak: 1,
        lastLoginDate: new Date().toDateString()
      };
      
      // Force cache the loaded data
      this.playerData.set(player.id, playerData);
      console.log(`[SimpleLevelingSystem] ✅ LOADED AND CACHED: Player ${player.id} - Level ${level}, XP ${xp}, Total ${totalXP}`);
      
    } catch (error) {
      console.error(`[SimpleLevelingSystem] ❌ Error loading player data for ${player.id}:`, error);
    }
  }

  /**
   * Add XP to a player and handle level ups
   */
  public addXP(playerId: string, amount: number, player?: Player): boolean {
    const data = this.getOrCreatePlayerData(playerId);
    const oldLevel = data.level;
    
    data.xp += amount;
    data.totalXP += amount;
    data.lastActiveTime = Date.now();
    
    console.log(`[SimpleLevelingSystem] Added ${amount} XP to player ${playerId}. Total: ${data.totalXP}, Current Level XP: ${data.xp}`);
    
    // Check for level up
    const leveledUp = this.checkLevelUp(data);
    
    if (leveledUp && player) {
      console.log(`[SimpleLevelingSystem] Player ${playerId} leveled up from ${oldLevel} to ${data.level}!`);
      
      // Send level up celebration
      try {
        player.ui.sendData({
          type: 'levelUp',
          oldLevel: oldLevel,
          newLevel: data.level,
          newCash: LEVEL_CONFIG[data.level]?.cash || 100,
          unlockedBlocks: LEVEL_CONFIG[data.level]?.blocks || []
        });
      } catch (error) {
        console.error(`[SimpleLevelingSystem] Failed to send level up UI data:`, error);
      }
      
      // Send achievement popup for level up using MessageManager
      try {
        const unlockedBlocks = LEVEL_CONFIG[data.level]?.blocks || [];
        const bonusText = unlockedBlocks.length > 0 ? 
          `New blocks: ${unlockedBlocks.join(', ')}` : 
          `Cash allowance: ${LEVEL_CONFIG[data.level]?.cash || 100}`;
          
        this.messageManager.sendRichGameMessage(
          `🎉 Level ${data.level} Unlocked!`,
          player,
          {
            bonus: bonusText,
            duration: 4000
          }
        );
      } catch (error) {
        console.error(`[SimpleLevelingSystem] Failed to send level up achievement popup:`, error);
      }
    }
    
    // Always send XP update to UI
    if (player) {
      this.sendXPUIUpdate(player, data);
    }
    
    // Queue for save
    this.queuePlayerForSave(playerId);
    
    return leveledUp;
  }

  /**
   * Check if player should level up and handle the level up
   */
  private checkLevelUp(data: PlayerLevelData): boolean {
    const nextLevel = data.level + 1;
    const nextLevelConfig = LEVEL_CONFIG[nextLevel];
    
    if (!nextLevelConfig) {
      // Player is at max level
      return false;
    }
    
    const currentLevelConfig = LEVEL_CONFIG[data.level];
    const xpNeededForNextLevel = nextLevelConfig.xpRequired - (currentLevelConfig?.xpRequired || 0);
    
    if (data.xp >= xpNeededForNextLevel) {
      // Level up!
      data.level = nextLevel;
      data.xp = data.xp - xpNeededForNextLevel; // Carry over excess XP
      
      console.log(`[SimpleLevelingSystem] Level up! New level: ${data.level}, Remaining XP: ${data.xp}`);
      return true;
    }
    
    return false;
  }

  /**
   * Send XP and level data to player's UI
   */
  private sendXPUIUpdate(player: Player, data: PlayerLevelData): void {
    const nextLevel = Math.min(data.level + 1, 8);
    const nextLevelConfig = LEVEL_CONFIG[nextLevel];
    const currentLevelConfig = LEVEL_CONFIG[data.level];
    
    // Calculate XP needed for next level
    const xpNeededForNextLevel = nextLevelConfig ? 
      (nextLevelConfig.xpRequired - (currentLevelConfig?.xpRequired || 0)) : 0;
    
    const progressPercentage = xpNeededForNextLevel > 0 ? 
      Math.min((data.xp / xpNeededForNextLevel) * 100, 100) : 100;
    
    const uiData = {
      type: 'levelUpdate',
      level: data.level,
      currentXP: data.xp,
      nextLevelXP: xpNeededForNextLevel,
      totalXP: data.totalXP,
      progressPercentage: progressPercentage,
      cash: LEVEL_CONFIG[data.level]?.cash || 100,
      unlockedBlocks: this.getUnlockedBlocks(data.level)
    };
    
    console.log(`[SimpleLevelingSystem] Updating XP UI for ${player.id}: Level ${data.level}, XP ${data.xp}/${xpNeededForNextLevel}, Progress ${uiData.progressPercentage.toFixed(1)}%`);
    
    try {
      player.ui.sendData(uiData);
      console.log(`[SimpleLevelingSystem] ✅ XP UI data sent successfully to ${player.id}`);
    } catch (error) {
      console.error(`[SimpleLevelingSystem] ❌ Failed to send XP UI data to ${player.id}:`, error);
    }
  }

  /**
   * Get all unlocked blocks for a given level
   */
  private getUnlockedBlocks(level: number): string[] {
    const unlockedBlocks: string[] = [];
    
    for (let i = 1; i <= level; i++) {
      const levelConfig = LEVEL_CONFIG[i];
      if (levelConfig && levelConfig.blocks) {
        unlockedBlocks.push(...levelConfig.blocks);
      }
    }
    
    return unlockedBlocks;
  }

  /**
   * Check if a specific block type is unlocked for a player
   */
  public isBlockUnlocked(playerId: string, blockTypeName: string): boolean {
    const data = this.getOrCreatePlayerData(playerId);
    const unlockedBlocks = this.getUnlockedBlocks(data.level);
    return unlockedBlocks.includes(blockTypeName);
  }

  /**
   * Get player's current level
   */
  public getPlayerLevel(playerId: string): number {
    const data = this.getOrCreatePlayerData(playerId);
    return data.level;
  }

  /**
   * Get player's current cash allowance based on level
   */
  public getPlayerCashAllowance(playerId: string): number {
    const data = this.getOrCreatePlayerData(playerId);
    return LEVEL_CONFIG[data.level]?.cash || 100;
  }

  /**
   * Handle when a player places their first block
   */
  public onFirstBlockPlaced(playerId: string, player?: Player): void {
    const data = this.getOrCreatePlayerData(playerId);
    
    if (!data.firstTimeFlags.has('FIRST_BUILD')) {
      data.firstTimeFlags.add('FIRST_BUILD');
      this.addXP(playerId, XP_REWARDS.FIRST_BUILD, player);
      console.log(`[SimpleLevelingSystem] First block placed bonus: ${XP_REWARDS.FIRST_BUILD} XP for ${playerId}`);
    }
  }

  /**
   * Handle when a player places any block (repeatable)
   */
  public onBlockPlaced(playerId: string, player?: Player): void {
    this.addXP(playerId, XP_REWARDS.BLOCK_PLACED, player);
  }

  /**
   * Handle when a player publishes their first course
   */
  public onFirstCoursePublished(playerId: string, player?: Player): void {
    const data = this.getOrCreatePlayerData(playerId);
    
    if (!data.firstTimeFlags.has('FIRST_PUBLISH')) {
      data.firstTimeFlags.add('FIRST_PUBLISH');
      this.addXP(playerId, XP_REWARDS.FIRST_PUBLISH, player);
      console.log(`[SimpleLevelingSystem] First course published bonus: ${XP_REWARDS.FIRST_PUBLISH} XP for ${playerId}`);
    }
  }

  /**
   * Handle when a player publishes any course (repeatable)
   */
  public onCoursePublished(playerId: string, player?: Player): void {
    this.addXP(playerId, XP_REWARDS.COURSE_PUBLISHED, player);
  }

  /**
   * Handle when a player completes their own course for the first time
   */
  public onFirstSelfTestCompleted(playerId: string, player?: Player): void {
    const data = this.getOrCreatePlayerData(playerId);
    
    if (!data.firstTimeFlags.has('FIRST_SELF_TEST')) {
      data.firstTimeFlags.add('FIRST_SELF_TEST');
      this.addXP(playerId, XP_REWARDS.FIRST_SELF_TEST, player);
      console.log(`[SimpleLevelingSystem] First self-test completed bonus: ${XP_REWARDS.FIRST_SELF_TEST} XP for ${playerId}`);
    }
  }

  /**
   * Handle when a player plays someone else's course for the first time
   */
  public onFirstCoursePlayStarted(playerId: string, player?: Player): void {
    const data = this.getOrCreatePlayerData(playerId);
    
    if (!data.firstTimeFlags.has('FIRST_PLAY')) {
      data.firstTimeFlags.add('FIRST_PLAY');
      this.addXP(playerId, XP_REWARDS.FIRST_PLAY, player);
      console.log(`[SimpleLevelingSystem] First course play bonus: ${XP_REWARDS.FIRST_PLAY} XP for ${playerId}`);
    }
  }

  /**
   * Handle when a player completes someone else's course for the first time
   */
  public onFirstCourseCompleted(playerId: string, player?: Player): void {
    const data = this.getOrCreatePlayerData(playerId);
    
    if (!data.firstTimeFlags.has('FIRST_COMPLETE')) {
      data.firstTimeFlags.add('FIRST_COMPLETE');
      this.addXP(playerId, XP_REWARDS.FIRST_COMPLETE, player);
      console.log(`[SimpleLevelingSystem] First course completion bonus: ${XP_REWARDS.FIRST_COMPLETE} XP for ${playerId}`);
      
      // Send achievement popup for first completion
      if (player) {
        try {
          this.messageManager.sendRichGameMessage(
            '🎉 First Course Completed!',
            player,
            {
              bonus: `+${XP_REWARDS.FIRST_COMPLETE} XP bonus`,
              duration: 4000
            }
          );
        } catch (error) {
          console.error(`[SimpleLevelingSystem] Failed to send first completion achievement popup:`, error);
        }
      }
    }
  }

  /**
   * Handle when a player completes a specific course (once per course)
   */
  public onCourseCompleted(playerId: string, courseId: string, player?: Player): void {
    if (!this.completedCourses.has(playerId)) {
      this.completedCourses.set(playerId, new Map());
    }
    
    const playerCompletions = this.completedCourses.get(playerId)!;
    
    if (!playerCompletions.has(courseId)) {
      playerCompletions.set(courseId, new Date().toISOString());
      this.addXP(playerId, XP_REWARDS.COURSE_COMPLETED, player);
      console.log(`[SimpleLevelingSystem] Course completion: ${XP_REWARDS.COURSE_COMPLETED} XP for ${playerId} (course: ${courseId})`);
      
      // Send achievement popup for course completion
      if (player) {
        try {
          this.messageManager.sendRichGameMessage(
            '✅ Course Completed!',
            player,
            {
              bonus: `+${XP_REWARDS.COURSE_COMPLETED} XP earned`,
              duration: 3000
            }
          );
        } catch (error) {
          console.error(`[SimpleLevelingSystem] Failed to send course completion achievement popup:`, error);
        }
      }
    }
  }

  /**
   * Grant time-based XP (call every 5 minutes for active players)
   */
  public grantTimeBasedXP(playerId: string, isBuilding: boolean, player?: Player): void {
    const now = Date.now();
    const lastGranted = this.lastTimeGranted.get(playerId) || 0;
    
    // Only grant if it's been at least 5 minutes
    if (now - lastGranted < 5 * 60 * 1000) {
      return;
    }
    
    this.lastTimeGranted.set(playerId, now);
    
    const xpAmount = isBuilding ? XP_REWARDS.TIME_BUILDING : XP_REWARDS.TIME_PLAYING;
    this.addXP(playerId, xpAmount, player);
    
    console.log(`[SimpleLevelingSystem] Time-based XP: ${xpAmount} XP for ${playerId} (${isBuilding ? 'building' : 'playing'})`);
  }

  /**
   * Handle daily login bonuses
   */
  public onPlayerLogin(playerId: string, player?: Player): { xpGained: number; message: string; isNewDay: boolean } {
    const data = this.getOrCreatePlayerData(playerId);
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
    
    if (data.lastLoginDate === today) {
      // Already got today's bonus
      return { xpGained: 0, message: 'Welcome back!', isNewDay: false };
    }
    
    // Check login streak
    if (data.lastLoginDate === yesterday) {
      // Consecutive login
      data.loginStreak++;
    } else {
      // Streak broken or first login
      data.loginStreak = 1;
    }
    
    data.lastLoginDate = today;
    
    // Grant daily bonus
    let bonusXP = XP_REWARDS.DAILY_LOGIN;
    let message = `Daily Login: +${XP_REWARDS.DAILY_LOGIN} XP`;
    
    // Check for streak bonuses
    if (data.loginStreak >= 14) {
      bonusXP += XP_REWARDS.STREAK_14_DAYS;
      message += `\n🔥 14-Day Streak: +${XP_REWARDS.STREAK_14_DAYS} XP`;
    } else if (data.loginStreak >= 7) {
      bonusXP += XP_REWARDS.STREAK_7_DAYS;
      message += `\n🔥 7-Day Streak: +${XP_REWARDS.STREAK_7_DAYS} XP`;
    } else if (data.loginStreak >= 3) {
      bonusXP += XP_REWARDS.STREAK_3_DAYS;
      message += `\n🔥 3-Day Streak: +${XP_REWARDS.STREAK_3_DAYS} XP`;
    } else if (data.loginStreak > 1) {
      message += `\n🔥 ${data.loginStreak}-Day Streak!`;
    }
    
    this.addXP(playerId, bonusXP, player);
    console.log(`[SimpleLevelingSystem] Daily login bonus: ${bonusXP} XP for ${playerId} (streak: ${data.loginStreak})`);
    
    return { xpGained: bonusXP, message: message, isNewDay: true };
  }

  /**
   * Get next unlock information for UI
   */
  public getNextUnlock(playerId: string): { level: number; blocks: string[] } | null {
    const data = this.getOrCreatePlayerData(playerId);
    const nextLevel = data.level + 1;
    const nextLevelConfig = LEVEL_CONFIG[nextLevel];
    
    if (!nextLevelConfig) {
      return null; // Max level reached
    }
    
    return {
      level: nextLevel,
      blocks: nextLevelConfig.blocks
    };
  }

  /**
   * Queue a player for saving (throttled saves)
   */
  private queuePlayerForSave(playerId: string): void {
    this.saveQueue.add(playerId);
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(() => {
      this.saveQueuedPlayers();
    }, 5000); // Save every 5 seconds
  }

  /**
   * Save all queued players
   */
  private async saveQueuedPlayers(): Promise<void> {
    console.log(`[SimpleLevelingSystem] Saving ${this.saveQueue.size} players to persistence`);
    
    const playersToSave = Array.from(this.saveQueue);
    this.saveQueue.clear();
    this.saveTimeout = null;

    for (const playerId of playersToSave) {
      try {
        await this.savePlayerData(playerId);
      } catch (error) {
        console.error(`[SimpleLevelingSystem] Failed to save player ${playerId}:`, error);
      }
    }
  }

  /**
   * Save player data to persistence - COMPLETELY REWRITTEN
   */
  private async savePlayerData(playerId: string): Promise<void> {
    const data = this.playerData.get(playerId);
    if (!data) {
      console.log(`[SimpleLevelingSystem] No data to save for ${playerId}`);
      return;
    }

    if (!this.world) {
      console.log(`[SimpleLevelingSystem] No world available for saving ${playerId}`);
      return;
    }
    
    const allPlayerEntities = this.world.entityManager.getAllPlayerEntities();
    const playerEntity = allPlayerEntities.find(pe => pe.player.id === playerId);
    
    if (!playerEntity) {
      console.log(`[SimpleLevelingSystem] Player ${playerId} not found for saving`);
      return;
    }

    try {
      console.log(`[SimpleLevelingSystem] Saving player ${playerId}: Level ${data.level}, XP ${data.xp}, Total ${data.totalXP}`);
      
      // Save the data in multiple locations to ensure it's found
      const saveData = {
        level: data.level,
        xp: data.xp,
        totalXP: data.totalXP,
        firstTimeFlags: Array.from(data.firstTimeFlags),
        lastActiveTime: data.lastActiveTime,
        loginStreak: data.loginStreak,
        lastLoginDate: data.lastLoginDate
      };

      // Get existing persisted data first
      const existingData = await playerEntity.player.getPersistedData() || {};
      
      // Update with new level data
      const updatedData = {
        ...existingData,
        levelData: saveData,  // Primary location
        level: data.level,    // Backup in root
        xp: data.xp,         // Backup in root
        totalXP: data.totalXP // Backup in root
      };

      await playerEntity.player.setPersistedData(updatedData);
      console.log(`[SimpleLevelingSystem] ✅ SAVED player ${playerId}: Level ${data.level}, XP ${data.xp}, Total ${data.totalXP}`);
      
      // Verify the save worked
      const verification = await playerEntity.player.getPersistedData();
      console.log(`[SimpleLevelingSystem] 🔍 VERIFICATION for ${playerId}:`, JSON.stringify(verification, null, 2));
      
    } catch (error) {
      console.error(`[SimpleLevelingSystem] ❌ Error saving player data for ${playerId}:`, error);
    }
  }

  /**
   * Public method to send level UI update (can be called externally)
   */
  public sendLevelUIUpdate(player: Player): void {
    const data = this.getOrCreatePlayerData(player.id);
    this.sendXPUIUpdate(player, data);
  }

  /**
   * DEBUG: Manually set player level and XP for testing
   */
  public debugSetPlayerLevel(player: Player, level: number, xp: number): void {
    console.log(`[SimpleLevelingSystem] 🔧 DEBUG: Setting player ${player.id} to Level ${level}, XP ${xp}`);
    
    const data: PlayerLevelData = {
      level,
      xp,
      totalXP: xp,
      firstTimeFlags: new Set(),
      lastActiveTime: Date.now(),
      loginStreak: 1,
      lastLoginDate: new Date().toDateString()
    };
    
    // Force set the data
    this.playerData.set(player.id, data);
    
    // Send UI update immediately
    this.sendXPUIUpdate(player, data);
    
    // Save to persistence
    this.queuePlayerForSave(player.id);
    
    console.log(`[SimpleLevelingSystem] 🔧 DEBUG: Set and saved player ${player.id} to Level ${level}, XP ${xp}`);
  }

  /**
   * Get XP progress info for UI
   */
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
}