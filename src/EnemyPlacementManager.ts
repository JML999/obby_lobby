import { Player, World, Vector3 } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import { ZombieEntity } from './entities/ZombieEntity';
import type { ZombieEntityOptions } from './entities/ZombieEntity';
import { EnemyManager } from './EnemyManager';
import { PlotBoundaryManager } from './PlotBoundaryManager';
import { ObstacleCollisionManager } from './ObstacleCollisionManager';

export interface EnemyType {
    id: string;
    name: string;
    type: 'zombie';
    variant: 'normal' | 'fast' | 'strong';
    description: string;
    category: 'enemy';
    roamingAreaSize: number; // Size of the roaming area (e.g., 3 for 3x3)
}

export interface PlacedEnemy {
    id: string;
    type: 'zombie';
    variant: 'normal' | 'fast' | 'strong';
    position: Vector3;
    roamingArea: {
        center: Vector3;
        size: number; // 3 for 3x3, etc.
    };
    entityId?: string;
}

export class EnemyPlacementManager {
    private static instance: EnemyPlacementManager;
    private world?: World;
    private enemyManager?: EnemyManager;
    private plotBoundaryManager: PlotBoundaryManager;
    private obstacleCollisionManager: ObstacleCollisionManager;
    private placedEnemies: Map<string, PlacedEnemy[]> = new Map(); // plotId -> enemies

    // Enemy catalog for UI
    public readonly ENEMY_CATALOG: EnemyType[] = [
        {
            id: 'zombie_normal',
            name: 'Zombie',
            type: 'zombie',
            variant: 'normal',
            description: 'Basic zombie enemy - follows and attacks players',
            category: 'enemy',
            roamingAreaSize: 3
        },
        {
            id: 'zombie_fast',
            name: 'Fast Zombie',
            type: 'zombie',
            variant: 'fast',
            description: 'Quick zombie - faster movement and attacks',
            category: 'enemy',
            roamingAreaSize: 3
        },
        {
            id: 'zombie_strong',
            name: 'Strong Zombie',
            type: 'zombie',
            variant: 'strong',
            description: 'Tough zombie - more health and damage',
            category: 'enemy',
            roamingAreaSize: 3
        }
    ];

    public static getInstance(): EnemyPlacementManager {
        if (!EnemyPlacementManager.instance) {
            EnemyPlacementManager.instance = new EnemyPlacementManager();
        }
        return EnemyPlacementManager.instance;
    }

    private constructor() {
        this.plotBoundaryManager = PlotBoundaryManager.getInstance();
        this.obstacleCollisionManager = ObstacleCollisionManager.getInstance();
    }

    public initializeWorld(world: World): void {
        this.world = world;
        
        // Initialize EnemyManager for this world
        if (!this.enemyManager) {
            this.enemyManager = new EnemyManager(world, {
                maxEnemiesPerPlot: 5,
                maxEnemiesTotal: 50,
                spawnCooldownMs: 500,
                enableRandomSpawning: false
            });
        }
    }

    /**
     * Check if an enemy can be placed at the given position
     */
    public canPlaceEnemy(
        plotId: string | undefined,
        enemyType: EnemyType,
        position: Vector3Like
    ): { valid: boolean; reason?: string; suggestion?: string } {
        
        if (!this.world) {
            return { valid: false, reason: "World not initialized" };
        }

        // Calculate the 3x3 roaming area around the placement position
        const roamingAreaSize = enemyType.roamingAreaSize;
        const halfSize = Math.floor(roamingAreaSize / 2);
        
        const minX = Math.floor(position.x) - halfSize;
        const maxX = Math.floor(position.x) + halfSize;
        const minY = Math.floor(position.y);
        const maxY = Math.floor(position.y) + 2; // 2 blocks high for zombie space
        const minZ = Math.floor(position.z) - halfSize;
        const maxZ = Math.floor(position.z) + halfSize;

        // Check plot boundaries if in a plot
        if (plotId) {
            const boundaryResult = this.checkRoamingAreaBoundaries(plotId, {
                minX, maxX, minY, maxY, minZ, maxZ
            });
            if (!boundaryResult.valid) {
                return boundaryResult;
            }
        }

        // Check for clear space in the roaming area
        const clearSpaceResult = this.checkRoamingAreaClearSpace({
            minX, maxX, minY, maxY, minZ, maxZ
        });
        if (!clearSpaceResult.valid) {
            return clearSpaceResult;
        }

        // Check collision with existing obstacles and enemies
        const collisionResult = this.checkEnemyCollisions(plotId, position, roamingAreaSize);
        if (!collisionResult.valid) {
            return collisionResult;
        }

        return { valid: true };
    }

