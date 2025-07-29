/**
 * Feature Flags for Architecture Refactoring
 * 
 * These flags allow safe, gradual migration to the new architecture.
 * Each phase can be enabled/disabled independently for testing and rollback.
 */

export const FEATURE_FLAGS = {
  // Phase 1: WorldContext wrapper
  enableWorldContext: false,          // Enable WorldContext access
  logContextCompatibility: true,      // Log compatibility checks
  useContextForNewFeatures: false,    // Use context for new features only
  
  // Phase 2: Parallel implementation
  enableParallelSystems: true,        // Enable new parallel system implementations
  useEventBus: true,                  // Enable event-driven communication
  enableNewSystems: false,            // Use new system implementations
  
  // Phase 3: Gradual replacement
  useNewBlockSystem: false,           // Use new block placement system
  useNewPlotSystem: false,            // Use new plot management system
  useNewSaveSystem: false,            // Use new save system
  useNewWorldContext: false,          // Use new WorldContext implementation
  
  // Phase 4: Registry pattern
  useGlobalRegistry: false,           // Use global plot registry for cross-world tracking
  enableWorldPooling: false,          // Enable automatic world cleanup
  
  // Development/Testing flags
  enableCompatibilityTests: true,     // Run compatibility tests
  verboseLogging: true,               // Extra logging for debugging
  enablePerformanceMetrics: false,    // Track performance metrics
  enableEventLogging: false,          // Log all events
  
  // A/B Testing (can enable for subset of regions)
  testContextOnPercentage: 0,         // 0-100: percentage of regions to test new context on
  testNewSystemsPercentage: 0,        // 0-100: percentage of regions to test new systems on
} as const;

/**
 * Utility function to check if a feature flag is enabled
 */
export function isEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[flag] === true;
}

/**
 * Utility function to check if a region should use new features based on percentage
 */
export function shouldUseNewFeatures(regionId: string): boolean {
  if (FEATURE_FLAGS.testContextOnPercentage === 0) return false;
  if (FEATURE_FLAGS.testContextOnPercentage === 100) return true;
  
  // Use regionId hash to determine if this region should use new features
  const hash = regionId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const percentage = Math.abs(hash % 100);
  return percentage < FEATURE_FLAGS.testContextOnPercentage;
}

/**
 * Utility function to log feature flag status on startup
 */
export function logFeatureFlagStatus(): void {
  console.log('[FeatureFlags] Current feature flag configuration:');
  
  const enabledFlags = Object.entries(FEATURE_FLAGS)
    .filter(([_, value]) => value === true)
    .map(([key, _]) => key);
    
  const disabledFlags = Object.entries(FEATURE_FLAGS)
    .filter(([_, value]) => value === false)
    .map(([key, _]) => key);
  
  console.log(`[FeatureFlags] ✅ Enabled (${enabledFlags.length}):`, enabledFlags);
  console.log(`[FeatureFlags] ❌ Disabled (${disabledFlags.length}):`, disabledFlags);
  
  if (FEATURE_FLAGS.testContextOnPercentage > 0) {
    console.log(`[FeatureFlags] 🧪 A/B Testing: ${FEATURE_FLAGS.testContextOnPercentage}% of regions will use new features`);
  }
}