import { Player, World, Vector3 } from 'hytopia';
import type { Vector3Like } from 'hytopia';
import { ZombieEntity } from './entities/ZombieEntity';
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

        // --- BEGIN: Smart zombie placement check ---
        const baseX = Math.floor(position.x);
        const baseZ = Math.floor(position.z);
        let placeY = Math.floor(position.y);
        const world = this.world;
        
        if (world) {
            // Find the highest solid block at this X,Z position
            let foundSurface = false;
            let surfaceY = placeY;
            
            // Start from the target Y and search downward for a solid surface
            for (let y = placeY; y >= placeY - 10; y--) {
                const blockId = world.chunkLattice.getBlockId({ x: baseX, y: y, z: baseZ });
                if (blockId !== 0) {
                    // Found a solid block - place zombie on top
                    surfaceY = y + 1;
                    foundSurface = true;
                    break;
                }
            }
            
            if (!foundSurface) {
                return {
                    valid: false,
                    reason: "No solid surface found below placement location!",
                    suggestion: "Place the zombie above or near a solid block surface."
                };
            }
            
            // Check that there are at least 3 blocks of air space above the surface
            for (let y = surfaceY; y < surfaceY + 3; y++) {
                const blockId = world.chunkLattice.getBlockId({ x: baseX, y: y, z: baseZ });
                if (blockId !== 0) {
                    return {
                        valid: false,
                        reason: `Not enough air space! Block found at height ${y}`,
                        suggestion: "Clear at least 3 blocks of space above the surface for zombie placement."
                    };
                }
            }
            
            // Center the zombie on the block (0.5 offset from block edge)
            position.x = baseX + 0.5;
            position.y = surfaceY;
            position.z = baseZ + 0.5;
            
            console.log(`[EnemyPlacementManager] Adjusted zombie placement to centered position: (${position.x}, ${position.y}, ${position.z})`);
        }
        // --- END: Smart zombie placement check ---

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
                // Removed roamingArea - zombies now use aggro sensor only
            }
        });

        if (spawnedEnemy) {
           
            // Register the enemy placement
            this.registerEnemyPlacement(plotId, enemyType, position, spawnedEnemy.id?.toString());
            
            // Enemy placement is self-evident - no toast needed
            // Player can see the enemy spawn, redundant notification removed
            return true;
        } else {
            this.world.chatManager.sendPlayerMessage(player, 'Failed to place enemy!', 'FF0000');
            return false;
        }
    }

    /**
     * Remove an enemy at the target position using entity tags
     */
    public removeEnemy(player: Player, position: Vector3Like, plotId?: string): { success: boolean; enemyType?: string; enemyVariant?: string } {
        // CRITICAL: Use player's world instead of stored world for proper world instancing
        const targetWorld = player.world || this.world;
        if (!targetWorld) {
            console.log(`[EnemyPlacementManager] ❌ No world available (player.world: ${!!player.world}, this.world: ${!!this.world})`);
            return { success: false };
        }

        console.log(`[EnemyPlacementManager] 🌍 Using world: ${targetWorld.name} (from ${player.world ? 'player.world' : 'this.world'})`);

        // Get ALL entities and filter for ZombieEntity type (more reliable than tags)
        const allEntities = targetWorld.entityManager.getAllEntities();
        const zombies = allEntities.filter(entity => entity instanceof ZombieEntity);
        const targetPos = new Vector3(position.x, position.y, position.z);
        const searchRadius = 5; // Increased search radius for better detection

        console.log(`[EnemyPlacementManager] 🔍 ZOMBIE REMOVAL DEBUG:`);
        console.log(`[EnemyPlacementManager] Target position: (${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
        console.log(`[EnemyPlacementManager] Search radius: ${searchRadius}`);
        console.log(`[EnemyPlacementManager] Found ${zombies.length} zombies total in world`);

        if (zombies.length === 0) {
            console.log(`[EnemyPlacementManager] ❌ No zombies found in world using entity tags!`);
            // Don't send message here - let the controller handle unified messaging
            return { success: false };
        }

        // Sort zombies by distance to find the closest one
        const zombiesWithDistance = zombies
            .filter(zombie => zombie && zombie.position) // Filter out null/undefined
            .map(zombie => {
                const zombiePos = zombie.position;
                const distance = Math.sqrt(
                    Math.pow(zombiePos.x - targetPos.x, 2) +
                    Math.pow(zombiePos.y - targetPos.y, 2) +
                    Math.pow(zombiePos.z - targetPos.z, 2)
                );
                return { zombie, distance, position: zombiePos };
            })
            .sort((a, b) => a.distance - b.distance); // Sort by distance, closest first

        console.log(`[EnemyPlacementManager] Sorted ${zombiesWithDistance.length} zombies by distance`);

        // Log all zombies for debugging
        zombiesWithDistance.forEach((item, i) => {
            console.log(`[EnemyPlacementManager] Zombie ${i}: pos(${item.position.x.toFixed(1)}, ${item.position.y.toFixed(1)}, ${item.position.z.toFixed(1)}) distance=${item.distance.toFixed(2)} withinRadius=${item.distance <= searchRadius}`);
        });

        // Find the closest zombie within search radius
        const closestWithinRadius = zombiesWithDistance.find(item => item.distance <= searchRadius);

        if (closestWithinRadius) {
            const { zombie, distance } = closestWithinRadius;
            const isZombie = zombie instanceof ZombieEntity;
            const variant = isZombie ? (zombie as ZombieEntity).getVariant() : 'normal';

            console.log(`[EnemyPlacementManager] ✅ Removing closest zombie at distance ${distance.toFixed(2)}! Type: ${zombie.constructor.name}, Variant: ${variant}`);

            // Check if zombie has EnemyManager reference and unregister it
            const enemyManagerId = (zombie as any)._enemyManagerId;
            const enemyPlotId = (zombie as any)._plotId;
            
            if (enemyManagerId && this.enemyManager) {
                console.log(`[EnemyPlacementManager] Unregistering zombie ${enemyManagerId} from EnemyManager`);
                // Call the unregisterEnemy method on EnemyManager
                (this.enemyManager as any).unregisterEnemy(enemyManagerId);
            }
            
            // Despawn the zombie (this automatically removes it from entity tag system)
            zombie.despawn();

            console.log(`[EnemyPlacementManager] Successfully removed zombie with variant: ${variant}`);
            // Enemy removal is self-evident - no toast needed
            // Player can see the enemy despawn, redundant notification removed

            return {
                success: true,
                enemyType: 'zombie',
                enemyVariant: variant
            };
        }

        // Provide helpful debugging info
        if (zombiesWithDistance.length > 0) {
            const closest = zombiesWithDistance[0];
            console.log(`[EnemyPlacementManager] ❌ No zombie within radius. Closest was ${closest.distance.toFixed(2)} blocks away at (${closest.position.x.toFixed(1)}, ${closest.position.y.toFixed(1)}, ${closest.position.z.toFixed(1)})`);
            // Don't send detailed distance message - let controller handle unified messaging
        } else {
            console.log(`[EnemyPlacementManager] ❌ No zombies detected at all!`);
            // Don't send message here - let the controller handle unified messaging
        }

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
     * Check collision with existing obstacles and enemies using entity tags
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

        // Use entity tags to get all zombies in the world - more reliable than stored positions
        if (!this.world) {
            return { valid: false, reason: "World not available" };
        }

        // Get ALL entities and filter for ZombieEntity type (more reliable than tags)
        const allEntities = this.world.entityManager.getAllEntities();
        const existingZombies = allEntities.filter(entity => entity instanceof ZombieEntity);
        console.log(`[EnemyPlacementManager] Found ${existingZombies.length} existing zombies by type checking`);

        // Check for max zombie limit (5 per plot or 50 total)
        const maxZombiesPerPlot = 5;
        const maxZombiesTotal = 50;

        if (existingZombies.length >= maxZombiesTotal) {
            return {
                valid: false,
                reason: `Maximum zombies reached (${maxZombiesTotal} total)`,
                suggestion: "Remove some zombies before placing more"
            };
        }

        // For plot-specific limits, count zombies in this plot if applicable
        if (plotId) {
            let zombiesInPlot = 0;
            for (const zombie of existingZombies) {
                // Simple boundary check - if zombie is within plot boundaries, count it
                // This is more reliable than tracking separate data structures
                const plotBoundaries = this.plotBoundaryManager.getCalculatedBoundaries(plotId);
                if (plotBoundaries) {
                    const zombiePos = zombie.position;
                    const isInPlot = zombiePos.x >= plotBoundaries.minX && zombiePos.x <= plotBoundaries.maxX &&
                                   zombiePos.z >= plotBoundaries.minZ && zombiePos.z <= plotBoundaries.maxZ &&
                                   zombiePos.y >= plotBoundaries.minY && zombiePos.y <= plotBoundaries.maxY;
                    if (isInPlot) {
                        zombiesInPlot++;
                    }
                }
            }

            if (zombiesInPlot >= maxZombiesPerPlot) {
                return {
                    valid: false,
                    reason: `Maximum zombies per plot reached (${maxZombiesPerPlot})`,
                    suggestion: "Remove some zombies from this plot before placing more"
                };
            }
        }

        // Simple distance check - ensure no zombie is within 1 block of placement position
        const minDistance = 1.0; // 1 block minimum distance
        
        for (const zombie of existingZombies) {
            const distance = Math.sqrt(
                Math.pow(zombie.position.x - position.x, 2) +
                Math.pow(zombie.position.y - position.y, 2) +
                Math.pow(zombie.position.z - position.z, 2)
            );

            console.log(`[EnemyPlacementManager] Zombie at (${zombie.position.x.toFixed(1)}, ${zombie.position.y.toFixed(1)}, ${zombie.position.z.toFixed(1)}) - distance: ${distance.toFixed(2)}`);

            if (distance < minDistance) {
                return {
                    valid: false,
                    reason: "Another zombie is too close to this position",
                    suggestion: "Place zombies at least 1 block apart"
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
        if (!this.world) {
            console.warn(`[EnemyPlacementManager] Cannot clear plot enemies - world not initialized`);
            return 0;
        }

        // Get plot boundaries to find zombies within this plot
        const plotBoundaries = this.plotBoundaryManager.getCalculatedBoundaries(plotId);
        if (!plotBoundaries) {
            console.warn(`[EnemyPlacementManager] Cannot clear plot enemies - no boundaries found for plot ${plotId}`);
            return 0;
        }

        // Find and despawn all zombies in this plot (using type checking instead of tags)
        const allEntities = this.world.entityManager.getAllEntities();
        const zombies = allEntities.filter(entity => entity instanceof ZombieEntity);
        
        let zombiesCleared = 0;
        for (const zombie of zombies) {
            const zombiePos = zombie.position;
            const isInPlot = zombiePos.x >= plotBoundaries.minX && zombiePos.x <= plotBoundaries.maxX &&
                           zombiePos.z >= plotBoundaries.minZ && zombiePos.z <= plotBoundaries.maxZ &&
                           zombiePos.y >= plotBoundaries.minY && zombiePos.y <= plotBoundaries.maxY;
            
            if (isInPlot) {
                // Check if zombie has EnemyManager reference and unregister it
                const enemyManagerId = (zombie as any)._enemyManagerId;
                if (enemyManagerId && this.enemyManager) {
                    console.log(`[EnemyPlacementManager] Unregistering zombie ${enemyManagerId} from EnemyManager`);
                    (this.enemyManager as any).unregisterEnemy(enemyManagerId);
                }
                
                zombie.despawn();
                zombiesCleared++;
                console.log(`[EnemyPlacementManager] Despawned zombie at (${zombiePos.x.toFixed(1)}, ${zombiePos.y.toFixed(1)}, ${zombiePos.z.toFixed(1)}) from plot ${plotId}`);
            }
        }

        // Clear tracking data
        const enemies = this.placedEnemies.get(plotId);
        if (enemies) {
            this.placedEnemies.delete(plotId);
        }

        console.log(`[EnemyPlacementManager] Cleared ${zombiesCleared} zombies from plot ${plotId}`);
        return zombiesCleared;
    }

    /**
     * Get enemy statistics for a plot using entity tags
     */
    public getPlotEnemyStats(plotId: string): { total: number; byVariant: Record<string, number> } {
        if (!this.world) {
            return { total: 0, byVariant: {} };
        }

        // Get all zombies using entity tags
        const allZombies = this.world.entityManager.getEntitiesByTag('zombie');
        const stats = { total: 0, byVariant: {} as Record<string, number> };

        // Get plot boundaries
        const plotBoundaries = this.plotBoundaryManager.getCalculatedBoundaries(plotId);
        if (!plotBoundaries) {
            return stats;
        }

        // Count zombies within plot boundaries
        for (const zombie of allZombies) {
            const zombiePos = zombie.position;
            const isInPlot = zombiePos.x >= plotBoundaries.minX && zombiePos.x <= plotBoundaries.maxX &&
                           zombiePos.z >= plotBoundaries.minZ && zombiePos.z <= plotBoundaries.maxZ &&
                           zombiePos.y >= plotBoundaries.minY && zombiePos.y <= plotBoundaries.maxY;

            if (isInPlot) {
                stats.total++;
                const isZombie = zombie instanceof ZombieEntity;
                const variant = isZombie ? (zombie as ZombieEntity).getVariant() : 'normal';
                const key = `zombie_${variant}`;
                stats.byVariant[key] = (stats.byVariant[key] || 0) + 1;
            }
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