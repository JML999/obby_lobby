import { World, Vector3, PlayerEntity } from "hytopia";
import type { Player, Vector3Like, RaycastHit } from "hytopia";
import { BlockBehaviorManager } from "./BlockBehaviorManager";
import { PlotBoundaryManager } from "./PlotBoundaryManager";
import { ObstacleCollisionManager } from "./ObstacleCollisionManager";
import { PlotSaveManager } from "./PlotSaveManager";

export interface BlockType {
  id: number;
  name: string;
  description: string;
  category: 'basic' | 'obstacle' | 'special';
}

export class BlockPlacementManager {
  private static instance: BlockPlacementManager;
  // Remove singleton world storage - world will be passed as parameter
  private playerBuildModes: Map<string, boolean> = new Map();
  private playerSelectedBlocks: Map<string, number> = new Map();
  private plotBoundaryManager: PlotBoundaryManager;
  private obstacleCollisionManager: ObstacleCollisionManager;
  private plotSaveManager: PlotSaveManager;
  
  // Block catalog for obby creator (matching world map block IDs)
  public readonly BLOCK_CATALOG: BlockType[] = [
    // Required blocks (0 points)
    { id: 100, name: 'start', description: 'Start block - spawn point', category: 'special' },
    { id: 101, name: 'goal', description: 'Goal block - finish point', category: 'special' },
    
    // Basic movement blocks (1 point each) - names match world map
    { id: 1, name: 'platform', description: 'Basic platform block', category: 'basic' },
    { id: 19, name: 'stone', description: 'Stone platform block', category: 'basic' },
    { id: 16, name: 'oak-planks', description: 'Wood platform block', category: 'basic' },
    { id: 9, name: 'ice', description: 'Slippery ice block', category: 'obstacle' },
    { id: 17, name: 'sand', description: 'Sticky sand block', category: 'obstacle' },
    { id: 15, name: 'vines', description: 'Climbable vines', category: 'special' },
    
    // Hazard blocks (2 points each)
    { id: 21, name: 'lava', description: 'Deadly lava block', category: 'obstacle' },
    
    // Conveyor blocks (2 points each) - relative to player facing
    { id: 104, name: 'conveyor backward', description: 'Conveyor belt moving backward relative to your view', category: 'special' },
    { id: 105, name: 'conveyor forward', description: 'Conveyor belt moving forward relative to your view', category: 'special' },
    { id: 109, name: 'conveyor left', description: 'Conveyor belt moving left relative to your view', category: 'special' },
    { id: 110, name: 'conveyor right', description: 'Conveyor belt moving right relative to your view', category: 'special' },
    
    // Special blocks (3 points each)
    { id: 6, name: 'glass', description: 'Disappearing glass', category: 'obstacle' },
  ];

  public static getInstance(): BlockPlacementManager {
    if (!BlockPlacementManager.instance) {
      BlockPlacementManager.instance = new BlockPlacementManager();
    }
    return BlockPlacementManager.instance;
  }

  // Initialize world and register all block types - restored with block registration
  public initializeWorld(world: World): void {
    // Import blockRegistry and register all block types with this world
    const { blockRegistry } = require('./BlockRegistry');
    blockRegistry.registerAllBlockTypes(world);
    console.log(`[BlockPlacementManager] Initialized world ${world.name} and registered all block types`);
  }
  
  private constructor() {
    this.plotBoundaryManager = PlotBoundaryManager.getInstance();
    this.obstacleCollisionManager = ObstacleCollisionManager.getInstance();
    this.plotSaveManager = PlotSaveManager.getInstance();
  }

  // Toggle build mode for a player - now requires world parameter
  public toggleBuildMode(player: Player, world: World): void {
    const playerId = player.id.toString();
    const currentMode = this.playerBuildModes.get(playerId) || false;
    this.playerBuildModes.set(playerId, !currentMode);
    
    if (!currentMode) {
      // Entering build mode
      world.chatManager.sendPlayerMessage(player, '🔨 Build mode enabled!', 'FFD700');
      world.chatManager.sendPlayerMessage(player, 'Left click to place blocks, right click to remove');
      this.showBlockCatalog(player, world);
    } else {
      // Exiting build mode
      world.chatManager.sendPlayerMessage(player, '🏃 Build mode disabled!', 'FF6B6B');
    }
  }

  // Check if player is in build mode
  public isInBuildMode(player: Player): boolean {
    // Always return true for obby game - build mode is always enabled
    return true;
  }

