import { World, WorldManager, Player, Vector3 } from 'hytopia';
import GameRegion from './GameRegion';
import { PlotManager } from './PlotManager';
import { BlockPlacementManager } from './BlockPlacementManager';
import { ObstaclePlacementManager } from './ObstaclePlacementManager';
import { ObstacleCollisionManager } from './ObstacleCollisionManager';
import { ObbyPlayerController } from './ObbyPlayerController';
import { ObbyPlayerEntity } from './ObbyPlayerEntity';
import { generateObbyHubMap, getPlotCoordinates } from './generateObbyHubMap';
import { PlotSaveManager } from './PlotSaveManager';
import { ObbyPlayManager } from './ObbyPlayManager';
import { PlayerStateManager, PlayerGameState } from './PlayerGameState';
import { ParkingLotPopulator } from './ParkingLotPopulator';
import { GreeterNpc } from './entities/GreeterNpc';
import { type NpcConfig } from './entities/DialogNpc';
// import { TrafficManager } from './TrafficManager'; // TODO: Enable for next version - Traffic system ready but disabled for production

export default class ObbyRegion extends GameRegion {
  public id: string;
  public world: World;
  private plotManager: PlotManager;
  private blockPlacementManager: BlockPlacementManager;
  private obstaclePlacementManager: ObstaclePlacementManager;
  private obstacleCollisionManager: ObstacleCollisionManager;
  private plotSaveManager: PlotSaveManager;
  // TODO: Enable for next version - Traffic system ready but disabled for production
  // private trafficManager?: TrafficManager;
  private maxPlayers: number = 5;

  constructor(regionId: string) {
    super();
    this.id = regionId;
    
    // Create the world
    this.world = WorldManager.instance.createWorld({
      name: regionId,
      skyboxUri: 'skyboxes/partly-cloudy',
    });
    
    console.log(`[ObbyRegion] Created region ${this.id} with world ${this.world.name}`);
    
    // Load the map
    this.world.loadMap(generateObbyHubMap());
    console.log(`[ObbyRegion] Loaded map for region ${this.id}`);
    
    // Populate parking lot with decorations
    console.log(`[ObbyRegion] Populating parking lot for region ${this.id}...`);
    const parkingLotPopulator = new ParkingLotPopulator(this.world);
    parkingLotPopulator.populateParkingLot();
    console.log(`[ObbyRegion] Parking lot populated for region ${this.id}`);
    
    // Initialize managers
    this.plotManager = PlotManager.getInstance();
    this.blockPlacementManager = BlockPlacementManager.getInstance();
    this.obstaclePlacementManager = ObstaclePlacementManager.getInstance();
    this.obstacleCollisionManager = ObstacleCollisionManager.getInstance();
    this.plotSaveManager = PlotSaveManager.getInstance();
    // TODO: Enable for next version - Traffic system ready but disabled for production
    // this.trafficManager = new TrafficManager(this.world);
    
    // Initialize managers for this world
    this.obstaclePlacementManager.initializeWorld(this.world);
    this.obstacleCollisionManager.initializeWorld(this.world);
    this.plotSaveManager.initializeWorld(this.world);
    this.blockPlacementManager.initializeWorld(this.world);
    
    // Initialize EnemyPlacementManager
    const { EnemyPlacementManager } = require('./EnemyPlacementManager');
    const enemyPlacementManager = EnemyPlacementManager.getInstance();
    enemyPlacementManager.initializeWorld(this.world);
    
    // Plot initialization is now handled automatically by PlotManager.assignPlayerToPlotInWorld()
    // when the first player is assigned to this region
    
    // Set up event handlers - world will be registered when first player joins
    this.setupEventHandlers();
    
    // Spawn the Greeter NPC in this region
    this.spawnGreeterNpc();
    
    // TODO: Enable for next version - Traffic system ready but disabled for production
    // Start traffic system after everything is set up
    // setTimeout(() => {
    //   this.trafficManager?.start();
    //   console.log(`[ObbyRegion] Traffic system started for region ${this.id}`);
    // }, 3000); // 3 second delay to ensure world is fully loaded
    
    console.log(`[ObbyRegion] Initialized region ${this.id} successfully`);
  }

