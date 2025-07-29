import { World, Vector3, Entity } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import { ZombieEntity } from './entities/ZombieEntity';
import type { ZombieEntityOptions } from './entities/ZombieEntity';
import { EnemyEntity } from './entities/EnemyEntity';

export interface EnemySpawnOptions {
    position: Vector3Like;
    type: 'zombie';
    variant?: 'normal' | 'fast' | 'strong';
    plotId: string; // Required: which plot this enemy belongs to
    customOptions?: Partial<ZombieEntityOptions>;
}

export interface EnemyManagerOptions {
    maxEnemiesPerPlot?: number;    // New: per-plot limit
    maxEnemiesTotal?: number;      // Renamed from maxEnemies
    spawnCooldownMs?: number;
    enableRandomSpawning?: boolean;
    randomSpawnInterval?: number;
}

export interface PlotEnemyStats {
    plotId: string;
    total: number;
    zombies: number;
    alive: number;
    dead: number;
    canSpawnMore: boolean;
}

export class EnemyManager {
    private world: World;
    private enemies: Map<string, Entity> = new Map(); // Changed from EnemyEntity to Entity
    private enemiesByPlot: Map<string, Set<string>> = new Map(); // plotId -> Set of enemy IDs
    
    // Limits and cooldowns
    private maxEnemiesPerPlot: number;
    private maxEnemiesTotal: number;
    private spawnCooldownMs: number;
    private lastSpawnTime: number = 0;
    
    // Random spawning
    private enableRandomSpawning: boolean;
    private randomSpawnInterval: number;
    private randomSpawnTimer: number = 0;
    
    // Global counters
    private globalCounters = {
        total: 0,
        zombies: 0,
        alive: 0,
        dead: 0,
        activePlots: 0
    };

    constructor(world: World, options: EnemyManagerOptions = {}) {
        this.world = world;
        this.maxEnemiesPerPlot = options.maxEnemiesPerPlot ?? 20; // Increased from 10 to 20
        this.maxEnemiesTotal = options.maxEnemiesTotal ?? 200; // Increased proportionally from 100 to 200
        this.spawnCooldownMs = options.spawnCooldownMs ?? 500; // Reduced from 1000ms to 500ms for faster spawning
        this.enableRandomSpawning = options.enableRandomSpawning ?? false;
        this.randomSpawnInterval = options.randomSpawnInterval ?? 10000;
        
        console.log('[EnemyManager] Initialized with per-plot support:', {
            maxEnemiesPerPlot: this.maxEnemiesPerPlot,
            maxEnemiesTotal: this.maxEnemiesTotal,
            spawnCooldownMs: this.spawnCooldownMs,
            enableRandomSpawning: this.enableRandomSpawning
        });
    }

    /**
     * Spawn an enemy on a specific plot
     */
    public spawnEnemy(options: EnemySpawnOptions): Entity | null {
        // Check if we can spawn (cooldown, total limit, and per-plot limit)
        if (!this.canSpawnOnPlot(options.plotId)) {
            console.warn(`[EnemyManager] Cannot spawn enemy on plot ${options.plotId} - limits reached or cooldown active`);
            return null;
        }

        let enemy: Entity;

        try {
            switch (options.type) {
                case 'zombie':
                    enemy = this.createZombie(options);
                    break;
                default:
                    console.error(`[EnemyManager] Unknown enemy type: ${options.type}`);
                    return null;
            }

            // Spawn the enemy in the world
            enemy.spawn(this.world, options.position);
            
            // Register the enemy with plot association
            this.registerEnemy(enemy, options.plotId);
            
            // Update spawn timing
            this.lastSpawnTime = Date.now();
            
            console.log(`[EnemyManager] Spawned ${options.type} on plot ${options.plotId} at (${options.position.x}, ${options.position.y}, ${options.position.z})`);
            return enemy;

        } catch (error) {
            console.error('[EnemyManager] Error spawning enemy:', error);
            return null;
        }
    }

