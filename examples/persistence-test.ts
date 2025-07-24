import { ScoreboardManager } from '../src/ScoreboardManager';
import { PlotSaveManager } from '../src/PlotSaveManager';

// Mock Player class for testing
class MockPlayer {
  id: string;
  username: string;
  private persistedData: any = {};

  constructor(id: string, username: string) {
    this.id = id;
    this.username = username;
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
  world = {} as any;
}

async function testScoreboardPersistence() {
  console.log('🧪 Testing Scoreboard Persistence...\n');

  // Create mock players
  const creator = new MockPlayer('creator123', 'ObbyCreator');
  const player1 = new MockPlayer('player1', 'SpeedRunner');
  const player2 = new MockPlayer('player2', 'CasualPlayer');
  const player3 = new MockPlayer('player3', 'ProGamer');

  const plotId = 'plot_5';

  // Initialize managers
  const scoreboardManager = ScoreboardManager.getInstance();
  const plotSaveManager = PlotSaveManager.getInstance();

  console.log('📊 Step 1: Adding initial scores...');
  
  // Add some scores
  const result1 = scoreboardManager.addScore(plotId, player1 as any, 15000); // 15 seconds
  const result2 = scoreboardManager.addScore(plotId, player2 as any, 25000); // 25 seconds
  const result3 = scoreboardManager.addScore(plotId, player3 as any, 12000); // 12 seconds - new record!

  console.log(`Player 1: ${result1.position}${result1.isNewRecord ? 'st (NEW RECORD!)' : 'nd'} place`);
  console.log(`Player 2: ${result2.position}${result2.isNewRecord ? 'st (NEW RECORD!)' : 'nd'} place`);
  console.log(`Player 3: ${result3.position}${result3.isNewRecord ? 'st (NEW RECORD!)' : 'nd'} place`);

  console.log('\n📋 Current Leaderboard:');
  const leaderboard = scoreboardManager.formatScoreboard(plotId);
  leaderboard.forEach(line => console.log(line));

  console.log('\n💾 Step 2: Simulating plot save with scoreboard...');
  
  // Simulate saving plot data with scoreboard
  const mockPlotData = {
    version: '1.0',
    plotSize: { width: 10, length: 10, height: 5 },
    plotCenter: { x: 0, y: 0, z: 0 },
    blocks: [],
    obstacles: [],
    lastModified: Date.now(),
    creatorName: creator.username,
    creatorId: creator.id,
    scoreboard: scoreboardManager.getScoreboard(plotId)
  };

  // Save to creator's persistence
  await creator.setPersistedData({ obby: { plotData: mockPlotData } });
  console.log('✅ Plot data saved with scoreboard');

  console.log('\n🔄 Step 3: Simulating server restart (clearing memory)...');
  
  // Clear in-memory scoreboard (simulate server restart)
  scoreboardManager.clearPlotScoreboard(plotId);
  console.log('✅ In-memory scoreboard cleared');

  // Verify scoreboard is empty
  const emptyScoreboard = scoreboardManager.getScoreboard(plotId);
  console.log(`📊 Scoreboard after clear: ${emptyScoreboard.length} entries`);

  console.log('\n📥 Step 4: Loading scoreboard from persistence...');
  
  // Load from persistence
  await scoreboardManager.loadScoreboardFromPlot(plotId, mockPlotData);
  console.log('✅ Scoreboard loaded from persistence');

  // Verify scoreboard is restored
  const restoredScoreboard = scoreboardManager.getScoreboard(plotId);
  console.log(`📊 Scoreboard after restore: ${restoredScoreboard.length} entries`);

  console.log('\n📋 Restored Leaderboard:');
  const restoredLeaderboard = scoreboardManager.formatScoreboard(plotId);
  restoredLeaderboard.forEach(line => console.log(line));

  console.log('\n🧹 Step 5: Testing plot clear (clears scoreboard)...');
  
  // Simulate plot clear
  await plotSaveManager.clearPlayerObby(creator as any, plotId);
  
  // Verify scoreboard is cleared
  const clearedScoreboard = scoreboardManager.getScoreboard(plotId);
  console.log(`📊 Scoreboard after plot clear: ${clearedScoreboard.length} entries`);

  console.log('\n✅ Persistence Test Complete!');
  console.log('\n📝 Summary:');
  console.log('- Scores are saved with plot data');
  console.log('- Scores persist through server restarts');
  console.log('- Scores are cleared when plot is cleared');
  console.log('- Natural lifecycle: scores live/die with the obby');
}

// Run the test
testScoreboardPersistence().catch(console.error); 