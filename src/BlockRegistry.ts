/*
================================================================================
HYTOPIA BLOCK REGISTRY: NOTES ON ADDING NEW BLOCKS (INCLUDING DIRECTIONAL BLOCKS)
================================================================================

Key Findings & Best Practices (2024-06):

1. Block Registration:
   - All blocks in Hytopia are defined in the BlockRegistry with a unique block type ID.
   - Block properties (id, name, textureUri, etc.) are shared by all blocks of that type.
   - The map format and block placement API only support block type IDs and coordinates.

2. No Per-Block Metadata:
   - You CANNOT store custom metadata (e.g., facing direction) on individual block instances in the map or via the block placement API.
   - All blocks of a given type share the same properties.
   - If you need per-block state, you must use either:
     a) Block entities (if supported by the SDK)
     b) An external data structure (e.g., a Map keyed by block coordinates)

3. Directional Blocks (e.g., Conveyors):
   - The recommended approach is to create separate block types for each direction:
     - conveyor-north (ID: ...)
     - conveyor-south (ID: ...)
     - conveyor-east  (ID: ...)
     - conveyor-west  (ID: ...)
   - When placing a conveyor, determine the intended direction (e.g., from player/camera facing) and place the correct block type.
   - The block's behavior uses its type to determine the force direction.
   - This is simple, robust, and compatible with the Hytopia SDK's block system.

4. External Metadata (Advanced):
   - If you need more flexibility, you can maintain an external map of block positions to metadata in your game code.
   - Be aware this requires extra work to keep in sync and persist if needed.

5. Block Entities (Advanced):
   - If the SDK supports block entities, use them for blocks that require unique state or behavior.

Summary: For most use cases, especially for directional conveyor blocks, use separate block types for each direction. This is the most compatible and maintainable approach with the current Hytopia SDK.
*/
import { Vector3 } from "hytopia";

// =============================================================================
// BLOCK REGISTRY - SINGLE SOURCE OF TRUTH FOR ALL BLOCKS
// =============================================================================
// This registry centralizes ALL block definitions to eliminate inconsistencies
// and provide a single point of maintenance for block data.

/**
 * Extended block definition with all possible metadata
 */
export interface BlockDefinition {
  id: number;
  name: string;
  textureUri: string;
  description?: string;
  category: 'environment' | 'basic' | 'obstacle' | 'special' | 'decoration';
  
  // Build system properties
  buildable?: boolean;
  destructible?: boolean;
  pointCost?: number;
  
  // Behavior properties
  isDeadly?: boolean;
  isSlippery?: boolean;
  isSandy?: boolean;
  bounceForce?: number;
  friction?: number;
  disappearAfterTime?: number;
  regenerateAfterTime?: number;
  
  // Special behavior flags
  isStartBlock?: boolean;
  isGoalBlock?: boolean;
  isCheckpoint?: boolean;
  isClimbable?: boolean;
  
  // Visual properties
  transparent?: boolean;
  emissive?: boolean;
  color?: string;
}

/**
 * Block categories for easy filtering and management
 */
export enum BlockCategory {
  ENVIRONMENT = 'environment',
  BASIC = 'basic',
  OBSTACLE = 'obstacle',
  SPECIAL = 'special',
  DECORATION = 'decoration'
}

/**
 * Centralized Block Registry - Single Source of Truth
 */
export class BlockRegistry {
  private static instance: BlockRegistry;
  private blocks: Map<number, BlockDefinition> = new Map();
  private blocksByName: Map<string, BlockDefinition> = new Map();
  private blocksByCategory: Map<string, BlockDefinition[]> = new Map();

  private constructor() {
    this.initializeBlocks();
  }

  public static getInstance(): BlockRegistry {
    if (!BlockRegistry.instance) {
      BlockRegistry.instance = new BlockRegistry();
    }
    return BlockRegistry.instance;
  }

