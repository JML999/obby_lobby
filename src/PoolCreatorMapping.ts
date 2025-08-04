/**
 * Pool Creator Mapping Library
 * 
 * This library maintains the hardcoded mapping between pool numbers and their
 * hashed creator names for consistent leaderboard persistence across all regions.
 */

/**
 * Mapping of pool numbers to their unique hashed creator names
 */
export const POOL_CREATOR_MAPPING: Record<string, string> = {
  'pool-1': 'pool-1-x7k9m2',
  'pool-2': 'pool-2-a3f8n5',
  'pool-3': 'pool-3-w6j4q1',
  'pool-4': 'pool-4-b9r7t3',
  'pool-5': 'pool-5-c2h5p8',
  'pool-6': 'pool-6-d8l3v6',
  'pool-7': 'pool-7-e5n9z4',
  'pool-8': 'pool-8-f1k6s7',
  'pool-9': 'pool-9-g4m2w9',
  'pool-10': 'pool-10-h7p5x1',
  'pool-11': 'pool-11-i3q8y2',
  'pool-12': 'pool-12-j6t1z5',
  'pool-13': 'pool-13-k9v4a8',
  'pool-14': 'pool-14-l2x7b3',
  'pool-15': 'pool-15-m5z3c6',
  'pool-16': 'pool-16-n8a6d9',
  'pool-17': 'pool-17-o1c9e4',
  'pool-18': 'pool-18-p4e2f7',
  'pool-19': 'pool-19-q7f5g1',
  'pool-20': 'pool-20-r3g8h6',
};

/**
 * Get the hashed creator name for a pool number
 * @param poolNumber - The pool number (1-20)
 * @returns The hashed creator name (e.g., 'pool-1-x7k9m2')
 */
export function getPoolCreatorName(poolNumber: number): string {
  const poolKey = `pool-${poolNumber}`;
  const creatorName = POOL_CREATOR_MAPPING[poolKey];
  
  if (!creatorName) {
    console.warn(`[PoolCreatorMapping] No creator name found for ${poolKey}, using fallback`);
    return `pool-${poolNumber}-default`;
  }
  
  return creatorName;
}

/**
 * Check if a creator name is a pool creator
 * @param creatorName - The creator name to check
 * @returns True if this is a pool creator name
 */
export function isPoolCreator(creatorName: string): boolean {
  return Object.values(POOL_CREATOR_MAPPING).includes(creatorName);
}

/**
 * Get the pool number from a pool creator name  
 * @param creatorName - The pool creator name (e.g., 'pool-1-x7k9m2')
 * @returns The pool number or null if not a pool creator
 */
export function getPoolNumberFromCreator(creatorName: string): number | null {
  for (const [poolKey, mappedCreatorName] of Object.entries(POOL_CREATOR_MAPPING)) {
    if (mappedCreatorName === creatorName) {
      const poolNumber = parseInt(poolKey.replace('pool-', ''));
      return isNaN(poolNumber) ? null : poolNumber;
    }
  }
  return null;
}

/**
 * Get all available pool creator names
 * @returns Array of all pool creator names
 */
export function getAllPoolCreators(): string[] {
  return Object.values(POOL_CREATOR_MAPPING);
}

/**
 * Debug information about the pool creator mapping
 */
export function getPoolCreatorMappingInfo(): { totalPools: number; mappings: Record<string, string> } {
  return {
    totalPools: Object.keys(POOL_CREATOR_MAPPING).length,
    mappings: { ...POOL_CREATOR_MAPPING }
  };
}