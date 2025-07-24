import type { WorldMap } from "hytopia";
import { Vector3 } from "hytopia";

// --- ENVIRONMENT BLOCKS ONLY ---
// These block IDs are reserved for map structure only and do NOT overlap with player build palette blocks.
// Using IDs 22+ to avoid conflicts with existing map.json blocks (1-21) and obby blocks (100+)
const ENV_BLOCKS = {
    ROAD_STONE: 22,    // road surface
    STORE_WALL: 26,    // store facade (snow blocks)
    STORE_WINDOW: 27,  // store windows (glass)
    PARKING_LOT: 28,   // parking lot surface
    PARKING_GRAVEL: 29, // parking lot top layer
    SPAWN_MARKER: 25,  // spawn area
    SIGN_BLOCK: 32,    // jungle blocks for store name
    STREET_ASPHALT: 33, // street surface (dark stone)
    SIDEWALK: 34,      // sidewalk surface
    GRASS_FIELD: 35,   // grass field surface
    // Colored glass blocks for plot identification walls
    GLASS_1: 36,       // glass block 1
    GLASS_2: 37,       // glass block 2
    GLASS_3: 38,       // glass block 3
    GLASS_4: 39,       // glass block 4
    GLASS_5: 40,       // glass block 5
    GLASS_6: 41,       // glass block 6
    GLASS_7: 42,       // glass block 7
    GLASS_8: 43,       // glass block 8
};

const PLOT_SIZE = 64;
const ROAD_WIDTH = 16;
const PLOTS_PER_SIDE = 4;
const MAP_WIDTH = (PLOT_SIZE * 2) + ROAD_WIDTH; // 192
const MAP_LENGTH = PLOT_SIZE * PLOTS_PER_SIDE;  // 256
const HEIGHT = 32;
const ROAD_X_START = -ROAD_WIDTH / 2;
const ROAD_X_END = ROAD_WIDTH / 2 - 1;

// Store facade constants
const STORE_HEIGHT = 24;
const STORE_Z = MAP_LENGTH / 2; // North end of map
const PARKING_LOT_LENGTH = 48; // How far the parking lot extends north (50% bigger)
const STREET_LENGTH = 16; // Street length beyond parking lot
const ENTRANCE_WIDTH = 6;
const ENTRANCE_HEIGHT = 5;

// Helper: Get clockwise display number for glass walls (same as plot numbering)
function getClockwiseDisplayNumber(plotIndex: number): number {
    const clockwiseMap: { [key: number]: number } = {
        0: 4, // Left top → 4
        1: 3, // Left middle-top → 3
        2: 2, // Left middle-bottom → 2
        3: 1, // Left bottom → 1
        4: 5, // Right top → 5
        5: 6, // Right middle-top → 6
        6: 7, // Right middle-bottom → 7
        7: 8  // Right bottom → 8
    };
    
    return clockwiseMap[plotIndex] || plotIndex + 1;
}

// Helper: Get glass block ID for display number
function getGlassBlockId(displayNumber: number): number {
    return ENV_BLOCKS.GLASS_1 + (displayNumber - 1); // GLASS_1 = 36, so 1->36, 2->37, etc.
}

// Text position constants
const TEXT_Y = ENTRANCE_HEIGHT + 3; // 3 blocks above entrance
type LetterPattern = number[][];
type TextPatterns = { [key: string]: LetterPattern };

const TEXT_PATTERN: TextPatterns = {
    'O': [
        [1,1,1],
        [1,0,1],
        [1,0,1],
        [1,0,1],
        [1,1,1]
    ].reverse(),
    'B': [
        [1,1,1],
        [1,0,1],
        [1,1,1],
        [1,0,1],
        [1,1,1]
    ].reverse(),
    'Y': [
        [0,1,0],
        [0,1,0],
        [1,1,1],
        [1,0,1],
        [1,0,1]
    ],
    'L': [
        [1,1,1],
        [1,0,0],
        [1,0,0],
        [1,0,0],
        [1,0,0]
    ]
};