    /**
     * Place an enemy at the target position
     */
    public placeEnemy(player: Player, enemyId: string, position: Vector3Like, plotId?: string): boolean {
        if (!this.world || !this.enemyManager) return false;

        const enemyType = this.ENEMY_CATALOG.find(e => e.id === enemyId);
        if (!enemyType) {
            console.log(`[EnemyPlacementManager] Enemy ID ${enemyId} not found in catalog`);
            return false;
        }

        // Check if placement is valid
        const canPlace = this.canPlaceEnemy(plotId, enemyType, position);
        if (!canPlace.valid) {
            this.world.chatManager.sendPlayerMessage(player, canPlace.reason || 'Cannot place enemy here!', 'FF0000');
            if (canPlace.suggestion) {
                this.world.chatManager.sendPlayerMessage(player, canPlace.suggestion, 'FFAA00');
            }
            return false;
        }

        // Spawn the enemy using EnemyManager
        const spawnedEnemy = this.enemyManager.spawnEnemy({
            position: position,
            type: 'zombie',
            variant: enemyType.variant,
            plotId: plotId || 'global',
            customOptions: {
                roamingArea: {
                    center: position,
                    size: enemyType.roamingAreaSize
                }
            }
        });

        if (spawnedEnemy) {
            // Register the enemy placement
            this.registerEnemyPlacement(plotId, enemyType, position, spawnedEnemy.id?.toString());
            
            this.world.chatManager.sendPlayerMessage(player, `Placed ${enemyType.name}`, '00FF00');
            this.world.chatManager.sendPlayerMessage(player, `💀 ${enemyType.name} will roam in a ${enemyType.roamingAreaSize}x${enemyType.roamingAreaSize} area`, 'FFAA00');
            return true;
        } else {
            this.world.chatManager.sendPlayerMessage(player, 'Failed to place enemy!', 'FF0000');
            return false;
        }
    }

    /**
     * Remove an enemy at the target position
     */
    public removeEnemy(player: Player, position: Vector3Like, plotId?: string): { success: boolean; enemyType?: string; enemyVariant?: string } {
        if (!this.world || !this.enemyManager) return { success: false };

        // Find enemies near the target position
        const enemies = plotId ? this.enemyManager.getEnemiesInPlot(plotId) : this.enemyManager.getAllEnemies();
        const targetPos = new Vector3(position.x, position.y, position.z);
        const searchRadius = 3; // Search radius for enemy removal

        for (const enemy of enemies) {
            const enemyPos = enemy.position;
            const distance = Math.sqrt(
                Math.pow(enemyPos.x - targetPos.x, 2) +
                Math.pow(enemyPos.y - targetPos.y, 2) +
                Math.pow(enemyPos.z - targetPos.z, 2)
            );

            console.log(`[EnemyPlacementManager] Checking enemy at ${enemyPos.x}, ${enemyPos.y}, ${enemyPos.z} - distance: ${distance.toFixed(2)}`);

            if (distance <= searchRadius) {
                // Found an enemy to remove
                const enemyName = enemy.constructor.name;
                const isZombie = enemy instanceof ZombieEntity;
                const variant = isZombie ? enemy.getVariant() : 'normal';

                enemy.despawn();

                // Unregister from our tracking
                this.unregisterEnemyPlacement(plotId, enemyPos);

                this.world.chatManager.sendPlayerMessage(player, `Removed ${enemyName}`, 'FFA500');

                return {
                    success: true,
                    enemyType: 'zombie',
                    enemyVariant: variant
                };
            }
        }

        this.world.chatManager.sendPlayerMessage(player, 'No enemy found to remove here!', 'FF0000');
        return { success: false };
    }

