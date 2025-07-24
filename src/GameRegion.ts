import { World, Player, PlayerEvent, PlayerEntity } from 'hytopia';

export default abstract class GameRegion {
  public abstract id: string;
  public abstract world: World;
  
  constructor() {
    // Event handlers will be set up by subclass after world creation
  }

  protected setupEventHandlers(): void {
    // Call this after world is created in subclass constructor
    console.log(`[GameRegion] Setting up event handlers for region ${this.id}`);
    
    this.world.on(PlayerEvent.JOINED_WORLD, ({ player }: { player: Player }) => {
      console.log(`[GameRegion] Player ${player.id} joined region ${this.id}`);
      this.handlePlayerJoin(player);
    });

    this.world.on(PlayerEvent.LEFT_WORLD, ({ player }: { player: Player }) => {
      console.log(`[GameRegion] Player ${player.id} left region ${this.id}`);
      this.handlePlayerLeave(player);
    });
    
    console.log(`[GameRegion] Event handlers set up successfully for region ${this.id}`);
  }

  // Override in subclasses to handle player joining this region
  protected abstract handlePlayerJoin(player: Player): void;

  // Override in subclasses to handle player leaving this region  
  protected abstract handlePlayerLeave(player: Player): void;

  // Get the number of players currently in this region
  public getPlayerCount(): number {
    return this.world.entityManager.getAllPlayerEntities().length;
  }

  // Check if this region has space for more players
  public abstract hasSpace(): boolean;
} 