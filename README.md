# HYTOPIA Obby Creator

A multiplayer obby (obstacle course) creator game built with the HYTOPIA SDK.

## Features

### 🔨 Block Placement System
- **Mouse-based Building**: Left click to place blocks, right click to remove
- **Build Mode**: Toggle with `/build` command
- **Block Categories**: Basic, Obstacle, and Special blocks
- **Smart Placement**: Blocks are placed adjacent to surfaces you're looking at

### 📦 Block Types

**Basic Blocks:**
- Stone - Basic stone block
- Wood - Wooden planks  
- Brick - Red brick block
- Glass - Transparent glass

**Obstacle Blocks:**
- Kill Zone - Kills player on touch
- Ice Block - Slippery surface
- Bouncy Block - Bounces player upward
- Speed Block - Increases player speed

**Special Blocks:**
- Checkpoint - Save point for players
- Finish Line - End of the course
- Teleporter - Teleports to linked teleporter

## Controls

### Movement
- **WASD** - Move around
- **Space** - Jump
- **Shift** - Sprint
- **\\** - Toggle debug view

### Building
- **Left Click** - Place block (in build mode)
- **Right Click** - Remove block (in build mode)

### Chat Commands
- `/build` - Toggle build mode on/off
- `/block <name>` - Select a block type (e.g., `/block stone`, `/block kill zone`)
- `/blocks` - View all available blocks
- `/rocket` - Launch yourself into the air (for fun!)

## Getting Started

1. Join the game
2. Type `/build` to enter build mode
3. Use `/block <name>` to select your desired block type
4. Look where you want to place a block and left-click
5. Look at blocks you want to remove and right-click
6. Type `/build` again to exit build mode and test your creation

## Development

This project extends the HYTOPIA SDK boilerplate with:
- Custom `ObbyPlayerEntity` for enhanced player functionality
- Custom `ObbyPlayerController` for mouse-based building
- `BlockPlacementManager` for block placement logic
- Raycast-based targeting system

## Architecture

```
index.ts - Main server entry point
src/
├── ObbyPlayerEntity.ts - Custom player entity with building capabilities
├── ObbyPlayerController.ts - Custom controller for mouse input handling
└── BlockPlacementManager.ts - Block placement and removal logic
```

## Future Enhancements

- [ ] Block behavior implementation (kill zones, bouncy blocks, etc.)
- [ ] Course save/load system
- [ ] Play mode vs Build mode separation
- [ ] Timer system for course completion
- [ ] Multiplayer course racing
- [ ] Course sharing and browsing

## Documentation

For more information about the HYTOPIA SDK, visit:
- [SDK Documentation](https://github.com/hytopiagg/sdk/blob/main/docs/server.md)
- [Examples](https://github.com/hytopiagg/sdk/tree/main/examples)
- [Discord Community](https://discord.gg/DXCXJbHSJX)
