/**
 * Interface for mechanical blocks that can be resized
 * Used by the raycast placement system to handle ML/MR resize operations
 */
export interface ResizableMechanicalBlock {
    /**
     * Increase the size of the mechanical block (ML click)
     * @returns true if resized successfully, false if already at maximum size
     */
    resizeLarger(): boolean;
    
    /**
     * Decrease the size of the mechanical block (MR click)
     * @returns true if resized successfully, false if already at minimum size
     */
    resizeSmaller(): boolean;
    
    /**
     * Get the current size of the mechanical block
     * @returns current size (e.g., 1, 3, 5 for wheels)
     */
    getCurrentSize(): number;
    
    /**
     * Get the size description for user feedback
     * @returns size description (e.g., "Small (1x1)", "Medium (3x1)")
     */
    getSizeDescription(): string;
    
    /**
     * Get the original spawn position of the mechanical block
     * @returns spawn position where the block was originally placed
     */
    getSpawnPosition(): { x: number; y: number; z: number };
}