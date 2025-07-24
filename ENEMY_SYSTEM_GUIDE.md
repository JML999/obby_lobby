# Plot-Aware Enemy System Guide

## Overview

This guide explains the complete enemy system designed for your Obby Creator game, modeled after Roblox's Obby Creator. The system supports both per-plot and global enemy management, perfect for a game where builders create obstacle courses with enemies on individual plots.

## Architecture

### 🏗️ **Core Components**

1. **EnemyEntity** - Abstract base class for all enemies
2. **ZombieEntity** - Concrete zombie implementation with variants
3. **EnemyManager** - Plot-aware manager for world-level enemy control
4. **Plot Integration** - Associates enemies with specific player plots

### 🌍 **World vs Plot Management**

**Design Decision: One EnemyManager per World**
- ✅ **Single world-level EnemyManager** that tracks all enemies
- ✅ **Plot association** via `plotId` for each enemy
- ✅ **Per-plot limits** and **global limits** both enforced
- ✅ **Easy cleanup** when plots reset or players leave

## Key Features

### 📊 **Dual-Level Management**

```typescript
// Per-plot operations
enemyManager.spawnEnemy({ plotId: 'plot_123', ... });
enemyManager.clearPlotEnemies('plot_123');
enemyManager.getPlotStats('plot_123');

// Global operations  
enemyManager.getAllEnemies();
enemyManager.getGlobalStats();
enemyManager.clearAllEnemies();
```

### 🎮 **Role Support**

- **Builders**: Place/remove enemies on their plots
- **Players**: Interact with enemies, no management permissions
- **Admins**: Global oversight and management

### ⚡ **Performance & Limits**

- **Per-plot limits**: Prevent any single plot from overwhelming the world
- **Global limits**: Maintain overall world performance
- **Automatic cleanup**: Dead enemies and plot resets handled automatically

## Usage Examples

### Basic Enemy Placement

```typescript
// Initialize world-level enemy manager
const enemyManager = new EnemyManager(world, {
    maxEnemiesPerPlot: 5,    // Each plot max 5 enemies
    maxEnemiesTotal: 50,     // World max 50 enemies
    spawnCooldownMs: 500     // 0.5s between spawns
});

// Builder places a zombie on their plot
const zombie = enemyManager.spawnEnemy({
    position: { x: 10, y: 10, z: 10 },
    type: 'zombie',
    variant: 'normal',
    plotId: 'plot_player123'  // Required: associates with plot
});
```

### Plot Management

```typescript
// Get plot statistics
const plotStats = enemyManager.getPlotStats('plot_player123');
console.log(plotStats);
// {
//   plotId: 'plot_player123',
//   total: 3,
//   zombies: 3,
//   alive: 2,
//   dead: 1,
//   canSpawnMore: true
// }

// Clear all enemies from a plot (useful for plot resets)
const clearedCount = enemyManager.clearPlotEnemies('plot_player123');

// Spawn multiple enemies in a pattern
const horde = enemyManager.spawnZombieGroupInPlot(
    'plot_player123',
    { x: 0, y: 10, z: 0 },  // center
    3,                       // count
    5,                       // radius
    'normal'                // variant
);
```

### Admin/Global Management

```typescript
// Get overview of all plots
const allPlotStats = enemyManager.getAllPlotStats();
const globalStats = enemyManager.getGlobalStats();

console.log(`${globalStats.total} enemies across ${globalStats.activePlots} plots`);

// Find enemies near a position (across all plots)
const nearbyEnemies = enemyManager.getEnemiesInRadius({ x: 0, y: 10, z: 0 }, 20);

// Emergency cleanup
enemyManager.clearAllEnemies(); // Nuclear option
```

## Integration Points

### 🔧 **Build System Integration**

```typescript
// Add to your existing placement manager
function handlePlayerPlacement(playerId: string, plotId: string, itemType: string) {
    if (itemType === 'zombie') {
        const result = enemyManager.spawnEnemy({
            position: targetPosition,
            type: 'zombie',
            variant: 'normal',
            plotId: plotId
        });
        
        if (!result) {
            // Show "plot enemy limit reached" message to player
        }
    }
    // ... existing block/obstacle placement logic
}
```

### 🧹 **Plot Reset Integration**

```typescript
function resetPlayerPlot(plotId: string) {
    // Clear enemies (new)
    const clearedEnemies = enemyManager.clearPlotEnemies(plotId);
    
    // Clear blocks (existing)
    clearPlotBlocks(plotId);
    
    // Clear obstacles (existing) 
    clearPlotObstacles(plotId);
    
    console.log(`Plot reset: ${clearedEnemies} enemies cleared`);
}
```

### 📱 **UI Integration**