// Helper: Get plot coordinates (returns {xStart, xEnd, zStart, zEnd})
export function getPlotCoordinates(plotIndex: number) {
    // plotIndex: 0-3 = left side (north to south), 4-7 = right side (north to south)
    const side = plotIndex < 4 ? -1 : 1;
    const idx = plotIndex % 4;
    const xStart = side === -1
        ? -MAP_WIDTH / 2 + 1
        : ROAD_X_END; // FIX: was ROAD_X_END + 1, now flush with road edge
    const xEnd = xStart + PLOT_SIZE - 1;
    const zStart = -MAP_LENGTH / 2 + idx * PLOT_SIZE;
    const zEnd = zStart + PLOT_SIZE - 1;
    return { xStart, xEnd, zStart, zEnd };
}

// Main map generator
export function generateObbyHubMap(): WorldMap {
    const blocks: Record<string, number> = {};

    // Generate plots (left and right)
    for (let plotIndex = 0; plotIndex < 8; plotIndex++) {
        const { xStart, xEnd, zStart, zEnd } = getPlotCoordinates(plotIndex);
        // Determine which side and entrance direction
        const side = plotIndex < 4 ? -1 : 1;
        // Entrance is on the road-facing side
        const entranceX = side === -1 ? xEnd : xStart;
        // Center entrance on z axis
        const entranceZStart = Math.floor((zStart + zEnd) / 2) - 1;
        const entranceZEnd = entranceZStart + 2;
        
        // Get the colored glass block for this plot
        const displayNumber = getClockwiseDisplayNumber(plotIndex);
        const glassBlockId = getGlassBlockId(displayNumber);
        
        for (let x = xStart; x <= xEnd; x++) {
            for (let z = zStart; z <= zEnd; z++) {
                // Do NOT fill y=0 or y=1 (leave plot completely empty for vertical building)
                // --- Fence logic with colored glass - tall walls like store front ---
                // North/south edges - create tall walls
                if (z === zStart || z === zEnd) {
                    for (let y = 2; y <= STORE_HEIGHT - 2; y++) {
                        blocks[`${x},${y},${z}`] = glassBlockId;
                    }
                }
                // West/east edges, but leave entrance gap on road-facing side - create tall walls
                if (x === xStart || x === xEnd) {
                    const isEntranceEdge = (side === -1 && x === xEnd) || (side === 1 && x === xStart);
                    if (isEntranceEdge) {
                        // Leave entrance gap (but create tall walls where there's no entrance)
                        if (z < entranceZStart || z > entranceZEnd) {
                            for (let y = 2; y <= STORE_HEIGHT - 2; y++) {
                                blocks[`${x},${y},${z}`] = glassBlockId;
                            }
                        }
                    } else {
                        // Create tall walls on non-entrance edges
                        for (let y = 2; y <= STORE_HEIGHT - 2; y++) {
                            blocks[`${x},${y},${z}`] = glassBlockId;
                        }
                    }
                }
            }
        }
    }

    // Generate central road/lobby
    for (let x = ROAD_X_START; x <= ROAD_X_END; x++) {
        for (let z = -MAP_LENGTH / 2; z < STORE_Z; z++) {
            blocks[`${x},0,${z}`] = ENV_BLOCKS.STORE_WALL; // Changed from LOBBY_FLOOR to STORE_WALL
            blocks[`${x},1,${z}`] = ENV_BLOCKS.STORE_WALL; // Changed from grass to snow
        }
    }

    // Add conveyor belt on the right side of the lobby (airplane walkway style)
    // Place it 4 blocks to the left of the right edge for better positioning
    const CONVEYOR_X = ROAD_X_END - 4; // 4 blocks left from right edge
    const CONVEYOR_START_Z = -MAP_LENGTH / 2 + 20;
    const CONVEYOR_END_Z = STORE_Z - 20;
    for (let z = CONVEYOR_START_Z; z < CONVEYOR_END_Z; z++) { // Continuous line, every block
        blocks[`${CONVEYOR_X},1,${z}`] = 104; // Conveyor block ID 104
    }

    // Place conveyor-backward strip (ID 105) seven blocks left of the forward conveyor
    const backwardConveyorX = CONVEYOR_X - 7; // Shift left by 7 blocks total
    for (let z = CONVEYOR_START_Z; z < CONVEYOR_END_Z; z++) { // Same exact range as forward conveyor
        blocks[`${backwardConveyorX},1,${z}`] = 105; // Place backward conveyor
    }

    // Generate store facade first (complete wall)
    for (let x = -MAP_WIDTH / 2; x <= MAP_WIDTH / 2; x++) {
        for (let y = 0; y < STORE_HEIGHT; y++) {
            // Main wall structure (snow blocks)
            if (y > 0) { // Start wall at y=1
                // Center entrance gap
                if (y < ENTRANCE_HEIGHT && Math.abs(x) < ENTRANCE_WIDTH / 2) {
                    continue; // Leave empty for door
                }
                
                // Windows pattern - but not above door
                if (y > 3 && y < 16 && Math.abs(x % 12) < 4 && (Math.abs(x) >= ENTRANCE_WIDTH * 1.5)) {
                    blocks[`${x},${y},${STORE_Z}`] = ENV_BLOCKS.STORE_WINDOW;
                } else {
                    blocks[`${x},${y},${STORE_Z}`] = ENV_BLOCKS.STORE_WALL;
                }
            }
        }
    }

    // Add stacked "OBBY LOBBY" text
    const words = ["OBBY", "LOBBY"];
    let maxWidth = 0;
    
    // Calculate max width for centering
    for (const word of words) {
        let wordWidth = 0;
        for (const char of word) {
            const pattern = TEXT_PATTERN[char];
            if (pattern && pattern[0]) {
                wordWidth += pattern[0].length + 1; // Add 1 for spacing
            }
        }
        maxWidth = Math.max(maxWidth, wordWidth);
    }

    // Place each word, stacked vertically
    words.forEach((word, wordIndex) => {
        // Calculate individual word width for better centering
        let wordWidth = 0;
        for (const char of word) {
            const pattern = TEXT_PATTERN[char];
            if (pattern && pattern[0]) {
                wordWidth += pattern[0].length + 1; // Add 1 for spacing
            }
        }
        
        // Center each word individually, then shift right to center over entrance
        let currentX = -Math.floor(wordWidth / 2) + 1;
        
        // OBBY at top (wordIndex 0), LOBBY below (wordIndex 1)
        const wordY = TEXT_Y + ((1 - wordIndex) * 7); // Flip order: 1-wordIndex puts OBBY on top
        
        for (const char of word) {
            const pattern = TEXT_PATTERN[char];
            if (!pattern || !pattern[0]) continue;
            
            // Place each character
            for (let py = 0; py < pattern.length; py++) {
                const row = pattern[py];
                if (!row) continue;
                
                for (let px = 0; px < row.length; px++) {
                    if (row[px] === 1) {
                        // Place only in front of the wall
                        blocks[`${currentX + px},${wordY + py},${STORE_Z + 1}`] = ENV_BLOCKS.SIGN_BLOCK;
                    }
                }
            }
            currentX += pattern[0].length + 1; // Move to next character position
        }
    });

    // Generate parking lot with gravel top layer and parking lines
    for (let x = -MAP_WIDTH / 2; x <= MAP_WIDTH / 2; x++) {
        for (let z = STORE_Z; z <= STORE_Z + PARKING_LOT_LENGTH; z++) {
            blocks[`${x},0,${z}`] = ENV_BLOCKS.PARKING_LOT;
            blocks[`${x},1,${z}`] = ENV_BLOCKS.PARKING_GRAVEL;
        }
    }
    
    // Add parking space lines (short lines in gravel) - positioned symmetrically on either side of entrance
    const parkingSpaceWidth = 8; // Width of each parking space
    
    // Left side parking spaces (2 rows, 3 spaces each) - symmetric to right side
    for (let row = 0; row < 2; row++) {
        for (let space = 0; space <= 3; space++) { // 4 lines for 3 spaces
            const lineX = -32 + (space * parkingSpaceWidth); // Start at -32 to mirror the right side
            const startZ = STORE_Z + 8 + (row * 16);
            
            // Create short vertical lines (3 blocks long) in the gravel layer
            for (let i = 0; i < 3; i++) {
                blocks[`${lineX},1,${startZ + i}`] = ENV_BLOCKS.STORE_WALL;
            }
        }
    }
    
    // Right side parking spaces (2 rows, 3 spaces each)
    for (let row = 0; row < 2; row++) {
        for (let space = 0; space <= 3; space++) { // 4 lines for 3 spaces
            const lineX = 8 + (space * parkingSpaceWidth);
            const startZ = STORE_Z + 8 + (row * 16);
            
            // Create short vertical lines (3 blocks long) in the gravel layer
            for (let i = 0; i < 3; i++) {
                blocks[`${lineX},1,${startZ + i}`] = ENV_BLOCKS.STORE_WALL;
            }
        }
    }
    
    // Generate street beyond parking lot (one level lower to create curb effect)
    for (let x = -MAP_WIDTH / 2; x <= MAP_WIDTH / 2; x++) {
        for (let z = STORE_Z + PARKING_LOT_LENGTH + 1; z <= STORE_Z + PARKING_LOT_LENGTH + STREET_LENGTH; z++) {
            blocks[`${x},-1,${z}`] = ENV_BLOCKS.STREET_ASPHALT;
            blocks[`${x},0,${z}`] = ENV_BLOCKS.STREET_ASPHALT;
        }
    }

    // Generate sidewalk beyond street (same height as parking lot to create curb effect)
    const SIDEWALK_WIDTH = 6; // 6 blocks wide
    for (let x = -MAP_WIDTH / 2; x <= MAP_WIDTH / 2; x++) {
        for (let z = STORE_Z + PARKING_LOT_LENGTH + STREET_LENGTH + 1; z <= STORE_Z + PARKING_LOT_LENGTH + STREET_LENGTH + SIDEWALK_WIDTH; z++) {
            blocks[`${x},0,${z}`] = ENV_BLOCKS.SIDEWALK;
            blocks[`${x},1,${z}`] = ENV_BLOCKS.SIDEWALK;
        }
    }

    // Generate grass field beyond sidewalk (same height as parking lot)
    const GRASS_FIELD_LENGTH = 24; // 24 blocks deep
    for (let x = -MAP_WIDTH / 2; x <= MAP_WIDTH / 2; x++) {
        for (let z = STORE_Z + PARKING_LOT_LENGTH + STREET_LENGTH + SIDEWALK_WIDTH + 1; z <= STORE_Z + PARKING_LOT_LENGTH + STREET_LENGTH + SIDEWALK_WIDTH + GRASS_FIELD_LENGTH; z++) {
            blocks[`${x},0,${z}`] = ENV_BLOCKS.PARKING_LOT; // Use parking lot base
            blocks[`${x},1,${z}`] = ENV_BLOCKS.GRASS_FIELD; // Grass on top
        }
    }

    // Move spawn area to in front of store (positioned well within the larger parking lot)
    // Change to gravel instead of emerald/spawn marker
    for (let x = -8; x <= 8; x++) {
        for (let z = STORE_Z + 6; z <= STORE_Z + 18; z++) {
            blocks[`${x},1,${z}`] = ENV_BLOCKS.PARKING_GRAVEL;
        }
    }

    // Fences/walls around the map - using snow blocks
    for (let x = -MAP_WIDTH / 2; x <= MAP_WIDTH / 2; x++) {
        // Only place wall if not at entrance
        if (Math.abs(x) >= ENTRANCE_WIDTH / 2) {
            blocks[`${x},2,${STORE_Z}`] = ENV_BLOCKS.STORE_WALL;
        }
        blocks[`${x},2,${-MAP_LENGTH / 2}`] = ENV_BLOCKS.STORE_WALL;
    }
    for (let z = -MAP_LENGTH / 2; z < STORE_Z; z++) {
        blocks[`${-MAP_WIDTH / 2},2,${z}`] = ENV_BLOCKS.STORE_WALL;
        blocks[`${MAP_WIDTH / 2},2,${z}`] = ENV_BLOCKS.STORE_WALL;
    }

    // Add stacked "OBBY LOBBY" text with random glass color for each letter (no two adjacent the same)
    const glassBlocks = [
        ENV_BLOCKS.GLASS_1,
        ENV_BLOCKS.GLASS_2,
        ENV_BLOCKS.GLASS_3,
        ENV_BLOCKS.GLASS_4,
        ENV_BLOCKS.GLASS_5,
        ENV_BLOCKS.GLASS_6,
        ENV_BLOCKS.GLASS_7,
        ENV_BLOCKS.GLASS_8
    ];
    function getRandomGlassBlock(exclude: number): number {
        const options = exclude >= 0 ? glassBlocks.filter(g => g !== exclude) : glassBlocks;
        // Always return a number, fallback to glassBlocks[0] if options is empty (should never happen)
        return options.length > 0 ? options[Math.floor(Math.random() * options.length)]! : glassBlocks[0]!;
    }

    words.forEach((word, wordIndex) => {
        let wordWidth = 0;
        for (const char of word) {
            const pattern = TEXT_PATTERN[char];
            if (pattern && pattern[0]) {
                wordWidth += pattern[0].length + 1;
            }
        }
        let currentX = -Math.floor(wordWidth / 2) + 1;
        const wordY = TEXT_Y + ((1 - wordIndex) * 7);
        let prevGlassBlock: number = glassBlocks[0]!; // Start with a valid glass block
        let isFirstLetter = true;
        for (const char of word) {
            const pattern = TEXT_PATTERN[char];
            if (!pattern || !pattern[0]) continue;
            let glassBlockId: number;
            if (isFirstLetter) {
                glassBlockId = getRandomGlassBlock(-1)!; // -1 will not match any glass block, so all are possible
                isFirstLetter = false;
            } else {
                glassBlockId = getRandomGlassBlock(prevGlassBlock)!;
            }
            prevGlassBlock = glassBlockId;
            for (let py = 0; py < pattern.length; py++) {
                const row = pattern[py];
                if (!row) continue;
                for (let px = 0; px < row.length; px++) {
                    if (row[px] === 1) {
                        blocks[`${currentX + px},${wordY + py},${STORE_Z + 1}`] = glassBlockId;
                    }
                }
            }
            currentX += pattern[0].length + 1;
        }
    });

    return {
        blockTypes: [
            // Standard building blocks (from map.json)
            { id: 1, name: "bricks", textureUri: "blocks/stone-bricks.png" },
            { id: 2, name: "clay", textureUri: "blocks/clay.png" },
            { id: 3, name: "diamond-ore", textureUri: "blocks/diamond-ore.png" },
            { id: 4, name: "dirt", textureUri: "blocks/dirt.png" },
            { id: 5, name: "dragons-stone", textureUri: "blocks/dragons-stone.png" },
            { id: 6, name: "glass", textureUri: "blocks/glass.png" },
            { id: 7, name: "grass", textureUri: "blocks/grass" },
            { id: 8, name: "gravel", textureUri: "blocks/gravel.png" },
            { id: 9, name: "ice", textureUri: "blocks/ice.png" },
            { id: 10, name: "infected-shadowrock", textureUri: "blocks/infected-shadowrock.png" },
            { id: 11, name: "log-side", textureUri: "blocks/log" },
            { id: 12, name: "log-top", textureUri: "blocks/log" },
            { id: 13, name: "mossy-coblestone", textureUri: "blocks/mossy-coblestone.png" },
            { id: 14, name: "nuit", textureUri: "blocks/nuit.png" },
            { id: 15, name: "vines", textureUri: "blocks/oak-planks-leafyerer.png" },
            { id: 16, name: "oak-planks", textureUri: "blocks/oak-planks.png" },
            { id: 17, name: "sand", textureUri: "blocks/sand.png" },
            { id: 18, name: "shadowrock", textureUri: "blocks/shadowrock.png" },
            { id: 19, name: "stone", textureUri: "blocks/stone-bricks.png" },
            { id: 20, name: "stone-bricks", textureUri: "blocks/stone-bricks.png" },
            { id: 21, name: "lava", textureUri: "blocks/lava.png" },
            
            // Environment blocks (for map structure only)
            { id: ENV_BLOCKS.ROAD_STONE, name: "road-stone", textureUri: "blocks/stone.png" },
            { id: ENV_BLOCKS.STORE_WALL, name: "store-wall", textureUri: "blocks/snow.png" },
            { id: ENV_BLOCKS.STORE_WINDOW, name: "store-window", textureUri: "blocks/glass.png" },
            { id: ENV_BLOCKS.PARKING_LOT, name: "parking-lot", textureUri: "blocks/stone.png" },
            { id: ENV_BLOCKS.PARKING_GRAVEL, name: "parking-gravel", textureUri: "blocks/gravel.png" },
            { id: ENV_BLOCKS.SPAWN_MARKER, name: "spawn-marker", textureUri: "blocks/gravel.png" },
            { id: ENV_BLOCKS.SIGN_BLOCK, name: "sign-block", textureUri: "blocks/jungle-planks.png" },
            { id: ENV_BLOCKS.STREET_ASPHALT, name: "street-asphalt", textureUri: "blocks/shadowrock.png" },
            { id: ENV_BLOCKS.SIDEWALK, name: "sidewalk", textureUri: "blocks/stone-bricks.png" },
            { id: ENV_BLOCKS.GRASS_FIELD, name: "grass-field", textureUri: "blocks/grass" },
            
            // Colored glass blocks for plot identification walls
            { id: ENV_BLOCKS.GLASS_1, name: "glass-1", textureUri: "blocks/glass_1.png" },
            { id: ENV_BLOCKS.GLASS_2, name: "glass-2", textureUri: "blocks/glass_2.png" },
            { id: ENV_BLOCKS.GLASS_3, name: "glass-3", textureUri: "blocks/glass_3.png" },
            { id: ENV_BLOCKS.GLASS_4, name: "glass-4", textureUri: "blocks/glass_4.png" },
            { id: ENV_BLOCKS.GLASS_5, name: "glass-5", textureUri: "blocks/glass_5.png" },
            { id: ENV_BLOCKS.GLASS_6, name: "glass-6", textureUri: "blocks/glass_6.png" },
            { id: ENV_BLOCKS.GLASS_7, name: "glass-7", textureUri: "blocks/glass_7.png" },
            { id: ENV_BLOCKS.GLASS_8, name: "glass-8", textureUri: "blocks/glass_8.png" },
            
            // Obby-specific blocks (used by players for course building)
            { id: 100, name: "start", textureUri: "blocks/start.png" },
            { id: 101, name: "goal", textureUri: "blocks/goal.png" },
            { id: 102, name: "checkpoint", textureUri: "blocks/emerald-block.png" },
            
            // Additional blocks that might be referenced but missing from base catalog
            { id: 103, name: "snow", textureUri: "blocks/snow.png" },
            { id: 104, name: "conveyor-z-", textureUri: "blocks/conveyor-z-" },
            { id: 105, name: "conveyor-z+", textureUri: "blocks/conveyor-z+" },
            { id: 109, name: "conveyor-x-", textureUri: "blocks/conveyor-x-" },
            { id: 110, name: "conveyor-x+", textureUri: "blocks/conveyor-x+" },
            
            // Delete block for clearing zombie blocks
            { id: 106, name: "delete_block", textureUri: "blocks/delete_block.png" }
        ],
        blocks
    };
} 