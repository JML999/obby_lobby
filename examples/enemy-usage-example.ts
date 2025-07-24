import { World, PlayerEvent } from 'hytopia';
import { EnemyManager } from '../src/EnemyManager';
import { ZombieEntity } from '../src/entities/ZombieEntity';
import { ObbyPlayerEntity } from '../src/ObbyPlayerEntity';

/**
 * Example of how to use the Enemy System in your obby creator
 * 
 * This example shows:
 * 1. Setting up the enemy manager
 * 2. Spawning different zombie variants
 * 3. Managing enemies during gameplay
 * 4. Cleanup when players leave
 */

export function setupEnemySystem(world: World) {
    // Initialize the enemy manager
    const enemyManager = new EnemyManager(world, {
        maxEnemies: 20,           // Maximum 20 enemies at once
        spawnCooldownMs: 1000,    // 1 second between spawns
        enableRandomSpawning: false, // Disable random spawning for now
    });

    console.log('[Example] Enemy system initialized');

    // Example 1: Spawn a single zombie when a player joins
    world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
        console.log(`[Example] Player ${player.username} joined - spawning welcome zombie`);
        
        // Spawn a normal zombie near the spawn point
        const zombie = enemyManager.spawnEnemy({
            position: { x: 5, y: 10, z: 5 },
            type: 'zombie',
            variant: 'normal'
        });

        if (zombie) {
            console.log(`[Example] Spawned welcome zombie for ${player.username}`);
        }
    });

    // Example 2: Spawn different zombie types using commands (you'd need to implement commands)
    // This is just to show the different variants available
    function demonstrateZombieVariants() {
        console.log('[Example] Demonstrating zombie variants...');

        // Spawn a normal zombie
        const normalZombie = enemyManager.spawnEnemy({
            position: { x: 10, y: 10, z: 10 },
            type: 'zombie',
            variant: 'normal'
        });

        // Spawn a fast zombie (moves faster, less health)
        const fastZombie = enemyManager.spawnEnemy({
            position: { x: 15, y: 10, z: 10 },
            type: 'zombie',
            variant: 'fast'
        });

        // Spawn a strong zombie (more health, slower)
        const strongZombie = enemyManager.spawnEnemy({
            position: { x: 20, y: 10, z: 10 },
            type: 'zombie',
            variant: 'strong'
        });

        console.log('[Example] Spawned all zombie variants');
    }

    // Example 3: Spawn a group of zombies in a pattern
    function spawnZombieHorde() {
        console.log('[Example] Spawning zombie horde...');
        
        const hordeCenter = { x: 0, y: 10, z: 30 };
        const zombieHorde = enemyManager.spawnZombieGroup(
            hordeCenter,
            5,          // 5 zombies
            8,          // 8 block radius
            'normal'    // All normal variant
        );

        console.log(`[Example] Spawned horde of ${zombieHorde.length} zombies`);
        
        // You could make some of them different variants
        setTimeout(() => {
            enemyManager.spawnEnemy({
                position: { x: hordeCenter.x, y: hordeCenter.y, z: hordeCenter.z },
                type: 'zombie',
                variant: 'fast' // Add a fast zombie to the horde
            });
        }, 2000);
    }

    // Example 4: Management functions
    function manageEnemies() {
        // Get stats about current enemies
        const stats = enemyManager.getStats();
        console.log('[Example] Enemy stats:', stats);

        // Find enemies near a specific location
        const nearbyEnemies = enemyManager.getEnemiesInRadius({ x: 0, y: 10, z: 0 }, 20);
        console.log(`[Example] Found ${nearbyEnemies.length} enemies near spawn`);

        // Get all zombies specifically
        const allZombies = enemyManager.getEnemiesByType(ZombieEntity);
        console.log(`[Example] Total zombies: ${allZombies.length}`);

                 // Find the nearest enemy to a position
        const playerPos = { x: 0, y: 10, z: 0 };
        const nearestEnemy = enemyManager.getNearestEnemy(playerPos);
        if (nearestEnemy && nearestEnemy.position) {
            const enemyPos = nearestEnemy.position;
            console.log(`[Example] Nearest enemy is ${nearestEnemy.constructor.name} at distance ~${Math.floor(
                Math.sqrt(
                    Math.pow(enemyPos.x - playerPos.x, 2) +
                    Math.pow(enemyPos.y - playerPos.y, 2) +
                    Math.pow(enemyPos.z - playerPos.z, 2)
                )
            )} blocks`);
        }
    }

    // Example 5: Cleanup functions
    function cleanupEnemies() {
        // Clear enemies in a specific area (useful for plot resets)
        const plotCenter = { x: -50, y: 5, z: 50 };
        const clearedCount = enemyManager.clearEnemiesInRadius(plotCenter, 30);
        console.log(`[Example] Cleared ${clearedCount} enemies from plot area`);

        // Or clear all enemies (useful for server resets)
        // enemyManager.clearAllEnemies();
    }

    // Example 6: Player interaction with zombies
    world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
        const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
        if (playerEntities.length > 0) {
            const playerEntity = playerEntities[0] as ObbyPlayerEntity;
            
                         // You could add a custom event or timer to check for nearby zombies
            setInterval(() => {
                if (playerEntity.position) {
                    const nearbyZombies = enemyManager.getEnemiesInRadius(playerEntity.position, 10);
                    if (nearbyZombies.length > 0) {
                        // Player is near zombies - could trigger special effects, UI warnings, etc.
                        console.log(`[Example] Player ${player.username} has ${nearbyZombies.length} zombies nearby!`);
                    }
                }
            }, 5000); // Check every 5 seconds
        }
    });

    // Example 7: Update the enemy manager (call this from your main game loop)
    // You'd typically call this from your main game loop or in a setInterval
    function updateEnemySystem() {
        const deltaTime = 16.67; // Assuming 60 FPS (1000/60)
        enemyManager.update(deltaTime);
    }

    // Example 8: Dynamic configuration
    function configurateEnemySystem() {
        // Adjust settings based on player count or game state
        const playerCount = world.entityManager.getAllPlayerEntities().length;
        
        if (playerCount > 5) {
            // More players = more enemies allowed
            enemyManager.setMaxEnemies(playerCount * 4);
            enemyManager.setSpawnCooldown(500); // Faster spawning
        } else {
            // Reset to defaults
            enemyManager.setMaxEnemies(20);
            enemyManager.setSpawnCooldown(1000);
        }

        console.log(`[Example] Configured enemy system for ${playerCount} players`);
    }

    // Set up some example timers (you'd replace these with your actual game logic)
    setTimeout(() => demonstrateZombieVariants(), 5000);   // After 5 seconds
    setTimeout(() => spawnZombieHorde(), 10000);           // After 10 seconds  
    setTimeout(() => manageEnemies(), 15000);              // After 15 seconds
    setTimeout(() => cleanupEnemies(), 30000);             // After 30 seconds

    // Update loop example (you'd integrate this into your main game loop)
    setInterval(() => {
        updateEnemySystem();
        configurateEnemySystem();
    }, 1000); // Every second

    // Example cleanup when players leave
    world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
        console.log(`[Example] Player ${player.username} left - could cleanup their enemies`);
        
        // Example: Remove enemies from around where the player was last seen
        // This is just an example - you'd need to track player positions
        const lastKnownPosition = { x: 0, y: 10, z: 0 }; // You'd track this
        enemyManager.clearEnemiesInRadius(lastKnownPosition, 10);
    });

    return enemyManager;
}

