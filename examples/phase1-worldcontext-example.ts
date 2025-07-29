/**
 * Phase 1: WorldContext Usage Examples
 * 
 * This file demonstrates how the new WorldContext API works alongside
 * the existing singleton-based system. All examples produce identical results.
 */

import { World, Player } from 'hytopia';
import ObbyRegion from '../src/ObbyRegion';
import { FEATURE_FLAGS } from '../src/FeatureFlags';

/**
 * Example 1: Plot Management
 * Shows how WorldContext provides cleaner API while maintaining identical behavior
 */
export function demonstrateWorldContextPlotManagement(region: ObbyRegion, playerId: string) {
  console.log('\n=== Phase 1 Example: Plot Management ===');
  
  const context = region.getContext();
  if (!context) {
    console.log('WorldContext disabled - using traditional approach only');
    
    // Traditional approach (current system)
    const plotManager = require('../src/PlotManager').PlotManager.getInstance();
    const playerPlot = plotManager.getPlayerPlot(playerId);
    console.log('Traditional approach result:', playerPlot);
    return;
  }
  
  // Traditional approach (current system)
  const plotManager = require('../src/PlotManager').PlotManager.getInstance();
  const traditionalResult = plotManager.getPlayerPlot(playerId);
  
  // New context approach (Phase 1)
  const contextResult = context.plotManager.getPlayerPlot(playerId);
  
  // Verify identical behavior
  const identical = JSON.stringify(traditionalResult) === JSON.stringify(contextResult);
  
  console.log('Traditional approach result:', traditionalResult);
  console.log('Context approach result:', contextResult);
  console.log('Results identical:', identical ? '✅ YES' : '❌ NO');
  
  if (!identical) {
    console.error('⚠️  COMPATIBILITY ISSUE DETECTED - Consider rollback');
  }
}

/**
 * Example 2: Block Placement
 * Shows cleaner API without needing to pass world parameter
 */
export function demonstrateWorldContextBlockPlacement(region: ObbyRegion, player: Player, blockType: number, position: any) {
  console.log('\n=== Phase 1 Example: Block Placement ===');
  
  const context = region.getContext();
  if (!context) {
    console.log('WorldContext disabled - using traditional approach only');
    
    // Traditional approach requires world parameter
    const blockManager = require('../src/BlockPlacementManager').BlockPlacementManager.getInstance();
    const canPlace = blockManager.canPlaceBlock(player, blockType, position, region.world);
    console.log('Traditional canPlaceBlock result:', canPlace);
    return;
  }
  
  // Traditional approach (requires world parameter)
  const blockManager = require('../src/BlockPlacementManager').BlockPlacementManager.getInstance();
  const traditionalResult = blockManager.canPlaceBlock(player, blockType, position, region.world);
  
  // New context approach (world context is implicit)
  const contextResult = context.blockSystem.canPlaceBlock(player, blockType, position);
  
  // Verify identical behavior
  const identical = traditionalResult === contextResult;
  
  console.log('Traditional approach (with world param):', traditionalResult);
  console.log('Context approach (implicit world):', contextResult);
  console.log('Results identical:', identical ? '✅ YES' : '❌ NO');
  
  // Demonstrate the cleaner API
  console.log('\n📝 API Comparison:');
  console.log('Old: blockManager.canPlaceBlock(player, blockType, position, world)');
  console.log('New: context.blockSystem.canPlaceBlock(player, blockType, position)');
  console.log('✨ Benefit: No need to pass world parameter - it\'s encapsulated in context');
}

/**
 * Example 3: System Initialization
 * Shows how context can simplify multi-manager initialization
 */
