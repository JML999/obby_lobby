/**
 * Complete Architecture Example - All Phases
 * 
 * This file demonstrates how to use all architecture phases
 * and how to transition between them safely.
 */

import { World, Player } from 'hytopia';
import ObbyRegion from '../src/ObbyRegion';
import { SystemManager } from '../src/SystemManager';
import { GlobalRegistry } from '../src/GlobalRegistry';
import { FEATURE_FLAGS } from '../src/FeatureFlags';
import { GlobalEventBus } from '../src/EventBus';

/**
 * Example 1: Basic Usage with SystemManager
 */
export function demonstrateSystemManager() {
  console.log('\n=== Complete Architecture Example: SystemManager ===');
  
  const systemManager = SystemManager.getInstance();
  const stats = systemManager.getSystemStatistics();
  
  console.log('System Statistics:', stats);
  console.log('Current Feature Flags:', FEATURE_FLAGS);
  
  // Show which systems are available
  console.log('\n📊 Available Systems:');
  console.log('- Legacy System: Always available (singleton fallback)');
  console.log('- Phase 1 (WorldContext):', FEATURE_FLAGS.enableWorldContext ? '✅ Enabled' : '❌ Disabled');
  console.log('- Phase 2 (EventBus):', FEATURE_FLAGS.useEventBus ? '✅ Enabled' : '❌ Disabled');
  console.log('- Phase 3 (New Systems):', FEATURE_FLAGS.useNewWorldContext ? '✅ Enabled' : '❌ Disabled');
  console.log('- Phase 4 (Global Registry):', FEATURE_FLAGS.useGlobalRegistry ? '✅ Enabled' : '❌ Disabled');
}

/**
 * Example 2: Creating Multiple Regions with Different Systems
 */
export function demonstrateMultipleRegions() {
  console.log('\n=== Complete Architecture Example: Multiple Regions ===');
  
  // Create regions with different configurations
  const regions = [
    new ObbyRegion('Region-Legacy'),
    new ObbyRegion('Region-Phase1'), 
    new ObbyRegion('Region-Phase3'),
    new ObbyRegion('Region-Phase4')
  ];

  regions.forEach((region, index) => {
    const context = region.getContext();
    const systemManager = SystemManager.getInstance();
    const systemType = systemManager.getWorldSystemType(region.world.name);
    
    console.log(`\n🌍 ${region.id}:`);
    console.log(`  System Type: ${systemType}`);
    console.log(`  Has Context: ${context ? '✅ Yes' : '❌ No'}`);
    
    if (context) {
      const debugInfo = context.getDebugInfo();
      console.log(`  World Name: ${debugInfo.worldName}`);
      console.log(`  System Implementation: ${debugInfo.systemType || 'delegation'}`);
      
      if (debugInfo.performanceMetrics) {
        console.log(`  Performance Tracking: ${debugInfo.performanceMetrics === 'disabled' ? '❌ Disabled' : '✅ Enabled'}`);
      }
    }
  });

  return regions;
}

/**
 * Example 3: Player Assignment Across Different Systems
 */
export async function demonstratePlayerAssignment(regions: ObbyRegion[], players: Player[]) {
  console.log('\n=== Complete Architecture Example: Player Assignment ===');
  
  const systemManager = SystemManager.getInstance();
  const globalRegistry = systemManager.getGlobalRegistry();
  
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const region = regions[i % regions.length]; // Distribute across regions
    const context = region.getContext();
    
    console.log(`\n👤 Assigning Player ${player.id}:`);
    
    try {
      if (globalRegistry) {
        // Phase 4: Use global registry
        const assignment = await globalRegistry.assignPlot(player.id);
        if (assignment) {
          console.log(`  ✅ Global Registry: Plot ${assignment.plotIndex} in ${assignment.worldId}`);
        } else {
          console.log(`  ❌ Global Registry: No available plots`);
        }
      } else if (context) {
        // Phase 1-3: Use context
        const result = await context.plotManager.assignPlayerToPlotInWorld(player.id);
        console.log(`  ✅ Context: Plot ${result.plotIndex} in ${result.world.name}`);
      } else {
        // Legacy: Direct singleton usage
        console.log(`  ⚠️  Legacy: Would use singleton PlotManager`);
      }
      
      // Verify assignment worked
      if (context) {
        const playerPlot = context.plotManager.getPlayerPlot(player.id);
        console.log(`  📍 Verification: Player has plot ${playerPlot?.plotIndex || 'none'}`);
      }
      
    } catch (error) {
      console.error(`  ❌ Error assigning player ${player.id}:`, error.message);
    }
  }
}