  /**
   * Initialize all block definitions
   */
  private initializeBlocks(): void {
    const allBlocks: BlockDefinition[] = [
      // =================================================================
      // BASIC WORLD BLOCKS (IDs 1-21) - From map.json
      // =================================================================
      { 
        id: 1, name: 'bricks', textureUri: 'blocks/stone-bricks.png', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Basic brick block'
      },
      { 
        id: 2, name: 'clay', textureUri: 'blocks/clay.png', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Clay block'
      },
      { 
        id: 3, name: 'diamond-ore', textureUri: 'blocks/diamond-ore.png', 
        category: 'decoration', buildable: true, destructible: true, pointCost: 3,
        description: 'Valuable diamond ore'
      },
      { 
        id: 4, name: 'dirt', textureUri: 'blocks/dirt.png', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Basic dirt block'
      },
      { 
        id: 5, name: 'dragons-stone', textureUri: 'blocks/dragons-stone.png', 
        category: 'decoration', buildable: true, destructible: true, pointCost: 2,
        description: 'Mystical dragon stone'
      },
      { 
        id: 6, name: 'glass', textureUri: 'blocks/glass.png', 
        category: 'obstacle', buildable: true, destructible: true, pointCost: 3,
        description: 'Disappearing glass block', transparent: true,
        disappearAfterTime: 150, regenerateAfterTime: 5000
      },
      { 
        id: 7, name: 'grass', textureUri: 'blocks/grass', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Grass block'
      },
      { 
        id: 8, name: 'gravel', textureUri: 'blocks/gravel.png', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Gravel block'
      },
      { 
        id: 9, name: 'ice', textureUri: 'blocks/ice.png', 
        category: 'obstacle', buildable: true, destructible: true, pointCost: 1,
        description: 'Slippery ice block', isSlippery: true, friction: 0.02
      },
      { 
        id: 10, name: 'infected-shadowrock', textureUri: 'blocks/infected-shadowrock.png', 
        category: 'decoration', buildable: true, destructible: true, pointCost: 2,
        description: 'Corrupted shadowrock'
      },
      { 
        id: 11, name: 'log-side', textureUri: 'blocks/log', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Log block (side texture)'
      },
      { 
        id: 12, name: 'log-top', textureUri: 'blocks/log', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Log block (top texture)'
      },
      { 
        id: 13, name: 'mossy-cobblestone', textureUri: 'blocks/mossy-coblestone.png', 
        category: 'decoration', buildable: true, destructible: true, pointCost: 1,
        description: 'Mossy cobblestone'
      },
      { 
        id: 14, name: 'nuit', textureUri: 'blocks/nuit.png', 
        category: 'decoration', buildable: true, destructible: true, pointCost: 2,
        description: 'Nuit block'
      },
      { 
        id: 15, name: 'vines', textureUri: 'blocks/oak-planks-leafyerer.png', 
        category: 'special', buildable: true, destructible: true, pointCost: 1,
        description: 'Climbable vines', isClimbable: true
      },
      { 
        id: 16, name: 'oak-planks', textureUri: 'blocks/oak-planks.png', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Oak wooden planks'
      },
      { 
        id: 17, name: 'sand', textureUri: 'blocks/sand.png', 
        category: 'obstacle', buildable: true, destructible: true, pointCost: 1,
        description: 'Sticky sand block', isSandy: true, friction: 2.0
      },
      { 
        id: 18, name: 'shadowrock', textureUri: 'blocks/shadowrock.png', 
        category: 'decoration', buildable: true, destructible: true, pointCost: 2,
        description: 'Dark shadowrock'
      },
      { 
        id: 19, name: 'stone', textureUri: 'blocks/stone.png', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Basic stone block'
      },
      { 
        id: 20, name: 'stone-bricks', textureUri: 'blocks/stone.png', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Stone brick block'
      },
      { 
        id: 21, name: 'lava', textureUri: 'blocks/lava.png', 
        category: 'obstacle', buildable: true, destructible: true, pointCost: 2,
        description: 'Deadly lava block', isDeadly: true, emissive: true
      },
      { 
        id: 22, name: 'cloud', textureUri: 'blocks/cloud.png', 
        category: 'decoration', buildable: true, destructible: true, pointCost: 3,
        description: 'Cloud block for visual effects'
      },

      // =================================================================
      // ENVIRONMENT BLOCKS (IDs 22-43) - From generateObbyHubMap.ts
      // =================================================================
      { 
        id: 25, name: 'spawn-marker', textureUri: 'blocks/emerald-block.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Spawn area marker', emissive: true
      },
      { 
        id: 26, name: 'store-wall', textureUri: 'blocks/snow.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Store facade wall'
      },
      { 
        id: 27, name: 'store-window', textureUri: 'blocks/glass.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Store window', transparent: true
      },
      { 
        id: 28, name: 'parking-lot', textureUri: 'blocks/stone.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Parking lot surface'
      },
      { 
        id: 29, name: 'parking-gravel', textureUri: 'blocks/gravel.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Parking lot gravel layer'
      },
      { 
        id: 32, name: 'sign-block', textureUri: 'blocks/oak-planks.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Store signage block'
      },
      { 
        id: 33, name: 'street-asphalt', textureUri: 'blocks/stone.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Street asphalt surface'
      },
      { 
        id: 34, name: 'sidewalk', textureUri: 'blocks/stone-bricks.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Sidewalk surface'
      },
      { 
        id: 35, name: 'grass-field', textureUri: 'blocks/grass', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Grass field surface'
      },

      // Plot boundary glass blocks (colored)
      { 
        id: 36, name: 'glass-plot-1', textureUri: 'blocks/glass_1.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Plot 1 boundary glass', transparent: true, color: '#FF0000'
      },
      { 
        id: 37, name: 'glass-plot-2', textureUri: 'blocks/glass_2.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Plot 2 boundary glass', transparent: true, color: '#00FF00'
      },
      { 
        id: 38, name: 'glass-plot-3', textureUri: 'blocks/glass_3.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Plot 3 boundary glass', transparent: true, color: '#0000FF'
      },
      { 
        id: 39, name: 'glass-plot-4', textureUri: 'blocks/glass_4.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Plot 4 boundary glass', transparent: true, color: '#FFFF00'
      },
      { 
        id: 40, name: 'glass-plot-5', textureUri: 'blocks/glass_5.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Plot 5 boundary glass', transparent: true, color: '#FF00FF'
      },
      { 
        id: 41, name: 'glass-plot-6', textureUri: 'blocks/glass_6.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Plot 6 boundary glass', transparent: true, color: '#00FFFF'
      },
      { 
        id: 42, name: 'glass-plot-7', textureUri: 'blocks/glass_7.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Plot 7 boundary glass', transparent: true, color: '#FFA500'
      },
      { 
        id: 43, name: 'glass-plot-8', textureUri: 'blocks/glass_8.png', 
        category: 'environment', buildable: false, destructible: false,
        description: 'Plot 8 boundary glass', transparent: true, color: '#800080'
      },

      // =================================================================
      // SPECIAL OBBY BLOCKS (IDs 100+)
      // =================================================================
      { 
        id: 100, name: 'start', textureUri: 'blocks/start.png', 
        category: 'special', buildable: true, destructible: true, pointCost: 0,
        description: 'Start block - spawn point', isStartBlock: true, emissive: true
      },
      { 
        id: 101, name: 'goal', textureUri: 'blocks/goal.png', 
        category: 'special', buildable: true, destructible: true, pointCost: 0,
        description: 'Goal block - finish point', isGoalBlock: true, emissive: true
      },
      { 
        id: 102, name: 'checkpoint', textureUri: 'blocks/emerald-block.png', 
        category: 'special', buildable: true, destructible: true, pointCost: 3,
        description: 'Checkpoint - respawn point', isCheckpoint: true, emissive: true
      },
      { 
        id: 103, name: 'snow', textureUri: 'blocks/snow.png', 
        category: 'basic', buildable: true, destructible: true, pointCost: 1,
        description: 'Snow block'
      },
      { 
        id: 104, name: 'conveyor-z-', textureUri: 'blocks/conveyor-z-', 
        category: 'special', buildable: true, destructible: true, pointCost: 2,
        description: 'Conveyor belt - moves players in the negative Z direction (south)'
      },
      { 
        id: 105, name: 'conveyor-z+', textureUri: 'blocks/conveyor-z+', 
        category: 'special', buildable: true, destructible: true, pointCost: 2,
        description: 'Conveyor belt - moves players in the positive Z direction (north)'
      },
      { 
        id: 109, name: 'conveyor-x-', textureUri: 'blocks/conveyor-x-', 
        category: 'special', buildable: true, destructible: true, pointCost: 2,
        description: 'Conveyor belt - moves players in the negative X direction (west)'
      },
      { 
        id: 110, name: 'conveyor-x+', textureUri: 'blocks/conveyor-x+', 
        category: 'special', buildable: true, destructible: true, pointCost: 2,
        description: 'Conveyor belt - moves players in the positive X direction (east)'
      },

    ];

    // Build internal maps for fast lookup
    this.buildMaps(allBlocks);
  }

