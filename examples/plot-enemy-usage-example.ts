import { World, PlayerEvent } from 'hytopia';
import { EnemyManager } from '../src/EnemyManager';
import { ZombieEntity } from '../src/entities/ZombieEntity';
import { ObbyPlayerEntity } from '../src/ObbyPlayerEntity';

/**
 * Example of how to use the Plot-Aware Enemy System in your obby creator
 * 
 * This example shows:
 * 1. Setting up the plot-aware enemy manager
 * 2. Spawning enemies on specific plots
 * 3. Managing enemies per plot and globally
 * 4. Plot cleanup and statistics
 * 5. Integration with builder/player roles
 */

export function setupPlotEnemySystem(world: World) {
    // Initialize the plot-aware enemy manager
    const enemyManager = new EnemyManager(world, {
        maxEnemiesPerPlot: 5,     // Each plot can have max 5 enemies
        maxEnemiesTotal: 50,      // World can have max 50 enemies total
        spawnCooldownMs: 500,     // 0.5 second between spawns
        enableRandomSpawning: false
    });

    console.log('[PlotExample] Plot-aware enemy system initialized');

    // Example 1: Builder places an enemy on their plot
    function builderPlaceEnemy(playerId: string, plotId: string, position: { x: number, y: number, z: number }) {
        console.log(`[PlotExample] Builder ${playerId} placing enemy on plot ${plotId}`);
        
        const zombie = enemyManager.spawnEnemy({
            position: position,
            type: 'zombie',
            variant: 'normal',
            plotId: plotId  // Associate with the specific plot
        });

        if (zombie) {
            console.log(`[PlotExample] Successfully placed zombie on plot ${plotId}`);
            
            // Show updated plot stats
            const plotStats = enemyManager.getPlotStats(plotId);
            console.log(`[PlotExample] Plot ${plotId} stats:`, plotStats);
        } else {
            console.log(`[PlotExample] Failed to place enemy on plot ${plotId} - limits reached`);
        }

        return zombie;
    }

    // Example 2: Clear all enemies from a specific plot (when player resets their build)
    function clearPlotEnemies(plotId: string) {
        console.log(`[PlotExample] Clearing all enemies from plot ${plotId}`);
        
        const clearedCount = enemyManager.clearPlotEnemies(plotId);
        console.log(`[PlotExample] Cleared ${clearedCount} enemies from plot ${plotId}`);
        
        return clearedCount;
    }

    // Example 3: Spawn a zombie horde on a specific plot
    function spawnZombieHordeOnPlot(plotId: string, center: { x: number, y: number, z: number }) {
        console.log(`[PlotExample] Spawning zombie horde on plot ${plotId}`);
        
        const horde = enemyManager.spawnZombieGroupInPlot(
            plotId,
            center,
            3,          // 3 zombies
            5,          // 5 block radius
            'normal'    // All normal variant
        );

        console.log(`[PlotExample] Spawned ${horde.length} zombies on plot ${plotId}`);
        
        // Show plot stats after spawning
        const plotStats = enemyManager.getPlotStats(plotId);
        console.log(`[PlotExample] Plot ${plotId} after horde spawn:`, plotStats);
        
        return horde;
    }

    // Example 4: Get statistics for all plots
    function showAllPlotStats() {
        console.log('[PlotExample] === All Plot Statistics ===');
        
        const allPlotStats = enemyManager.getAllPlotStats();
        allPlotStats.forEach(stats => {
            console.log(`Plot ${stats.plotId}: ${stats.total} enemies (${stats.alive} alive, ${stats.dead} dead), can spawn more: ${stats.canSpawnMore}`);
        });
        
        const globalStats = enemyManager.getGlobalStats();
        console.log(`Global: ${globalStats.total} total enemies across ${globalStats.activePlots} plots`);
        
        return { allPlotStats, globalStats };
    }

    // Example 5: Player enters a plot with enemies
    function handlePlayerEnterPlot(player: any, plotId: string) {
        console.log(`[PlotExample] Player ${player.username} entered plot ${plotId}`);
        
        // Get enemies in this specific plot
        const plotEnemies = enemyManager.getEnemiesInPlot(plotId);
        const plotZombies = enemyManager.getEnemiesByTypeInPlot(plotId, ZombieEntity);
        
        console.log(`[PlotExample] Plot ${plotId} has ${plotEnemies.length} enemies (${plotZombies.length} zombies)`);
        
        if (plotEnemies.length > 0) {
            // Could trigger special UI, warnings, etc.
            console.log(`[PlotExample] Warning: Player entered a plot with ${plotEnemies.length} enemies!`);
        }
        
        return plotEnemies;
    }

    // Example 6: Builder role - advanced enemy placement
    function builderAdvancedPlacement(playerId: string, plotId: string) {
        console.log(`[PlotExample] Advanced enemy placement for builder ${playerId} on plot ${plotId}`);
        
        // Check current plot status
        const plotStats = enemyManager.getPlotStats(plotId);
        console.log(`[PlotExample] Current plot stats:`, plotStats);
        
        if (!plotStats.canSpawnMore) {
            console.log(`[PlotExample] Cannot spawn more enemies on plot ${plotId} - limit reached (${plotStats.total}/${enemyManager.getGlobalStats().maxEnemiesPerPlot})`);
            return null;
        }
        
        // Spawn different types based on what's already on the plot
        let variant: 'normal' | 'fast' | 'strong' = 'normal';
        
        if (plotStats.zombies === 0) {
            // First zombie - use normal
            variant = 'normal';
        } else if (plotStats.zombies < 3) {
            // Add some variety
            variant = Math.random() > 0.5 ? 'fast' : 'normal';
        } else {
            // Later zombies can be stronger
            variant = 'strong';
        }
        
        const position = {
            x: Math.random() * 10, // Random position within plot bounds
            y: 10,
            z: Math.random() * 10
        };
        
        const zombie = enemyManager.spawnEnemy({
            position,
            type: 'zombie',
            variant,
            plotId,
            customOptions: {
                // Could add plot-specific customizations
            }
        });
        
        if (zombie) {
            console.log(`[PlotExample] Placed ${variant} zombie on plot ${plotId} at (${position.x.toFixed(1)}, ${position.y}, ${position.z.toFixed(1)})`);
        }
        
        return zombie;
    }

    // Example 7: Plot management for admins/moderators
    function adminPlotManagement() {
        console.log('[PlotExample] === Admin Plot Management ===');
        
        // Show global overview
        const globalStats = enemyManager.getGlobalStats();
        console.log(`Global: ${globalStats.total}/${globalStats.maxEnemiesTotal} enemies across ${globalStats.activePlots} plots`);
        
        // Find plots with most enemies
        const allPlotStats = enemyManager.getAllPlotStats();
        const sortedPlots = allPlotStats.sort((a, b) => b.total - a.total);
        
        console.log('Top 3 plots by enemy count:');
        sortedPlots.slice(0, 3).forEach((stats, index) => {
            console.log(`${index + 1}. Plot ${stats.plotId}: ${stats.total} enemies`);
        });
        
        // Clean up plots with too many dead enemies
        sortedPlots.forEach(stats => {
            if (stats.dead > stats.alive && stats.dead > 2) {
                console.log(`[PlotExample] Plot ${stats.plotId} has too many dead enemies (${stats.dead}), considering cleanup`);
                // Could automatically clean up dead enemies
            }
        });
        
        return { globalStats, sortedPlots };
    }

    // Example 8: Integration with world events
    world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
        console.log(`[PlotExample] Player ${player.username} joined - setting up plot tracking`);
        
        // In a real implementation, you'd determine which plot the player is assigned to
        const assignedPlotId = `plot_${player.id}`; // Simple plot assignment
        
        // Could automatically place a welcome enemy or show plot stats
        setTimeout(() => {
            console.log(`[PlotExample] Welcome placement for ${player.username} on plot ${assignedPlotId}`);
            
            // Example: Place a single welcome zombie
            builderPlaceEnemy(player.id, assignedPlotId, { x: 0, y: 10, z: 0 });
        }, 2000);
    });

    world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
        const plotId = `plot_${player.id}`;
        console.log(`[PlotExample] Player ${player.username} left - cleaning up plot ${plotId}`);
        
        // Clean up the player's plot enemies when they leave
        clearPlotEnemies(plotId);
    });

    // Example 9: Periodic management
    setInterval(() => {
        // Update the enemy manager
        enemyManager.update(1000); // 1 second update
        
        // Periodic admin overview (every 10 seconds)
        if (Date.now() % 10000 < 1000) {
            showAllPlotStats();
        }
    }, 1000);

    // Example 10: Demonstration sequence
    setTimeout(() => {
        console.log('[PlotExample] === Starting Demonstration ===');
        
        // Simulate some plot activity
        const testPlots = ['plot_1', 'plot_2', 'plot_3'];
        
        testPlots.forEach((plotId, index) => {
            setTimeout(() => {
                console.log(`[PlotExample] Demonstrating plot ${plotId}`);
                
                // Place some enemies
                builderAdvancedPlacement(`builder_${index}`, plotId);
                builderAdvancedPlacement(`builder_${index}`, plotId);
                
                // Spawn a small horde
                if (index === 1) { // Only on plot_2
                    spawnZombieHordeOnPlot(plotId, { x: 5, y: 10, z: 5 });
                }
                
                // Show stats
                setTimeout(() => {
                    handlePlayerEnterPlot({ username: `player_${index}` }, plotId);
                }, 1000);
                
            }, index * 2000); // Stagger the demonstrations
        });
        
        // Show admin overview after all demonstrations
        setTimeout(() => {
            adminPlotManagement();
        }, 8000);
        
    }, 3000);

    // Return helper functions for external use
    return {
        enemyManager,
        builderPlaceEnemy,
        clearPlotEnemies,
        spawnZombieHordeOnPlot,
        showAllPlotStats,
        handlePlayerEnterPlot,
        builderAdvancedPlacement,
        adminPlotManagement
    };
}