/**
 * Example 4: Block Operations Across Systems
 */
export async function demonstrateBlockOperations(regions: ObbyRegion[], players: Player[]) {
  console.log('\n=== Complete Architecture Example: Block Operations ===');
  
  for (let i = 0; i < Math.min(regions.length, players.length); i++) {
    const region = regions[i];
    const player = players[i];
    const context = region.getContext();
    
    console.log(`\n🧱 Block Operations for ${region.id} (Player ${player.id}):`);
    
    if (!context) {
      console.log('  ⚠️  No context available, would use legacy singleton methods');
      continue;
    }
    
    try {
      // Test block placement validation
      const testPosition = { x: 0, y: 10, z: 0 };
      const canPlace = context.blockSystem.canPlaceBlock(player, 1, testPosition);
      console.log(`  🔍 Can place block: ${canPlace ? '✅ Yes' : '❌ No'}`);
      
      if (canPlace) {
        // Test block placement
        const placeResult = await context.blockSystem.placeBlock(player, 1, testPosition);
        console.log(`  ⬆️  Place block: ${placeResult.success ? '✅ Success' : '❌ Failed'}`);
        
        if (placeResult.success) {
          // Test block removal
          const removeResult = await context.blockSystem.removeBlock(player, testPosition);
          console.log(`  ⬇️  Remove block: ${removeResult.success ? '✅ Success' : '❌ Failed'}`);
        }
      }
      
      // Show block statistics if available
      if ('getPlotBlocks' in context.blockSystem) {
        const plotInfo = context.plotManager.getPlayerPlot(player.id);
        if (plotInfo) {
          const plotId = `plot_${plotInfo.plotIndex}`;
          const blocks = context.blockSystem.getPlotBlocks(plotId);
          console.log(`  📊 Plot blocks: ${Array.isArray(blocks) ? blocks.length : 'N/A'}`);
        }
      }
      
    } catch (error) {
      console.error(`  ❌ Error in block operations:`, error.message);
    }
  }
}

/**
 * Example 5: Save/Load Operations
 */
export async function demonstrateSaveLoadOperations(regions: ObbyRegion[], players: Player[]) {
  console.log('\n=== Complete Architecture Example: Save/Load Operations ===');
  
  for (let i = 0; i < Math.min(regions.length, players.length); i++) {
    const region = regions[i];
    const player = players[i];
    const context = region.getContext();
    
    console.log(`\n💾 Save/Load Operations for ${region.id} (Player ${player.id}):`);
    
    if (!context) {
      console.log('  ⚠️  No context available, would use legacy singleton methods');
      continue;
    }
    
    try {
      // Check if player has existing save
      const hasObby = context.saveSystem.hasPlayerObby(player);
      console.log(`  🔍 Has existing save: ${hasObby ? '✅ Yes' : '❌ No'}`);
      
      // Test save operation
      const saveResult = await context.saveSystem.savePlayerObby(player);
      console.log(`  💾 Save operation: ${saveResult.success ? '✅ Success' : '❌ Failed'}`);
      
      if (saveResult.success) {
        // Test load operation
        const plotInfo = context.plotManager.getPlayerPlot(player.id);
        if (plotInfo) {
          const plotId = `plot_${plotInfo.plotIndex}`;
          const loadResult = await context.saveSystem.loadPlayerObby(player, plotId);
          console.log(`  📂 Load operation: ${loadResult.success ? '✅ Success' : '❌ Failed'}`);
        }
      }
      
    } catch (error) {
      console.error(`  ❌ Error in save/load operations:`, error.message);
    }
  }
}

