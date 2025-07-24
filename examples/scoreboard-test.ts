import { ScoreboardManager } from '../src/ScoreboardManager';

// Mock Player for testing
const mockPlayer = {
    id: 'test-player-1',
    name: 'TestPlayer1'
} as any;

const mockPlayer2 = {
    id: 'test-player-2', 
    name: 'TestPlayer2'
} as any;

const mockPlayer3 = {
    id: 'test-player-3',
    name: 'TestPlayer3'
} as any;

console.log('🧪 Testing Scoreboard System...\n');

const scoreboardManager = ScoreboardManager.getInstance();

// Test 1: Add scores to plot_1
console.log('📊 Test 1: Adding scores to plot_1');
const result1 = scoreboardManager.addScore('plot_1', mockPlayer, 15000); // 15 seconds
console.log('Result:', result1);
console.log('Achievement:', scoreboardManager.getAchievementMessage(result1));

const result2 = scoreboardManager.addScore('plot_1', mockPlayer2, 12000); // 12 seconds - new record!
console.log('Result:', result2);
console.log('Achievement:', scoreboardManager.getAchievementMessage(result2));

const result3 = scoreboardManager.addScore('plot_1', mockPlayer3, 18000); // 18 seconds
console.log('Result:', result3);
console.log('Achievement:', scoreboardManager.getAchievementMessage(result3));

// Test 2: Show leaderboard
console.log('\n📊 Test 2: Displaying leaderboard');
const leaderboard = scoreboardManager.formatScoreboard('plot_1');
leaderboard.forEach(line => console.log(line));

// Test 3: Add another score to see ranking
console.log('\n📊 Test 3: Adding another score');
const result4 = scoreboardManager.addScore('plot_1', mockPlayer, 10000); // 10 seconds - new record!
console.log('Result:', result4);
console.log('Achievement:', scoreboardManager.getAchievementMessage(result4));

const updatedLeaderboard = scoreboardManager.formatScoreboard('plot_1');
console.log('\nUpdated leaderboard:');
updatedLeaderboard.forEach(line => console.log(line));

// Test 4: Test plot clearing
console.log('\n📊 Test 4: Clearing plot scoreboard');
scoreboardManager.clearPlotScoreboard('plot_1');
const clearedLeaderboard = scoreboardManager.formatScoreboard('plot_1');
console.log('After clearing:');
clearedLeaderboard.forEach(line => console.log(line));

// Test 5: Test multiple plots
console.log('\n📊 Test 5: Multiple plots');
scoreboardManager.addScore('plot_2', mockPlayer, 8000);
scoreboardManager.addScore('plot_2', mockPlayer2, 9000);
scoreboardManager.addScore('plot_3', mockPlayer3, 11000);

console.log('Plot 2 leaderboard:');
scoreboardManager.formatScoreboard('plot_2').forEach(line => console.log(line));

console.log('\nPlot 3 leaderboard:');
scoreboardManager.formatScoreboard('plot_3').forEach(line => console.log(line));

console.log('\n✅ Scoreboard system test completed!'); 