  private spawnGreeterNpc(): void {
    console.log(`[ObbyRegion] Spawning greeter NPC in region ${this.id}`);
    
    const greeterConfig: NpcConfig = {
      id: "greeter",
      definitionId: "greeter",
      name: "Greeter",
      position: { x: -1.5, y: 3, z: 131 }, // Greeter position
      facing: { x:  0, y: 3, z: 135 }, // Facing towards the entrance
      modelUri: "models/npcs/npc_greeter.gltf", // Temporarily using cow model for testing
      modelScale: 1.0, // Made it bigger to be more visible
      interaction: {
        type: "dialog",
        prompt: "Welcome! Ready to start building, or want to explore other obbys?",
        options: [
          { text: "Start Building", response: "Great! Let's get you started on your obby course. I'll take you to Plot 4 where you can build!" },
          { text: "Explore", response: "To play other obbys, just walk up to any plot entrance and press 'Play'! Each plot has different courses to try." }
        ]
      },
      idleAnimation: "idle",
      interactAnimation: "wave"
    };

    const playerStateManager = PlayerStateManager.getInstance();
    const greeterNpc = new GreeterNpc(this.world, playerStateManager, greeterConfig);
    greeterNpc.spawn();
    
    // Register the NPC instance globally so it can be found by mobile players
    (globalThis as any).npcRegistry = (globalThis as any).npcRegistry || new Map();
    (globalThis as any).npcRegistry.set(`${this.world.name}:${greeterConfig.id}`, greeterNpc);
    
    console.log(`[ObbyRegion] Greeter NPC spawned successfully in region ${this.id} and registered globally`);
  }

  protected handlePlayerJoin(player: Player): void {
    console.log(`[ObbyRegion] Player ${player.id} joined region ${this.id}`);
    
    // Start traffic system if this is the first player
    if (this.getPlayerCount() === 1) {
      // this.trafficManager?.start(); // Disabled for production
      console.log(`[ObbyRegion] Traffic system restarted for region ${this.id}`);
    }
    
    // Get player's assigned plot (should already be assigned by GameManager)
    const playerPlot = this.plotManager.getPlayerPlot(player.id);
    if (!playerPlot) {
      console.error(`[ObbyRegion] Player ${player.id} joined region but has no assigned plot!`);
      return;
    }
    
    const displayNumber = this.getDisplayNumber(playerPlot.plotIndex);
    console.log(`[ObbyRegion] Player ${player.id} has plot ${displayNumber} in this region`);
    
    // Choose a random spawn position in the parking lot
    const parkingLotSpawns = [
        { x: 0, y: 30, z: 158 },
        { x: -8, y: 30, z: 162 },
        { x: 8, y: 30, z: 162 },
        { x: -12, y: 30, z: 170 },
        { x: 12, y: 30, z: 170 }
    ];
    const spawnPos = parkingLotSpawns[Math.floor(Math.random() * parkingLotSpawns.length)]!;
    console.log(`[ObbyRegion] Spawning player ${player.id} at position: (${spawnPos.x}, ${spawnPos.y}, ${spawnPos.z})`);

    // Create and spawn the player entity
    const controller = new ObbyPlayerController(this.world);
    // Enable fall detection for lobby/build mode
    controller.setFallDetectionEnabled(true);
    controller.setFallThreshold(-5);
    const playerEntity = new ObbyPlayerEntity(player, this.world, controller);
    playerEntity.spawn(this.world, spawnPos);
    console.log(`[ObbyRegion] Player entity spawned for ${player.id} in region ${this.id}`);
    
    // Debug: Check if player entity is registered immediately after spawn
    setTimeout(() => {
      const allPlayerEntities = this.world.entityManager.getAllPlayerEntities();
      console.log(`[ObbyRegion] DEBUG - Player entities after spawn: ${allPlayerEntities.length}`);
      allPlayerEntities.forEach((entity, index) => {
        console.log(`[ObbyRegion] DEBUG - Player entity ${index}: ID=${entity.player.id}, spawned=${entity.isSpawned}, constructor=${entity.constructor.name}`);
      });
    }, 100);

    // Auto-load player's saved obby if they have one (with delay to ensure world is fully initialized)
    setTimeout(() => {
      this.autoLoadPlayerObby(player, playerPlot.plotIndex);
    }, 2000); // 2 seconds should be sufficient

    // Send detailed chat messages after a delay (welcome message is now handled in ObbyPlayerEntity.onUIReady)
    setTimeout(() => {
      const displayNumber = this.getDisplayNumber(playerPlot.plotIndex);
      this.sendDetailedInstructions(player, displayNumber);
    }, 4000); // Wait 4 seconds for animated welcome message to finish
  }