  /**
   * Build internal maps for fast lookups
   */
  private buildMaps(blocks: BlockDefinition[]): void {
    this.blocks.clear();
    this.blocksByName.clear();
    this.blocksByCategory.clear();

    for (const block of blocks) {
      // Main ID map
      this.blocks.set(block.id, block);
      
      // Name map (lowercase for case-insensitive lookup)
      this.blocksByName.set(block.name.toLowerCase(), block);
      
      // Category map
      if (!this.blocksByCategory.has(block.category)) {
        this.blocksByCategory.set(block.category, []);
      }
      this.blocksByCategory.get(block.category)!.push(block);
    }
  }

  // =================================================================
  // PUBLIC API METHODS
  // =================================================================

  /**
   * Get block definition by ID
   */
  public getBlock(id: number): BlockDefinition | undefined {
    return this.blocks.get(id);
  }

  /**
   * Get block definition by name (case-insensitive)
   */
  public getBlockByName(name: string): BlockDefinition | undefined {
    return this.blocksByName.get(name.toLowerCase());
  }

  /**
   * Get all blocks in a category
   */
  public getBlocksByCategory(category: BlockCategory | string): BlockDefinition[] {
    return this.blocksByCategory.get(category) || [];
  }

  /**
   * Get all buildable blocks (for UI panels)
   */
  public getBuildableBlocks(): BlockDefinition[] {
    return Array.from(this.blocks.values()).filter(block => block.buildable === true);
  }