    /**
     * Check if we can spawn an enemy on a specific plot
     */
    private canSpawnOnPlot(plotId: string): boolean {
        const now = Date.now();
        const cooldownPassed = (now - this.lastSpawnTime) >= this.spawnCooldownMs;
        const underTotalLimit = this.enemies.size < this.maxEnemiesTotal;
        const underPlotLimit = this.getEnemyCountInPlot(plotId) < this.maxEnemiesPerPlot;
        
        // Debug logging to see exactly what's blocking spawns
        const timeSinceLastSpawn = now - this.lastSpawnTime;
        const plotEnemyCount = this.getEnemyCountInPlot(plotId);
        const totalEnemyCount = this.enemies.size;
        
        console.log(`[EnemyManager] Spawn check for plot ${plotId}:`);
        console.log(`  - Cooldown: ${cooldownPassed} (${timeSinceLastSpawn}ms since last spawn, need ${this.spawnCooldownMs}ms)`);
        console.log(`  - Total limit: ${underTotalLimit} (${totalEnemyCount}/${this.maxEnemiesTotal})`);
        console.log(`  - Plot limit: ${underPlotLimit} (${plotEnemyCount}/${this.maxEnemiesPerPlot})`);
        console.log(`  - Can spawn: ${cooldownPassed && underTotalLimit && underPlotLimit}`);
        
        return cooldownPassed && underTotalLimit && underPlotLimit;
    }