export function demonstrateWorldContextInitialization(region: ObbyRegion) {
  console.log('\n=== Phase 1 Example: System Initialization ===');
  
  const context = region.getContext();
  if (!context) {
    console.log('WorldContext disabled - traditional initialization used in constructor');
    return;
  }
  
  console.log('Traditional approach (in ObbyRegion constructor):');
  console.log('  this.obstaclePlacementManager.initializeWorld(this.world);');
  console.log('  this.obstacleCollisionManager.initializeWorld(this.world);');
  console.log('  this.plotSaveManager.initializeWorld(this.world);');
  console.log('  this.blockPlacementManager.initializeWorld(this.world);');
  console.log('  // ... more initialization calls');
  
  console.log('\nContext approach (single call):');
  console.log('  context.initializeAllSystems();');
  console.log('✨ Benefit: Single method call instead of multiple manager calls');
  
  // Show debug info
  const debugInfo = context.getDebugInfo();
  console.log('\nContext debug info:', debugInfo);
}

/**
 * Example 4: Error Handling and Rollback
 * Shows how feature flags enable safe rollback
 */
export function demonstrateRollbackCapability() {
  console.log('\n=== Phase 1 Example: Rollback Capability ===');
  
  console.log('Current feature flag status:');
  console.log('  enableWorldContext:', FEATURE_FLAGS.enableWorldContext);
  console.log('  logContextCompatibility:', FEATURE_FLAGS.logContextCompatibility);
  console.log('  enableCompatibilityTests:', FEATURE_FLAGS.enableCompatibilityTests);
  
  console.log('\n🔄 To rollback Phase 1 (if issues arise):');
  console.log('1. Set FEATURE_FLAGS.enableWorldContext = false');
  console.log('2. System automatically falls back to traditional singletons');
  console.log('3. Remove WorldContext import and usage from ObbyRegion');
  console.log('4. All existing functionality continues unchanged');
  
  console.log('\n✅ Rollback is safe because:');
  console.log('- All existing singleton code is unchanged');
  console.log('- WorldContext only delegates to existing singletons');
  console.log('- No data structures or business logic modified');
  console.log('- Feature flags prevent context usage when disabled');
}

/**
 * Example 5: Compatibility Testing
 * Shows automated compatibility verification
 */
export function demonstrateCompatibilityTesting(region: ObbyRegion, playerId: string) {
  console.log('\n=== Phase 1 Example: Compatibility Testing ===');
  
  // This will run compatibility checks if enabled
  region.verifyPhase1Compatibility(playerId);
  
  console.log('\n🧪 Compatibility testing features:');
  console.log('- Automatic comparison of old vs new API results');
  console.log('- Detailed logging when mismatches detected');
  console.log('- Can be disabled via feature flags for production');
  console.log('- Helps identify issues before they affect users');
}

/**
 * Example 6: Future-Proofing
 * Shows how Phase 1 prepares for future phases
 */
export function demonstrateFutureProofing() {
  console.log('\n=== Phase 1 Example: Future-Proofing ===');
  
  console.log('🔮 Phase 1 prepares for future improvements:');
  console.log('\nPhase 2 (Parallel Implementation):');
  console.log('- Add new implementations alongside old ones');
  console.log('- Use context to switch between implementations');
  console.log('- A/B testing becomes possible');
  
  console.log('\nPhase 3 (Gradual Replacement):');
  console.log('- Replace singleton internals with world-specific instances');
  console.log('- Context API remains unchanged');
  console.log('- Users experience no breaking changes');
  
  console.log('\nPhase 4 (Registry Pattern):');
  console.log('- Cross-world operations use global registry');
  console.log('- Individual worlds become fully isolated');
  console.log('- Better scalability and performance');
  
  console.log('\n✨ Key Benefit: Each phase is reversible and optional');
}

/**
 * Complete demonstration function
 * Call this to see all examples in action
 */
export function runAllPhase1Examples(region: ObbyRegion, player: Player, playerId: string) {
  console.log('🚀 Running Phase 1 WorldContext Examples');
  console.log('==========================================');
  
  demonstrateWorldContextPlotManagement(region, playerId);
  demonstrateWorldContextBlockPlacement(region, player, 1, { x: 0, y: 10, z: 0 });
  demonstrateWorldContextInitialization(region);
  demonstrateRollbackCapability();
  demonstrateCompatibilityTesting(region, playerId);
  demonstrateFutureProofing();
  
  console.log('\n✅ Phase 1 demonstrations complete!');
  console.log('The new WorldContext API is ready for gradual adoption.');
}