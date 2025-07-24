import { World, Vector3 } from 'hytopia';
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
    private enemies: Map<string, EnemyEntity> = new Map();
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
        this.maxEnemiesPerPlot = options.maxEnemiesPerPlot ?? 10;
        this.maxEnemiesTotal = options.maxEnemiesTotal ?? 100;
        this.spawnCooldownMs = options.spawnCooldownMs ?? 1000;
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
    public spawnEnemy(options: EnemySpawnOptions): EnemyEntity | null {
        // Check if we can spawn (cooldown, total limit, and per-plot limit)
        if (!this.canSpawnOnPlot(options.plotId)) {
            console.warn(`[EnemyManager] Cannot spawn enemy on plot ${options.plotId} - limits reached or cooldown active`);
            return null;
        }

        let enemy: EnemyEntity;

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
        
        return cooldownPassed && underTotalLimit && underPlotLimit;
    }

    /**
     * Register an enemy with plot association
     */
    private registerEnemy(enemy: EnemyEntity, plotId: string): void {
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
        
        // Update counters
        this.updateCounters();
        
        // Set up cleanup when enemy dies/despawns
        enemy.on('DESPAWNED', () => {
            this.unregisterEnemy(enemyId);
        });

        console.log(`[EnemyManager] Registered enemy ${enemyId} on plot ${plotId}, plot enemies: ${this.getEnemyCountInPlot(plotId)}, total: ${this.enemies.size}`);
    }

    /**
     * Unregister an enemy from all tracking
     */
    private unregisterEnemy(enemyId: string): void {
        const enemy = this.enemies.get(enemyId);
        if (enemy) {
            const plotId = (enemy as any)._plotId;
            
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
            
            this.updateCounters();
            console.log(`[EnemyManager] Unregistered enemy ${enemyId} from plot ${plotId}, remaining: ${this.enemies.size}`);
        }
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
    public getEnemiesInPlot(plotId: string): EnemyEntity[] {
        const enemyIds = this.enemiesByPlot.get(plotId);
        if (!enemyIds) return [];
        
        const enemies: EnemyEntity[] = [];
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
    public getEnemiesByTypeInPlot<T extends EnemyEntity>(plotId: string, type: new (...args: any[]) => T): T[] {
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
    ): EnemyEntity[] {
        const spawnedEnemies: EnemyEntity[] = [];
        
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
            
            if (enemy.isDeadState) {
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
            
            if (enemy.isDeadState) {
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
    public getAllEnemies(): EnemyEntity[] {
        return Array.from(this.enemies.values());
    }

    /**
     * Get enemies by type (across all plots)
     */
    public getEnemiesByType<T extends EnemyEntity>(type: new (...args: any[]) => T): T[] {
        return this.getAllEnemies().filter(enemy => enemy instanceof type) as T[];
    }

    /**
     * Get enemies within a radius of a position (across all plots)
     */
    public getEnemiesInRadius(center: Vector3Like, radius: number): EnemyEntity[] {
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
    public getNearestEnemy(position: Vector3Like): EnemyEntity | null {
        let nearestEnemy: EnemyEntity | null = null;
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
} 