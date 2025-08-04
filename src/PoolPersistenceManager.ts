import { promises as fs } from 'fs';
import * as path from 'path';
import type { ScoreboardEntry } from './ScoreboardManager';

export interface PoolData {
  poolId: string;
  displayName: string;
  creator: string;
  version: string;
  lastModified: number;
  scoreboard: ScoreboardEntry[];
  metadata?: {
    difficulty?: 'easy' | 'medium' | 'hard';
    category?: string;
    playCount?: number;
  };
}

export class PoolPersistenceManager {
  private static instance: PoolPersistenceManager;
  private readonly persistenceDir: string;
  private readonly poolsDir: string;
  private saveInProgress: Set<string> = new Set();

  private constructor() {
    this.persistenceDir = path.join(process.cwd(), 'dev', 'persistence');
    this.poolsDir = path.join(this.persistenceDir, 'pools');
  }

  public static getInstance(): PoolPersistenceManager {
    if (!PoolPersistenceManager.instance) {
      PoolPersistenceManager.instance = new PoolPersistenceManager();
    }
    return PoolPersistenceManager.instance;
  }

  /**
   * Initialize the pool persistence system
   */
  public async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.poolsDir, { recursive: true });
      console.log('[PoolPersistenceManager] Initialized pools directory:', this.poolsDir);
    } catch (error) {
      console.error('[PoolPersistenceManager] Error initializing pools directory:', error);
    }
  }

  /**
   * Save pool data to individual file
   */
  public async savePoolData(poolId: string, data: PoolData): Promise<void> {
    if (this.saveInProgress.has(poolId)) {
      console.log(`[PoolPersistenceManager] Save already in progress for ${poolId}, skipping...`);
      return;
    }

    this.saveInProgress.add(poolId);

    try {
      const filePath = path.join(this.poolsDir, `${poolId}.json`);
      const tempPath = `${filePath}.tmp`;

      // Update lastModified timestamp
      data.lastModified = Date.now();

      // Write to temp file first
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));

      // Atomic rename
      await fs.rename(tempPath, filePath);

      console.log(`[PoolPersistenceManager] Saved pool data for ${poolId}`);
    } catch (error) {
      console.error(`[PoolPersistenceManager] Error saving pool ${poolId}:`, error);
      // Clean up temp file if it exists
      try {
        const tempPath = path.join(this.poolsDir, `${poolId}.json.tmp`);
        await fs.unlink(tempPath);
      } catch {}
    } finally {
      this.saveInProgress.delete(poolId);
    }
  }

  /**
   * Load pool data from file
   */
  public async loadPoolData(poolId: string): Promise<PoolData | null> {
    try {
      const filePath = path.join(this.poolsDir, `${poolId}.json`);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent) as PoolData;
      
      console.log(`[PoolPersistenceManager] Loaded pool data for ${poolId} with ${data.scoreboard?.length || 0} scores`);
      return data;
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.error(`[PoolPersistenceManager] Error loading pool ${poolId}:`, error);
      }
      return null;
    }
  }

  /**
   * Load all pool data
   */
  public async loadAllPools(): Promise<Map<string, PoolData>> {
    const pools = new Map<string, PoolData>();

    try {
      const files = await fs.readdir(this.poolsDir);
      const poolFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));

      await Promise.all(poolFiles.map(async (file) => {
        const poolId = file.replace('.json', '');
        const data = await this.loadPoolData(poolId);
        if (data) {
          pools.set(poolId, data);
        }
      }));

      console.log(`[PoolPersistenceManager] Loaded ${pools.size} pool files`);
    } catch (error) {
      console.error('[PoolPersistenceManager] Error loading all pools:', error);
    }

    return pools;
  }

  /**
   * Update pool scoreboard by merging new scores with existing ones
   */
  public async updatePoolScoreboard(poolId: string, newScores: ScoreboardEntry[]): Promise<void> {
    let poolData = await this.loadPoolData(poolId);
    
    if (!poolData) {
      // Create new pool data if it doesn't exist
      poolData = {
        poolId,
        displayName: poolId.replace('pool-', 'Pool '),
        creator: 'System',
        version: '1.0',
        lastModified: Date.now(),
        scoreboard: [],
        metadata: {
          playCount: 0
        }
      };
    }

    // Merge new scores with existing scores
    const existingScores = poolData.scoreboard || [];
    const allScores = [...existingScores, ...newScores];
    
    // Sort by completion time (fastest first) and keep top 3
    allScores.sort((a, b) => a.completionTime - b.completionTime);
    poolData.scoreboard = allScores.slice(0, 3);
    
    console.log(`[PoolPersistenceManager] Merged ${newScores.length} new scores with ${existingScores.length} existing scores for ${poolId}. Final: ${poolData.scoreboard.length} scores`);
    
    // Increment play count for each new score
    if (poolData.metadata) {
      poolData.metadata.playCount = (poolData.metadata.playCount || 0) + newScores.length;
    }

    await this.savePoolData(poolId, poolData);
  }

  /**
   * Get pool scoreboard
   */
  public async getPoolScoreboard(poolId: string): Promise<ScoreboardEntry[]> {
    const poolData = await this.loadPoolData(poolId);
    return poolData?.scoreboard || [];
  }

  /**
   * Check if pool data exists
   */
  public async poolExists(poolId: string): Promise<boolean> {
    try {
      const filePath = path.join(this.poolsDir, `${poolId}.json`);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete pool data (for testing/admin purposes)
   */
  public async deletePoolData(poolId: string): Promise<void> {
    try {
      const filePath = path.join(this.poolsDir, `${poolId}.json`);
      await fs.unlink(filePath);
      console.log(`[PoolPersistenceManager] Deleted pool data for ${poolId}`);
    } catch (error) {
      console.error(`[PoolPersistenceManager] Error deleting pool ${poolId}:`, error);
    }
  }
}