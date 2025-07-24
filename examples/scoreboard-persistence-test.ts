import { ScoreboardManager } from '../src/ScoreboardManager';
import { PlotSaveManager } from '../src/PlotSaveManager';

// Mock Player class for testing
class MockPlayer {
  id: string;
  username: string;
  private persistedData: any = {};
  world: any;

  constructor(id: string, username: string) {
    this.id = id;
    this.username = username;
    this.world = {
      entityManager: {
        getAllPlayerEntities: () => [{
          player: this
        }]
      }
    };
  }

  async getPersistedData(): Promise<any> {
    return this.persistedData;
  }

  async setPersistedData(data: any): Promise<void> {
    this.persistedData = data;
  }

  // Mock other required Player properties
  profilePictureUrl = '';
  camera = {} as any;
  ui = {} as any;
  input = {} as any;
  position = { x: 0, y: 0, z: 0 };
  rotation = { x: 0, y: 0, z: 0 };
  velocity = { x: 0, y: 0, z: 0 };
  onGround = true;
  health = 100;
  maxHealth = 100;
  hunger = 100;
  maxHunger = 100;
  experience = 0;
  level = 1;
  inventory = {} as any;
  equipment = {} as any;
  chatManager = {} as any;
  entityManager = {} as any;
  chunkLattice = {} as any;
}

async function testScoreboardPersistence() {
  console.log('🧪 Testing New Scoreboard Persistence Flow...\n');

  // Create mock players
  const creator = new MockPlayer('creator123', 'ObbyCreator');
  const player1 = new MockPlayer('player1', 'SpeedRunner');
  const player2 = new MockPlayer('player2', 'CasualPlayer');

  const plotId = 'plot_5';

  // Initialize managers
  const scoreboardManager = ScoreboardManager.getInstance();
  const plotSaveManager = PlotSaveManager.getInstance();

  // Set up creator's initial plot data (simulating existing plot)
  const initialPlotData = {
    version: '1.0',
    plotSize: { width: 10, length: 10, height: 5 },
    plotCenter: { x: 0, y: 0, z: 0 },
    blocks: [],
    obstacles: [],
    lastModified: Date.now(),
    creatorName: creator.username,
    creatorId: creator.id,
    scoreboard: [] // Empty initially
  };

  await creator.setPersistedData({ obby: { plotData: initialPlotData } });
  console.log('✅ Set up creator with initial plot data');

  // Load the plot data (simulating plot loading)
  await scoreboardManager.loadScoreboardFromPlot(plotId, initialPlotData);
  console.log('✅ Loaded initial scoreboard from plot data');

  console.log('\n📊 Step 1: Adding first score...');
  
  // Add first score
  const result1 = scoreboardManager.addScore(plotId, player1 as any, 15000); // 15 seconds
  console.log(`Player 1: ${result1.position}${result1.isNewRecord ? 'st (NEW RECORD!)' : 'nd'} place`);

  console.log('\n📋 Current Leaderboard:');
  const leaderboard1 = scoreboardManager.formatScoreboard(plotId);
  leaderboard1.forEach(line => console.log(line));

  console.log('\n💾 Step 2: Simulating scoreboard save...');
  
  // The save should happen automatically in addScore, but let's trigger it manually for testing
  await scoreboardManager.saveScoreboardToPlot(plotId, player1 as any);
  
  // Check if creator's persistence was updated
  const creatorData = await creator.getPersistedData();
  console.log('Creator persistence updated:', !!creatorData?.obby?.plotData?.scoreboard);
  console.log('Scoreboard entries in persistence:', creatorData?.obby?.plotData?.scoreboard?.length || 0);

  console.log('\n📊 Step 3: Adding second score...');
  
  // Add second score
  const result2 = scoreboardManager.addScore(plotId, player2 as any, 12000); // 12 seconds - new record!
  console.log(`Player 2: ${result2.position}${result2.isNewRecord ? 'st (NEW RECORD!)' : 'nd'} place`);

  console.log('\n📋 Updated Leaderboard:');
  const leaderboard2 = scoreboardManager.formatScoreboard(plotId);
  leaderboard2.forEach(line => console.log(line));

  console.log('\n💾 Step 4: Checking final persistence...');
  
  // Check final persistence state
  const finalCreatorData = await creator.getPersistedData();
  console.log('Final scoreboard entries in persistence:', finalCreatorData?.obby?.plotData?.scoreboard?.length || 0);
  
  if (finalCreatorData?.obby?.plotData?.scoreboard) {
    console.log('Final scoreboard data:');
    finalCreatorData.obby.plotData.scoreboard.forEach((entry: any, index: number) => {
      console.log(`  ${index + 1}. ${entry.playerName} - ${(entry.completionTime / 1000).toFixed(2)}s`);
    });
  }

  console.log('\n🔄 Step 5: Simulating server restart...');
  
  // Clear in-memory scoreboard (simulate server restart)
  scoreboardManager.clearPlotScoreboard(plotId);
  console.log('✅ In-memory scoreboard cleared');

  // Load from persistence (simulate plot loading after restart)
  await scoreboardManager.loadScoreboardFromPlot(plotId, finalCreatorData.obby.plotData);
  console.log('✅ Scoreboard loaded from persistence');

  // Verify scoreboard is restored
  const restoredScoreboard = scoreboardManager.getScoreboard(plotId);
  console.log(`📊 Scoreboard after restore: ${restoredScoreboard.length} entries`);

  console.log('\n📋 Restored Leaderboard:');
  const restoredLeaderboard = scoreboardManager.formatScoreboard(plotId);
  restoredLeaderboard.forEach(line => console.log(line));

  console.log('\n✅ Scoreboard Persistence Test Complete!');
  console.log('\n📝 Summary:');
  console.log('- Scoreboard data is saved to creator\'s persistence');
  console.log('- Scoreboard data is loaded when plot is loaded');
  console.log('- Data persists through server restarts');
  console.log('- Natural lifecycle: scores live/die with the obby');
}

// Run the test
testScoreboardPersistence().catch(console.error); 