  // Set selected block type for player - now requires world parameter
  public setSelectedBlock(player: Player, blockId: number, world?: World): boolean {
    console.log(`[BlockPlacementManager] Setting selected block to: ${blockId}`);
    const block = this.BLOCK_CATALOG.find(b => b.id === blockId);
    if (!block) {
      console.log(`[BlockPlacementManager] Block ID ${blockId} not found in catalog`);
      return false;
    }
    
    const playerId = player.id.toString();
    this.playerSelectedBlocks.set(playerId, blockId);
    console.log(`[BlockPlacementManager] Successfully set block ${blockId} (${block.name}) for player ${playerId}`);
    
    if (world) {
      world.chatManager.sendPlayerMessage(player, `Selected: ${block.name}`, '00FF00');
    }
    
    return true;
  }

  // Get player's selected block
  public getSelectedBlock(player: Player): number {
    const selectedBlock = this.playerSelectedBlocks.get(player.id.toString());
    console.log(`[BlockPlacementManager] Player ${player.id} selected block: ${selectedBlock}`);
    return selectedBlock || 1; // Default to platform
  }

  // Place a block at the target position - now requires world parameter
  public placeBlock(player: Player, position: Vector3Like, world: World, plotId?: string): boolean {
    if (!this.isInBuildMode(player)) return false;
    
    const blockId = this.getSelectedBlock(player);
    const blockType = this.BLOCK_CATALOG.find(b => b.id === blockId);
    
    console.log(`[BlockPlacementManager] Attempting to place block ID ${blockId} (${blockType?.name || 'unknown'}) at position:`, position);
    
    if (!blockType) {
      console.log(`[BlockPlacementManager] Block type not found for ID ${blockId}`);
      return false;
    }
    
    // Check if a start or goal block already exists in the plot
    if (plotId && (blockId === 100 || blockId === 101) && this.hasStartOrGoalBlock(plotId, blockId, world)) {
      const blockName = blockId === 100 ? 'start' : 'goal';
      world.chatManager.sendPlayerMessage(player, `❌ Only one ${blockName} block allowed per plot!`, 'FF0000');
      return false;
    }

    // Check plot boundaries if plotId is provided
    if (plotId) {
      const violation = this.plotBoundaryManager.checkBoundaries(plotId, position);
      if (violation.type !== 'valid') {
        world.chatManager.sendPlayerMessage(player, violation.message, 'FF0000');
        if (violation.suggestion) {
          world.chatManager.sendPlayerMessage(player, violation.suggestion, 'FFAA00');
        }
        return false;
      }
    } else {
      // Fallback to basic validation for global areas
      if (!this.isValidPlacement(position)) {
        world.chatManager.sendPlayerMessage(player, 'Cannot place block here!', 'FF0000');
        return false;
      }
    }

    // Check collision with existing obstacles
    const obstacleCollision = this.obstacleCollisionManager.canPlaceBlock(plotId, position);
    if (!obstacleCollision.valid) {
      world.chatManager.sendPlayerMessage(player, obstacleCollision.reason || 'Cannot place block here!', 'FF0000');
      if (obstacleCollision.suggestion) {
        world.chatManager.sendPlayerMessage(player, obstacleCollision.suggestion, 'FFAA00');
      }
      return false;
    }
    
    // Dynamic conveyor placement - map conceptual directions to actual world directions based on camera
    let actualBlockId = blockId;
    if (blockId === 104 || blockId === 105 || blockId === 109 || blockId === 110) {
      const camera = player.camera;
      const yaw = camera.facingDirection ? Math.atan2(camera.facingDirection.x, camera.facingDirection.z) : 0;
      
      // Convert yaw to degrees and normalize to 0-360
      let yawDegrees = (yaw * 180 / Math.PI + 360) % 360;
      
      // Determine which direction the player is facing
      // 0° = North (positive Z), 90° = East (positive X), 180° = South (negative Z), 270° = West (negative X)
      let playerFacingDirection: 'north' | 'east' | 'south' | 'west';
      if (yawDegrees >= 315 || yawDegrees < 45) {
        playerFacingDirection = 'north';
      } else if (yawDegrees >= 45 && yawDegrees < 135) {
        playerFacingDirection = 'east';
      } else if (yawDegrees >= 135 && yawDegrees < 225) {
        playerFacingDirection = 'south';
      } else {
        playerFacingDirection = 'west';
      }
      
      // Map conceptual direction to actual world direction based on player facing
      let conceptualDirection: 'forward' | 'backward' | 'left' | 'right' = 'forward'; // Default fallback
      
      if (blockId === 105) { // "Conveyor North" = forward relative to player
        conceptualDirection = 'forward';
      } else if (blockId === 104) { // "Conveyor South" = backward relative to player  
        conceptualDirection = 'backward';
      } else if (blockId === 110) { // "Conveyor East" = right relative to player
        conceptualDirection = 'right';
      } else if (blockId === 109) { // "Conveyor West" = left relative to player
        conceptualDirection = 'left';
      }
      
      // Convert conceptual direction to actual world direction
      const directionMap = {
        north: { forward: 105, backward: 104, right: 110, left: 109 }, // Player facing north
        east:  { forward: 110, backward: 109, right: 104, left: 105 }, // Player facing east  
        south: { forward: 104, backward: 105, right: 109, left: 110 }, // Player facing south
        west:  { forward: 109, backward: 110, right: 105, left: 104 }  // Player facing west
      };
      
      actualBlockId = directionMap[playerFacingDirection][conceptualDirection];
      
      console.log(`[BlockPlacementManager] Dynamic conveyor: selected=${blockId}, playerFacing=${playerFacingDirection} (${yawDegrees.toFixed(1)}°), conceptual=${conceptualDirection}, placing=${actualBlockId}`);
    }
    const coordinate = new Vector3(
      Math.floor(position.x),
      Math.floor(position.y),
      Math.floor(position.z)
    );
    
    console.log(`[BlockPlacementManager] Setting block at coordinate:`, coordinate, `with ID: ${actualBlockId}`);
    world.chunkLattice.setBlock(coordinate, actualBlockId);
    
    // Verify the block was placed
    const placedBlockId = world.chunkLattice.getBlockId(coordinate);
    console.log(`[BlockPlacementManager] Block placed, verification - expected: ${actualBlockId}, actual: ${placedBlockId}`);
    
    // Track the block placement if plotId is provided
    if (plotId) {
      this.plotSaveManager.trackBlockPlacement(plotId, coordinate, actualBlockId);
      // Also record user-placed block for efficient clearing
      this.plotSaveManager.trackUserPlacedBlock(world, coordinate, actualBlockId, player.id, plotId);
    }
    
    // Send feedback
    world.chatManager.sendPlayerMessage(player, `Placed ${blockType.name}`, '00FF00');
    
    return true;
  }

