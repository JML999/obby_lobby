import { Audio } from 'hytopia';
import { EnemyEntity } from './EnemyEntity';
import type { EnemyEntityOptions } from './EnemyEntity';

export interface ZombieEntityOptions extends Omit<EnemyEntityOptions, 'modelUri' | 'name'> {
    variant?: 'normal' | 'fast' | 'strong';
}

export class ZombieEntity extends EnemyEntity {
    private variant: 'normal' | 'fast' | 'strong';
    private groanTimer: number = 0;
    private groanInterval: number = 3000; // Groan every 3 seconds when idle
    private groanAudio?: Audio;
    private moveAnimation: string = 'walk';

    constructor(options: ZombieEntityOptions = {}) {
        const { variant = 'normal', ...baseOptions } = options;

        // Set zombie-specific defaults based on variant
        const zombieDefaults = ZombieEntity.getVariantDefaults(variant);

        super({
            name: `Zombie (${variant})`,
            modelUri: 'models/npcs/zombie.gltf',
            modelLoopedAnimations: ['idle'],
            ...zombieDefaults,
            ...baseOptions
        });

        this.variant = variant;
    }

    private static getVariantDefaults(variant: 'normal' | 'fast' | 'strong'): Partial<EnemyEntityOptions> {
        switch (variant) {
            case 'fast':
                return {
                    maxHealth: 35,
                    damage: 8,
                    moveSpeed: 3.5,
                    attackRange: 1.2,
                    detectionRange: 10,
                    attackCooldownMs: 1500
                };
            case 'strong':
                return {
                    maxHealth: 80,
                    damage: 15,
                    moveSpeed: 1.5,
                    attackRange: 2.0,
                    detectionRange: 6,
                    attackCooldownMs: 2500
                };
            case 'normal':
            default:
                return {
                    maxHealth: 50,
                    damage: 10,
                    moveSpeed: 2,
                    attackRange: 1.5,
                    detectionRange: 8,
                    attackCooldownMs: 2000
                };
        }
    }

    protected onEnemySpawn(): void {
        console.log(`[ZombieEntity] Spawned ${this.variant} zombie`);
        this.setupZombieAnimations();
    }

    protected override initializeAudio(): void {
        if (!this.world) return;

        // Initialize zombie-specific audio
        this.attackAudio = new Audio({
            attachedToEntity: this,
            uri: 'audio/sfx/entity/zombie/zombie-attack.mp3',
            volume: 0.6,
            referenceDistance: 8,
        });

        this.hurtAudio = new Audio({
            attachedToEntity: this,
            uri: 'audio/sfx/entity/zombie/zombie-hurt.mp3',
            volume: 0.5,
            referenceDistance: 6,
        });

        this.deathAudio = new Audio({
            attachedToEntity: this,
            uri: 'audio/sfx/entity/zombie/zombie-death.mp3',
            volume: 0.7,
            referenceDistance: 10,
        });

        // Zombie-specific groan audio for atmosphere
        this.createGroanAudio();
    }

    private createGroanAudio(): void {
        if (!this.world) return;

        // Random groan sounds for ambient atmosphere
        const groanSounds = [
            'audio/sfx/entity/zombie/zombie-ambient-1.mp3',
            'audio/sfx/entity/zombie/zombie-ambient-2.mp3',
            'audio/sfx/entity/zombie/zombie-ambient-3.mp3'
        ];

        // Pick a random groan sound (fallback to a generic one if specific ones don't exist)
        const selectedGroan = groanSounds[Math.floor(Math.random() * groanSounds.length)] || 'audio/sfx/boing-1.wav';

        this.createAudio('groan', selectedGroan, 0.3, 12);
    }

    private createAudio(name: string, uri: string, volume: number, referenceDistance: number): void {
        if (!this.world) return;

        const audio = new Audio({
            attachedToEntity: this,
            uri,
            volume,
            referenceDistance,
        });

        // Store audio for later use
        if (name === 'groan') {
            this.groanAudio = audio;
        }
    }