    /**
     * Check if the roaming area fits within plot boundaries
     */
    private checkRoamingAreaBoundaries(
        plotId: string,
        area: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
    ): { valid: boolean; reason?: string; suggestion?: string } {
        
        const plotBoundaries = this.plotBoundaryManager.getCalculatedBoundaries(plotId);
        if (!plotBoundaries) {
            return { valid: false, reason: "Plot boundaries not found" };
        }

        // Check if roaming area fits within plot
        if (area.minX < plotBoundaries.minX || area.maxX > plotBoundaries.maxX ||
            area.minZ < plotBoundaries.minZ || area.maxZ > plotBoundaries.maxZ ||
            area.minY < plotBoundaries.minY || area.maxY > plotBoundaries.maxY) {
            
            return {
                valid: false,
                reason: "Enemy's roaming area extends outside plot boundaries",
                suggestion: "Move closer to the center of your plot"
            };
        }

        return { valid: true };
    }

    /**
     * Check if the roaming area has enough clear space
     */
    private checkRoamingAreaClearSpace(
        area: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
    ): { valid: boolean; reason?: string; suggestion?: string } {
        
        if (!this.world) return { valid: false, reason: "World not available" };

        // Check each position in the roaming area
        for (let x = area.minX; x <= area.maxX; x++) {
            for (let z = area.minZ; z <= area.maxZ; z++) {
                for (let y = area.minY; y <= area.maxY; y++) {
                    const blockId = this.world.chunkLattice.getBlockId({ x, y, z });
                    
                    // Only check at ground level and one block above for basic clearance
                    if (y <= area.minY + 1 && blockId !== 0) {
                        return {
                            valid: false,
                            reason: "Roaming area is not clear - blocks are in the way",
                            suggestion: "Clear a 3x3 area or choose a different location"
                        };
                    }
                }
            }
        }

        return { valid: true };
    }

    /**
     * Check collision with existing obstacles and enemies
     */
    private checkEnemyCollisions(
        plotId: string | undefined,
        position: Vector3Like,
        roamingAreaSize: number
    ): { valid: boolean; reason?: string; suggestion?: string } {
        
        // Check collision with existing obstacles by checking the area manually
        const obstacleCheck = this.checkObstacleCollisions(plotId, position, roamingAreaSize);
        if (!obstacleCheck.valid) {
            return obstacleCheck;
        }

        // Check collision with existing enemies
        const existingEnemies = plotId ? 
            this.getPlotEnemies(plotId) : 
            Array.from(this.placedEnemies.values()).flat();

        const halfSize = Math.floor(roamingAreaSize / 2) + 1; // Add buffer
        
        for (const enemy of existingEnemies) {
            const distance = Math.sqrt(
                Math.pow(enemy.position.x - position.x, 2) +
                Math.pow(enemy.position.z - position.z, 2)
            );

            if (distance < halfSize * 2) {
                return {
                    valid: false,
                    reason: "Too close to another enemy",
                    suggestion: "Enemies need more space between them"
                };
            }
        }

        return { valid: true };
    }

    /**
     * Check collision with existing obstacles in the area
     */
    private checkObstacleCollisions(
        plotId: string | undefined,
        position: Vector3Like,
        roamingAreaSize: number
    ): { valid: boolean; reason?: string; suggestion?: string } {
        
        // Get obstacles in this plot using the public API
        const obstacles = this.obstacleCollisionManager.getPlotObstacles(plotId || '');

        const halfSize = Math.floor(roamingAreaSize / 2);
        const enemyMinX = position.x - halfSize;
        const enemyMaxX = position.x + halfSize;
        const enemyMinZ = position.z - halfSize;
        const enemyMaxZ = position.z + halfSize;

        for (const obstacle of obstacles) {
            // Get obstacle bounds (assuming 5x5 for most obstacles)
            const obstacleHalfSize = 2.5; // 5/2 = 2.5
            const obstacleMinX = obstacle.position.x - obstacleHalfSize;
            const obstacleMaxX = obstacle.position.x + obstacleHalfSize;
            const obstacleMinZ = obstacle.position.z - obstacleHalfSize;
            const obstacleMaxZ = obstacle.position.z + obstacleHalfSize;

            // Check for overlap with buffer
            const buffer = 1; // 1 block buffer between enemies and obstacles
            if (!(enemyMaxX + buffer < obstacleMinX || 
                  enemyMinX - buffer > obstacleMaxX || 
                  enemyMaxZ + buffer < obstacleMinZ || 
                  enemyMinZ - buffer > obstacleMaxZ)) {
                return {
                    valid: false,
                    reason: "Too close to existing obstacles",
                    suggestion: "Move away from nearby obstacles"
                };
            }
        }

        return { valid: true };
    }

