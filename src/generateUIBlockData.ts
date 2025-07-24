import { blockRegistry, BlockCategory } from './BlockRegistry';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate block data for UI components
 * This ensures the UI stays in sync with the centralized BlockRegistry
 */

interface UIBlockData {
  id: number;
  name: string;
  textureUri: string;
  cost: number;
  type: string;
}

interface UIObstacleData {
  id: number;
  name: string;
  category: string;
  cost: number;
  model: string;
  description: string;
}

/**
 * Convert registry blocks to UI format
 */
function generateUIBlocks(): UIBlockData[] {
  const buildableBlocks = blockRegistry.getBuildableBlocks();
  
  return buildableBlocks.map(block => ({
    id: block.id,
    name: block.name,
    textureUri: block.textureUri,
    cost: block.pointCost || 0,
    type: block.name // Use name as type for UI compatibility
  }));
}

/**
 * Generate JavaScript code for BlockInventoryPanel.js initializeBlocks method
 */
function generateBlocksJavaScript(): string {
  const blocks = generateUIBlocks();
  
  let js = `    initializeBlocks() {
        // AUTO-GENERATED FROM BlockRegistry - DO NOT EDIT MANUALLY
        // To update this data, run: bun run scripts/updateUIBlocks.ts
        this.availableBlocks = [\n`;
  
  // Group blocks by category for better organization
  const categorizedBlocks = {
    special: blocks.filter(b => [100, 101, 102].includes(b.id)), // start, goal, checkpoint
    basic: blocks.filter(b => ![100, 101, 102].includes(b.id) && b.cost <= 1),
    hazard: blocks.filter(b => ![100, 101, 102].includes(b.id) && b.cost === 2),
    premium: blocks.filter(b => ![100, 101, 102].includes(b.id) && b.cost >= 3)
  };

  // Add special blocks first
  if (categorizedBlocks.special.length > 0) {
    js += `            // Required blocks (0 points)\n`;
    for (const block of categorizedBlocks.special) {
      js += `            { id: ${block.id}, name: '${block.name}', textureUri: '${block.textureUri}', cost: ${block.cost}, type: '${block.type}' },\n`;
    }
    js += `            \n`;
  }

  // Add basic blocks
  if (categorizedBlocks.basic.length > 0) {
    js += `            // Basic movement blocks (1 point each)\n`;
    for (const block of categorizedBlocks.basic) {
      js += `            { id: ${block.id}, name: '${block.name}', textureUri: '${block.textureUri}', cost: ${block.cost}, type: '${block.type}' },\n`;
    }
    js += `            \n`;
  }

  // Add hazard blocks
  if (categorizedBlocks.hazard.length > 0) {
    js += `            // Hazard blocks (2 points each)\n`;
    for (const block of categorizedBlocks.hazard) {
      js += `            { id: ${block.id}, name: '${block.name}', textureUri: '${block.textureUri}', cost: ${block.cost}, type: '${block.type}' },\n`;
    }
    js += `            \n`;
  }

  // Add premium blocks
  if (categorizedBlocks.premium.length > 0) {
    js += `            // Special blocks (3+ points each)\n`;
    for (const block of categorizedBlocks.premium) {
      js += `            { id: ${block.id}, name: '${block.name}', textureUri: '${block.textureUri}', cost: ${block.cost}, type: '${block.type}' },\n`;
    }
  }

  js += `        ];\n    }`;
  
  return js;
}

/**
 * Generate a JSON file with block data for external consumption
 */
function generateBlockDataJSON(): void {
  const blocks = generateUIBlocks();
  const registryInfo = {
    generated: new Date().toISOString(),
    totalBlocks: blocks.length,
    blocks: blocks
  };

  const outputPath = path.join(process.cwd(), 'assets', 'ui', 'block-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(registryInfo, null, 2));
  console.log(`✅ Generated block data JSON: ${outputPath}`);
}

/**
 * Update the BlockInventoryPanel.js file with new block data
 */
function updateBlockInventoryPanel(): void {
  const panelPath = path.join(process.cwd(), 'assets', 'ui', 'panels', 'BlockInventoryPanel.js');
  
  if (!fs.existsSync(panelPath)) {
    console.error(`❌ BlockInventoryPanel.js not found at: ${panelPath}`);
    return;
  }

  const content = fs.readFileSync(panelPath, 'utf-8');
  const newBlocksMethod = generateBlocksJavaScript();
  
  // Replace the initializeBlocks method
  const methodRegex = /initializeBlocks\(\)\s*\{[\s\S]*?\n\s{4}\}/;
  
  if (!methodRegex.test(content)) {
    console.error('❌ Could not find initializeBlocks method in BlockInventoryPanel.js');
    return;
  }

  const updatedContent = content.replace(methodRegex, newBlocksMethod);
  
  // Create backup
  const backupPath = panelPath + '.backup.' + Date.now();
  fs.writeFileSync(backupPath, content);
  console.log(`📝 Created backup: ${backupPath}`);
  
  // Write updated content
  fs.writeFileSync(panelPath, updatedContent);
  console.log(`✅ Updated BlockInventoryPanel.js with registry data`);
}

/**
 * Generate summary of all available blocks
 */
function generateBlockSummary(): void {
  const allBlocks = blockRegistry.getAllBlocks();
  const buildableBlocks = blockRegistry.getBuildableBlocks();
  const environmentBlocks = blockRegistry.getEnvironmentBlocks();
  
  console.log('\n=== BLOCK REGISTRY SUMMARY ===');
  console.log(`Total blocks: ${allBlocks.length}`);
  console.log(`Buildable blocks: ${buildableBlocks.length}`);
  console.log(`Environment blocks: ${environmentBlocks.length}`);
  
  console.log('\n=== BUILDABLE BLOCKS BY CATEGORY ===');
  for (const category of [BlockCategory.SPECIAL, BlockCategory.BASIC, BlockCategory.OBSTACLE, BlockCategory.DECORATION]) {
    const blocks = blockRegistry.getBlocksByCategory(category).filter(b => b.buildable);
    console.log(`${category}: ${blocks.length} blocks`);
    blocks.forEach(block => {
      console.log(`  - ${block.name} (ID: ${block.id}, Cost: ${block.pointCost || 0})`);
    });
  }

  console.log('\n=== ENVIRONMENT BLOCKS ===');
  environmentBlocks.forEach(block => {
    console.log(`  - ${block.name} (ID: ${block.id})`);
  });
}

// If run directly (not imported), execute the update
if (import.meta.main) {
  console.log('🔧 Updating UI components with BlockRegistry data...\n');
  
  try {
    // Generate summary
    generateBlockSummary();
    
    // Generate JSON data file
    generateBlockDataJSON();
    
    // Update the UI panel
    updateBlockInventoryPanel();
    
    console.log('\n✅ UI update complete! All components are now synchronized with BlockRegistry.');
    
  } catch (error) {
    console.error('❌ Error updating UI components:', error);
    process.exit(1);
  }
}

// Export functions for programmatic use
export {
  generateUIBlocks,
  generateBlocksJavaScript,
  generateBlockDataJSON,
  updateBlockInventoryPanel,
  generateBlockSummary
}; 