    /**
     * Register an enemy with plot association
     */
    private registerEnemy(enemy: Entity, plotId: string): void {
        const enemyId = enemy.id?.toString() || `enemy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Add to main enemies map
        this.enemies.set(enemyId, enemy);
        
        // Add to plot tracking
        if (!this.enemiesByPlot.has(plotId)) {
            this.enemiesByPlot.set(plotId, new Set());
        }
        this.enemiesByPlot.get(plotId)!.add(enemyId);
        
        // Store plot association on the enemy for quick lookup
        (enemy as any)._plotId = plotId;
        (enemy as any)._enemyManagerId = enemyId;
        
        // Update counters
        this.updateCounters();
        
        // Set up cleanup when enemy dies/despawns - listen to multiple events
        const cleanup = () => {
            console.log(`[EnemyManager] Cleaning up enemy ${enemyId} from plot ${plotId}`);
            this.unregisterEnemy(enemyId);
        };
        
        // Listen for standard despawn event
        enemy.on('DESPAWNED', cleanup);
        
        // For ZombieEntity, also listen for death events (in case they die but don't despawn immediately)
        if (enemy instanceof ZombieEntity) {
            // We'll check for death state periodically since zombies might die but not despawn
            const checkDeath = () => {
                if ((enemy as any)._isDead && this.enemies.has(enemyId)) {
                    console.log(`[EnemyManager] Found dead zombie ${enemyId}, cleaning up`);
                    cleanup();
                }
            };
            
            // Check death state every 5 seconds
            const deathCheckInterval = setInterval(checkDeath, 5000);
            
            // Clean up the interval when entity is removed
            const originalCleanup = cleanup;
            const enhancedCleanup = () => {
                clearInterval(deathCheckInterval);
                originalCleanup();
            };
            
            // Replace the cleanup function with enhanced version
            enemy.off('DESPAWNED', cleanup);
            enemy.on('DESPAWNED', enhancedCleanup);
        }

        console.log(`[EnemyManager] Registered enemy ${enemyId} on plot ${plotId}, plot enemies: ${this.getEnemyCountInPlot(plotId)}, total: ${this.enemies.size}`);
    }

    /**
     * Unregister an enemy from all tracking
     */
    private unregisterEnemy(enemyId: string): void {
        const enemy = this.enemies.get(enemyId);
        if (enemy) {
            const plotId = (enemy as any)._plotId;
            
            console.log(`[EnemyManager] Unregistering enemy ${enemyId} from plot ${plotId}`);
            
            // Remove from main map
            this.enemies.delete(enemyId);
            
            // Remove from plot tracking
            if (plotId && this.enemiesByPlot.has(plotId)) {
                this.enemiesByPlot.get(plotId)!.delete(enemyId);
                
                // Clean up empty plot sets
                if (this.enemiesByPlot.get(plotId)!.size === 0) {
                    this.enemiesByPlot.delete(plotId);
                }
            }
            
            // Update counters
            this.updateCounters();
            
            console.log(`[EnemyManager] Enemy ${enemyId} unregistered. Plot ${plotId} now has ${this.getEnemyCountInPlot(plotId)} enemies, total: ${this.enemies.size}`);
        } else {
            console.warn(`[EnemyManager] Attempted to unregister non-existent enemy ${enemyId}`);
        }
    }

    /**
     * Manually clean up all dead zombies (useful for debugging/maintenance)
     */
    public cleanupDeadZombies(): number {
        let cleanedCount = 0;
        const toRemove: string[] = [];
        
        for (const [enemyId, enemy] of this.enemies.entries()) {
            if (enemy instanceof ZombieEntity) {
                const isDead = (enemy as any)._isDead || false;
                if (isDead) {
                    console.log(`[EnemyManager] Found dead zombie ${enemyId}, marking for cleanup`);
                    toRemove.push(enemyId);
                    cleanedCount++;
                }
            }
        }
        
        // Remove dead zombies
        for (const enemyId of toRemove) {
            this.unregisterEnemy(enemyId);
        }
        
        console.log(`[EnemyManager] Cleaned up ${cleanedCount} dead zombies`);
        return cleanedCount;
    }

    /**
     * Get the number of enemies in a specific plot
     */
    public getEnemyCountInPlot(plotId: string): number {
        return this.enemiesByPlot.get(plotId)?.size || 0;
    }

    /**
     * Get all enemies in a specific plot
     */
    public getEnemiesInPlot(plotId: string): Entity[] {
        const enemyIds = this.enemiesByPlot.get(plotId);
        if (!enemyIds) return [];
        
        const enemies: Entity[] = [];
        for (const enemyId of enemyIds) {
            const enemy = this.enemies.get(enemyId);
            if (enemy) {
                enemies.push(enemy);
            }
        }
        return enemies;
    }

    /**
     * Get enemies by type in a specific plot
     */
    public getEnemiesByTypeInPlot<T extends Entity>(plotId: string, type: new (...args: any[]) => T): T[] {
        return this.getEnemiesInPlot(plotId).filter(enemy => enemy instanceof type) as T[];
    }

    /**
     * Clear all enemies from a specific plot
     */
    public clearPlotEnemies(plotId: string): number {
        const enemies = this.getEnemiesInPlot(plotId);
        console.log(`[EnemyManager] Clearing ${enemies.length} enemies from plot ${plotId}`);
        
        for (const enemy of enemies) {
            if (enemy.isSpawned) {
                enemy.despawn();
            }
        }
        
        return enemies.length;
    }

    /**
     * Spawn multiple zombies in a plot with a pattern
     */
    public spawnZombieGroupInPlot(
        plotId: string, 
        centerPosition: Vector3Like, 
        count: number, 
        radius: number = 3, 
        variant: 'normal' | 'fast' | 'strong' = 'normal'
    ): Entity[] {
        const spawnedEnemies: Entity[] = [];
        
        for (let i = 0; i < count; i++) {
            // Check if we can spawn more on this plot
            if (!this.canSpawnOnPlot(plotId)) {
                console.warn(`[EnemyManager] Cannot spawn zombie ${i + 1}/${count} on plot ${plotId} - limits reached`);
                break;
            }
            
            // Calculate position in a circle around the center
            const angle = (i / count) * Math.PI * 2;
            const spawnRadius = radius * (0.5 + Math.random() * 0.5);
            
            const spawnPosition = {
                x: centerPosition.x + Math.cos(angle) * spawnRadius,
                y: centerPosition.y,
                z: centerPosition.z + Math.sin(angle) * spawnRadius
            };

            const enemy = this.spawnEnemy({
                position: spawnPosition,
                type: 'zombie',
                variant: variant,
                plotId: plotId
            });

            if (enemy) {
                spawnedEnemies.push(enemy);
            }
        }

        console.log(`[EnemyManager] Spawned zombie group on plot ${plotId}: ${spawnedEnemies.length}/${count} zombies`);
        return spawnedEnemies;
    }

    /**
     * Get statistics for a specific plot
     */
    public getPlotStats(plotId: string): PlotEnemyStats {
        const enemies = this.getEnemiesInPlot(plotId);
        
        let zombies = 0;
        let alive = 0;
        let dead = 0;
        
        for (const enemy of enemies) {
            if (enemy instanceof ZombieEntity) {
                zombies++;
            }
            
            // Check dead state based on entity type
            let isDead = false;
            if (enemy instanceof ZombieEntity) {
                isDead = (enemy as any)._isDead || false; // ZombieEntity uses _isDead
            } else if ('isDeadState' in enemy) {
                isDead = (enemy as any).isDeadState; // EnemyEntity uses isDeadState
            }
            
            if (isDead) {
                dead++;
            } else {
                alive++;
            }
        }
        
        return {
            plotId,
            total: enemies.length,
            zombies,
            alive,
            dead,
            canSpawnMore: this.canSpawnOnPlot(plotId)
        };
    }

    /**
     * Get statistics for all plots
     */
    public getAllPlotStats(): PlotEnemyStats[] {
        const stats: PlotEnemyStats[] = [];
        
        for (const plotId of this.enemiesByPlot.keys()) {
            stats.push(this.getPlotStats(plotId));
        }
        
        return stats;
    }

    /**
     * Update global counters
     */
    private updateCounters(): void {
        this.globalCounters.total = this.enemies.size;
        this.globalCounters.zombies = 0;
        this.globalCounters.alive = 0;
        this.globalCounters.dead = 0;
        this.globalCounters.activePlots = this.enemiesByPlot.size;

        for (const enemy of this.enemies.values()) {
            if (enemy instanceof ZombieEntity) {
                this.globalCounters.zombies++;
            }
            
            // Check dead state based on entity type
            let isDead = false;
            if (enemy instanceof ZombieEntity) {
                isDead = (enemy as any)._isDead || false; // ZombieEntity uses _isDead
            } else if ('isDeadState' in enemy) {
                isDead = (enemy as any).isDeadState; // EnemyEntity uses isDeadState
            }
            
            if (isDead) {
                this.globalCounters.dead++;
            } else {
                this.globalCounters.alive++;
            }
        }
    }

    // === GLOBAL METHODS (unchanged from before) ===

    /**
     * Get all enemies (across all plots)
     */
    public getAllEnemies(): Entity[] {
        return Array.from(this.enemies.values());
    }

    /**
     * Get enemies by type (across all plots)
     */
    public getEnemiesByType<T extends Entity>(type: new (...args: any[]) => T): T[] {
        return this.getAllEnemies().filter(enemy => enemy instanceof type) as T[];
    }

    /**
     * Get enemies within a radius of a position (across all plots)
     */
    public getEnemiesInRadius(center: Vector3Like, radius: number): Entity[] {
        return this.getAllEnemies().filter(enemy => {
            const dx = enemy.position.x - center.x;
            const dy = enemy.position.y - center.y;
            const dz = enemy.position.z - center.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            return distance <= radius;
        });
    }

    /**
     * Get the nearest enemy to a position (across all plots)
     */
    public getNearestEnemy(position: Vector3Like): Entity | null {
        let nearestEnemy: Entity | null = null;
        let nearestDistance = Infinity;

        for (const enemy of this.enemies.values()) {
            const dx = enemy.position.x - position.x;
            const dy = enemy.position.y - position.y;
            const dz = enemy.position.z - position.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestEnemy = enemy;
            }
        }

        return nearestEnemy;
    }

    /**
     * Remove all enemies (across all plots)
     */
    public clearAllEnemies(): void {
        console.log(`[EnemyManager] Clearing all ${this.enemies.size} enemies across ${this.enemiesByPlot.size} plots`);
        
        for (const enemy of this.enemies.values()) {
            if (enemy.isSpawned) {
                enemy.despawn();
            }
        }
        
        this.enemies.clear();
        this.enemiesByPlot.clear();
        this.updateCounters();
    }

    /**
     * Remove enemies in a specific area (across all plots)
     */
    public clearEnemiesInRadius(center: Vector3Like, radius: number): number {
        const enemiesToRemove = this.getEnemiesInRadius(center, radius);
        
        console.log(`[EnemyManager] Clearing ${enemiesToRemove.length} enemies in radius ${radius} around (${center.x}, ${center.y}, ${center.z})`);
        
        for (const enemy of enemiesToRemove) {
            if (enemy.isSpawned) {
                enemy.despawn();
            }
        }
        
        return enemiesToRemove.length;
    }

    private createZombie(options: EnemySpawnOptions): ZombieEntity {
        const zombieOptions: ZombieEntityOptions = {
            variant: options.variant as 'normal' | 'fast' | 'strong' || 'normal',
            ...options.customOptions
        };

        return new ZombieEntity(zombieOptions);
    }

    /**
     * Update method - call this every frame or periodically
     */
    public update(deltaTimeMs: number): void {
        if (this.enableRandomSpawning) {
            this.updateRandomSpawning(deltaTimeMs);
        }
        
        // Update counters periodically
        this.updateCounters();
    }

    /**
     * Handle random spawning logic (would need plot selection logic)
     */
    private updateRandomSpawning(deltaTimeMs: number): void {
        this.randomSpawnTimer -= deltaTimeMs;
        
        if (this.randomSpawnTimer <= 0) {
            this.attemptRandomSpawn();
            
            // Reset timer with some randomization
            this.randomSpawnTimer = this.randomSpawnInterval + (Math.random() - 0.5) * 2000;
        }
    }

    /**
     * Attempt to spawn a random enemy (would need plot selection logic)
     */
    private attemptRandomSpawn(): void {
        // TODO: This would need logic to select a random plot and spawn point
        console.log('[EnemyManager] Would attempt random spawn (plot selection logic not implemented)');
        
        // Example of how this could work:
        // const activePlots = Array.from(this.enemiesByPlot.keys());
        // if (activePlots.length > 0) {
        //     const randomPlot = activePlots[Math.floor(Math.random() * activePlots.length)];
        //     if (this.canSpawnOnPlot(randomPlot)) {
        //         const spawnPoint = getRandomSpawnPointInPlot(randomPlot);
        //         this.spawnEnemy({
        //             position: spawnPoint,
        //             type: 'zombie',
        //             variant: Math.random() > 0.7 ? 'fast' : 'normal',
        //             plotId: randomPlot
        //         });
        //     }
        // }
    }

    /**
     * Get global enemy statistics
     */
    public getGlobalStats() {
        return {
            ...this.globalCounters,
            maxEnemiesTotal: this.maxEnemiesTotal,
            maxEnemiesPerPlot: this.maxEnemiesPerPlot,
            canSpawnGlobal: this.enemies.size < this.maxEnemiesTotal,
            lastSpawnTime: this.lastSpawnTime,
            enableRandomSpawning: this.enableRandomSpawning
        };
    }

    /**
     * Configuration methods
     */
    public setMaxEnemiesPerPlot(max: number): void {
        this.maxEnemiesPerPlot = Math.max(1, max);
        console.log(`[EnemyManager] Max enemies per plot set to ${this.maxEnemiesPerPlot}`);
    }

    public setMaxEnemiesTotal(max: number): void {
        this.maxEnemiesTotal = Math.max(1, max);
        console.log(`[EnemyManager] Max total enemies set to ${this.maxEnemiesTotal}`);
    }

    public setSpawnCooldown(cooldownMs: number): void {
        this.spawnCooldownMs = Math.max(0, cooldownMs);
        console.log(`[EnemyManager] Spawn cooldown set to ${this.spawnCooldownMs}ms`);
    }

    public setRandomSpawning(enabled: boolean): void {
        this.enableRandomSpawning = enabled;
        if (enabled) {
            this.randomSpawnTimer = this.randomSpawnInterval;
        }
        console.log(`[EnemyManager] Random spawning ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Debug method to show current enemy counts
     */
    public debugShowCounts(): void {
        console.log('=== ENEMY MANAGER DEBUG INFO ===');
        console.log(`Total enemies tracked: ${this.enemies.size}/${this.maxEnemiesTotal}`);
        console.log(`Plots with enemies: ${this.enemiesByPlot.size}`);
        
        for (const [plotId, enemyIds] of this.enemiesByPlot.entries()) {
            const plotStats = this.getPlotStats(plotId);
            console.log(`Plot ${plotId}: ${enemyIds.size}/${this.maxEnemiesPerPlot} (${plotStats.alive} alive, ${plotStats.dead} dead, ${plotStats.zombies} zombies)`);
            
            // List each enemy in the plot
            for (const enemyId of enemyIds) {
                const enemy = this.enemies.get(enemyId);
                if (enemy) {
                    let status = 'unknown';
                    if (enemy instanceof ZombieEntity) {
                        const isDead = (enemy as any)._isDead || false;
                        const isRespawning = (enemy as any).isRespawning || false;
                        status = isDead ? 'dead' : (isRespawning ? 'respawning' : 'alive');
                    }
                    console.log(`  - ${enemyId}: ${enemy.constructor.name} (${status})`);
                } else {
                    console.log(`  - ${enemyId}: MISSING ENTITY!`);
                }
            }
        }
        console.log('=== END ENEMY DEBUG INFO ===');
    }

    // Expose cleanup methods globally for console debugging
    public exposeDebugMethods(): void {
        (globalThis as any).enemyManagerDebug = {
            showCounts: () => this.debugShowCounts(),
            cleanupDead: () => this.cleanupDeadZombies(),
            clearPlot: (plotId: string) => this.clearPlotEnemies(plotId),
            getStats: (plotId: string) => this.getPlotStats(plotId)
        };
        console.log('[EnemyManager] Debug methods exposed to globalThis.enemyManagerDebug');
    }
} 