    /**
     * Register a placed enemy for tracking
     */
    private registerEnemyPlacement(
        plotId: string | undefined,
        enemyType: EnemyType,
        position: Vector3Like,
        entityId?: string
    ): void {
        const plotKey = plotId || 'global';
        
        if (!this.placedEnemies.has(plotKey)) {
            this.placedEnemies.set(plotKey, []);
        }

        const placedEnemy: PlacedEnemy = {
            id: `${enemyType.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: enemyType.type,
            variant: enemyType.variant,
            position: new Vector3(position.x, position.y, position.z),
            roamingArea: {
                center: new Vector3(position.x, position.y, position.z),
                size: enemyType.roamingAreaSize
            },
            entityId: entityId
        };

        this.placedEnemies.get(plotKey)!.push(placedEnemy);
        console.log(`[EnemyPlacementManager] Registered enemy ${placedEnemy.id} on plot ${plotKey}`);
    }

    /**
     * Unregister a placed enemy
     */
    private unregisterEnemyPlacement(plotId: string | undefined, position: Vector3Like): void {
        const plotKey = plotId || 'global';
        const enemies = this.placedEnemies.get(plotKey);
        
        if (!enemies) return;

        const index = enemies.findIndex(enemy => {
            const distance = Math.sqrt(
                Math.pow(enemy.position.x - position.x, 2) +
                Math.pow(enemy.position.y - position.y, 2) +
                Math.pow(enemy.position.z - position.z, 2)
            );
            return distance <= 2;
        });

        if (index >= 0) {
            const removed = enemies.splice(index, 1)[0];
            if (removed) {
                console.log(`[EnemyPlacementManager] Unregistered enemy ${removed.id}`);
            }
        }
    }

    /**
     * Get enemies placed in a specific plot
     */
    public getPlotEnemies(plotId: string): PlacedEnemy[] {
        return this.placedEnemies.get(plotId) || [];
    }

    /**
     * Clear all enemies from a plot
     */
    public clearPlotEnemies(plotId: string): number {
        const enemies = this.placedEnemies.get(plotId);
        if (!enemies) return 0;

        const count = enemies.length;
        this.placedEnemies.delete(plotId);
        
        // Also clear from EnemyManager
        if (this.enemyManager) {
            this.enemyManager.clearPlotEnemies(plotId);
        }

        console.log(`[EnemyPlacementManager] Cleared ${count} enemies from plot ${plotId}`);
        return count;
    }

    /**
     * Get enemy statistics for a plot
     */
    public getPlotEnemyStats(plotId: string): { total: number; byVariant: Record<string, number> } {
        const enemies = this.getPlotEnemies(plotId);
        const stats = { total: enemies.length, byVariant: {} as Record<string, number> };

        for (const enemy of enemies) {
            const key = `${enemy.type}_${enemy.variant}`;
            stats.byVariant[key] = (stats.byVariant[key] || 0) + 1;
        }

        return stats;
    }

    /**
     * Show available enemies to player
     */
    public showEnemyCatalog(player: Player): void {
        if (!this.world) return;

        this.world.chatManager.sendPlayerMessage(player, '💀 Available Enemies:', 'FFFF00');
        
        this.ENEMY_CATALOG.forEach(enemy => {
            this.world!.chatManager.sendPlayerMessage(player, 
                `${enemy.name} - ${enemy.description}`, 'FFFFFF');
        });
    }
} 