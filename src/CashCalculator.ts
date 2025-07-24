/**
 * CashCalculator - Pure utility for calculating cash costs
 * No imports to managers or registries to avoid circular dependencies
 */

export interface CashCosts {
    blocks: { [blockId: number]: number };
    entities: { [entityType: string]: number };
}

export class CashCalculator {
    // Block costs - keeping it simple with the agreed-upon pricing
    private static readonly BLOCK_COSTS: CashCosts['blocks'] = {
        // Basic blocks - 1 cash each
        1: 1,    // platform
        9: 1,    // ice  
        15: 1,   // vines
        16: 1,   // oak-planks
        17: 1,   // sand
        19: 1,   // stone
        21: 1,   // lava
        6: 1,    // glass
        
        // Special blocks - 0 cash (required for gameplay)
        100: 0,  // start block
        101: 0,  // goal block
    };

    // Entity costs - 5 cash each as agreed
    private static readonly ENTITY_COSTS: CashCosts['entities'] = {
        'bounce-pad': 5,
        'rotating-beam': 5,
        'obstacle': 5,
        // Add more entity types as needed
    };

    // Default starting cash
    public static readonly DEFAULT_STARTING_CASH = 100;

    /**
     * Get the cost of placing a block
     */
    public static getBlockCost(blockId: number): number {
        return this.BLOCK_COSTS[blockId] ?? 1; // Default to 1 if not found
    }

    /**
     * Get the cost of placing an entity/obstacle
     */
    public static getEntityCost(entityType: string): number {
        return this.ENTITY_COSTS[entityType] ?? 5; // Default to 5 if not found
    }

    /**
     * Check if player has enough cash for a block
     */
    public static canAffordBlock(currentCash: number, blockId: number): boolean {
        return currentCash >= this.getBlockCost(blockId);
    }

    /**
     * Check if player has enough cash for an entity
     */
    public static canAffordEntity(currentCash: number, entityType: string): boolean {
        return currentCash >= this.getEntityCost(entityType);
    }

    /**
     * Calculate cash after placing a block
     */
    public static deductBlockCost(currentCash: number, blockId: number): number {
        const cost = this.getBlockCost(blockId);
        return Math.max(0, currentCash - cost);
    }

    /**
     * Calculate cash after placing an entity
     */
    public static deductEntityCost(currentCash: number, entityType: string): number {
        const cost = this.getEntityCost(entityType);
        return Math.max(0, currentCash - cost);
    }

    /**
     * Calculate cash after removing a block (full refund)
     */
    public static refundBlockCost(currentCash: number, blockId: number, refundPercentage: number = 1.0): number {
        const cost = this.getBlockCost(blockId);
        const refund = Math.floor(cost * refundPercentage);
        return currentCash + refund;
    }

    /**
     * Calculate cash after removing an entity (full refund)
     */
    public static refundEntityCost(currentCash: number, entityType: string, refundPercentage: number = 1.0): number {
        const cost = this.getEntityCost(entityType);
        const refund = Math.floor(cost * refundPercentage);
        return currentCash + refund;
    }

    /**
     * Get all block costs for UI display
     */
    public static getAllBlockCosts(): CashCosts['blocks'] {
        return { ...this.BLOCK_COSTS };
    }

    /**
     * Get all entity costs for UI display
     */
    public static getAllEntityCosts(): CashCosts['entities'] {
        return { ...this.ENTITY_COSTS };
    }
} 