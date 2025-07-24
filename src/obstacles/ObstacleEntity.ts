import { Entity, type EntityOptions, EntityEvent, type EventPayloads, World, Audio } from 'hytopia';

export default class ObstacleEntity extends Entity {
    protected activated: boolean = false;
    protected paused: boolean = false;
    protected worldActive: World | null = null;
    
    constructor(options: EntityOptions = {}) {
        // Add obstacle tag to all obstacle entities
        const obstacleOptions = {
            ...options,
            tag: 'obstacle'
        };
        
        super(obstacleOptions);
        // Call onPhysicsUpdate every entity tick, ensuring correct 'this'
        this.on(EntityEvent.TICK, this.onPhysicsUpdate.bind(this));
    }

    /**
     * Called every entity tick to apply custom physics logic.
     * Subclasses should override this method.
     * @param payload - Contains tickDeltaMs (time since last tick)
     */
    public onPhysicsUpdate(payload: EventPayloads[EntityEvent.TICK]): void {
        // Base implementation checks activation state before processing
        if (!this.activated || this.paused) return;
        
        // Subclasses should override this method for custom physics
        this.updatePhysics(payload);
    }

    /**
     * Override this method in subclasses to implement custom physics logic.
     * This method is only called when the obstacle is activated and not paused.
     */
    protected updatePhysics(payload: EventPayloads[EntityEvent.TICK]): void {
        // Base implementation does nothing.
    }

    /**
     * Activate the obstacle's movement or behavior.
     * Subclasses should check this state before applying physics/movement.
     */
    public activate(): void {
        if (!this.activated) {
            this.activated = true;
        }
    }

    /**
     * Deactivate the obstacle's movement or behavior.
     */
    public deactivate(): void {
        if (this.activated) {
            this.activated = false;
        }
    }

    public reset(): void {
        // Subclasses can override
    }

    public setPauseMovement(pause: boolean): void {
        this.paused = pause;
    }

    public isPaused(): boolean {
        return this.paused;
    }

    /**
     * Check if the obstacle is currently activated.
     */
    public isActivated(): boolean {
        return this.activated;
    }

    public playGameSound(soundEffect: { uri: string, volume: number }, world: World) {
        if (world) {
            const playbackRate = Math.random() * 0.2 + 0.8;
            const sound = new Audio({
                uri: soundEffect.uri,
                volume: soundEffect.volume,
                referenceDistance: 2,
                playbackRate: playbackRate,
                position: this.position,
            });
            sound.setReferenceDistance(2);
            sound.play(world);
        }
    }
} 