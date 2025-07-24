import { readFileSync } from 'fs';
import { join } from 'path';

export interface DefaultMapData {
    ownerId: string;
    obby: {
        plotData: {
            version: string;
            plotSize: { width: number; length: number; height: number };
            plotCenter: { x: number; y: number; z: number };
            plotSide: 'left' | 'right';
            blocks: Array<{
                relativePos: { x: number; y: number; z: number };
                blockTypeId: number;
            }>;
            obstacles: Array<{
                id: string;
                type: string;
                size: string;
                relativePos: { x: number; y: number; z: number };
                config: any;
            }>;
            lastModified: number;
            creatorName: string;
            creatorId: string;
            scoreboard: any[];
        };
        cash: number;
    };
}

export class DefaultMapLoader {
    private static instance: DefaultMapLoader;
    private readonly POOL_MAPS_PATH = 'assets/default-maps/pool';
    private readonly FEATURED_MAPS_PATH = 'assets/default-maps/featured';
    private readonly STARTER_MAPS_PATH = 'assets/default-maps/starter';
    private readonly MAX_POOL_MAPS = 10; // You have pool-1.json to pool-10.json

    private constructor() {}

    public static getInstance(): DefaultMapLoader {
        if (!DefaultMapLoader.instance) {
            DefaultMapLoader.instance = new DefaultMapLoader();
        }
        return DefaultMapLoader.instance;
    }

    /**
     * Load random pool maps for plots 1-2 (featured) and plot 3 (pool)
     * Returns 2 different random pool maps
     */
    public async loadRandomPoolMaps(): Promise<DefaultMapData[]> {
        try {
            console.log(`[DefaultMapLoader] Loading random pool maps from ${this.POOL_MAPS_PATH}`);
            
            // Generate 2 different random numbers between 1 and 10
            const randomNumbers = this.generateRandomNumbers(2, 1, this.MAX_POOL_MAPS);
            console.log(`[DefaultMapLoader] Selected pool maps: ${randomNumbers.join(', ')}`);
            
            const poolMaps: DefaultMapData[] = [];
            
            for (const mapNumber of randomNumbers) {
                const mapData = await this.loadPoolMap(mapNumber);
                if (mapData) {
                    poolMaps.push(mapData);
                    console.log(`[DefaultMapLoader] ✅ Successfully loaded pool-${mapNumber}.json`);
                } else {
                    console.error(`[DefaultMapLoader] ❌ Failed to load pool-${mapNumber}.json`);
                }
            }
            
            console.log(`[DefaultMapLoader] Loaded ${poolMaps.length} pool maps successfully`);
            return poolMaps;
            
        } catch (error) {
            console.error(`[DefaultMapLoader] Error loading random pool maps:`, error);
            return [];
        }
    }

    /**
     * Load a specific pool map by number (public method for testing)
     */
    public async loadSpecificPoolMap(mapNumber: number): Promise<DefaultMapData | null> {
        return this.loadPoolMap(mapNumber);
    }

    /**
     * Load all available pool maps (1-10)
     */
    public async loadAllPoolMaps(): Promise<DefaultMapData[]> {
        try {
            console.log(`[DefaultMapLoader] Loading all pool maps from ${this.POOL_MAPS_PATH}`);
            
            const poolMaps: DefaultMapData[] = [];
            
            for (let mapNumber = 1; mapNumber <= this.MAX_POOL_MAPS; mapNumber++) {
                const mapData = await this.loadPoolMap(mapNumber);
                if (mapData) {
                    poolMaps.push(mapData);
                    console.log(`[DefaultMapLoader] ✅ Successfully loaded pool-${mapNumber}.json`);
                } else {
                    console.error(`[DefaultMapLoader] ❌ Failed to load pool-${mapNumber}.json`);
                }
            }
            
            console.log(`[DefaultMapLoader] Loaded ${poolMaps.length} pool maps successfully`);
            return poolMaps;
            
        } catch (error) {
            console.error(`[DefaultMapLoader] Error loading all pool maps:`, error);
            return [];
        }
    }

    /**
     * Load a specific pool map by number
     */
    private async loadPoolMap(mapNumber: number): Promise<DefaultMapData | null> {
        try {
            const filePath = join(this.POOL_MAPS_PATH, `pool-${mapNumber}.json`);
            console.log(`[DefaultMapLoader] Loading pool map from: ${filePath}`);
            
            const fileContent = readFileSync(filePath, 'utf8');
            const mapData = JSON.parse(fileContent) as DefaultMapData;
            
            // Validate the map data structure
            if (!this.validateMapData(mapData)) {
                console.error(`[DefaultMapLoader] Invalid map data structure in pool-${mapNumber}.json`);
                return null;
            }
            
            // Set the owner ID to indicate this is a pool map
            mapData.ownerId = `pool-${mapNumber}`;
            
            return mapData;
            
        } catch (error) {
            console.error(`[DefaultMapLoader] Error loading pool map ${mapNumber}:`, error);
            return null;
        }
    }

    /**
     * Generate n different random numbers between min and max (inclusive)
     */
    private generateRandomNumbers(count: number, min: number, max: number): number[] {
        const numbers: number[] = [];
        const availableNumbers = Array.from({ length: max - min + 1 }, (_, i) => min + i);
        
        for (let i = 0; i < count && availableNumbers.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * availableNumbers.length);
            const selectedNumber = availableNumbers[randomIndex];
            if (selectedNumber !== undefined) {
                numbers.push(selectedNumber);
                availableNumbers.splice(randomIndex, 1);
            }
        }
        
        return numbers;
    }

    /**
     * Validate that the map data has the required structure
     */
    private validateMapData(mapData: any): mapData is DefaultMapData {
        return (
            mapData &&
            typeof mapData === 'object' &&
            mapData.obby &&
            mapData.obby.plotData &&
            Array.isArray(mapData.obby.plotData.blocks) &&
            Array.isArray(mapData.obby.plotData.obstacles) &&
            mapData.obby.plotData.version &&
            mapData.obby.plotData.plotCenter &&
            mapData.obby.plotData.plotSide
        );
    }

    /**
     * Load a starter map for empty plots (future use)
     */
    public async loadRandomStarterMap(): Promise<DefaultMapData | null> {
        try {
            // For now, just load a random pool map as a starter
            const randomNumber = Math.floor(Math.random() * this.MAX_POOL_MAPS) + 1;
            const mapData = await this.loadPoolMap(randomNumber);
            
            if (mapData) {
                mapData.ownerId = `starter-${randomNumber}`;
            }
            
            return mapData;
        } catch (error) {
            console.error(`[DefaultMapLoader] Error loading random starter map:`, error);
            return null;
        }
    }
} 