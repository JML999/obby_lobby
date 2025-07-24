/**
 * HYTOPIA SDK Boilerplate
 * 
 * This is a simple boilerplate to get started on your project.
 * It implements the bare minimum to be able to run and connect
 * to your game server and run around as the basic player entity.
 * 
 * From here you can begin to implement your own game logic
 * or do whatever you want!
 * 
 * You can find documentation here: https://github.com/hytopiagg/sdk/blob/main/docs/server.md
 * 
 * For more in-depth examples, check out the examples folder in the SDK, or you
 * can find it directly on GitHub: https://github.com/hytopiagg/sdk/tree/main/examples/payload-game
 * 
 * You can officially report bugs or request features here: https://github.com/hytopiagg/sdk/issues
 * 
 * To get help, have found a bug, or want to chat with
 * other HYTOPIA devs, join our Discord server:
 * https://discord.gg/DXCXJbHSJX
 * 
 * Official SDK Github repo: https://github.com/hytopiagg/sdk
 * Official SDK NPM Package: https://www.npmjs.com/package/hytopia
 */

import {
  startServer,
  Audio,
  PlayerEntity,
  DefaultPlayerEntity,
  PlayerEvent,
  ColliderShape,
  Entity,
  EntityEvent,
  RigidBodyType,
  WorldManager,
  World,
  Player,
} from 'hytopia';

import { generateObbyHubMap, getPlotCoordinates } from './src/generateObbyHubMap';
import { BlockPlacementManager } from './src/BlockPlacementManager';
import { ObstaclePlacementManager } from './src/ObstaclePlacementManager';
import { BouncePadObstacle } from './src/obstacles/BouncePadObstacle';
import RotatingBeamEntity from './src/obstacles/RotatingBeamEntity';
import SeesawEntity from './src/obstacles/SeesawEntity';
import GameManager from './src/GameManager';
import { PlayerStateManager, PlayerGameState } from './src/PlayerGameState';
import { PlotBuildManager } from './src/PlotBuildManager';
import { PlotSaveManager } from './src/PlotSaveManager';
import { ObbyPlayManager } from './src/ObbyPlayManager';
import { MobileDetectionManager } from './src/MobileDetectionManager';


/**
 * startServer is always the entry point for our game.
 * It accepts a single function where we should do any
 * setup necessary for our game. The init function is
 * passed a World instance which is the default
 * world created by the game server on startup.
 * 
 * Documentation: https://github.com/hytopiagg/sdk/blob/main/docs/server.startserver.md
 */

startServer(world => {
  /**
   * Initialize the Game Manager using the Frontiers pattern
   * This replaces all the complex world management logic with a clean architecture
   */
  console.log('[Server] Initializing Game Manager...');
  GameManager.instance.initialize();
  console.log('[Server] Game Manager initialized successfully');

  /**
   * Initialize PlayerStateManager, PlotBuildManager, PlotSaveManager, ObbyPlayManager, and MobileDetectionManager
   */
  const playerStateManager = PlayerStateManager.getInstance();
  const plotBuildManager = PlotBuildManager.getInstance();
  const plotSaveManager = PlotSaveManager.getInstance();
  const obbyPlayManager = ObbyPlayManager.getInstance();
  const mobileDetectionManager = MobileDetectionManager.getInstance();
  
  // Initialize managers with the default world
  const { BlockPlacementManager } = require('./src/BlockPlacementManager');
  const blockPlacementManager = BlockPlacementManager.getInstance();
  blockPlacementManager.initializeWorld(world);
  plotSaveManager.initializeWorld(world);
  obbyPlayManager.initializeWorld(world);
  console.log('[Server] PlayerStateManager, PlotBuildManager, PlotSaveManager, BlockPlacementManager, ObbyPlayManager, and MobileDetectionManager initialized');



  /**
   * Handle player connections - initialize their state
   */
  world.on(PlayerEvent.JOINED_WORLD, ({ player }: { player: Player }) => {
    console.log(`[Server] Player ${player.id} joined - initializing to LOBBY state`);
    playerStateManager.setPlayerState(player.id, PlayerGameState.LOBBY, undefined, player);
  });

  /**
   * Handle player disconnections - clean up global state
   * NOTE: Plot release is handled at the region level in ObbyRegion.handlePlayerLeave()
   */
  world.on(PlayerEvent.LEFT_WORLD, async ({ player }: { player: Player }) => {
    console.log(`[Server] Player ${player.id} disconnected from server`);
    // Plot release is now handled in ObbyRegion.handlePlayerLeave()
    playerStateManager.removePlayer(player.id);
    await plotSaveManager.handlePlayerDisconnect(player);
  });

  /**
   * Debug commands - simplified for the new architecture
   */
  

  

  // Spawn a bounce pad obstacle next to the ice block for testing
  // Import the class
  // (Assume BouncePadObstacle is exported from src/obstacles/BouncePadObstacle)
  // If not already imported at the top:

 

  /**
   * Play some peaceful ambient music to
   * set the mood!
   */
  
  new Audio({
    uri: 'audio/music/hytopia-main-theme.mp3',
    loop: true,
    volume: 0.1,
  }).play(world);
});