    private setupZombieAnimations(): void {
        // Set appropriate animations based on variant
        switch (this.variant) {
            case 'fast':
                // Fast zombies run instead of walk
                this.moveAnimation = 'run';
                break;
            case 'strong':
                // Strong zombies might have different idle/movement
                this.moveAnimation = 'walk';
                break;
            case 'normal':
            default:
                this.moveAnimation = 'walk';
                break;
        }
    }

    protected override onEnemyTick(): void {
        this.updateGroanTimer();
        this.updateVariantBehavior();
    }

    private updateGroanTimer(): void {
        if (this.groanTimer > 0) {
            this.groanTimer -= 16.67; // Approximate tick time in ms
        }

        // Play groan sound when idle and timer expires
        if (this.groanTimer <= 0 && !this.isAggressive && this.world) {
            if (this.groanAudio) {
                this.groanAudio.play(this.world);
            }
            
            // Reset timer with some randomization
            this.groanInterval = 2000 + Math.random() * 4000; // 2-6 seconds
            this.groanTimer = this.groanInterval;
        }
    }

    private updateVariantBehavior(): void {
        // Fast zombies might get more aggressive when chasing
        if (this.variant === 'fast' && this.isAggressive && this.currentTarget) {
            const distance = this.getDistanceToTarget();
            
            // Switch to running animation when chasing
            if (distance > this.attackRange && !this.modelLoopedAnimations.has('run')) {
                this.stopModelAnimations(['walk', 'idle']);
                this.startModelLoopedAnimations(['run']);
            }
        }

        // Strong zombies might have special attack patterns
        if (this.variant === 'strong' && this.isAggressive) {
            // Could implement special attacks here
        }
    }

    protected override onBecomeAggressive(): void {
        super.onBecomeAggressive();
        
        // Play an aggressive sound
        if (this.world && this.groanAudio) {
            this.groanAudio.play(this.world);
        }

        // Change to appropriate movement animation
        if (this.variant === 'fast') {
            this.stopModelAnimations(['idle', 'walk']);
            this.startModelLoopedAnimations(['run']);
        } else {
            this.stopModelAnimations(['idle']);
            this.startModelLoopedAnimations([this.moveAnimation]);
        }
    }

    protected override onBecomePassive(): void {
        super.onBecomePassive();
        
        // Return to idle animation
        this.stopModelAnimations(['walk', 'run']);
        this.startModelLoopedAnimations(['idle']);
        
        // Reset groan timer to play soon
        this.groanTimer = 1000 + Math.random() * 2000; // 1-3 seconds
    }

    protected override onAttackExecuted(player: any): void {
        super.onAttackExecuted(player);
        
        // Special attack effects based on variant
        switch (this.variant) {
            case 'fast':
                // Fast zombies might attack more frantically
                this.startModelOneshotAnimations(['attack']);
                break;
            case 'strong':
                // Strong zombies might have a more powerful attack animation
                this.startModelOneshotAnimations(['attack']);
                break;
            case 'normal':
            default:
                // Standard attack
                break;
        }
    }

    protected override onTakeDamage(amount: number, source?: any): void {
        super.onTakeDamage(amount, source);
        
        // Zombies might become more aggressive when hurt
        if (this.variant === 'fast' && this.currentHealth < this.maxHealth * 0.5) {
            // Fast zombies become even faster when low on health
            this.moveSpeed = Math.min(this.moveSpeed * 1.2, 5); // Cap the speed boost
        }
    }

    protected override onDeath(): void {
        super.onDeath();
        
        console.log(`[ZombieEntity] ${this.variant} zombie died`);
        
        // TODO: When loot system is implemented, drop zombie-specific items
        // this.dropLoot(['rotting_flesh', 'bone']);
        
        // Play death-specific effects
        if (this.variant === 'strong') {
            // Strong zombies might have a more dramatic death
            console.log(`[ZombieEntity] Strong zombie death - could spawn smaller zombies or special effects`);
        }
    }

    // Public methods for external interaction
    public getVariant(): string {
        return this.variant;
    }

    public isZombie(): boolean {
        return true;
    }
} 