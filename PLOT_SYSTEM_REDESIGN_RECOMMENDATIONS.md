# Plot System Redesign Recommendations

## Current Issue Summary
**Date**: July 28, 2025  
**Issue**: Player-4 assigned to plot_3 but UI shows "by player-2" when starting course

### Root Cause
The `PlotSaveManager.getPlotCreatorName()` method checks all connected players' persistent data instead of checking current plot assignment from PlotManager. This causes mismatched creator attribution.

## System Overview
The game supports:
- Multiple world instances (multi-region architecture)
- 8 plots per world
- Default/pool maps loaded initially
- Player assignment clears default and loads player content
- "For sale" system when players leave (content preserved)

## Quick Fix (Immediate)
```typescript
// In PlotSaveManager.getPlotCreatorName():
public async getPlotCreatorName(plotIndex: number, world?: World): Promise<string | null> {
  // Check current plot assignment FIRST
  const plotManager = PlotManager.getInstance();
  const managedWorld = plotManager.findManagedWorld(world);
  if (managedWorld) {
    const plot = managedWorld.plots[plotIndex];
    if (plot?.ownerId) {
      return plot.ownerId; // Current owner IS the creator while assigned
    }
  }
  // Only then check metadata for "for sale" plots...
}
```

## Recommended Architecture Redesign

### 1. **Plot State Machine**
Implement clear state transitions:
- `EMPTY_DEFAULT` → Has pool/default map
- `PLAYER_ASSIGNED` → Active player owns and builds
- `FOR_SALE` → Player left, content preserved  
- `TRANSITIONING` → Locked during updates

### 2. **Event-Driven Architecture**
Central event bus coordinates all systems:
```typescript
PlotEventBus
├── PlotAssigned → Updates all systems atomically
├── PlotAbandoned → Transitions to "for sale"
├── PlotReclaimed → Clears for reuse
└── PlotContentUpdated → Syncs save/display
```

### 3. **Plot Snapshot System**
Track plot state with integrity:
```typescript
interface PlotSnapshot {
  version: number;
  state: PlotState;
  owner: string | null;
  contentCreator: string;
  contentHash: string; // Verify integrity
  metadata: { blockCount, obstacleCount, lastModified }
}
```

### 4. **Ownership Transfer Protocol**
Atomic updates when plots change hands:
1. Lock plot
2. Create snapshot
3. Clear old content
4. Load new content
5. Update all systems
6. Unlock plot

### 5. **System Responsibilities**

| System | Current Issues | Redesign Solution |
|--------|---------------|-------------------|
| PlotManager | Only tracks assignment | Add state machine |
| PlotSaveManager | Confused creator lookup | Use current assignment |
| PlotEntranceEntity | Shows wrong creator | Subscribe to events |
| ScoreboardManager | Inconsistent persistence | Snapshot-based saves |

## Implementation Recommendations

### Phase 1: Quick Fix (30 minutes)
- Fix `getPlotCreatorName()` logic
- Add debug logging
- Test multi-player scenarios

### Phase 2: Core Refactor (2-3 hours)
- Implement PlotStateMachine
- Create PlotEventBus
- Update existing managers to use events

### Phase 3: Full Redesign (4-6 hours)
- Add snapshot system
- Implement ownership transfer protocol
- Add "for sale" tracking
- Comprehensive testing

## Benefits of Redesign
1. **Consistency**: Single source of truth for plot state
2. **Reliability**: Atomic updates prevent race conditions
3. **Scalability**: Event system handles complex interactions
4. **Maintainability**: Clear separation of concerns
5. **Features**: Enables plot trading, versioning, history

## Testing Considerations
- Multiple players joining/leaving rapidly
- Server restarts with "for sale" plots
- Cross-region plot loading
- Concurrent plot updates
- Edge cases (full worlds, no free plots)

## Conclusion
The current system works but has coordination issues between subsystems. The quick fix solves the immediate problem. The full redesign would create a robust foundation for future plot-based features and eliminate entire classes of bugs around plot ownership and content attribution.

**Recommendation**: Apply quick fix now, schedule redesign for dedicated session with fresh context.