  /**
   * Get all environment blocks (non-destructible)
   */
  public getEnvironmentBlocks(): BlockDefinition[] {
    return this.getBlocksByCategory(BlockCategory.ENVIRONMENT);
  }

  /**
   * Get environment block IDs as a Set (for fast lookup)
   */
  public getEnvironmentBlockIds(): Set<number> {
    return new Set(this.getEnvironmentBlocks().map(block => block.id));
  }

  /**
   * Check if a block ID is an environment block
   */
  public isEnvironmentBlock(id: number): boolean {
    const block = this.getBlock(id);
    return block?.category === BlockCategory.ENVIRONMENT;
  }

  /**
   * Check if a block is destructible
   */
  public isDestructible(id: number): boolean {
    const block = this.getBlock(id);
    return block?.destructible === true;
  }

  /**
   * Check if a block is buildable
   */
  public isBuildable(id: number): boolean {
    const block = this.getBlock(id);
    return block?.buildable === true;
  }

  /**
   * Get all blocks as an array
   */
  public getAllBlocks(): BlockDefinition[] {
    return Array.from(this.blocks.values());
  }

  /**
   * Get blocks formatted for map.json blockTypes array
   */
  public getMapJsonBlockTypes(): Array<{id: number, name: string, textureUri: string}> {
    return this.getAllBlocks().map(block => ({
      id: block.id,
      name: block.name,
      textureUri: block.textureUri
    }));
  }

  /**
   * Get block catalog for build system (buildable blocks only)
   */
  public getBuildCatalog(): Array<{
    id: number;
    name: string;
    description: string;
    category: string;
    pointCost: number;
    textureUri: string;
  }> {
    return this.getBuildableBlocks().map(block => ({
      id: block.id,
      name: block.name,
      description: block.description || '',
      category: block.category,
      pointCost: block.pointCost || 0,
      textureUri: block.textureUri
    }));
  }

