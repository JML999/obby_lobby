/**
 * EventBus - Phase 2 Architecture Component
 * 
 * Provides decoupled communication between systems using events.
 * Replaces direct method calls with event-driven architecture.
 */

export interface EventPayload {
  [key: string]: any;
}

export type EventHandler<T = EventPayload> = (payload: T) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe(): void;
}

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private onceHandlers = new Map<string, Set<EventHandler>>();
  private eventHistory: Array<{ event: string; payload: any; timestamp: number }> = [];
  private maxHistorySize = 1000;

  constructor(private debugName?: string) {
    if (this.debugName) {
      console.log(`[EventBus:${this.debugName}] Created event bus`);
    }
  }

  /**
   * Subscribe to an event
   */
  on<T = EventPayload>(event: string, handler: EventHandler<T>): EventSubscription {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    
    this.handlers.get(event)!.add(handler as EventHandler);
    
    if (this.debugName) {
      console.log(`[EventBus:${this.debugName}] Subscribed to event: ${event}`);
    }
    
    return {
      unsubscribe: () => {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
          eventHandlers.delete(handler as EventHandler);
          if (eventHandlers.size === 0) {
            this.handlers.delete(event);
          }
        }
      }
    };
  }

  /**
   * Subscribe to an event once (auto-unsubscribe after first trigger)
   */
  once<T = EventPayload>(event: string, handler: EventHandler<T>): EventSubscription {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    
    this.onceHandlers.get(event)!.add(handler as EventHandler);
    
    return {
      unsubscribe: () => {
        const eventHandlers = this.onceHandlers.get(event);
        if (eventHandlers) {
          eventHandlers.delete(handler as EventHandler);
        }
      }
    };
  }

  /**
   * Emit an event to all subscribers
   */
  async emit<T = EventPayload>(event: string, payload: T): Promise<void> {
    const timestamp = Date.now();
    
    // Store in history for debugging
    this.eventHistory.push({ event, payload, timestamp });
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
    
    if (this.debugName) {
      console.log(`[EventBus:${this.debugName}] Emitting event: ${event}`, payload);
    }
    
    // Handle regular subscribers
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      const promises: Promise<void>[] = [];
      
      for (const handler of eventHandlers) {
        try {
          const result = handler(payload as EventPayload);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          console.error(`[EventBus:${this.debugName}] Error in event handler for ${event}:`, error);
        }
      }
      
      // Wait for all async handlers
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    }
    
    // Handle once subscribers
    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      const handlersToCall = Array.from(onceHandlers);
      this.onceHandlers.delete(event); // Remove all once handlers
      
      const promises: Promise<void>[] = [];
      
      for (const handler of handlersToCall) {
        try {
          const result = handler(payload as EventPayload);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          console.error(`[EventBus:${this.debugName}] Error in once handler for ${event}:`, error);
        }
      }
      
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    }
  }

  /**
   * Emit an event synchronously (fire and forget)
   */
  emitSync<T = EventPayload>(event: string, payload: T): void {
    this.emit(event, payload).catch(error => {
      console.error(`[EventBus:${this.debugName}] Error in async emission of ${event}:`, error);
    });
  }

  /**
   * Get list of events that have subscribers
   */
  getActiveEvents(): string[] {
    const events = new Set<string>();
    
    for (const event of this.handlers.keys()) {
      events.add(event);
    }
    
    for (const event of this.onceHandlers.keys()) {
      events.add(event);
    }
    
    return Array.from(events).sort();
  }

  /**
   * Get number of subscribers for an event
   */
  getSubscriberCount(event: string): number {
    const regularCount = this.handlers.get(event)?.size || 0;
    const onceCount = this.onceHandlers.get(event)?.size || 0;
    return regularCount + onceCount;
  }

  /**
   * Get recent event history for debugging
   */
  getRecentEvents(limit: number = 10): Array<{ event: string; payload: any; timestamp: number }> {
    return this.eventHistory.slice(-limit);
  }

  /**
   * Clear all subscribers and history
   */
  clear(): void {
    this.handlers.clear();
    this.onceHandlers.clear();
    this.eventHistory = [];
    
    if (this.debugName) {
      console.log(`[EventBus:${this.debugName}] Cleared all subscribers and history`);
    }
  }

  /**
   * Get debug information about the event bus
   */
  getDebugInfo(): any {
    return {
      name: this.debugName || 'unnamed',
      activeEvents: this.getActiveEvents(),
      totalSubscribers: Array.from(this.handlers.values()).reduce((sum, set) => sum + set.size, 0) +
                       Array.from(this.onceHandlers.values()).reduce((sum, set) => sum + set.size, 0),
      historySize: this.eventHistory.length,
      recentEvents: this.getRecentEvents(5).map(e => ({ event: e.event, timestamp: e.timestamp }))
    };
  }
}

// === Event Type Definitions ===

export interface PlotEvents {
  'plot.assigned': { playerId: string; plotIndex: number; worldId: string };
  'plot.released': { playerId: string; plotIndex: number; worldId: string };
  'plot.cleared': { plotId: string; worldId: string };
}

export interface BlockEvents {
  'block.placed': { playerId: string; plotId: string; position: any; blockId: number };
  'block.removed': { playerId: string; plotId: string; position: any; previousBlockId: number };
  'block.validated': { plotId: string; isValid: boolean; errors: string[] };
}

export interface ObstacleEvents {
  'obstacle.placed': { playerId: string; plotId: string; obstacleType: string; position: any };
  'obstacle.removed': { playerId: string; plotId: string; obstacleType: string; position: any };
}

export interface EnemyEvents {
  'enemy.spawned': { plotId: string; enemyType: string; position: any; entityId: string };
  'enemy.despawned': { plotId: string; enemyType: string; entityId: string };
  'enemy.attacked': { enemyId: string; targetId: string; damage: number };
}

export interface PlayerEvents {
  'player.joined': { playerId: string; plotIndex: number; worldId: string };
  'player.left': { playerId: string; plotIndex: number; worldId: string };
  'player.entered_plot': { playerId: string; plotId: string; plotIndex: number };
  'player.exited_plot': { playerId: string; plotId: string; plotIndex: number };
}

export interface SaveEvents {
  'save.started': { playerId: string; plotId: string };
  'save.completed': { playerId: string; plotId: string; success: boolean };
  'load.started': { playerId: string; plotId: string };
  'load.completed': { playerId: string; plotId: string; success: boolean };
}

export type AllEvents = PlotEvents & BlockEvents & ObstacleEvents & EnemyEvents & PlayerEvents & SaveEvents;

/**
 * Global event bus for cross-world events
 */
export const GlobalEventBus = new EventBus('Global');

/**
 * Create a world-specific event bus
 */
export function createWorldEventBus(worldId: string): EventBus {
  return new EventBus(worldId);
}