/**
 * Integration example: How to integrate with your existing plot/build system
 */
export function integrateWithBuildSystem(world: World, enemyManager: EnemyManager) {
    console.log('[PlotExample] Setting up build system integration...');

    /**
     * Example: Add enemy placement to your block placement system
     * This would be called from your existing placement manager
     */
    function handleEnemyPlacement(playerId: string, plotId: string, position: any, enemyType: 'zombie', variant?: 'normal' | 'fast' | 'strong') {
        // Validate the player can build on this plot
        // (your existing plot permission logic here)
        
        // Check if they can place more enemies
        const plotStats = enemyManager.getPlotStats(plotId);
        if (!plotStats.canSpawnMore) {
            // Send message to player about limit
            console.log(`[BuildSystem] Player ${playerId} cannot place more enemies on plot ${plotId} - limit reached`);
            return { success: false, reason: 'enemy_limit_reached' };
        }
        
        // Spawn the enemy
        const enemy = enemyManager.spawnEnemy({
            position,
            type: enemyType,
            variant: variant || 'normal',
            plotId
        });
        
        if (enemy) {
            console.log(`[BuildSystem] Player ${playerId} placed ${enemyType} (${variant}) on plot ${plotId}`);
            return { success: true, enemy };
        } else {
            return { success: false, reason: 'spawn_failed' };
        }
    }

    /**
     * Example: Plot reset functionality
     */
    function resetPlot(plotId: string) {
        console.log(`[BuildSystem] Resetting plot ${plotId}...`);
        
        // Clear all enemies from the plot
        const clearedEnemies = enemyManager.clearPlotEnemies(plotId);
        
        // Clear blocks (your existing block clearing logic)
        // clearPlotBlocks(plotId);
        
        // Clear obstacles (your existing obstacle clearing logic) 
        // clearPlotObstacles(plotId);
        
        console.log(`[BuildSystem] Plot ${plotId} reset complete - cleared ${clearedEnemies} enemies`);
        
        return {
            clearedEnemies,
            // clearedBlocks,
            // clearedObstacles
        };
    }

    /**
     * Example: Plot statistics for UI
     */
    function getPlotInfoForUI(plotId: string) {
        const plotStats = enemyManager.getPlotStats(plotId);
        
        return {
            enemies: {
                total: plotStats.total,
                zombies: plotStats.zombies,
                alive: plotStats.alive,
                dead: plotStats.dead,
                canPlaceMore: plotStats.canSpawnMore,
                limit: enemyManager.getGlobalStats().maxEnemiesPerPlot
            }
            // You'd add blocks, obstacles, etc. here too
        };
    }

    return {
        handleEnemyPlacement,
        resetPlot,
        getPlotInfoForUI
    };
} 