  // Remove a block at the target position - now requires world parameter
  public removeBlock(player: Player, position: Vector3Like, world: World, plotId?: string): boolean {
    if (!this.isInBuildMode(player)) return false;
    
    // Check plot boundaries if plotId is provided (for consistency)
    if (plotId) {
      const violation = this.plotBoundaryManager.checkBoundaries(plotId, position);
      if (violation.type !== 'valid') {
        world.chatManager.sendPlayerMessage(player, `Cannot remove block: ${violation.message}`, 'FF0000');
        return false;
      }
    }
    
    const coordinate = new Vector3(
      Math.floor(position.x),
      Math.floor(position.y),
      Math.floor(position.z)
    );
    
    console.log(`[BlockPlacementManager] Attempting to remove block at coordinate:`, coordinate);
    
    // Check if there's actually a block there
    const currentBlockId = world.chunkLattice.getBlockId(coordinate);
    console.log(`[BlockPlacementManager] Current block ID at position: ${currentBlockId}`);
    
    if (currentBlockId === 0) {
      console.log(`[BlockPlacementManager] No block found at position (ID: 0)`);
      world.chatManager.sendPlayerMessage(player, 'No block to remove here!', 'FF0000');
      return false;
    }
    
    // Use delete_block → air sequence to clear zombie blocks
    const DELETE_BLOCK_ID = 106;
    
    // First, set to delete_block
    console.log(`[BlockPlacementManager] About to set block to delete_block (ID: ${DELETE_BLOCK_ID}) at coordinate:`, coordinate);
    world.chunkLattice.setBlock(coordinate, DELETE_BLOCK_ID);
    console.log(`[BlockPlacementManager] Set block to delete_block (ID: ${DELETE_BLOCK_ID})`);
    
    // Verify the delete_block was set correctly
    const deleteBlockVerify = world.chunkLattice.getBlockId(coordinate);
    console.log(`[BlockPlacementManager] Delete block verification - expected: ${DELETE_BLOCK_ID}, actual: ${deleteBlockVerify}`);
    
    // Wait a brief moment, then set to air
    setTimeout(() => {
      console.log(`[BlockPlacementManager] About to set block to air (ID: 0) at coordinate:`, coordinate);
      
      // Double-check the current block ID before setting to air
      const currentBlockId = world.chunkLattice.getBlockId(coordinate);
      console.log(`[BlockPlacementManager] Current block ID before setting to air: ${currentBlockId}`);
      
      // Only set to air if the current block is the delete_block or some other valid block
      if (currentBlockId === DELETE_BLOCK_ID || currentBlockId === 0) {
        world.chunkLattice.setBlock(coordinate, 0);
        console.log(`[BlockPlacementManager] Set block to air (ID: 0)`);
        
        // Verify the block was actually removed
        const removedBlockId = world.chunkLattice.getBlockId(coordinate);
        console.log(`[BlockPlacementManager] Block removal verification - expected: 0, actual: ${removedBlockId}`);
      } else {
        console.warn(`[BlockPlacementManager] Unexpected block ID ${currentBlockId} found, not setting to air to prevent crash`);
      }
    }, 100); // 100ms delay to make delete_block visible
    
    // Track the block removal if plotId is provided
    if (plotId) {
      this.plotSaveManager.trackBlockPlacement(plotId, coordinate, 0);
      // Also record user block removal for efficient clearing
      this.plotSaveManager.trackUserPlacedBlock(world, coordinate, 0, player.id, plotId);
    }
    
    // Get block info for feedback
    const blockType = this.BLOCK_CATALOG.find(b => b.id === currentBlockId);
    const blockName = blockType ? blockType.name : `Block ID ${currentBlockId}`;
    
    world.chatManager.sendPlayerMessage(player, `Removed ${blockName}`, 'FFA500');
    console.log(`[BlockPlacementManager] Successfully removed block ${blockName} at`, coordinate);
    
    return true;
  }