```typescript
function getPlotUIData(plotId: string) {
    const plotStats = enemyManager.getPlotStats(plotId);
    
    return {
        enemies: {
            count: `${plotStats.total}/${maxEnemiesPerPlot}`,
            canPlace: plotStats.canSpawnMore,
            breakdown: `${plotStats.alive} alive, ${plotStats.dead} dead`
        }
        // ... blocks, obstacles, etc.
    };
}
```

## Zombie Variants

### 🧟 **Available Variants**

| Variant | Health | Damage | Speed | Special |
|---------|---------|---------|--------|---------|
| Normal  | 50     | 10     | 2.0    | Balanced |
| Fast    | 35     | 8      | 3.5    | Runs when chasing |
| Strong  | 80     | 15     | 1.5    | High damage/health |

### 🎭 **Behavior Differences**

- **Normal**: Standard zombie behavior, walks toward players
- **Fast**: Switches to running animation when aggressive, speed boost when low health
- **Strong**: Slower but hits harder, longer attack cooldown

## Events & Lifecycle

### 🔄 **Enemy Lifecycle**

1. **Spawn**: `enemyManager.spawnEnemy()` → registered with plot association
2. **Active**: Detects and chases players, plays animations/audio
3. **Death**: Health reaches 0 → death animation → auto-despawn after 3s
4. **Cleanup**: Automatically removed from manager on despawn

### 📡 **Event Integration**

```typescript
// Player events
world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    const plotId = assignPlayerToPlot(player);
    // Could spawn welcome enemies or show plot status
});

world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    const plotId = getPlayerPlot(player);
    enemyManager.clearPlotEnemies(plotId); // Optional cleanup
});
```

## Performance Considerations

### ⚡ **Optimization Features**

- **Efficient tracking**: O(1) plot lookups using Map data structures
- **Automatic cleanup**: Dead enemies auto-despawn, empty plot data auto-removed
- **Configurable limits**: Prevent performance issues with too many enemies
- **Batched operations**: Group spawning and clearing operations

### 📊 **Monitoring**

```typescript
// Regular performance monitoring
setInterval(() => {
    const stats = enemyManager.getGlobalStats();
    
    if (stats.total > stats.maxEnemiesTotal * 0.8) {
        console.warn('Enemy count approaching limit');
    }
    
    if (stats.activePlots > expectedPlotCount * 1.2) {
        console.warn('More active plots than expected');
    }
}, 30000); // Every 30 seconds
```

## Configuration

### ⚙️ **EnemyManager Options**

```typescript
const enemyManager = new EnemyManager(world, {
    maxEnemiesPerPlot: 10,        // Prevent plot overload
    maxEnemiesTotal: 100,         // Global world limit
    spawnCooldownMs: 1000,        // Rate limiting
    enableRandomSpawning: false,  // Disable for builder-only control
    randomSpawnInterval: 10000    // If enabled
});
```

### 🔧 **Runtime Configuration**

```typescript
// Adjust limits based on server load
enemyManager.setMaxEnemiesPerPlot(5);    // Reduce for performance
enemyManager.setMaxEnemiesTotal(50);     // Global reduction
enemyManager.setSpawnCooldown(2000);     // Slower spawning
```

## Best Practices

### ✅ **Recommendations**

1. **Start Conservative**: Begin with lower limits (5 per plot, 50 total)
2. **Monitor Performance**: Track enemy counts and world performance
3. **Plot Cleanup**: Clear plot enemies when players leave (optional)
4. **UI Feedback**: Show players their current enemy count vs limits
5. **Admin Tools**: Provide admin commands for emergency cleanup

### ⚠️ **Common Pitfalls**

1. **Don't** create per-player enemy managers - use world-level only
2. **Don't** forget to associate enemies with plotId
3. **Don't** set limits too high initially - start small and scale up
4. **Don't** rely on manual cleanup - use the automatic systems

## Future Extensions

### 🔮 **Possible Enhancements**

1. **More Enemy Types**: Skeleton, Spider, etc. extending EnemyEntity
2. **Enemy AI Modes**: Patrol routes, guard zones, chase behaviors
3. **Plot-Specific Configs**: Different limits per plot size/type
4. **Enemy Persistence**: Save/load enemy placements with plots
5. **Advanced Behaviors**: Enemy groups, leader/follower dynamics

### 🚀 **Integration Ideas**

1. **Economy System**: Cost currency to place enemies
2. **Unlock System**: Earn new enemy variants through gameplay
3. **Difficulty Scaling**: Stronger enemies in advanced plot areas
4. **Combat System**: Player weapons to fight enemies
5. **Leaderboards**: Track plot completion with enemy challenges

---

This system provides a solid foundation for enemy management in your Obby Creator game, balancing individual plot control with world-level performance and administration. 