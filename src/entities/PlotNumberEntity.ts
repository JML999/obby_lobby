import { Entity, World, Vector3, RigidBodyType } from 'hytopia';

export class PlotNumberEntity extends Entity {
    private plotNumber: number;

    constructor(plotNumber: number) {
        const modelUri = `models/items/block_${plotNumber}.gltf`;
        
        console.log(`[PlotNumberEntity] Constructor: Creating entity for number ${plotNumber} with model ${modelUri}`);
        
        super({
            modelUri,
            rigidBodyOptions: {
                type: RigidBodyType.FIXED
            },
            modelScale: 2
        });
        
        this.plotNumber = plotNumber;
        console.log(`[PlotNumberEntity] Constructor: Successfully created plot number entity for ${plotNumber} with fixed rigid body and 2x scale`);
    }

    public override spawn(world: World, position: Vector3): void {
        console.log(`[PlotNumberEntity] spawn: Attempting to spawn plot number ${this.plotNumber} at position (${position.x}, ${position.y}, ${position.z})`);
        
        try {
            super.spawn(world, position);
            console.log(`[PlotNumberEntity] spawn: ✅ Successfully spawned plot number ${this.plotNumber} in world ${world.name}`);
            
            // Additional debug info
            console.log(`[PlotNumberEntity] spawn: Entity ID: ${this.id}, Model URI: ${this.modelUri}, isSpawned: ${this.isSpawned}`);
        } catch (error) {
            console.error(`[PlotNumberEntity] spawn: ❌ Error spawning plot number ${this.plotNumber}:`, error);
            throw error;
        }
    }

    public getPlotNumber(): number {
        return this.plotNumber;
    }
} 