/**
 * Example 6: Event System Demonstration (Phase 2+)
 */
export function demonstrateEventSystem(regions: ObbyRegion[]) {
  console.log('\n=== Complete Architecture Example: Event System ===');
  
  if (!FEATURE_FLAGS.useEventBus) {
    console.log('⚠️  Event system disabled via feature flag');
    return;
  }
  
  // Set up global event listeners
  const eventCounts = { plot: 0, block: 0, save: 0, player: 0 };
  
  GlobalEventBus.on('plot.assigned', () => eventCounts.plot++);
  GlobalEventBus.on('block.placed', () => eventCounts.block++);
  GlobalEventBus.on('save.completed', () => eventCounts.save++);
  GlobalEventBus.on('player.joined', () => eventCounts.player++);
  
  console.log('📡 Event listeners registered for:');
  console.log('  - plot.assigned');
  console.log('  - block.placed');
  console.log('  - save.completed');
  console.log('  - player.joined');
  
  // Simulate some events
  GlobalEventBus.emitSync('plot.assigned', { playerId: 'test1', plotIndex: 0, worldId: 'test' });
  GlobalEventBus.emitSync('block.placed', { playerId: 'test1', plotId: 'plot_0', position: {x:0,y:0,z:0}, blockId: 1 });
  GlobalEventBus.emitSync('save.completed', { playerId: 'test1', plotId: 'plot_0', success: true });
  
  console.log('\n📊 Event counts after simulation:');
  console.log(`  Plot events: ${eventCounts.plot}`);
  console.log(`  Block events: ${eventCounts.block}`);
  console.log(`  Save events: ${eventCounts.save}`);
  console.log(`  Player events: ${eventCounts.player}`);
  
  // Show event bus debug info
  const debugInfo = GlobalEventBus.getDebugInfo();
  console.log('\n🔍 Global Event Bus Info:');
  console.log(`  Active events: ${debugInfo.activeEvents.join(', ')}`);
  console.log(`  Total subscribers: ${debugInfo.totalSubscribers}`);
  console.log(`  Recent events: ${debugInfo.recentEvents.length}`);
}

/**
 * Example 7: Performance Comparison
 */
