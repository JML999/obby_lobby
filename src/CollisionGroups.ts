// Collision groups for entity collision management
export const CollisionGroups = {
    PLAYER: 0x0001,
    FLY: 0x0002,
    PLOT_ENTRANCE: 0x0004,
    PLOT_NUMBER: 0x0008,
    OBSTACLE: 0x0010,
    BLOCK: 0x0020,
    ENTITY_SENSOR: 0x0040,
    ENTITY: 0x0080,
} as const;

// Type for collision group values
export type CollisionGroup = typeof CollisionGroups[keyof typeof CollisionGroups]; 