  protected handlePlayerLeave(player: Player): void {
    console.log(`[ObbyRegion] Player ${player.id} left region ${this.id}`);
    
    // Debug: Show current player count before cleanup
    const playerCountBefore = this.getPlayerCount();
    console.log(`[ObbyRegion] Player count before cleanup: ${playerCountBefore}`);
    
    // CRITICAL: Release the player's plot when they leave
    console.log(`[ObbyRegion] Releasing plot for player ${player.id}`);
    PlotManager.getInstance().releasePlayerPlot(player.id);
    
    // Debug: Check if plot release worked
    const managedWorld = this.plotManager.findManagedWorld(this.world);
    if (managedWorld) {
      const availablePlots = managedWorld.plots.filter(p => !p.ownerId).length;
      console.log(`[ObbyRegion] Available plots after release: ${availablePlots}`);
    }
    
    // Check if the player has an active obby play session and clean it up
    this.cleanupPlayerObbySession(player);
    
    // Clean up player entities when they leave this region
    console.log(`[ObbyRegion] Cleaning up player entities for ${player.id}`);
    this.world.entityManager.getPlayerEntitiesByPlayer(player).forEach((entity: any) => {
      console.log(`[ObbyRegion] Despawning entity for player ${player.id}`);
      entity.despawn();
    });
    
    // Debug: Show current player count after cleanup
    const playerCountAfter = this.getPlayerCount();
    console.log(`[ObbyRegion] Player count after cleanup: ${playerCountAfter}`);
    console.log(`[ObbyRegion] hasSpace() result: ${this.hasSpace()}`);
    
    // Clean up any plot save manager tracking for this player
    this.plotSaveManager.handlePlayerDisconnect(player);
    
    // Stop traffic system if no players remain
    if (this.getPlayerCount() === 0) {
      // this.trafficManager?.stop(); // Disabled for production
      console.log(`[ObbyRegion] Traffic system stopped for empty region ${this.id}`);
    }
  }

  /**
   * Clean up any active obby play session for a disconnecting player
   */
     private cleanupPlayerObbySession(player: Player): void {
     try {
       const obbyPlayManager = ObbyPlayManager.getInstance();
       const playerStateManager = PlayerStateManager.getInstance();
       
       // Check if this player is currently playing
       const isPlaying = obbyPlayManager.isPlayerPlaying(player.id);
       const currentState = playerStateManager.getCurrentState(player.id);
       
       console.log(`[ObbyRegion] Player ${player.id} cleanup - isPlaying: ${isPlaying}, state: ${currentState}`);
       
       if (isPlaying || currentState === PlayerGameState.PLAYING) {
         console.log(`[ObbyRegion] Player ${player.id} has active obby session, forcing cleanup`);
         
         // Use the new session-based cleanup for this specific player
         obbyPlayManager.cleanupPlayerSession(player.id);
         
         console.log(`[ObbyRegion] Successfully cleaned up obby session for player ${player.id}`);
       } else {
         console.log(`[ObbyRegion] Player ${player.id} has no active obby session to clean up`);
       }
       
       // Always clean up player state tracking when they disconnect completely
       playerStateManager.removePlayer(player.id);
       console.log(`[ObbyRegion] Removed player state tracking for ${player.id}`);
       
     } catch (error) {
       console.error(`[ObbyRegion] Error cleaning up obby session for player ${player.id}:`, error);
     }
   }

  public override getPlayerCount(): number {
    return this.world.entityManager.getAllPlayerEntities().length;
  }

  public hasSpace(): boolean {
    const playerCount = this.getPlayerCount();
    
    // First check: basic player count limit
    if (playerCount >= this.maxPlayers) {
      return false;
    }
    
    // Second check: are there any available plots in this region?
    const managedWorld = this.plotManager.findManagedWorld(this.world);
    if (managedWorld) {
      const availablePlots = managedWorld.plots.filter(p => !p.ownerId).length;
      console.log(`[ObbyRegion] hasSpace check for ${this.id}: ${playerCount}/${this.maxPlayers} players, ${availablePlots} available plots`);
      return availablePlots > 0;
    }
    
    // If world not managed yet, assume it has space (plots will be created when needed)
    console.log(`[ObbyRegion] hasSpace check for ${this.id}: ${playerCount}/${this.maxPlayers} players, world not managed yet (assuming space available)`);
    return true;
  }