/**
 * Advanced example: Custom zombie behavior
 * This shows how you could extend the zombie system for specific game mechanics
 */
export function setupAdvancedZombieFeatures(world: World, enemyManager: EnemyManager) {
    console.log('[Example] Setting up advanced zombie features...');

    // Example: Spawn zombies that patrol specific areas
    function spawnPatrolZombies() {
        const patrolPoints = [
            { x: 30, y: 10, z: 30 },
            { x: 40, y: 10, z: 30 },
            { x: 40, y: 10, z: 40 },
            { x: 30, y: 10, z: 40 }
        ];

        for (let i = 0; i < patrolPoints.length; i++) {
            const zombie = enemyManager.spawnEnemy({
                position: patrolPoints[i],
                type: 'zombie',
                variant: 'normal',
                customOptions: {
                    // You could extend ZombieEntityOptions to include patrol points
                    // patrolPoints: patrolPoints
                }
            });

            if (zombie) {
                const pos = patrolPoints[i];
                console.log(`[Example] Spawned patrol zombie ${i + 1} at (${pos.x}, ${pos.y}, ${pos.z})`);
            }
        }
    }

    // Example: Zombie spawn triggers
    function setupZombieSpawnTriggers() {
        // You could spawn zombies when players enter certain areas
        // This would require area detection logic in your game

        console.log('[Example] Zombie spawn triggers configured (logic not implemented)');
        
        // Example of what this might look like:
        // world.on('player-entered-area', ({ player, area }) => {
        //     if (area.name === 'zombie-zone') {
        //         const spawnPos = area.getRandomSpawnPoint();
        //         enemyManager.spawnEnemy({
        //             position: spawnPos,
        //             type: 'zombie',
        //             variant: Math.random() > 0.7 ? 'fast' : 'normal'
        //         });
        //     }
        // });
    }

    setTimeout(() => spawnPatrolZombies(), 2000);
    setupZombieSpawnTriggers();
} 