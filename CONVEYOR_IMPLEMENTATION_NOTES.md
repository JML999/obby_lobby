# Conveyor Belt Implementation - Complete Guide

## Overview
This document details the complete implementation of directional conveyor belts in the Hytopia game, including forward and backward moving conveyors.

## Key Learning: How Block Registration Works in Hytopia

### 1. Block Definition (BlockRegistry.ts)
```typescript
// Blocks must be defined in the allBlocks array in initializeBlocks()
{ 
  id: 104, name: 'conveyor-forward', textureUri: 'blocks/voidsoil.png', 
  category: 'special', buildable: true, destructible: true, pointCost: 2,
  description: 'Conveyor belt - moves players forward automatically'
},
{ 
  id: 105, name: 'conveyor-backward', textureUri: 'blocks/nuit.png', 
  category: 'special', buildable: true, destructible: true, pointCost: 2,
  description: 'Conveyor belt - moves players backward automatically'
}
```

### 2. World Map Registration (generateObbyHubMap.ts)
```typescript
// Blocks must ALSO be registered in the world's blockTypeRegistry
{ id: 104, name: "conveyor-forward", textureUri: "blocks/voidsoil.png" },
{ id: 105, name: "conveyor-backward", textureUri: "blocks/nuit.png" },
```

### 3. Behavior Implementation (BlockBehaviorManager.ts)
```typescript
// Forward conveyor behavior (from registry lookup)
if (block.name === 'conveyor-forward') {
    behavior.onTouch = (player, world, blockPos) => {
        (player as any).isOnConveyor = true;
        (player as any).conveyorDirection = 'forward';
        (player as any).conveyorStrength = 8.0;
    };
}

// Backward conveyor behavior (manual registration)
this.behaviors.set(105, {
    id: 105,
    name: "conveyor-backward",
    onTouch: (player, world) => {
        (player as any).isOnConveyor = true;
        (player as any).conveyorDirection = "backward";
        (player as any).conveyorStrength = 7.5;
    },
});
```

### 4. Physics Implementation (ObbyPlayerController.ts)
```typescript
private applyConveyorPhysics(entity: DefaultPlayerEntity, input: PlayerInput, cameraOrientation: PlayerCameraOrientation, deltaTimeMs: number): void {
    // Start with normal movement physics
    super.tickWithPlayerInput(entity, input, cameraOrientation, deltaTimeMs);
    
    // Then override velocity to add conveyor movement
    const currentVelocity = entity.linearVelocity;
    
    // Determine conveyor direction and boost
    let conveyorBoost = -7.5; // Default: forward (south/negative Z)
    if ((entity as any).conveyorDirection === "backward") {
        conveyorBoost = 7.5; // Move north (positive Z)
    }
    
    // Player input modifies conveyor speed
    if (input.w) {
        conveyorBoost *= 1.6; // Speed up with W
    } else if (input.s) {
        conveyorBoost *= 0.2; // Slow down with S
    }
    
    // Apply conveyor by adding to current velocity
    const newZVelocity = currentVelocity.z + conveyorBoost;
    entity.setLinearVelocity({
        x: currentVelocity.x,
        y: currentVelocity.y,
        z: Math.max(Math.min(newZVelocity, 24.0), -24.0) // Clamp to prevent excessive speed
    });
}
```

### 5. Block Detection (BlockBehaviorManager.ts)
```typescript
// Must detect both conveyor types in behavior checking
} else if (blockBelowId === 104 || blockBelowId === 105) { // Conveyor blocks (forward and backward)
    // Conveyor state is already set by behavior.onTouch above
    (player as any).isOnIce = false;
    (player as any).isOnSand = false;
    // Keep isOnConveyor = true (set by onTouch)
} else {
```

## Placement in Lobby
- **Forward Conveyor (ID 104)**: Placed at `ROAD_X_END - 4` (4 blocks left from right edge)
- **Backward Conveyor (ID 105)**: Placed at `ROAD_X_END - 7` (3 blocks left of forward conveyor)
- **Length**: Both run from `-MAP_LENGTH/2 + 20` to `STORE_Z - 20`
- **Y Level**: 1 (on top of the lobby floor)

## Visual Distinction
- **Forward Conveyor**: Uses `blocks/voidsoil.png` texture (dark)
- **Backward Conveyor**: Uses `blocks/nuit.png` texture (lighter/different color)

## Movement Behavior
- **Forward Conveyor**: Moves players south (negative Z direction)
- **Backward Conveyor**: Moves players north (positive Z direction)
- **Base Speed**: 7.5-8.0 blocks/second
- **Input Modification**:
  - W key: 1.6x speed boost (faster in direction of travel)
  - S key: 0.2x speed reduction (slower/reverse)
- **Residual Momentum**: Yes, players continue moving briefly after stepping off

## Lessons Learned

### About Hytopia Block System
1. **Dual Registration Required**: Blocks must be registered in BOTH `BlockRegistry.ts` and `generateObbyHubMap.ts`
2. **No Per-Block Metadata**: Individual block instances cannot store custom data (like facing direction)
3. **Separate Block Types**: Directional blocks require separate block type IDs (recommended approach)
4. **Behavior System**: Uses `onTouch` callbacks for continuous effects, `onStandingOn` for one-time effects

### About Physics Integration
1. **Layer Above Normal Movement**: Conveyor physics are applied AFTER normal movement physics
2. **Velocity Override**: Conveyors modify the player's velocity directly
3. **Input Responsiveness**: Player input can modify conveyor behavior in real-time
4. **State Management**: Conveyor state is stored on the player entity temporarily

### About Implementation Patterns
1. **Registry-Driven Behavior**: Some behaviors can be automatically registered based on block properties
2. **Manual Behavior Registration**: Complex behaviors may require manual registration
3. **Consistent Detection**: Block detection logic must be updated to include all relevant block IDs
4. **Debug Logging**: Essential for troubleshooting block detection and behavior triggering

## Future Enhancements
- East/West conveyors (would require additional block IDs 106, 107)
- Variable speed conveyors
- Curved or diagonal conveyors
- Conveyor activation switches
- Visual animations (moving texture patterns)

## Error Prevention Checklist
When adding new blocks:
- [ ] Add to `BlockRegistry.ts` allBlocks array
- [ ] Add to `generateObbyHubMap.ts` blockTypeRegistry
- [ ] Implement behavior in `BlockBehaviorManager.ts`
- [ ] Update detection logic for any special behavior
- [ ] Test block placement and physics behavior
- [ ] Verify texture loading and visual appearance 