  /**
   * Convert plot index to clockwise display number
   */
  private getDisplayNumber(plotIndex: number): number {
    const clockwiseMap: { [key: number]: number } = {
      0: 4, // Left top → 4
      1: 3, // Left middle-top → 3
      2: 2, // Left middle-bottom → 2
      3: 1, // Left bottom → 1
      4: 5, // Right top → 5
      5: 6, // Right middle-top → 6
      6: 7, // Right middle-bottom → 7
      7: 8  // Right bottom → 8
    };
    
    return clockwiseMap[plotIndex] || plotIndex + 1;
  }

  private async autoLoadPlayerObby(player: Player, plotIndex: number): Promise<void> {
    try {
      console.log(`[ObbyRegion] Processing plot assignment for player ${player.id}`);
      
      // IMPORTANT: Only auto-load for players in LOBBY state
      // Players who are already BUILDING or PLAYING shouldn't have their data auto-loaded
      const { PlayerStateManager, PlayerGameState } = await import('./PlayerGameState');
      const playerStateManager = PlayerStateManager.getInstance();
      const currentState = playerStateManager.getCurrentState(player.id);
      
      if (currentState && currentState !== PlayerGameState.LOBBY) {
        console.log(`[ObbyRegion] Skipping auto-load for player ${player.id} - already in state: ${currentState}`);
        return;
      }
      
      // Generate plot ID for this plot
      const plotId = `plot_${plotIndex}`;
      
      // ALWAYS clear the plot first to give player a clean slate
      // This ensures any previous player's unsaved builds or pool maps are removed
      console.log(`[ObbyRegion] Clearing plot ${plotId} for player ${player.id} to provide clean slate`);
      
      // Clear physical blocks AND metadata when new player claims the plot
      await this.plotSaveManager.clearPlotPhysicalContent(plotId, player.world);
      
      // Also clear metadata tracking since this is a new player claiming the plot
      this.plotSaveManager.clearTrackedBlocks(plotId, player.world);
      
      // Clear user-placed block tracking for this plot
      if (player.world) {
        const userPlacedBlocks = this.plotSaveManager.getUserPlacedBlocksInPlot(player.world, plotId);
        console.log(`[ObbyRegion] Found ${userPlacedBlocks.length} user-placed blocks to clear for plot ${plotId}`);
        
        // Clear each user-placed block from tracking
        const userBlocks = this.plotSaveManager['getUserPlacedSet'](player.world);
        const metadata = this.plotSaveManager['getUserBlockMetadata'](player.world);
      
              for (const block of userPlacedBlocks) {
          const key = `${block.position.x},${block.position.y},${block.position.z}`;
          userBlocks.delete(key);
          metadata.delete(key);
        }
        
        console.log(`[ObbyRegion] Cleared ${userPlacedBlocks.length} user-placed blocks from tracking for plot ${plotId}`);
      }
      
      // Check if player has saved obby data
      const hasSavedObby = await this.plotSaveManager.hasPlayerObby(player);
      
      if (hasSavedObby) {
        console.log(`[ObbyRegion] Player ${player.id} has saved obby data, loading it...`);
        
        // Load the player's saved obby onto their assigned plot
        await this.plotSaveManager.loadPlayerObby(player, plotId);
        
        this.world.chatManager.sendPlayerMessage(player, '🔄 Your saved obby has been loaded!', '00FF00');
        console.log(`[ObbyRegion] Successfully auto-loaded obby for player ${player.id} onto plot ${plotId}`);
      } else {
        console.log(`[ObbyRegion] Player ${player.id} has no saved obby data - plot is ready for building`);
        this.world.chatManager.sendPlayerMessage(player, '🏠 Your plot is ready for building!', '00FF00');
      }
    } catch (error) {
      console.error(`[ObbyRegion] Error processing plot assignment for player ${player.id}:`, error);
      this.world.chatManager.sendPlayerMessage(player, '⚠️ Error setting up your plot', 'FFAA00');
    }
  }

  private sendDetailedInstructions(player: Player, plotNumber: number): void {
    this.world.chatManager.sendPlayerMessage(player, `Welcome! You have been assigned to plot ${plotNumber}.`, '00FF00');
    this.world.chatManager.sendPlayerMessage(player, '🏠 You can build in your assigned plot!', 'FFD700');
    this.world.chatManager.sendPlayerMessage(player, '🔨 Walk into your plot entrance to see build options', 'FFD700');
    this.world.chatManager.sendPlayerMessage(player, 'Or walk to other plots to play!', 'FFD700');

  }
} 