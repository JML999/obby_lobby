import { blockRegistry } from './src/BlockRegistry';

console.log('=== Testing BlockRegistry ===');

// Check if the registry is initialized
console.log(`Registry has ${blockRegistry.getAllBlocks().length} blocks`);

// Check block ID 1 specifically
const block1 = blockRegistry.getBlock(1);
console.log(`Block ID 1: ${block1 ? block1.name : 'NOT FOUND'}`);

// Check what getMapJsonBlockTypes returns
const mapBlockTypes = blockRegistry.getMapJsonBlockTypes();
console.log(`getMapJsonBlockTypes returns ${mapBlockTypes.length} blocks`);
console.log(`Block type 1 in map: ${mapBlockTypes.find(b => b.id === 1)?.name || 'NOT FOUND'}`);

// List all block IDs
console.log('All block IDs:', mapBlockTypes.map(b => b.id).sort((a, b) => a - b));

console.log('=== Test Complete ==='); 