  /**
   * Search blocks by name or description
   */
  public searchBlocks(query: string): BlockDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllBlocks().filter(block => 
      block.name.toLowerCase().includes(lowerQuery) ||
      (block.description && block.description.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get blocks with specific behavior flags
   */
  public getBlocksWithBehavior(behavior: keyof BlockDefinition): BlockDefinition[] {
    return this.getAllBlocks().filter(block => block[behavior] === true);
  }

  /**
   * Validate block registry integrity
   */
  public validateRegistry(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const ids = new Set<number>();
    const names = new Set<string>();

    for (const block of this.getAllBlocks()) {
      // Check for duplicate IDs
      if (ids.has(block.id)) {
        errors.push(`Duplicate block ID: ${block.id}`);
      }
      ids.add(block.id);

      // Check for duplicate names
      if (names.has(block.name.toLowerCase())) {
        errors.push(`Duplicate block name: ${block.name}`);
      }
      names.add(block.name.toLowerCase());

      // Check required fields
      if (!block.textureUri) {
        errors.push(`Block ${block.id} missing textureUri`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Register all block types with the Hytopia SDK's BlockTypeRegistry
   * This must be called before any block placement to prevent timing issues
   */
  public registerAllBlockTypes(world: any): void {
    
    for (const block of this.getAllBlocks()) {
      try {
        // Register each block type with the SDK
        const registeredBlock = world.blockTypeRegistry.registerGenericBlockType({
          id: block.id,
          textureUri: block.textureUri,
          name: block.name
        });
        
      } catch (error) {
        console.error(`[BlockRegistry] ❌ Failed to register block type ${block.id} (${block.name}):`, error);
      }
    }
    
  }

  /**
   * Register a specific block type with the SDK's BlockTypeRegistry
   */
  public registerBlockType(world: any, blockId: number): boolean {
    const block = this.getBlock(blockId);
    if (!block) {
      console.error(`[BlockRegistry] Cannot register unknown block type ${blockId}`);
      return false;
    }
    
    try {
      world.blockTypeRegistry.registerGenericBlockType({
        id: block.id,
        textureUri: block.textureUri,
        name: block.name
      });
      
      return true;
    } catch (error) {
      console.error(`[BlockRegistry] ❌ Failed to register block type ${block.id}:`, error);
      return false;
    }
  }

  /**
   * Register a specific block type in the registry (does not register with SDK directly)
   */
  public registerBlock(block: BlockDefinition): boolean {
    if (!block) {
      console.error(`[BlockRegistry] Cannot register unknown block type`);
      return false;
    }
    this.blocks.set(block.id, block);
    this.blocksByName.set(block.name, block);
    if (!this.blocksByCategory.has(block.category)) {
      this.blocksByCategory.set(block.category, []);
    }
    this.blocksByCategory.get(block.category)!.push(block);
    return true;
  }
}

// =================================================================
// CONVENIENCE EXPORTS
// =================================================================

/**
 * Get the singleton BlockRegistry instance
 */
export const blockRegistry = BlockRegistry.getInstance();

/**
 * Environment block IDs for easy access
 */
export const ENV_BLOCK_IDS = {
  ROAD_STONE: 22,
  SPAWN_MARKER: 25,
  STORE_WALL: 26,
  STORE_WINDOW: 27,
  PARKING_LOT: 28,
  PARKING_GRAVEL: 29,
  SIGN_BLOCK: 32,
  STREET_ASPHALT: 33,
  SIDEWALK: 34,
  GRASS_FIELD: 35,
  GLASS_1: 36,
  GLASS_2: 37,
  GLASS_3: 38,
  GLASS_4: 39,
  GLASS_5: 40,
  GLASS_6: 41,
  GLASS_7: 42,
  GLASS_8: 43,
  SNOW: 103
} as const;

/**
 * Special block IDs for easy access
 */
export const SPECIAL_BLOCK_IDS = {
  START: 100,
  GOAL: 101,
  CHECKPOINT: 102
} as const; 