  // Raycast to find where player is looking - now requires world parameter
  public getTargetPosition(player: Player, world: World, maxDistance: number = 10): Vector3Like | null {
    // Get player entity
    const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
    if (playerEntities.length === 0) return null;
    
    const playerEntity = playerEntities[0];
    if (!playerEntity) return null;
    
    const playerPos = playerEntity.position;
    const playerRotation = playerEntity.rotation;
    
    // Calculate direction from player's rotation
    const direction = {
      x: Math.sin(playerRotation.y) * Math.cos(playerRotation.x),
      y: -Math.sin(playerRotation.x),
      z: Math.cos(playerRotation.y) * Math.cos(playerRotation.x)
    };
    
    // Calculate target position
    const targetPosition = {
      x: playerPos.x + direction.x * maxDistance,
      y: playerPos.y + direction.y * maxDistance,
      z: playerPos.z + direction.z * maxDistance
    };
    
    return targetPosition;
  }

  // Check if a position is valid for block placement (fallback for non-plot areas)
  private isValidPlacement(position: Vector3Like): boolean {
    // Basic bounds checking for global areas
    if (position.y < -10 || position.y > 100) return false;
    if (Math.abs(position.x) > 200 || Math.abs(position.z) > 200) return false;
    
    return true;
  }

  // Check if a start or goal block already exists in the plot
  private hasStartOrGoalBlock(plotId: string, blockId: number, world: World): boolean {
    if (!plotId) return false;
    
    // Get all blocks in the plot from PlotSaveManager
    const userPlacedBlocks = this.plotSaveManager.getUserPlacedBlocksInPlot(world, plotId);
    
    // Check if a block of the same type already exists
    return userPlacedBlocks.some(block => block.blockTypeId === blockId);
  }

  // Show available blocks to player - now requires world parameter
  private showBlockCatalog(player: Player, world: World): void {
    world.chatManager.sendPlayerMessage(player, '📋 Available Blocks:', 'FFFF00');
    
    const categories = ['basic', 'obstacle', 'special'];
    categories.forEach(category => {
      const categoryBlocks = this.BLOCK_CATALOG.filter(b => b.category === category);
      if (categoryBlocks.length > 0) {
        world.chatManager.sendPlayerMessage(player, `--- ${category.toUpperCase()} ---`, 'CCCCCC');
        categoryBlocks.forEach(block => {
          world.chatManager.sendPlayerMessage(player, `${block.name} (ID: ${block.id}) - ${block.description}`, 'FFFFFF');
        });
      }
    });
  }

  // Handle block selection by name - now requires world parameter
  public selectBlockByName(player: Player, blockName: string, world?: World): boolean {
    const block = this.BLOCK_CATALOG.find(b => 
      b.name.toLowerCase().includes(blockName.toLowerCase())
    );
    
    if (!block) {
      if (world) {
        world.chatManager.sendPlayerMessage(player, `Block "${blockName}" not found!`, 'FF0000');
      }
      return false;
    }
    
    return this.setSelectedBlock(player, block.id, world);
  }
} 