export async function demonstratePerformanceComparison(regions: ObbyRegion[], operations: number = 100) {
  console.log('\n=== Complete Architecture Example: Performance Comparison ===');
  
  const results: Record<string, { operations: number; totalTime: number; avgTime: number }> = {};
  
  for (const region of regions) {
    const context = region.getContext();
    const systemManager = SystemManager.getInstance();
    const systemType = systemManager.getWorldSystemType(region.world.name);
    
    console.log(`\n⏱️  Testing ${systemType} system (${region.id}):`);
    
    if (!context) {
      console.log('  ⚠️  No context available for performance testing');
      continue;
    }
    
    // Test plot operations
    const startTime = Date.now();
    
    for (let i = 0; i < operations; i++) {
      const testPlayerId = `test_player_${i}`;
      
      try {
        // Quick operations that don't modify state
        context.plotManager.getPlayerPlot(testPlayerId);
        context.blockSystem.canPlaceBlock({ id: testPlayerId }, 1, { x: 0, y: 0, z: 0 });
        context.saveSystem.hasPlayerObby({ id: testPlayerId });
      } catch (error) {
        // Ignore errors for performance testing
      }
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / operations;
    
    results[systemType] = { operations, totalTime, avgTime };
    
    console.log(`  📊 ${operations} operations in ${totalTime}ms (${avgTime.toFixed(2)}ms avg)`);
    
    // Show performance metrics if available (Phase 3+)
    if ('getPerformanceMetrics' in context) {
      const metrics = context.getPerformanceMetrics();
      if (Object.keys(metrics).length > 0) {
        console.log('  📈 Detailed metrics available:', Object.keys(metrics).join(', '));
      }
    }
  }
  
  console.log('\n🏆 Performance Summary:');
  const sortedResults = Object.entries(results).sort((a, b) => a[1].avgTime - b[1].avgTime);
  
  sortedResults.forEach(([system, result], index) => {
    const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📊';
    console.log(`  ${emoji} ${system}: ${result.avgTime.toFixed(2)}ms avg`);
  });
}

/**
 * Example 8: System Migration Demonstration
 */
export async function demonstrateSystemMigration(region: ObbyRegion) {
  console.log('\n=== Complete Architecture Example: System Migration ===');
  
  const systemManager = SystemManager.getInstance();
  const currentType = systemManager.getWorldSystemType(region.world.name);
  
  console.log(`📊 Current system: ${currentType}`);
  
  // Show migration capabilities
  const context = region.getContext();
  if (context && 'exportWorldState' in context) {
    console.log('✅ Export capability: Available');
    
    try {
      const worldState = await context.exportWorldState();
      console.log('📤 Export test successful:');
      console.log(`  - Exported at: ${new Date(worldState.exportedAt)}`);
      console.log(`  - Version: ${worldState.version}`);
      console.log(`  - Plots: ${worldState.plots?.length || 0}`);
    } catch (error) {
      console.log('❌ Export test failed:', error.message);
    }
  } else {
    console.log('❌ Export capability: Not available');
  }
  
  if (context && 'importWorldState' in context) {
    console.log('✅ Import capability: Available');
  } else {
    console.log('❌ Import capability: Not available');
  }
}

/**
 * Example 9: Compatibility Testing
 */
export async function demonstrateCompatibilityTesting() {
  console.log('\n=== Complete Architecture Example: Compatibility Testing ===');
  
  const systemManager = SystemManager.getInstance();
  
  try {
    const testResults = await systemManager.runCompatibilityTests();
    
    console.log('🧪 Compatibility Test Results:');
    console.log(`  ✅ Passed: ${testResults.passed}`);
    console.log(`  ❌ Failed: ${testResults.failed}`);
    console.log(`  📊 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
      console.log('\n❌ Failed Tests:');
      testResults.results
        .filter(result => !result.passed)
        .forEach(result => {
          console.log(`  - ${result.worldId} (${result.systemType}): ${result.details}`);
        });
    }
    
  } catch (error) {
    console.error('❌ Compatibility testing failed:', error.message);
  }
}

/**
 * Complete demonstration function
 */
export async function runCompleteArchitectureDemo() {
  console.log('🚀 Running Complete Architecture Demonstration');
  console.log('='.repeat(60));
  
  // Initialize
  demonstrateSystemManager();
  
  // Create test regions
  const regions = demonstrateMultipleRegions();
  
  // Create test players
  const players = [
    { id: 'player1', username: 'Alice' },
    { id: 'player2', username: 'Bob' },
    { id: 'player3', username: 'Charlie' },
    { id: 'player4', username: 'Diana' }
  ] as Player[];
  
  // Run demonstrations
  await demonstratePlayerAssignment(regions, players);
  await demonstrateBlockOperations(regions, players);
  await demonstrateSaveLoadOperations(regions, players);
  
  demonstrateEventSystem(regions);
  await demonstratePerformanceComparison(regions, 50);
  await demonstrateSystemMigration(regions[0]);
  await demonstrateCompatibilityTesting();
  
  console.log('\n✅ Complete Architecture Demonstration Finished!');
  console.log('='.repeat(60));
  
  // Show final statistics
  const systemManager = SystemManager.getInstance();
  const finalStats = systemManager.getSystemStatistics();
  console.log('\n📊 Final System Statistics:');
  console.log(JSON.stringify(finalStats, null, 2));
}